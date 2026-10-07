import { supabase, supabaseConfigured } from './supabase-client.js';
import './shared.js';
import { refreshUser, translate, getLanguage, setToast } from './shared.js';

let records = [];
let visibleRecords = [];
let currentUser = null;
let historyScope = 'local';
const selectedIds = new Set();

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

function updateSelectionControls() {
  const count = selectedIds.size;
  const countEl = $('selectedHistoryCount');
  const deleteButton = $('deleteSelectedHistory');
  const selectAll = $('selectAllHistory');

  if (countEl) countEl.textContent = String(count);
  if (deleteButton) deleteButton.disabled = count === 0;

  if (selectAll) {
    const visibleIds = visibleRecords.map(r => String(r.id));
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length;

    selectAll.checked =
      visibleIds.length > 0 &&
      selectedVisible === visibleIds.length;

    selectAll.indeterminate =
      selectedVisible > 0 &&
      selectedVisible < visibleIds.length;
  }
}

function render(data=records) {
  visibleRecords = data;
  $('historyCount').textContent=records.length;
  $('historyLoading').hidden=true;

  if(!data.length) {
    $('historyList').hidden=true;
    $('historyEmpty').hidden=false;
    updateSelectionControls();
    return;
  }

  $('historyEmpty').hidden=true;
  $('historyList').hidden=false;

  $('historyList').innerHTML=data.map(r=>{
    const id = String(r.id);
    const risk=Math.round(Number(r.churn_risk||0)*100);
    const priority=Math.round(Number(r.retention_priority||0));
    const contact=[r.customer_email,r.customer_phone,r.customer_external_id]
      .filter(Boolean)
      .join(' · ');

    return `<article class="history-row ${selectedIds.has(id) ? 'selected' : ''}">
      <label class="history-row-select" title="${translate('Select analysis','تحديد التحليل')}">
        <input
          type="checkbox"
          class="history-row-checkbox"
          data-select-id="${escapeHtml(id)}"
          ${selectedIds.has(id) ? 'checked' : ''}
        />
      </label>

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
        <button class="icon-button danger" data-delete="${escapeHtml(id)}" title="${translate('Delete analysis','حذف التحليل')}">×</button>
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-delete]').forEach(btn=>{
    btn.addEventListener('click',()=>deleteRecord(btn.dataset.delete));
  });

  document.querySelectorAll('[data-select-id]').forEach(box=>{
    box.addEventListener('change',()=>{
      const id = String(box.dataset.selectId);

      if (box.checked) selectedIds.add(id);
      else selectedIds.delete(id);

      box.closest('.history-row')?.classList.toggle('selected', box.checked);
      updateSelectionControls();
    });
  });

  updateSelectionControls();
}

function filter() {
  const q=$('historySearch').value.trim().toLowerCase();

  if(!q) {
    render(records);
    return;
  }

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
    const next = records.filter(r=>String(r.id)!==String(id));
    saveGuestHistory(next);
  }

  selectedIds.delete(String(id));
  records=records.filter(r=>String(r.id)!==String(id));
  filter();

  setToast(
    translate('Analysis deleted.','تم حذف التحليل.'),
    'success'
  );
}

async function deleteSelected() {
  const ids = [...selectedIds];

  if (!ids.length) return;

  const confirmed = confirm(
    translate(
      `Delete ${ids.length} selected analyses? This cannot be undone.`,
      `حذف ${ids.length} من التحليلات المحددة؟ لا يمكن التراجع عن ذلك.`
    )
  );

  if (!confirmed) return;

  const button = $('deleteSelectedHistory');
  if (button) button.disabled = true;

  try {
    if (historyScope === 'cloud') {
      const {error}=await supabase
        .from('customer_analyses')
        .delete()
        .in('id', ids);

      if(error) throw error;
    } else {
      const next = records.filter(r=>!selectedIds.has(String(r.id)));
      saveGuestHistory(next);
    }

    records = records.filter(r=>!selectedIds.has(String(r.id)));
    selectedIds.clear();
    filter();

    setToast(
      translate(
        `${ids.length} analyses deleted.`,
        `تم حذف ${ids.length} من التحليلات.`
      ),
      'success'
    );
  } catch (error) {
    console.error(error);
    setToast(
      error.message || translate(
        'Could not delete the selected analyses.',
        'تعذر حذف التحليلات المحددة.'
      ),
      'error'
    );
  } finally {
    updateSelectionControls();
  }
}

function toggleSelectAllVisible(checked) {
  visibleRecords.forEach(record=>{
    const id = String(record.id);

    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  });

  render(visibleRecords);
}

async function withTimeout(promise, ms = 2500) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    )
  ]);
}

async function init() {
  // Always start with local history so the page never gets stuck loading.
  historyScope = 'local';
  records = getGuestHistory();

  updateScopeMessage();
  render();

  // Then try to upgrade to cloud history if the user is signed in.
  // If Supabase is slow/unavailable, the local history remains usable.
  try {
    currentUser = await withTimeout(refreshUser(), 2500);

    if (currentUser && supabaseConfigured && supabase) {
      const result = await withTimeout(
        supabase
          .from('customer_analyses')
          .select('*')
          .order('created_at', { ascending: false }),
        3500
      );

      const { data, error } = result;

      if (error) throw error;

      historyScope = 'cloud';
      records = data || [];

      updateScopeMessage();
      render();
    }
  } catch (error) {
    console.warn('History cloud load skipped:', error);

    // Keep local history visible and usable.
    historyScope = 'local';
    records = getGuestHistory();

    updateScopeMessage();
    render();
  }
}

$('historySearch')?.addEventListener('input',filter);

$('selectAllHistory')?.addEventListener('change',(event)=>{
  toggleSelectAllVisible(event.target.checked);
});

$('deleteSelectedHistory')?.addEventListener('click',deleteSelected);

window.addEventListener('navigate:language',()=>{
  updateScopeMessage();
  filter();
});

init();
