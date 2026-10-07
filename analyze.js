import { supabase } from './supabase-client.js';
import './shared.js';
import { refreshUser, translate, getLanguage, setToast, supabaseConfigured } from './shared.js';

let modelData = null;
let activeUser = null;
let latestAnalysis = null;
const $ = (id) => document.getElementById(id);
const FEATURE_IDS = ['TenureMonths','SatisfactionScore','OrderCount','TotalSpend','DaysSinceLastOrder','Complain'];

const GUEST_HISTORY_KEY = 'navigate_guest_history';

function getGuestHistory() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveGuestAnalysis(payload) {
  const records = getGuestHistory();
  const record = {
    ...payload,
    id: `guest-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    created_at: new Date().toISOString(),
    storage_scope: 'local'
  };

  records.unshift(record);
  localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(records.slice(0, 100)));
  return record;
}

function loadGuestAnalysis(id) {
  return getGuestHistory().find((record) => record.id === id) || null;
}


const clamp = (v, min=0, max=100) => Math.min(max, Math.max(min, v));
const pct = (v) => clamp(v * 100);

function normalize(value, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return 50;
  return clamp(((value - min) / (max - min)) * 100);
}
function inverseNormalize(value, min, max) { return 100 - normalize(value, min, max); }
function sigmoid(x) {
  if (x >= 0) { const z = Math.exp(-x); return 1 / (1 + z); }
  const z = Math.exp(x); return z / (1 + z);
}
function range(name) { return modelData.feature_ranges[name]; }

async function loadModel() {
  const response = await fetch('./navigate_web_model.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('navigate_web_model.json could not be loaded.');
  modelData = await response.json();
}

function predictProbability(values) {
  const probs = modelData.members.map((member) => {
    const standardized = modelData.features.map((feature, i) =>
      (values[feature] - member.scaler_mean[i]) / member.scaler_scale[i]
    );
    let decision = member.intercept;
    member.coef.forEach((coef, i) => decision += coef * standardized[i]);
    return sigmoid(-(member.calibration_a * decision + member.calibration_b));
  });
  return probs.reduce((a,b) => a+b, 0) / probs.length;
}

function computeIndicators(values, probability) {
  const spend = normalize(values.TotalSpend, range('TotalSpend').min, range('TotalSpend').max);
  const frequency = normalize(values.OrderCount, range('OrderCount').min, range('OrderCount').max);
  const valueIndex = clamp(0.72 * spend + 0.28 * frequency);
  const tenure = normalize(values.TenureMonths, range('TenureMonths').min, range('TenureMonths').max);
  const satisfactionHealth = clamp(((values.SatisfactionScore - 1) / 4) * 100);
  const recencyHealth = inverseNormalize(values.DaysSinceLastOrder, range('DaysSinceLastOrder').min, range('DaysSinceLastOrder').max);
  const complaintHealth = values.Complain === 1 ? 25 : 100;
  const engagement = clamp(0.18*tenure + 0.28*satisfactionHealth + 0.20*frequency + 0.24*recencyHealth + 0.10*complaintHealth);
  const risk = pct(probability);
  const priority = clamp(0.70*risk + 0.30*valueIndex);
  const threshold = modelData.decision_threshold * 100;
  return {
    risk,
    valueIndex,
    engagement,
    priority,
    threshold,
    decisionMargin: Math.abs(risk-threshold),
    recencyHealth,
    satisfactionHealth
  };
}

function riskLevel(probability) {
  const t = modelData.decision_threshold;
  if (probability < t*0.5) return {key:'low',en:'Low',ar:'منخفض'};
  if (probability < t) return {key:'moderate',en:'Moderate',ar:'متوسط'};
  if (probability < 0.5) return {key:'high',en:'High',ar:'مرتفع'};
  return {key:'critical',en:'Critical',ar:'حرج'};
}
function priorityLevel(score) {
  if (score < 30) return {en:'Low',ar:'منخفضة'};
  if (score < 50) return {en:'Moderate',ar:'متوسطة'};
  if (score < 75) return {en:'High',ar:'مرتفعة'};
  return {en:'Critical',ar:'حرجة'};
}
function customerSegment(ind) {
  if (ind.valueIndex >= 70 && ind.risk >= ind.threshold) return {en:'High-value at risk',ar:'عالي القيمة ومعرض للخطر'};
  if (ind.valueIndex >= 70) return {en:'High-value stable',ar:'عالي القيمة ومستقر'};
  if (ind.risk >= ind.threshold) return {en:'At-risk',ar:'معرض للخطر'};
  return {en:'Stable',ar:'مستقر'};
}

function factorData(values, ind) {
  const risk = [], positive = [];
  const med = (n) => range(n).median;
  if (values.SatisfactionScore <= 2) risk.push({en:'Low satisfaction score deserves direct review.',ar:'انخفاض درجة الرضا يحتاج مراجعة مباشرة.'});
  else if (values.SatisfactionScore >= 4) positive.push({en:'Customer satisfaction is relatively strong.',ar:'مستوى رضا العميل جيد نسبيًا.'});
  if (values.Complain === 1) risk.push({en:'A complaint is recorded for this customer.',ar:'توجد شكوى مسجلة لهذا العميل.'});
  else positive.push({en:'No complaint is recorded in the review period.',ar:'لا توجد شكوى مسجلة ضمن فترة المراجعة.'});
  if (values.DaysSinceLastOrder > med('DaysSinceLastOrder')) risk.push({en:'The customer has been inactive longer than the training-data median.',ar:'مدة عدم النشاط أطول من الوسيط في بيانات التدريب.'});
  else positive.push({en:'Recent activity is stronger than the training-data median.',ar:'حداثة النشاط أفضل من الوسيط في بيانات التدريب.'});
  if (values.OrderCount < med('OrderCount')) risk.push({en:'Transaction frequency is below the training-data median.',ar:'تكرار المعاملات أقل من الوسيط في بيانات التدريب.'});
  else positive.push({en:'Transaction frequency is at or above the training-data median.',ar:'تكرار المعاملات عند أو أعلى من الوسيط في بيانات التدريب.'});
  if (values.TenureMonths < med('TenureMonths')) risk.push({en:'Customer tenure is relatively short.',ar:'مدة علاقة العميل بالشركة قصيرة نسبيًا.'});
  else positive.push({en:'Customer tenure is relatively established.',ar:'مدة علاقة العميل بالشركة مستقرة نسبيًا.'});
  if (ind.valueIndex >= 70) positive.push({en:'Customer value is high relative to the model training range.',ar:'قيمة العميل مرتفعة مقارنة بنطاق بيانات التدريب.'});
  if (!risk.length) risk.push({en:'No single review factor stands out; the score reflects the combined customer profile.',ar:'لا يوجد عامل منفرد بارز؛ النتيجة ناتجة عن مجموعة إشارات العميل معًا.'});
  if (!positive.length) positive.push({en:'No strong supporting retention signal stands out in the current profile.',ar:'لا توجد إشارة قوية داعمة للاحتفاظ بارزة في الملف الحالي.'});
  return {risk, positive};
}

function recommendationData(probability, values, ind) {
  const actions = [], followUp = [];
  const threshold = modelData.decision_threshold;
  if (probability >= 0.5) {
    actions.push({en:'Prioritize immediate retention outreach and review the customer’s most recent experience.',ar:'أعطِ الأولوية لتواصل احتفاظ سريع وراجع أحدث تجربة للعميل.'});
    followUp.push({en:'Contact the customer within 24–48 hours.',ar:'تواصل مع العميل خلال 24–48 ساعة.'});
  } else if (probability >= threshold) {
    actions.push({en:'Start proactive outreach before risk increases further.',ar:'ابدأ تواصلًا استباقيًا قبل ارتفاع الخطر أكثر.'});
    followUp.push({en:'Review the account within the next 3–7 days.',ar:'راجع الحساب خلال 3–7 أيام القادمة.'});
  } else {
    actions.push({en:'Maintain regular engagement and continue monitoring behavior changes.',ar:'حافظ على تفاعل منتظم واستمر في متابعة تغيرات السلوك.'});
    followUp.push({en:'Reassess after the next meaningful customer interaction.',ar:'أعد التقييم بعد التفاعل المهم التالي مع العميل.'});
  }
  if (values.SatisfactionScore <= 2) actions.push({en:'Ask for direct feedback and investigate the source of dissatisfaction.',ar:'اطلب ملاحظات مباشرة وحدد سبب انخفاض الرضا.'});
  if (values.Complain === 1) actions.push({en:'Confirm that the complaint has been resolved and follow up on the outcome.',ar:'تأكد من معالجة الشكوى المسجلة وتابع نتيجة الحل مع العميل.'});
  if (values.DaysSinceLastOrder > range('DaysSinceLastOrder').median) actions.push({en:'Use a re-engagement message or relevant service reminder based on customer history.',ar:'استخدم تواصل إعادة تفاعل أو تذكيرًا مناسبًا بناءً على سجل العميل.'});
  if (ind.valueIndex >= 70 && probability >= threshold) actions.push({en:'Consider a personalized retention option that reflects the customer’s value.',ar:'فكّر في خيار احتفاظ مخصص يعكس قيمة العميل.'});
  followUp.push(ind.engagement < 45
    ? {en:'Track activity and satisfaction after the next intervention.',ar:'تابع النشاط والرضا بعد الإجراء التالي.'}
    : {en:'Keep the customer engagement trend under periodic review.',ar:'استمر في مراجعة اتجاه تفاعل العميل بشكل دوري.'});
  return {actions, followUp};
}

function collectValues() {
  return {
    TenureMonths:Number($('TenureMonths').value),
    SatisfactionScore:Number($('SatisfactionScore').value),
    OrderCount:Number($('OrderCount').value),
    TotalSpend:Number($('TotalSpend').value),
    DaysSinceLastOrder:Number($('DaysSinceLastOrder').value),
    Complain:Number($('Complain').value),
  };
}
function validateValues(values) {
  if (!FEATURE_IDS.every(n => Number.isFinite(values[n]))) return translate('Complete all six behavior signals with valid values.','أكمل جميع إشارات السلوك الست بقيم صحيحة.');
  if (values.SatisfactionScore < 1 || values.SatisfactionScore > 5) return translate('Satisfaction score must be between 1 and 5.','درجة الرضا يجب أن تكون بين 1 و5.');
  if (values.TenureMonths < 0 || values.OrderCount < 0 || values.TotalSpend < 0 || values.DaysSinceLastOrder < 0) return translate('Behavior values cannot be negative.','قيم السلوك لا يمكن أن تكون سالبة.');
  return null;
}
function getWarnings(values) {
  return FEATURE_IDS.filter(n => n !== 'Complain').filter(n => values[n] < range(n).min || values[n] > range(n).max);
}
function renderWarning(fields) {
  const box = $('rangeWarning');
  if (!fields.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<strong>${translate('Outside training range','خارج نطاق بيانات التدريب')}</strong><span>${translate(`Some values are outside the training range (${fields.join(', ')}). The analysis can still run, but the estimate is less supported by the training data.`,`بعض القيم خارج نطاق بيانات التدريب (${fields.join(', ')}). يمكن تشغيل التحليل، لكن النتيجة تكون أقل دعمًا من بيانات التدريب.`)}</span>`;
}

function renderList(container, items, numbered=false) {
  container.innerHTML = '';
  items.forEach((item,index) => {
    const row = document.createElement('div');
    row.className = numbered ? 'action-item' : 'factor-item';
    const text = getLanguage()==='ar' ? item.ar : item.en;
    row.innerHTML = numbered ? `<span>${String(index+1).padStart(2,'0')}</span><p>${text}</p>` : `<i></i><p>${text}</p>`;
    container.appendChild(row);
  });
}
function renderSignalChart(values) {
  const items = [
    {en:'Tenure',ar:'مدة العلاقة',v:normalize(values.TenureMonths,range('TenureMonths').min,range('TenureMonths').max)},
    {en:'Satisfaction',ar:'الرضا',v:clamp(((values.SatisfactionScore-1)/4)*100)},
    {en:'Transactions',ar:'المعاملات',v:normalize(values.OrderCount,range('OrderCount').min,range('OrderCount').max)},
    {en:'Value',ar:'القيمة',v:normalize(values.TotalSpend,range('TotalSpend').min,range('TotalSpend').max)},
    {en:'Recency',ar:'حداثة النشاط',v:inverseNormalize(values.DaysSinceLastOrder,range('DaysSinceLastOrder').min,range('DaysSinceLastOrder').max)},
    {en:'Issue health',ar:'سلامة الشكاوى',v:values.Complain===1?20:100},
  ];
  $('signalChart').innerHTML = items.map(x=>`<div class="signal-row"><div class="signal-meta"><span>${getLanguage()==='ar'?x.ar:x.en}</span><strong>${Math.round(x.v)}</strong></div><div class="signal-track"><i style="width:${Math.round(x.v)}%"></i></div></div>`).join('');
}

function renderBenchmarkChart(values) {
  const specs = [
    {key:'TenureMonths', en:'Tenure', ar:'مدة العلاقة', inverse:false},
    {key:'SatisfactionScore', en:'Satisfaction', ar:'الرضا', satisfaction:true},
    {key:'OrderCount', en:'Transactions', ar:'المعاملات', inverse:false},
    {key:'TotalSpend', en:'Value', ar:'القيمة', inverse:false},
    {key:'DaysSinceLastOrder', en:'Recency', ar:'حداثة النشاط', inverse:true},
  ];

  const rows = specs.map((spec) => {
    const r = range(spec.key);
    let customer;
    let median;

    if (spec.satisfaction) {
      customer = clamp(((values[spec.key] - 1) / 4) * 100);
      median = clamp(((r.median - 1) / 4) * 100);
    } else if (spec.inverse) {
      customer = inverseNormalize(values[spec.key], r.min, r.max);
      median = inverseNormalize(r.median, r.min, r.max);
    } else {
      customer = normalize(values[spec.key], r.min, r.max);
      median = normalize(r.median, r.min, r.max);
    }

    const label = getLanguage() === 'ar' ? spec.ar : spec.en;

    return `<div class="benchmark-row">
      <div class="benchmark-label"><span>${label}</span><strong>${Math.round(customer)}</strong></div>
      <div class="benchmark-pair">
        <div class="benchmark-track customer"><i style="width:${Math.round(customer)}%"></i></div>
        <div class="benchmark-track median"><i style="width:${Math.round(median)}%"></i></div>
      </div>
    </div>`;
  }).join('');

  $('benchmarkChart').innerHTML =
    `<div class="benchmark-legend">
      <span><i class="customer-dot"></i>${translate('Customer','العميل')}</span>
      <span><i class="median-dot"></i>${translate('Training median','وسيط التدريب')}</span>
    </div>${rows}`;
}

function renderSensitivityChart(values) {
  const r = range('DaysSinceLastOrder');
  const points = 9;
  const samples = Array.from({length: points}, (_, index) => {
    const x = r.min + ((r.max - r.min) * index / (points - 1));
    const scenario = {...values, DaysSinceLastOrder: x};
    return {x, risk: predictProbability(scenario) * 100};
  });

  const width = 620;
  const height = 220;
  const padX = 34;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const sx = (x) => padX + ((x - r.min) / Math.max(1, r.max - r.min)) * plotW;
  const sy = (risk) => padY + (1 - clamp(risk) / 100) * plotH;

  const path = samples.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${sx(point.x).toFixed(1)} ${sy(point.risk).toFixed(1)}`
  ).join(' ');

  const currentX = clamp(values.DaysSinceLastOrder, r.min, r.max);
  const currentRisk = predictProbability({...values, DaysSinceLastOrder: currentX}) * 100;

  const yLines = [0,25,50,75,100].map(v =>
    `<g><line x1="${padX}" y1="${sy(v)}" x2="${width-padX}" y2="${sy(v)}" class="chart-gridline"/>
    <text x="4" y="${sy(v)+4}" class="chart-axis-text">${v}</text></g>`
  ).join('');

  $('sensitivityChart').innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${translate('Risk sensitivity line chart','رسم خطي لحساسية الخطر')}">
      ${yLines}
      <path d="${path}" class="sensitivity-line" />
      <circle cx="${sx(currentX)}" cy="${sy(currentRisk)}" r="6" class="sensitivity-point"/>
      <text x="${padX}" y="${height-2}" class="chart-axis-text">${Math.round(r.min)}d</text>
      <text x="${width-padX-24}" y="${height-2}" class="chart-axis-text">${Math.round(r.max)}d</text>
    </svg>
    <div class="sensitivity-summary">
      <span>${translate('Current inactivity','عدم النشاط الحالي')} <strong>${Math.round(values.DaysSinceLastOrder)} ${translate('days','يوم')}</strong></span>
      <span>${translate('Current model risk','الخطر الحالي')} <strong>${Math.round(currentRisk)}%</strong></span>
    </div>`;
}

function formatDate(value=new Date()) {
  return new Intl.DateTimeFormat(getLanguage()==='ar'?'ar-SA':'en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}

function buildPayload(values, probability, ind, factors, recs) {
  const level = riskLevel(probability), seg = customerSegment(ind);
  return {
    customer_name:$('customerName').value.trim(),
    customer_email:$('customerEmail').value.trim()||null,
    customer_phone:$('customerPhone').value.trim()||null,
    customer_external_id:$('customerExternalId').value.trim()||null,
    company_account_id:$('companyAccountId').value.trim()||null,
    notes:$('customerNotes').value.trim()||null,
    input_data:values,
    churn_risk:Number(probability.toFixed(6)),
    risk_level:level.en,
    retention_priority:Number(ind.priority.toFixed(2)),
    customer_value_index:Number(ind.valueIndex.toFixed(2)),
    engagement_health:Number(ind.engagement.toFixed(2)),
    decision_margin:Number(ind.decisionMargin.toFixed(2)),
    model_threshold:Number(modelData.decision_threshold.toFixed(6)),
    customer_segment:seg.en,
    risk_factors:factors.risk,
    retention_signals:factors.positive,
    recommended_actions:recs.actions,
    follow_up_plan:recs.followUp,
  };
}

function renderResults(payload, createdAt=new Date()) {
  const values = payload.input_data;
  const probability = Number(payload.churn_risk);
  const ind = {
    risk:probability*100,
    priority:Number(payload.retention_priority),
    valueIndex:Number(payload.customer_value_index),
    engagement:Number(payload.engagement_health),
    decisionMargin:Number(payload.decision_margin),
    threshold:Number(payload.model_threshold)*100,
    recencyHealth: inverseNormalize(values.DaysSinceLastOrder, range('DaysSinceLastOrder').min, range('DaysSinceLastOrder').max),
    satisfactionHealth: clamp(((values.SatisfactionScore - 1) / 4) * 100),
  };
  const level = riskLevel(probability), priority = priorityLevel(ind.priority), seg = customerSegment(ind);
  const derivedFactors = factorData(values,ind), derivedRecs = recommendationData(probability,values,ind);
  const factors = {risk:payload.risk_factors||derivedFactors.risk,positive:payload.retention_signals||derivedFactors.positive};
  const recs = {actions:payload.recommended_actions||derivedRecs.actions,followUp:payload.follow_up_plan||derivedRecs.followUp};

  $('resultCustomerName').textContent = payload.customer_name;
  $('resultTimestamp').textContent = formatDate(createdAt);
  $('metricRisk').textContent = `${Math.round(ind.risk)}%`;
  $('metricRiskLabel').textContent = getLanguage()==='ar'?level.ar:level.en;
  $('metricPriority').textContent = Math.round(ind.priority);
  $('metricValue').textContent = Math.round(ind.valueIndex);
  $('metricEngagement').textContent = Math.round(ind.engagement);
  $('metricRecency').textContent = Math.round(ind.recencyHealth);
  $('metricSatisfaction').textContent = Math.round(ind.satisfactionHealth);
  $('transparencyThreshold').textContent = `${Math.round(ind.threshold)}%`;
  $('transparencyMargin').textContent = `${Math.round(ind.decisionMargin)} ${translate('pts','نقطة')}`;

  $('riskCategoryBadge').dataset.level = level.key;
  $('riskCategoryBadge').textContent = getLanguage()==='ar'?level.ar:level.en;
  $('gaugeRisk').textContent = `${Math.round(ind.risk)}%`;
  $('riskGauge').style.setProperty('--risk-angle',`${ind.risk*3.6}deg`);
  $('thresholdMarker').style.left = `${clamp(ind.threshold)}%`;
  $('riskMarker').style.left = `${clamp(ind.risk)}%`;

  const above = probability >= modelData.decision_threshold;
  $('riskDecisionText').textContent = above
    ? translate('Estimated churn risk is above NAVIGATE’s validated decision threshold. The customer deserves proactive retention review.','خطر المغادرة المتوقع أعلى من حد القرار المعتمد في NAVIGATE، لذلك يستحق العميل مراجعة استباقية للاحتفاظ.')
    : translate('Estimated churn risk is below NAVIGATE’s decision threshold. Continue monitoring for meaningful behavior changes.','خطر المغادرة المتوقع أقل من حد القرار في NAVIGATE. استمر في المتابعة لرصد أي تغيرات سلوكية مهمة.');

  renderSignalChart(values);
  renderBenchmarkChart(values);
  renderSensitivityChart(values);
  $('decisionTitle').textContent = above ? translate('Retention attention recommended','يوصى باهتمام احتفاظي') : translate('No strong churn signal currently','لا توجد إشارة مغادرة قوية حاليًا');
  $('decisionSummary').textContent = above
    ? translate(`The model estimates a ${Math.round(ind.risk)}% churn risk. Combined with customer value, the current retention priority is ${Math.round(ind.priority)}/100.`,`يقدّر النموذج خطر المغادرة بـ ${Math.round(ind.risk)}٪. وبدمج الخطر مع قيمة العميل تصبح أولوية الاحتفاظ الحالية ${Math.round(ind.priority)}/100.`)
    : translate(`The model estimates a ${Math.round(ind.risk)}% churn risk, currently below the decision threshold. The customer should still be monitored as behavior changes.`,`يقدّر النموذج خطر المغادرة بـ ${Math.round(ind.risk)}٪، وهو أقل حاليًا من حد القرار. مع ذلك، يجب الاستمرار في متابعة تغيرات سلوك العميل.`);
  $('summaryRiskLevel').textContent = getLanguage()==='ar'?level.ar:level.en;
  $('summaryPriority').textContent = getLanguage()==='ar'?priority.ar:priority.en;
  $('summarySegment').textContent = getLanguage()==='ar'?seg.ar:seg.en;
  renderList($('riskFactors'),factors.risk);
  renderList($('retentionSignals'),factors.positive);
  renderList($('recommendedActions'),recs.actions,true);
  renderList($('followUpPlan'),recs.followUp,true);
  $('resultsSection').hidden = false;
  latestAnalysis = {payload,createdAt};
}

async function saveAnalysis(payload) {
  if (!supabaseConfigured || !supabase || !activeUser) return null;

  const {data,error} = await supabase
    .from('customer_analyses')
    .insert({user_id:activeUser.id,...payload})
    .select()
    .single();

  if (error) throw error;
  return data;
}
async function loadSavedAnalysis(id) {
  const {data,error} = await supabase.from('customer_analyses').select('*').eq('id',id).single();
  if (error) throw error;
  $('customerName').value=data.customer_name||''; $('customerEmail').value=data.customer_email||''; $('customerPhone').value=data.customer_phone||''; $('customerExternalId').value=data.customer_external_id||''; $('companyAccountId').value=data.company_account_id||''; $('customerNotes').value=data.notes||'';
  Object.entries(data.input_data||{}).forEach(([k,v])=>{if($(k)) $(k).value=v;});
  if (data.customer_email||data.customer_phone||data.customer_external_id||data.company_account_id||data.notes) { $('optionalDetails').hidden=false; $('optionalDetailsToggle').setAttribute('aria-expanded','true'); }
  renderResults(data,data.created_at);
}

$('optionalDetailsToggle').addEventListener('click',()=>{
  const d=$('optionalDetails'), open=!d.hidden; d.hidden=open; $('optionalDetailsToggle').setAttribute('aria-expanded',String(!open)); $('optionalDetailsToggle').querySelector('span:first-child').textContent=open?'＋':'−';
});
$('analysisForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  if (!$('customerName').value.trim()) { setToast(translate('Customer name is required.','اسم العميل مطلوب.'),'error'); $('customerName').focus(); return; }
  if (!modelData) { setToast(translate('Model is not ready yet.','النموذج غير جاهز بعد.'),'error'); return; }
  const values=collectValues(), err=validateValues(values); if(err){setToast(err,'error');return;}
  renderWarning(getWarnings(values));
  const probability=predictProbability(values), ind=computeIndicators(values,probability), factors=factorData(values,ind), recs=recommendationData(probability,values,ind), payload=buildPayload(values,probability,ind,factors,recs);
  renderResults(payload);
  try {
    const saved=await saveAnalysis(payload);

    if (saved) {
      latestAnalysis={payload:saved,createdAt:saved.created_at};
      const url=new URL(window.location.href);
      url.searchParams.set('id',saved.id);
      history.replaceState({},'',url);

      setToast(
        translate(
          'Analysis complete and saved to your history.',
          'اكتمل التحليل وتم حفظه في السجل.'
        ),
        'success'
      );
    } else {
      const localRecord = saveGuestAnalysis(payload);
      latestAnalysis={payload:localRecord,createdAt:localRecord.created_at};

      const url=new URL(window.location.href);
      url.searchParams.set('id',localRecord.id);
      history.replaceState({},'',url);

      setToast(
        translate(
          'Analysis complete and saved to this device. Sign in only if you want History synced across devices.',
          'اكتمل التحليل وتم حفظه على هذا الجهاز. سجّل الدخول فقط إذا أردت مزامنة السجل بين الأجهزة.'
        ),
        'success'
      );
    }
  } catch(error) {
    console.error(error);
    latestAnalysis={payload,createdAt:new Date()};
    setToast(
      translate(
        'Analysis complete, but saving failed. Your result is still shown below.',
        'اكتمل التحليل، لكن تعذر الحفظ. النتيجة ما زالت معروضة بالأسفل.'
      ),
      'error'
    );
  }
  $('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
});
$('printReport').addEventListener('click',()=>window.print());
window.addEventListener('navigate:language',()=>{ if(latestAnalysis) renderResults(latestAnalysis.payload,latestAnalysis.createdAt); });

async function init(){
  // Analysis must work even before Supabase is configured or before the user signs in.
  // Signing in is only required for permanent History storage.
  activeUser = await refreshUser();

  try {
    await loadModel();
  } catch(e) {
    console.error(e);
    setToast(
      translate(
        'Could not load navigate_web_model.json. Make sure the file is uploaded beside the website files.',
        'تعذر تحميل navigate_web_model.json. تأكدي أن الملف مرفوع بجانب ملفات الموقع.'
      ),
      'error'
    );
    return;
  }

  const id = new URLSearchParams(window.location.search).get('id');

  if (id) {
    try {
      if (id.startsWith('guest-')) {
        const localRecord = loadGuestAnalysis(id);

        if (!localRecord) {
          throw new Error('Local guest analysis was not found on this device.');
        }

        $('customerName').value=localRecord.customer_name||'';
        $('customerEmail').value=localRecord.customer_email||'';
        $('customerPhone').value=localRecord.customer_phone||'';
        $('customerExternalId').value=localRecord.customer_external_id||'';
        $('companyAccountId').value=localRecord.company_account_id||'';
        $('customerNotes').value=localRecord.notes||'';

        Object.entries(localRecord.input_data||{}).forEach(([k,v])=>{
          if($(k)) $(k).value=v;
        });

        if (
          localRecord.customer_email ||
          localRecord.customer_phone ||
          localRecord.customer_external_id ||
          localRecord.company_account_id ||
          localRecord.notes
        ) {
          $('optionalDetails').hidden=false;
          $('optionalDetailsToggle').setAttribute('aria-expanded','true');
        }

        renderResults(localRecord, localRecord.created_at);
      } else {
        if (!supabaseConfigured || !supabase || !activeUser) {
          throw new Error('Sign in is required for cloud-saved analyses.');
        }

        await loadSavedAnalysis(id);
      }

      $('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
    } catch(e) {
      console.error(e);
      setToast(
        translate(
          id.startsWith('guest-')
            ? 'This local analysis is not available on this device anymore.'
            : 'Sign in to open this cloud-saved analysis.',
          id.startsWith('guest-')
            ? 'هذا التحليل المحلي لم يعد متاحًا على هذا الجهاز.'
            : 'سجّل الدخول لفتح هذا التحليل المحفوظ سحابيًا.'
        ),
        'error'
      );
    }
  }
}
init();
