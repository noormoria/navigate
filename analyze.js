import { supabase } from './supabase-client.js';
import './shared.js';
import { refreshUser, translate, getLanguage, setToast, supabaseConfigured } from './shared.js';

let activeUser = null;
let latestAnalysis = null;
const $ = (id) => document.getElementById(id);

/*
  IMPORTANT:
  After the Python backend is deployed, replace this URL with the real API URL.
  Example: https://navigate-api.onrender.com
*/
const API_BASE_URL = 'https://navigate-efxe.onrender.com';

const MODEL_INFO = {
  name: 'Hist Gradient Boosting',
  threshold: 0.5537,
  ranges: {
    Tenure: { min: 1, max: 60, median: 32 },
    TotalSpend: { min: 100, max: 1000, median: 661 },
    LastInteraction: { min: 1, max: 30, median: 14 },
    UsageFrequency: { min: 1, max: 30, median: 16 },
    SupportCalls: { min: 0, max: 10, median: 3 },
    PaymentDelay: { min: 0, max: 30, median: 12 }
  }
};

// Model outputs are risk estimates; action plans must be verified against real customer records.
const REQUIRED_FEATURE_IDS = ['Tenure', 'TotalSpend', 'LastInteraction'];
const OPTIONAL_NUMERIC_IDS = ['UsageFrequency', 'SupportCalls', 'PaymentDelay'];

const SKILL_CATALOG = [
  'Python','SQL','Power BI','Tableau','Excel','Machine Learning','Artificial Intelligence','Data Analysis','Data Engineering','Statistics','R','SAS',
  'AWS','Azure','Google Cloud','Cloud Architecture','Cybersecurity','Network Security','DevOps','Docker','Kubernetes','Linux',
  'SAP','Oracle','Salesforce','ERP','CRM','Financial Analysis','Accounting','Risk Management','Project Management','Product Management',
  'Leadership','Team Management','Strategic Planning','Operations','Supply Chain','Logistics','Sales','Business Development','Customer Success',
  'Marketing','Digital Marketing','UX/UI Design','Graphic Design','JavaScript','React','Node.js','Java','C#','.NET','PHP','Mobile Development'
];

let selectedSkills = [];

const clamp = (v, min = 0, max = 100) => Math.min(max, Math.max(min, v));

function normalize(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return 50;
  return clamp(((value - min) / (max - min)) * 100);
}

function inverseNormalize(value, min, max) {
  return 100 - normalize(value, min, max);
}

function range(name) {
  return MODEL_INFO.ranges[name];
}

function optionalNumber(id) {
  const raw = $(id)?.value?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function skillLevelLabel(level) {
  const labels = {
    1: { en: 'Low', ar: 'منخفض' },
    2: { en: 'Moderate', ar: 'متوسط' },
    3: { en: 'Strong', ar: 'قوي' },
    4: { en: 'Very strong', ar: 'قوي جدًا' },
    5: { en: 'Critical', ar: 'حرج' }
  };
  const item = labels[Number(level)] || labels[3];
  return getLanguage() === 'ar' ? item.ar : item.en;
}

function skillImpactScore(skills = selectedSkills) {
  if (!Array.isArray(skills) || !skills.length) return 0;
  return clamp((skills.reduce((sum, s) => sum + Number(s.level || 3), 0) / (skills.length * 5)) * 100);
}

function collectSelectedSkills() {
  return selectedSkills.map((s) => ({ name: s.name, level: Number(s.level) }));
}

function renderSelectedSkills() {
  const wrap = $('selectedSkills');
  const empty = $('skillsEmpty');
  if (!wrap) return;

  wrap.innerHTML = '';

  if (!selectedSkills.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  selectedSkills.forEach((skill, index) => {
    const row = document.createElement('div');
    row.className = 'selected-skill-row';
    row.innerHTML = `
      <span class="selected-skill-name">${skill.name}</span>
      <label class="skill-strength">
        <span>${translate('Impact strength', 'قوة التأثير')}</span>
        <select data-skill-level="${index}">
          <option value="1" ${skill.level === 1 ? 'selected' : ''}>1 · ${translate('Low', 'منخفض')}</option>
          <option value="2" ${skill.level === 2 ? 'selected' : ''}>2 · ${translate('Moderate', 'متوسط')}</option>
          <option value="3" ${skill.level === 3 ? 'selected' : ''}>3 · ${translate('Strong', 'قوي')}</option>
          <option value="4" ${skill.level === 4 ? 'selected' : ''}>4 · ${translate('Very strong', 'قوي جدًا')}</option>
          <option value="5" ${skill.level === 5 ? 'selected' : ''}>5 · ${translate('Critical', 'حرج')}</option>
        </select>
      </label>
      <button type="button" class="skill-remove" data-remove-skill="${index}" aria-label="${translate('Remove skill', 'حذف المهارة')}">×</button>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('[data-skill-level]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.dataset.skillLevel);
      if (selectedSkills[index]) selectedSkills[index].level = Number(select.value);
    });
  });

  wrap.querySelectorAll('[data-remove-skill]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedSkills.splice(Number(button.dataset.removeSkill), 1);
      renderSelectedSkills();
    });
  });
}

function addSkill(name) {
  const clean = String(name || '').trim();
  if (!clean || selectedSkills.some((s) => s.name.toLowerCase() === clean.toLowerCase())) return;

  selectedSkills.push({ name: clean, level: 3 });
  renderSelectedSkills();

  if ($('skillSearch')) $('skillSearch').value = '';
  if ($('skillSuggestions')) $('skillSuggestions').hidden = true;
}

function renderSkillSuggestions(query = '') {
  const box = $('skillSuggestions');
  if (!box) return;

  const q = query.trim().toLowerCase();

  if (!q) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const matches = SKILL_CATALOG
    .filter((skill) =>
      skill.toLowerCase().includes(q) &&
      !selectedSkills.some((x) => x.name.toLowerCase() === skill.toLowerCase())
    )
    .slice(0, 10);

  if (!matches.length) {
    box.innerHTML = `<button type="button" data-custom-skill="${query.replace(/"/g, '&quot;')}">${translate('Add', 'إضافة')} “${query}”</button>`;
  } else {
    box.innerHTML = matches
      .map((skill) => `<button type="button" data-skill-option="${skill}">${skill}</button>`)
      .join('');
  }

  box.hidden = false;

  box.querySelectorAll('[data-skill-option]').forEach((button) =>
    button.addEventListener('click', () => addSkill(button.dataset.skillOption))
  );

  box.querySelectorAll('[data-custom-skill]').forEach((button) =>
    button.addEventListener('click', () => addSkill(button.dataset.customSkill))
  );
}

function restoreSelectedSkills(skills) {
  selectedSkills = Array.isArray(skills)
    ? skills
        .map((s) => ({
          name: String(s.name || '').trim(),
          level: Math.min(5, Math.max(1, Number(s.level) || 3))
        }))
        .filter((s) => s.name)
    : [];

  renderSelectedSkills();
}

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
    id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

function collectValues() {
  return {
    Tenure: Number($('Tenure').value),
    TotalSpend: Number($('TotalSpend').value),
    LastInteraction: Number($('LastInteraction').value),
    UsageFrequency: optionalNumber('UsageFrequency'),
    SupportCalls: optionalNumber('SupportCalls'),
    PaymentDelay: optionalNumber('PaymentDelay'),
    SubscriptionType: $('SubscriptionType').value || null,
    ContractLength: $('ContractLength').value || null
  };
}

function validateValues(values) {
  if (!REQUIRED_FEATURE_IDS.every((name) => Number.isFinite(values[name]))) {
    return translate(
      'Complete the three required operational signals with valid values.',
      'أكمل المؤشرات التشغيلية الثلاثة المطلوبة بقيم صحيحة.'
    );
  }

  const numericValues = [...REQUIRED_FEATURE_IDS, ...OPTIONAL_NUMERIC_IDS]
    .map((name) => values[name])
    .filter((value) => value !== null);

  if (numericValues.some((value) => value < 0)) {
    return translate(
      'Operational values cannot be negative.',
      'القيم التشغيلية لا يمكن أن تكون سالبة.'
    );
  }

  return null;
}

function getWarnings(values) {
  return [...REQUIRED_FEATURE_IDS, ...OPTIONAL_NUMERIC_IDS].filter((name) => {
    const value = values[name];
    if (value === null || !Number.isFinite(value)) return false;
    const r = range(name);
    return value < r.min || value > r.max;
  });
}

function renderWarning(fields) {
  const box = $('rangeWarning');

  if (!fields.length) {
    box.hidden = true;
    return;
  }

  const labels = {
    Tenure: { en: 'Customer tenure', ar: 'مدة تعامل العميل' },
    TotalSpend: { en: 'Customer revenue / total spend', ar: 'إيراد العميل / إجمالي الإنفاق' },
    LastInteraction: { en: 'Days since last activity', ar: 'الأيام منذ آخر نشاط' },
    UsageFrequency: { en: 'Usage frequency', ar: 'تكرار الاستخدام' },
    SupportCalls: { en: 'Support calls', ar: 'مكالمات الدعم' },
    PaymentDelay: { en: 'Payment delay', ar: 'تأخر الدفع' }
  };

  const details = fields.map((name) => {
    const r = range(name);
    const label = labels[name] || { en: name, ar: name };
    const text = getLanguage() === 'ar' ? label.ar : label.en;

    return `${text}: ${Math.round(r.min)}–${Math.round(r.max)}`;
  }).join(' • ');

  box.hidden = false;
  box.innerHTML = `
    <strong>${translate('Please double-check this value', 'يرجى التأكد من القيمة المدخلة')}</strong>
    <span>${translate(
      `One or more values are unusually high or low. Make sure the number was entered correctly. The analysis will still run. Typical input range: ${details}`,
      `توجد قيمة واحدة أو أكثر مرتفعة أو منخفضة بشكل غير معتاد. تأكد من أن الرقم أُدخل بشكل صحيح. سيستمر التحليل بشكل طبيعي. النطاق المعتاد للإدخال: ${details}`
    )}</span>
  `;
}

function apiIsConfigured() {
  return API_BASE_URL && !API_BASE_URL.includes('YOUR-BACKEND-URL');
}

async function predictFromApi(values) {
  if (!apiIsConfigured()) {
    throw new Error('NAVIGATE Python API URL has not been configured yet.');
  }

  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenure: values.Tenure,
      total_spend: values.TotalSpend,
      last_interaction: values.LastInteraction,
      usage_frequency: values.UsageFrequency,
      support_calls: values.SupportCalls,
      payment_delay: values.PaymentDelay,
      subscription_type: values.SubscriptionType,
      contract_length: values.ContractLength
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Prediction API failed (${response.status}): ${details}`);
  }

  return response.json();
}

function computeIndicators(values, probability, threshold) {
  const risk = clamp(probability * 100);

  const valueIndex = normalize(
    values.TotalSpend,
    range('TotalSpend').min,
    range('TotalSpend').max
  );

  const tenureHealth = normalize(
    values.Tenure,
    range('Tenure').min,
    range('Tenure').max
  );

  const recencyHealth = inverseNormalize(
    values.LastInteraction,
    range('LastInteraction').min,
    range('LastInteraction').max
  );

  const usageHealth = values.UsageFrequency === null
    ? 50
    : normalize(values.UsageFrequency, range('UsageFrequency').min, range('UsageFrequency').max);

  const supportHealth = values.SupportCalls === null
    ? 50
    : inverseNormalize(values.SupportCalls, range('SupportCalls').min, range('SupportCalls').max);

  const paymentHealth = values.PaymentDelay === null
    ? 50
    : inverseNormalize(values.PaymentDelay, range('PaymentDelay').min, range('PaymentDelay').max);

  const operationalHealth = clamp(
    0.35 * usageHealth +
    0.30 * supportHealth +
    0.35 * paymentHealth
  );

  const engagement = clamp(
    0.25 * tenureHealth +
    0.30 * recencyHealth +
    0.25 * usageHealth +
    0.10 * supportHealth +
    0.10 * paymentHealth
  );

  const priority = clamp(0.70 * risk + 0.30 * valueIndex);
  const thresholdPercent = threshold * 100;

  return {
    risk,
    valueIndex,
    engagement,
    priority,
    threshold: thresholdPercent,
    decisionMargin: Math.abs(risk - thresholdPercent),
    recencyHealth,
    operationalHealth
  };
}

function riskLevel(probability, threshold = MODEL_INFO.threshold) {
  if (probability < 0.25) return { key: 'low', en: 'Low', ar: 'منخفض' };
  if (probability < threshold) return { key: 'moderate', en: 'Moderate', ar: 'متوسط' };
  if (probability < 0.75) return { key: 'high', en: 'High', ar: 'مرتفع' };
  return { key: 'critical', en: 'Critical', ar: 'حرج' };
}

function priorityLevel(score) {
  if (score < 30) return { en: 'Low', ar: 'منخفضة' };
  if (score < 50) return { en: 'Moderate', ar: 'متوسطة' };
  if (score < 75) return { en: 'High', ar: 'مرتفعة' };
  return { en: 'Critical', ar: 'حرجة' };
}

function customerSegment(ind) {
  if (ind.valueIndex >= 70 && ind.risk >= ind.threshold) {
    return { en: 'High-value at risk', ar: 'عالي القيمة ومعرض للخطر' };
  }
  if (ind.valueIndex >= 70) {
    return { en: 'High-value stable', ar: 'عالي القيمة ومستقر' };
  }
  if (ind.risk >= ind.threshold) {
    return { en: 'At-risk', ar: 'معرض للخطر' };
  }
  return { en: 'Stable', ar: 'مستقر' };
}

function factorData(values, ind) {
  const risk = [];
  const positive = [];

  if (values.LastInteraction >= 20) {
    risk.push({
      en: `The customer has had no meaningful activity for ${Math.round(values.LastInteraction)} days, which is a strong disengagement signal.`,
      ar: `لم يسجل العميل نشاطًا مهمًا منذ ${Math.round(values.LastInteraction)} يومًا، وهذه إشارة قوية على انخفاض التفاعل.`
    });
  } else if (values.LastInteraction >= 10) {
    risk.push({
      en: `It has been ${Math.round(values.LastInteraction)} days since the customer’s last meaningful activity, so re-engagement should not be delayed.`,
      ar: `مرّ ${Math.round(values.LastInteraction)} يومًا منذ آخر نشاط مهم للعميل، لذلك لا يُفضّل تأخير إعادة التفاعل معه.`
    });
  } else {
    positive.push({
      en: `The customer was active recently (${Math.round(values.LastInteraction)} days since the last meaningful activity).`,
      ar: `العميل كان نشطًا مؤخرًا، إذ مرّ ${Math.round(values.LastInteraction)} يومًا فقط منذ آخر نشاط مهم.`
    });
  }

  if (values.UsageFrequency !== null) {
    if (values.UsageFrequency <= 8) {
      risk.push({
        en: `Usage frequency is limited (${Math.round(values.UsageFrequency)}), which may indicate weakening engagement.`,
        ar: `تكرار الاستخدام منخفض (${Math.round(values.UsageFrequency)}) وقد يشير إلى تراجع التفاعل.`
      });
    } else if (values.UsageFrequency >= 20) {
      positive.push({
        en: `Usage is strong (${Math.round(values.UsageFrequency)}), showing that the customer still engages with the service.`,
        ar: `الاستخدام مرتفع (${Math.round(values.UsageFrequency)}) مما يدل على استمرار تفاعل العميل مع الخدمة.`
      });
    }
  }

  if (values.SupportCalls !== null) {
    if (values.SupportCalls >= 5) {
      risk.push({
        en: `The customer has contacted support ${Math.round(values.SupportCalls)} times. Review whether there is unresolved friction.`,
        ar: `تواصل العميل مع الدعم ${Math.round(values.SupportCalls)} مرات. راجع ما إذا كانت هناك مشكلة متكررة أو غير محلولة.`
      });
    } else if (values.SupportCalls <= 2) {
      positive.push({
        en: `Support demand is currently low (${Math.round(values.SupportCalls)} calls), with no obvious sign of repeated service friction.`,
        ar: `الحاجة للدعم منخفضة حاليًا (${Math.round(values.SupportCalls)} مكالمات)، ولا توجد إشارة واضحة على احتكاك متكرر بالخدمة.`
      });
    }
  }

  if (values.PaymentDelay !== null) {
    if (values.PaymentDelay >= 10) {
      risk.push({
        en: `Payment is delayed by ${Math.round(values.PaymentDelay)} days. Check for billing friction, affordability concerns, or payment-process issues.`,
        ar: `يوجد تأخر في الدفع بمقدار ${Math.round(values.PaymentDelay)} يومًا. تحقق من وجود مشكلة في الفوترة أو القدرة على الدفع أو إجراءات السداد.`
      });
    } else if (values.PaymentDelay <= 3) {
      positive.push({
        en: `Payment behavior is healthy, with only ${Math.round(values.PaymentDelay)} days of delay.`,
        ar: `سلوك الدفع جيد، إذ يبلغ التأخر ${Math.round(values.PaymentDelay)} أيام فقط.`
      });
    }
  }

  if (values.Tenure < 6) {
    risk.push({
      en: `The customer relationship is still new (${Math.round(values.Tenure)} months), so early onboarding and value reinforcement are important.`,
      ar: `علاقة العميل ما زالت حديثة (${Math.round(values.Tenure)} أشهر)، لذلك يعد تحسين البداية وتوضيح القيمة أمرًا مهمًا.`
    });
  } else if (values.Tenure >= 24) {
    positive.push({
      en: `The customer has a long relationship with the company (${Math.round(values.Tenure)} months), which is worth protecting.`,
      ar: `للعميل علاقة طويلة مع الشركة (${Math.round(values.Tenure)} شهرًا)، وهي علاقة تستحق الحفاظ عليها.`
    });
  }

  if (values.TotalSpend >= 1000) {
    positive.push({
      en: `Customer revenue is substantial (${Number(values.TotalSpend).toLocaleString()}), so losing this account may have meaningful financial impact.`,
      ar: `إيراد العميل مرتفع (${Number(values.TotalSpend).toLocaleString()}), لذلك فقدان هذا الحساب قد يترك أثرًا ماليًا مهمًا.`
    });
  }

  if (!risk.length) {
    risk.push({
      en: 'No single warning signal dominates the profile. The model returned a combined risk estimate; no single reason can be confirmed from these inputs alone.',
      ar: 'لا توجد إشارة تحذير منفردة تسيطر على الملف. قدّر النموذج الخطر من المدخلات مجتمعة، ولا يمكن تأكيد سبب واحد اعتمادًا عليها فقط.'
    });
  }

  if (!positive.length) {
    positive.push({
      en: 'There is no strong positive signal to rely on right now, so the account should be managed proactively.',
      ar: 'لا توجد إشارة إيجابية قوية يمكن الاعتماد عليها حاليًا، لذلك يفضّل إدارة الحساب بشكل استباقي.'
    });
  }

  return { risk, positive };
}

function recommendationData(probability, values, ind, threshold) {
  const actions = [];
  const followUp = [];

  if (probability >= 0.75) {
    actions.push({
      en: 'Assign an owner to this account today and contact the customer within 24 hours.',
      ar: 'عيّن مسؤولًا واضحًا لهذا الحساب اليوم وتواصل مع العميل خلال 24 ساعة.'
    });
    actions.push({
      en: 'Ask one direct question: “What is the main reason you may reduce or stop using our service?” Record the answer before offering a solution.',
      ar: 'اسأل سؤالًا مباشرًا: «ما السبب الرئيسي الذي قد يجعلك تقلل أو توقف استخدام الخدمة؟» وسجّل الإجابة قبل تقديم الحل.'
    });
    followUp.push({
      en: 'Create a 7-day retention plan with a named owner, next-contact date, and a clear success measure.',
      ar: 'أنشئ خطة احتفاظ لمدة 7 أيام تتضمن اسم المسؤول وموعد التواصل القادم ومقياس نجاح واضح.'
    });
  } else if (probability >= 0.50) {
    actions.push({
      en: 'Contact the customer within 48 hours and identify the strongest source of friction.',
      ar: 'تواصل مع العميل خلال 48 ساعة وحدد أقوى سبب للاحتكاك أو عدم الرضا.'
    });
    followUp.push({
      en: 'Review the account again within 3–5 days after the first intervention.',
      ar: 'أعد مراجعة الحساب خلال 3–5 أيام بعد أول تدخل.'
    });
  } else {
    actions.push({
      en: 'Maintain regular engagement and watch for a decline in activity, usage, or payment behavior.',
      ar: 'حافظ على تواصل منتظم وراقب أي انخفاض في النشاط أو الاستخدام أو سلوك الدفع.'
    });
    followUp.push({
      en: 'Reassess after the next meaningful customer interaction.',
      ar: 'أعد التحليل بعد التفاعل المهم التالي مع العميل.'
    });
  }

  if (values.LastInteraction >= 10) {
    actions.push({
      en: `Use a re-engagement message tied to the customer’s actual history, not a generic campaign. Mention the most relevant service or benefit and ask for a reply.`,
      ar: 'أرسل تواصل إعادة تفاعل مرتبطًا بتاريخ العميل الفعلي وليس حملة عامة. اذكر الخدمة أو الفائدة الأكثر صلة واطلب ردًا واضحًا.'
    });
  }

  if (values.UsageFrequency !== null && values.UsageFrequency <= 8) {
    actions.push({
      en: 'Identify one feature or service the customer previously used successfully and guide them back to it with a simple next step.',
      ar: 'حدد ميزة أو خدمة سبق أن استخدمها العميل بنجاح، ووجّهه للعودة إليها بخطوة بسيطة وواضحة.'
    });
  }

  if (values.SupportCalls !== null && values.SupportCalls >= 5) {
    actions.push({
      en: 'Audit the latest support cases, confirm what remains unresolved, and close the loop with the customer personally.',
      ar: 'راجع آخر حالات الدعم، وحدد ما لم يُحل، ثم أغلق المشكلة مع العميل بتواصل شخصي.'
    });
  }

  if (values.PaymentDelay !== null && values.PaymentDelay >= 10) {
    actions.push({
      en: 'Check whether the issue is invoice clarity, payment method, billing timing, or affordability; solve the exact payment obstacle instead of sending a generic reminder.',
      ar: 'تحقق هل المشكلة في وضوح الفاتورة أو وسيلة الدفع أو توقيت الفوترة أو القدرة على الدفع، ثم عالج العائق الحقيقي بدل إرسال تذكير عام.'
    });
  }

  if (values.TotalSpend >= 1000 && probability >= 0.50) {
    actions.push({
      en: 'Review account value and the verified reason for leaving before considering an offer. Apply only approved offers within the retention budget.',
      ar: 'راجع قيمة الحساب والسبب المؤكد لاحتمال المغادرة قبل التفكير في عرض احتفاظ. استخدم فقط العروض المعتمدة وضمن الميزانية.'
    });
  }

  followUp.push({
    en: 'Assign every action to an account owner, document a case or ticket ID, record a due date, and verify the customer issue before marking it resolved.',
    ar: 'أسند كل إجراء لمسؤول الحساب، ووثّق رقم الحالة أو التذكرة وموعد التنفيذ، وتحقق من المشكلة قبل تسجيلها كمحلولة.'
  });

  followUp.push({
    en: 'After each action, record whether activity, usage, support demand, or payment behavior improved, then run the analysis again.',
    ar: 'بعد كل إجراء، سجّل هل تحسن النشاط أو الاستخدام أو الحاجة للدعم أو سلوك الدفع، ثم أعد تشغيل التحليل.'
  });

  return { actions, followUp };
}

function renderList(container, items, numbered = false) {
  container.innerHTML = '';

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = numbered ? 'action-item' : 'factor-item';

    const text = getLanguage() === 'ar' ? item.ar : item.en;

    row.innerHTML = numbered
      ? `<span>${String(index + 1).padStart(2, '0')}</span><p>${text}</p>`
      : `<i></i><p>${text}</p>`;

    container.appendChild(row);
  });
}

function renderSignalChart(values) {
  const specs = [
    ['Tenure','Tenure','مدة التعامل',false],
    ['TotalSpend','Revenue','الإيراد',false],
    ['LastInteraction','Activity recency','حداثة النشاط',true],
    ['UsageFrequency','Usage','الاستخدام',false],
    ['SupportCalls','Support health','سلامة الدعم',true],
    ['PaymentDelay','Payment health','سلامة الدفع',true]
  ];
  const available = specs.filter(([key]) => values[key] !== null && Number.isFinite(values[key]));
  const rows = available.map(([key,en,ar,inverse]) => {
    const r = range(key);
    const value = inverse ? inverseNormalize(values[key],r.min,r.max) : normalize(values[key],r.min,r.max);
    const score = Math.round(value);
    return `<div class="navigate-bar-row"><span class="navigate-bar-label">${getLanguage()==='ar'?ar:en}</span><div class="navigate-bar-track"><span style="width:${score}%"></span></div><strong>${score}</strong></div>`;
  }).join('');
  const host = $('signalChart');
  host.innerHTML = `<div class="navigate-bar-chart" role="img" aria-label="${translate('Customer signal bar chart','رسم أعمدة مؤشرات العميل')}"><div class="navigate-bar-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>${rows}</div>`;
}

function renderBenchmarkChart(values) {
  const specs = [
    ['Tenure','Relationship','العلاقة',false],
    ['TotalSpend','Revenue','الإيراد',false],
    ['LastInteraction','Activity','النشاط',true],
    ['UsageFrequency','Usage','الاستخدام',false],
    ['SupportCalls','Support health','سلامة الدعم',true],
    ['PaymentDelay','Payment health','سلامة الدفع',true]
  ];
  const items = specs.filter(([key])=>values[key]!==null && Number.isFinite(values[key])).map(([key,en,ar,inverse])=>{
    const r=range(key);
    return {label:getLanguage()==='ar'?ar:en,score:Math.round(inverse?inverseNormalize(values[key],r.min,r.max):normalize(values[key],r.min,r.max))};
  }).sort((a,b)=>b.score-a.score);
  $('benchmarkChart').innerHTML=`<div class="navigate-bar-chart ranked" role="img" aria-label="${translate('Ranked customer signal chart','رسم ترتيب مؤشرات العميل')}"><div class="navigate-bar-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>${items.map(x=>`<div class="navigate-bar-row"><span class="navigate-bar-label">${x.label}</span><div class="navigate-bar-track"><span style="width:${x.score}%"></span></div><strong>${x.score}</strong></div>`).join('')}</div>`;
}

async function renderSensitivityChart(values) {
  const container = $('sensitivityChart');
  if (!container) return;

  if (!apiIsConfigured()) {
    container.innerHTML = `<p class="chart-note">${translate(
      'Sensitivity chart will activate after the Python API URL is connected.',
      'سيتم تفعيل رسم حساسية الخطر بعد ربط رابط Python API.'
    )}</p>`;
    return;
  }

  try {
    const r = range('LastInteraction');
    const points = 7;
    const xValues = Array.from({ length: points }, (_, index) =>
      r.min + ((r.max - r.min) * index / (points - 1))
    );

    const results = await Promise.all(
      xValues.map((x) =>
        predictFromApi({ ...values, LastInteraction: Number(x.toFixed(2)) })
      )
    );

    const samples = xValues.map((x, index) => ({
      x,
      risk: Number(results[index].churn_percentage)
    }));

    const width = 620;
    const height = 220;
    const padX = 34;
    const padY = 24;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const sx = (x) => padX + ((x - r.min) / Math.max(1, r.max - r.min)) * plotW;
    const sy = (risk) => padY + (1 - clamp(risk) / 100) * plotH;

    const path = samples
      .map((point, index) =>
        `${index === 0 ? 'M' : 'L'} ${sx(point.x).toFixed(1)} ${sy(point.risk).toFixed(1)}`
      )
      .join(' ');

    const currentX = clamp(values.LastInteraction, r.min, r.max);
    const currentResult = await predictFromApi({ ...values, LastInteraction: currentX });
    const currentRisk = Number(currentResult.churn_percentage);

    const yLines = [0, 25, 50, 75, 100]
      .map((v) => `
        <g>
          <line x1="${padX}" y1="${sy(v)}" x2="${width - padX}" y2="${sy(v)}" class="chart-gridline"/>
          <text x="4" y="${sy(v) + 4}" class="chart-axis-text">${v}</text>
        </g>
      `)
      .join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${translate('Risk sensitivity line chart', 'رسم خطي لحساسية الخطر')}">
        ${yLines}
        <path d="${path}" class="sensitivity-line" />
        <circle cx="${sx(currentX)}" cy="${sy(currentRisk)}" r="6" class="sensitivity-point"/>
        <text x="${padX}" y="${height - 2}" class="chart-axis-text">${Math.round(r.min)}d</text>
        <text x="${width - padX - 24}" y="${height - 2}" class="chart-axis-text">${Math.round(r.max)}d</text>
      </svg>

      <div class="sensitivity-summary">
        <span>${translate('Current inactivity', 'عدم النشاط الحالي')}
          <strong>${Math.round(values.LastInteraction)} ${translate('days', 'يوم')}</strong>
        </span>
        <span>${translate('Current model risk', 'الخطر الحالي')}
          <strong>${Math.round(currentRisk)}%</strong>
        </span>
      </div>
    `;

    const minRisk = Math.min(...samples.map((x) => x.risk));
    const maxRisk = Math.max(...samples.map((x) => x.risk));
    const change = maxRisk - minRisk;
    const sensitivityLabel = change >= 20
      ? translate('strong', 'قوي')
      : change >= 8
        ? translate('moderate', 'متوسط')
        : translate('limited', 'محدود');

    const explanation = $('sensitivityExplanation');
    if (explanation) {
      explanation.textContent = translate(
        `For this customer, inactivity has a ${sensitivityLabel} effect on churn risk. Across the scenarios shown, risk moves from about ${Math.round(minRisk)}% to ${Math.round(maxRisk)}%. The current point is ${Math.round(currentRisk)}% at ${Math.round(values.LastInteraction)} days since the last activity. If the line rises as days increase, faster re-engagement is likely to matter more.`,
        `بالنسبة لهذا العميل، تأثير عدم النشاط على خطر المغادرة ${sensitivityLabel}. عبر السيناريوهات المعروضة يتغير الخطر تقريبًا من ${Math.round(minRisk)}٪ إلى ${Math.round(maxRisk)}٪. النقطة الحالية هي ${Math.round(currentRisk)}٪ عند مرور ${Math.round(values.LastInteraction)} يومًا منذ آخر نشاط. إذا كان الخط يرتفع مع زيادة الأيام فهذا يعني أن سرعة إعادة التفاعل تصبح أكثر أهمية.`
      );
    }
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="chart-note">${translate(
      'Sensitivity analysis is temporarily unavailable.',
      'تحليل حساسية الخطر غير متاح مؤقتًا.'
    )}</p>`;
  }
}

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat(
    getLanguage() === 'ar' ? 'ar-SA' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' }
  ).format(new Date(value));
}

function buildPayload(values, apiResult, ind, factors, recs) {
  const probability = Number(apiResult.churn_probability);
  const threshold = Number(apiResult.decision_threshold || MODEL_INFO.threshold);
  const level = riskLevel(probability, threshold);
  const segment = customerSegment(ind);

  return {
    customer_name: $('customerName').value.trim(),
    customer_email: $('customerEmail').value.trim() || null,
    customer_phone: $('customerPhone').value.trim() || null,
    customer_external_id: $('customerExternalId').value.trim() || null,
    company_account_id: $('companyAccountId').value.trim() || null,
    notes: $('customerNotes').value.trim() || null,

    model_version: 'navigate-hgb-python-v1',
    model_name: MODEL_INFO.name,

    input_data: {
      ...values,
      Skills: collectSelectedSkills()
    },

    churn_risk: Number(probability.toFixed(6)),
    predicted_churn: Number(apiResult.prediction),
    risk_level: level.en,
    retention_priority: Number(ind.priority.toFixed(2)),
    customer_value_index: Number(ind.valueIndex.toFixed(2)),
    engagement_health: Number(ind.engagement.toFixed(2)),
    operational_health: Number(ind.operationalHealth.toFixed(2)),
    decision_margin: Number(ind.decisionMargin.toFixed(2)),
    model_threshold: Number(threshold.toFixed(6)),
    customer_segment: segment.en,
    risk_factors: factors.risk,
    retention_signals: factors.positive,
    recommended_actions: recs.actions,
    follow_up_plan: recs.followUp
  };
}

async function renderResults(payload, createdAt = new Date()) {
  const values = payload.input_data || {};
  const probability = Number(payload.churn_risk);
  const threshold = Number(payload.model_threshold || MODEL_INFO.threshold);

  const ind = computeIndicators(values, probability, threshold);
  ind.priority = Number(payload.retention_priority ?? ind.priority);
  ind.valueIndex = Number(payload.customer_value_index ?? ind.valueIndex);
  ind.engagement = Number(payload.engagement_health ?? ind.engagement);
  ind.operationalHealth = Number(payload.operational_health ?? ind.operationalHealth);
  ind.decisionMargin = Number(payload.decision_margin ?? ind.decisionMargin);

  const level = riskLevel(probability, threshold);
  const priority = priorityLevel(ind.priority);
  const segment = customerSegment(ind);

  const derivedFactors = factorData(values, ind);
  const derivedRecs = recommendationData(probability, values, ind, threshold);

  const factors = {
    risk: payload.risk_factors || derivedFactors.risk,
    positive: payload.retention_signals || derivedFactors.positive
  };

  const recs = {
    actions: payload.recommended_actions || derivedRecs.actions,
    followUp: payload.follow_up_plan || derivedRecs.followUp
  };

  $('resultCustomerName').textContent = payload.customer_name || translate('Customer', 'العميل');
  $('resultTimestamp').textContent = formatDate(createdAt);

  $('metricRisk').textContent = `${Math.round(ind.risk)}%`;
  $('metricRiskLabel').textContent = getLanguage() === 'ar' ? level.ar : level.en;
  $('metricPriority').textContent = Math.round(ind.priority);
  $('metricValue').textContent = Math.round(ind.valueIndex);
  $('metricSkills').textContent = Math.round(skillImpactScore(values.Skills || []));
  $('metricEngagement').textContent = Math.round(ind.engagement);
  $('metricRecency').textContent = Math.round(ind.recencyHealth);
  $('metricOperational').textContent = Math.round(ind.operationalHealth);

  $('riskCategoryBadge').dataset.level = level.key;
  $('riskCategoryBadge').textContent = getLanguage() === 'ar' ? level.ar : level.en;

  $('gaugeRisk').textContent = `${Math.round(ind.risk)}%`;
  $('riskGauge').style.setProperty('--risk-angle', `${ind.risk * 3.6}deg`);
  $('riskMarker').style.left = `${clamp(ind.risk)}%`;

  const above = probability >= threshold;
  const riskText = probability >= 0.75
    ? translate(
        `This customer is at very high risk of leaving (${Math.round(ind.risk)}%). The marker is near the high-risk end, so this account should be treated as urgent. Focus first on the weakest customer signals and contact the customer quickly.`,
        `هذا العميل في مستوى خطر مرتفع جدًا للمغادرة (${Math.round(ind.risk)}٪). المؤشر قريب من الطرف الأعلى للخطر، لذلك يُفضّل التعامل مع الحساب كحالة عاجلة. ابدأ بأضعف مؤشرات العميل وتواصل معه بسرعة.`
      )
    : probability >= 0.50
      ? translate(
          `This customer has a high churn risk (${Math.round(ind.risk)}%). The position is clearly on the higher-risk side, so proactive retention action is recommended before engagement weakens further.`,
          `خطر مغادرة هذا العميل مرتفع (${Math.round(ind.risk)}٪). موضع المؤشر واضح في جهة الخطر الأعلى، لذلك يُنصح بإجراء احتفاظ استباقي قبل أن يضعف التفاعل أكثر.`
        )
      : probability >= 0.25
        ? translate(
            `This customer has a moderate churn risk (${Math.round(ind.risk)}%). The account is not yet in the highest-risk zone, but specific warning signals should be addressed early.`,
            `خطر مغادرة هذا العميل متوسط (${Math.round(ind.risk)}٪). الحساب ليس في أعلى منطقة خطر حاليًا، لكن يفضّل معالجة إشارات التحذير مبكرًا.`
          )
        : translate(
            `This customer currently shows a low churn risk (${Math.round(ind.risk)}%). Keep the relationship active and monitor for meaningful changes in behavior.`,
            `خطر مغادرة هذا العميل منخفض حاليًا (${Math.round(ind.risk)}٪). حافظ على نشاط العلاقة وراقب أي تغيرات مهمة في السلوك.`
          );

  $('riskDecisionText').textContent = riskText;

  const riskPositionExplanation = $('riskPositionExplanation');
  if (riskPositionExplanation) {
    riskPositionExplanation.textContent = translate(
      `The horizontal marker shows this customer's current risk position from lower to higher risk. A position farther to the right means the account needs faster and more focused retention action.`,
      `المؤشر الأفقي يوضح موضع خطر هذا العميل من خطر أقل إلى خطر أعلى. كلما اتجه المؤشر أكثر إلى اليمين احتاج الحساب إلى تدخل احتفاظ أسرع وأكثر تركيزًا.`
    );
  }

  renderSignalChart(values);
  renderBenchmarkChart(values);
  renderSensitivityChart(values);

  $('decisionTitle').textContent = above
    ? translate('Retention attention recommended', 'يوصى باهتمام احتفاظي')
    : translate('No strong churn signal currently', 'لا توجد إشارة مغادرة قوية حاليًا');

  $('decisionSummary').textContent = above
    ? translate(
        `This customer has a ${Math.round(ind.risk)}% churn risk. Considering both churn risk and revenue strength, the current retention priority is ${Math.round(ind.priority)}/100.`,
        `خطر مغادرة هذا العميل هو ${Math.round(ind.risk)}٪. وبالنظر إلى خطر المغادرة وقوة الإيراد معًا، تصبح أولوية الاحتفاظ الحالية ${Math.round(ind.priority)}/100.`
      )
    : translate(
        `This customer has a ${Math.round(ind.risk)}% churn risk. Continue monitoring the account and respond quickly if activity, usage, support, or payment behavior weakens.`,
        `خطر مغادرة هذا العميل هو ${Math.round(ind.risk)}٪. استمر في متابعة الحساب وتدخل بسرعة إذا تراجع النشاط أو الاستخدام أو سلوك الدعم أو الدفع.`
      );

  $('summaryRiskLevel').textContent = getLanguage() === 'ar' ? level.ar : level.en;
  $('summaryPriority').textContent = getLanguage() === 'ar' ? priority.ar : priority.en;
  $('summarySegment').textContent = getLanguage() === 'ar' ? segment.ar : segment.en;

  renderList($('riskFactors'), factors.risk);
  renderList($('retentionSignals'), factors.positive);
  renderList($('recommendedActions'), recs.actions, true);
  renderList($('followUpPlan'), recs.followUp, true);

  const skillList = $('skillsImpactList');
  if (skillList) {
    const skills = Array.isArray(values.Skills) ? values.Skills : [];
    skillList.innerHTML = skills.length
      ? skills
          .map(
            (skill) => `
              <div class="skill-impact-item">
                <span>${skill.name}</span>
                <strong>${skillLevelLabel(skill.level)} · ${Math.round((Number(skill.level) / 5) * 100)}</strong>
              </div>
            `
          )
          .join('')
      : `<p class="chart-note">${translate(
          'No key skills were added for this customer.',
          'لم تتم إضافة مهارات أساسية لهذا العميل.'
        )}</p>`;
  }

  $('resultsSection').hidden = false;
  latestAnalysis = { payload, createdAt };
}

async function saveAnalysis(payload) {
  if (!supabaseConfigured || !supabase || !activeUser) return null;

  const { data, error } = await supabase
    .from('customer_analyses')
    .insert({ user_id: activeUser.id, ...payload })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function populateFormFromRecord(data) {
  $('customerName').value = data.customer_name || '';
  $('customerEmail').value = data.customer_email || '';
  $('customerPhone').value = data.customer_phone || '';
  $('customerExternalId').value = data.customer_external_id || '';
  $('companyAccountId').value = data.company_account_id || '';
  $('customerNotes').value = data.notes || '';

  const input = data.input_data || {};

  [
    'Tenure',
    'TotalSpend',
    'LastInteraction',
    'UsageFrequency',
    'SupportCalls',
    'PaymentDelay',
    'SubscriptionType',
    'ContractLength'
  ].forEach((key) => {
    if ($(key) && input[key] !== null && input[key] !== undefined) {
      $(key).value = input[key];
    }
  });

  restoreSelectedSkills(input.Skills || []);

  if (
    data.customer_email ||
    data.customer_phone ||
    data.customer_external_id ||
    data.company_account_id ||
    data.notes
  ) {
    $('optionalDetails').hidden = false;
    $('optionalDetailsToggle').setAttribute('aria-expanded', 'true');
  }
}

async function loadSavedAnalysis(id) {
  const { data, error } = await supabase
    .from('customer_analyses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  if (data.model_version && data.model_version !== 'navigate-hgb-python-v1') {
    throw new Error('This record belongs to an older NAVIGATE model version.');
  }

  populateFormFromRecord(data);
  await renderResults(data, data.created_at);
}

$('skillSearch')?.addEventListener('input', (event) =>
  renderSkillSuggestions(event.target.value)
);

$('skillSearch')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const first = $('skillSuggestions')?.querySelector('button');
    if (first) first.click();
    else addSkill(event.target.value);
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.skill-search-wrap') && $('skillSuggestions')) {
    $('skillSuggestions').hidden = true;
  }
});

$('optionalDetailsToggle')?.addEventListener('click', () => {
  const details = $('optionalDetails');
  const open = !details.hidden;

  details.hidden = open;
  $('optionalDetailsToggle').setAttribute('aria-expanded', String(!open));
  $('optionalDetailsToggle').querySelector('span:first-child').textContent = open ? '＋' : '−';
});

$('analysisForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!$('customerName').value.trim()) {
    setToast(translate('Customer name is required.', 'اسم العميل مطلوب.'), 'error');
    $('customerName').focus();
    return;
  }

  const values = collectValues();
  const validationError = validateValues(values);

  if (validationError) {
    setToast(validationError, 'error');
    return;
  }

  // Do not block or warn merely because values lie beyond training reference ranges.

  const submitButton = event.submitter || $('analysisForm').querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const apiResult = await predictFromApi(values);

    const probability = Number(apiResult.churn_probability);
    const threshold = Number(apiResult.decision_threshold || MODEL_INFO.threshold);

    const ind = computeIndicators(values, probability, threshold);
    const factors = factorData(values, ind);
    const recs = recommendationData(probability, values, ind, threshold);
    const payload = buildPayload(values, apiResult, ind, factors, recs);

    await renderResults(payload);

    try {
      const saved = await saveAnalysis(payload);

      if (saved) {
        latestAnalysis = { payload: saved, createdAt: saved.created_at };

        const url = new URL(window.location.href);
        url.searchParams.set('id', saved.id);
        history.replaceState({}, '', url);

        setToast(
          translate(
            'Analysis complete and saved to your history.',
            'اكتمل التحليل وتم حفظه في السجل.'
          ),
          'success'
        );
      } else {
        const localRecord = saveGuestAnalysis(payload);
        latestAnalysis = { payload: localRecord, createdAt: localRecord.created_at };

        const url = new URL(window.location.href);
        url.searchParams.set('id', localRecord.id);
        history.replaceState({}, '', url);

        setToast(
          translate(
            'Analysis complete and saved to this device. Sign in only if you want History synced across devices.',
            'اكتمل التحليل وتم حفظه على هذا الجهاز. سجّل الدخول فقط إذا أردت مزامنة السجل بين الأجهزة.'
          ),
          'success'
        );
      }
    } catch (saveError) {
      console.error(saveError);
      latestAnalysis = { payload, createdAt: new Date() };

      setToast(
        translate(
          'Analysis complete, but saving failed. Your result is still shown below.',
          'اكتمل التحليل، لكن تعذر الحفظ. النتيجة ما زالت معروضة بالأسفل.'
        ),
        'error'
      );
    }

    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);

    const message = !apiIsConfigured()
      ? translate(
          'The Python API is ready in the project, but its public deployment URL still needs to be connected.',
          'ملفات Python API جاهزة في المشروع، لكن نحتاج أولًا ربط رابط النشر العام للباك إند.'
        )
      : translate(
          'Could not reach the Python prediction API. Check that the backend is online.',
          'تعذر الاتصال بـ Python API. تأكد من أن الباك إند يعمل.'
        );

    setToast(message, 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$('printReport')?.addEventListener('click', () => window.print());

window.addEventListener('navigate:language', () => {
  renderSelectedSkills();
  if (latestAnalysis) {
    renderResults(latestAnalysis.payload, latestAnalysis.createdAt);
  }
});

async function init() {
  activeUser = await refreshUser();

  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) return;

  try {
    if (id.startsWith('guest-')) {
      const localRecord = loadGuestAnalysis(id);

      if (!localRecord) {
        throw new Error('Local guest analysis was not found on this device.');
      }

      if (
        localRecord.model_version &&
        localRecord.model_version !== 'navigate-hgb-python-v1'
      ) {
        throw new Error('This record belongs to an older NAVIGATE model version.');
      }

      populateFormFromRecord(localRecord);
      await renderResults(localRecord, localRecord.created_at);
    } else {
      if (!supabaseConfigured || !supabase || !activeUser) {
        throw new Error('Sign in is required for cloud-saved analyses.');
      }

      await loadSavedAnalysis(id);
    }

    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);

    setToast(
      translate(
        id.startsWith('guest-')
          ? 'This analysis is unavailable or belongs to an older model version.'
          : 'Sign in to open this cloud-saved analysis.',
        id.startsWith('guest-')
          ? 'هذا التحليل غير متاح أو يعود لإصدار أقدم من النموذج.'
          : 'سجّل الدخول لفتح هذا التحليل المحفوظ سحابيًا.'
      ),
      'error'
    );
  }
}

renderSelectedSkills();
init();

/* Accessible, progressive disclosure of the existing analysis form. */
function initializeGuidedAnalysis() {
  const form=$('analysisForm'); if(!form) return;
  const panels=Array.from(form.querySelectorAll(':scope > article.form-panel'));
  let step=0;
  const headings=[['Customer details','معلومات العميل'],['Optional skills','المهارات الاختيارية'],['Customer activity','نشاط العميل']];
  const update=()=>{
    panels.forEach((p,i)=>{p.hidden=i!==step;});
    $('navigateStepTitle').textContent=headings[step][getLanguage()==='ar'?1:0];
    $('navigateStepProgress').style.width=((step+1)/panels.length*100)+'%';
    $('navigateStepCount').textContent=translate('Step','الخطوة')+' '+(step+1)+' / '+panels.length;
    $('navigatePrevious').hidden=step===0;
    $('navigateNext').hidden=step===panels.length-1;
    $('navigateSubmit').hidden=step!==panels.length-1;
  };
  $('navigateNext').addEventListener('click',()=>{
    if(step===0 && !$('customerName').value.trim()){setToast(translate('Enter a customer name first.','أدخل اسم العميل أولًا.'),'error');$('customerName').focus();return;}
    step=Math.min(step+1,panels.length-1);update();form.scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('navigatePrevious').addEventListener('click',()=>{step=Math.max(0,step-1);update();form.scrollIntoView({behavior:'smooth',block:'start'});});
  $('skillGuideToggle')?.addEventListener('click',()=>{
    const panel=$('skillGuidePanel');panel.hidden=!panel.hidden;
    $('skillGuideToggle').setAttribute('aria-expanded',String(!panel.hidden));
  });
  document.querySelector('[data-language-toggle]')?.addEventListener('click',()=>queueMicrotask(update));
  update();
}
initializeGuidedAnalysis();
