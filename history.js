import { supabase, supabaseConfigured } from './supabase-client.js';
import './shared.js';
import { refreshUser, translate, getLanguage, setToast } from './shared.js';

let records = [];
let currentUser = null;
let historyScope = 'local';

const $ = (id) => document.getElementById(id);
const GUEST_HISTORY_KEY = 'navigate_guest_history';

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function getGuestHistory() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveGuestHistory(data) {
  localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(data));
}

function formatDate(v) {
  return new Intl.DateTimeFormat(
    getLanguage()==='ar' ? 'ar-SA' : 'en-US',
    {dateStyle:'medium',timeStyle:'short'}
  ).format(new Date(v));
}

function levelKey(v) {
  v=String(v||'').toLowerCase();
  if(v==='critical') return 'critical';
  if(v==='high') return 'high';
  if(v==='moderate') return 'moderate';
  return 'low';
}

function levelText(v) {
  if(getLanguage()!=='ar') return v||'—';
  const m={critical:'حرج',high:'مرتفع',moderate:'متوسط',low:'منخفض'};
  return m[String(v||'').toLowerCase()]||v||'—';
}

function updateScopeMessage() {
  const box = $('historyScopeNote');
  if (!box) return;

  if (historyScope === 'cloud') {
    box.dataset.type = 'success';
    box.textContent = translate(
      'Signed in: History is saved to your account and can sync across devices.',
      'أنت مسجل الدخول: يتم حفظ السجل في حسابك ويمكن مزامنته بين الأجهزة.'
    );
  } else {
    box.dataset.type = 'info';
    box.textContent = translate(
      'Guest mode: History is saved only in this browser on this device. Sign in only if you want cross-device sync.',
      'وضع الزائر: يتم حفظ السجل داخل هذا المتصفح وعلى هذا الجهاز فقط. سجّل الدخول فقط إذا أردت المزامنة بين الأجهزة.'
    );
  }
}

function render(data=records) {
  $('historyCount').textContent=data.length;
  $('historyLoading').hidden=true;

  if(!data.length) {
    $('historyList').hidden=true;
    $('historyEmpty').hidden=false;
    return;
  }

  $('historyEmpty').hidden=true;
  $('historyList').hidden=false;

  $('historyList').innerHTML=data.map(r=>{
    const risk=Math.round(Number(r.churn_risk||0)*100);
    const priority=Math.round(Number(r.retention_priority||0));
    const contact=[r.customer_email,r.customer_phone,r.customer_external_id]
      .filter(Boolean)
      .join(' · ');

    return `<article class="history-row">
      <div class="history-customer">
        <span class="history-avatar">${escapeHtml((r.customer_name||'?').trim().charAt(0).toUpperCase())}</span>
        <div>
          <h3>${escapeHtml(r.customer_name)}</h3>
          <p>${escapeHtml(contact||translate('No optional contact details','لا توجد بيانات تواصل اختيارية'))}</p>
        </div>
      </div>

      <div class="history-stat">
        <small>${translate('Churn risk','خطر المغادرة')}</small>
        <strong>${risk}%</strong>
      </div>

      <div class="history-stat">
        <small>${translate('Priority','الأولوية')}</small>
        <strong>${priority}/100</strong>
      </div>

      <div class="history-level">
        <span class="risk-badge" data-level="${levelKey(r.risk_level)}">${levelText(r.risk_level)}</span>
      </div>

      <div class="history-date">
        <small>${translate('Analyzed','تاريخ التحليل')}</small>
        <span>${formatDate(r.created_at)}</span>
      </div>

      <div class="history-actions">
        <a class="icon-button" href="analyze.html?id=${encodeURIComponent(r.id)}" title="${translate('Open analysis','فتح التحليل')}">↗</a>
        <button class="icon-button danger" data-delete="${r.id}" title="${translate('Delete analysis','حذف التحليل')}">×</button>
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-delete]').forEach(btn=>{
    btn.addEventListener('click',()=>deleteRecord(btn.dataset.delete));
  });
}

function filter() {
  const q=$('historySearch').value.trim().toLowerCase();

  if(!q) return render(records);

  render(
    records.filter(r=>
      [r.customer_name,r.customer_email,r.customer_phone,r.customer_external_id,r.company_account_id]
        .filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(q))
    )
  );
}

async function deleteRecord(id) {
  if(!confirm(
    translate(
      'Delete this saved analysis? This cannot be undone.',
      'حذف هذا التحليل المحفوظ؟ لا يمكن التراجع عن ذلك.'
    )
  )) return;

  if (historyScope === 'cloud') {
    const {error}=await supabase
      .from('customer_analyses')
      .delete()
      .eq('id',id);

    if(error) {
      setToast(error.message,'error');
      return;
    }
  } else {
    const next = records.filter(r=>r.id!==id);
    saveGuestHistory(next);
  }

  records=records.filter(r=>r.id!==id);
  filter();

  setToast(
    translate('Analysis deleted.','تم حذف التحليل.'),
    'success'
  );
}

async function init() {
  currentUser = await refreshUser();

  if (currentUser && supabaseConfigured && supabase) {
    historyScope = 'cloud';

    const {data,error}=await supabase
      .from('customer_analyses')
      .select('*')
      .order('created_at',{ascending:false});

    $('historyLoading').hidden=true;

    if(error) {
      setToast(
        translate(
          'Could not load your cloud history. Showing local guest history instead.',
          'تعذر تحميل السجل السحابي. سيتم عرض السجل المحلي بدلًا منه.'
        ),
        'error'
      );

      historyScope = 'local';
      records = getGuestHistory();
    } else {
      records=data||[];
    }
  } else {
    historyScope = 'local';
    records=getGuestHistory();
  }

  updateScopeMessage();
  render();
}

$('historySearch')?.addEventListener('input',filter);
window.addEventListener('navigate:language',()=>{
  updateScopeMessage();
  filter();
});

init();
