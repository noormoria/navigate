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
const COMPARISON_HISTORY_KEY = 'navigate_comparison_history';


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

function getComparisonHistory() {
  try {
    return JSON.parse(localStorage.getItem(COMPARISON_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveComparisonHistory(data) {
  localStorage.setItem(COMPARISON_HISTORY_KEY, JSON.stringify(data));
}

function isComparison(record) {
  return record?.record_type === 'comparison' ||
    String(record?.id || '').startsWith('compare-');
}

function sortHistory(items) {
  return [...items].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
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

    if (isComparison(r)) {
      const scoreA = Math.round(Number(r.score_a || 0));
      const scoreB = Math.round(Number(r.score_b || 0));
      const nameA = r.candidate_a_name || 'Candidate A';
      const nameB = r.candidate_b_name || 'Candidate B';
      const role = r.role_title || translate('Candidate comparison','مقارنة مرشحين');

      return `<article class="history-row ${selectedIds.has(id) ? 'selected' : ''}">
        <label class="history-row-select">
          <input type="checkbox" class="history-row-checkbox"
            data-select-id="${escapeHtml(id)}"
            ${selectedIds.has(id) ? 'checked' : ''}/>
        </label>

        <div class="history-customer">
          <span class="history-avatar">↔</span>
          <div>
            <h3>${escapeHtml(role)}</h3>
            <p>${escapeHtml(nameA)} · ${escapeHtml(nameB)}</p>
          </div>
        </div>

        <div class="history-stat">
          <small>${translate('Candidate A','المرشح A')}</small>
          <strong>${scoreA}/100</strong>
        </div>

        <div class="history-stat">
          <small>${translate('Candidate B','المرشح B')}</small>
          <strong>${scoreB}/100</strong>
        </div>

        <div class="history-level">
          <span class="risk-badge" data-level="moderate">${translate('Comparison','مقارنة')}</span>
        </div>

        <div class="history-date">
          <small>${translate('Compared','تاريخ المقارنة')}</small>
          <span>${formatDate(r.created_at)}</span>
        </div>

        <div class="history-actions">
          <a class="icon-button"
            href="compare.html?id=${encodeURIComponent(r.id)}"><span class="history-open-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 17L17 7"></path>
                <path d="M8 7h9v9"></path>
              </svg>
            </span></a>
          <button class="icon-button danger"
            data-delete="${escapeHtml(id)}">×</button>
        </div>
      </article>`;
    }

    const risk=Math.round(Number(r.churn_risk||0)*100);
    const priority=Math.round(Number(r.retention_priority||0));
    const contact=[r.customer_email,r.customer_phone,r.customer_external_id]
      .filter(Boolean)
      .join(' · ');

    return `<article class="history-row ${selectedIds.has(id) ? 'selected' : ''}">
      <label class="history-row-select">
        <input type="checkbox" class="history-row-checkbox"
          data-select-id="${escapeHtml(id)}"
          ${selectedIds.has(id) ? 'checked' : ''}/>
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
        <a class="icon-button"
          href="analyze.html?id=${encodeURIComponent(r.id)}"><span class="history-open-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 17L17 7"></path>
                <path d="M8 7h9v9"></path>
              </svg>
            </span></a>
        <button class="icon-button danger"
          data-delete="${escapeHtml(id)}">×</button>
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
    records.filter(r=>{
      const values = isComparison(r)
        ? [r.role_title,r.candidate_a_name,r.candidate_b_name,r.criteria_text]
        : [r.customer_name,r.customer_email,r.customer_phone,r.customer_external_id,r.company_account_id];

      return values
        .filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(q));
    })
  );
}

async function deleteRecord(id) {
  const record = records.find(r=>String(r.id)===String(id));
  const comparison = isComparison(record);

  if(!confirm(
    translate(
      comparison
        ? 'Delete this saved comparison? This cannot be undone.'
        : 'Delete this saved analysis? This cannot be undone.',
      comparison
        ? 'حذف هذه المقارنة المحفوظة؟ لا يمكن التراجع عن ذلك.'
        : 'حذف هذا التحليل المحفوظ؟ لا يمكن التراجع عن ذلك.'
    )
  )) return;

  if (comparison) {
    const next = getComparisonHistory()
      .filter(r=>String(r.id)!==String(id));
    saveComparisonHistory(next);
  } else if (historyScope === 'cloud') {
    const {error}=await supabase
      .from('customer_analyses')
      .delete()
      .eq('id',id);

    if(error) {
      setToast(error.message,'error');
      return;
    }
  } else {
    const next = getGuestHistory()
      .filter(r=>String(r.id)!==String(id));
    saveGuestHistory(next);
  }

  selectedIds.delete(String(id));
  records=records.filter(r=>String(r.id)!==String(id));
  filter();

  setToast(
    translate(
      comparison ? 'Comparison deleted.' : 'Analysis deleted.',
      comparison ? 'تم حذف المقارنة.' : 'تم حذف التحليل.'
    ),
    'success'
  );
}

async function deleteSelected() {
  const ids = [...selectedIds];

  if (!ids.length) return;

  const confirmed = confirm(
    translate(
      `Delete ${ids.length} selected saved items? This cannot be undone.`,
      `حذف ${ids.length} من العناصر المحددة؟ لا يمكن التراجع عن ذلك.`
    )
  );

  if (!confirmed) return;

  const button = $('deleteSelectedHistory');
  if (button) button.disabled = true;

  try {
    const comparisonIds = ids.filter(id =>
      isComparison(records.find(r=>String(r.id)===String(id)))
    );

    const analysisIds = ids.filter(id => !comparisonIds.includes(id));

    if (comparisonIds.length) {
      saveComparisonHistory(
        getComparisonHistory().filter(
          r=>!comparisonIds.includes(String(r.id))
        )
      );
    }

    if (analysisIds.length) {
      if (historyScope === 'cloud') {
        const {error}=await supabase
          .from('customer_analyses')
          .delete()
          .in('id', analysisIds);

        if(error) throw error;
      } else {
        saveGuestHistory(
          getGuestHistory().filter(
            r=>!analysisIds.includes(String(r.id))
          )
        );
      }
    }

    records = records.filter(r=>!selectedIds.has(String(r.id)));
    selectedIds.clear();
    filter();

    setToast(
      translate(
        `${ids.length} saved items deleted.`,
        `تم حذف ${ids.length} من العناصر المحفوظة.`
      ),
      'success'
    );
  } catch (error) {
    console.error(error);
    setToast(
      error.message || translate(
        'Could not delete the selected items.',
        'تعذر حذف العناصر المحددة.'
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
  records = sortHistory([...getGuestHistory(), ...getComparisonHistory()]);

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
      records = sortHistory([...(data || []), ...getComparisonHistory()]);

      updateScopeMessage();
      render();
    }
  } catch (error) {
    console.warn('History cloud load skipped:', error);

    // Keep local history visible and usable.
    historyScope = 'local';
    records = sortHistory([...getGuestHistory(), ...getComparisonHistory()]);

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


// History page menu: force one reliable handler even if another page script/cache is stale.
function setupHistoryMenuFallback() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;

  let backdrop = document.querySelector(".menu-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "menu-backdrop";
    backdrop.setAttribute("aria-label", "Close menu");
    document.body.appendChild(backdrop);
  }

  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    backdrop.classList.toggle("show", open);
    document.body.classList.toggle("menu-open", open);
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  // Capture phase prevents a second stale listener from immediately undoing the click.
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    setOpen(!nav.classList.contains("open"));
  }, true);

  backdrop.addEventListener("click", () => setOpen(false));

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

setupHistoryMenuFallback();
