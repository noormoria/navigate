import "./shared.js";
import { translate, getLanguage, setToast } from "./shared.js";
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);

let cachedCvTextA = "";
let cachedCvTextB = "";
let currentComparisonId = null;

const COMPARISON_HISTORY_KEY = "navigate_comparison_history";

const STOPWORDS = new Set([
  "and","or","the","a","an","of","to","in","for","with","on","at","by","from","as","is","are","be","this","that",
  "و","في","من","على","إلى","الى","عن","مع","أو","او","التي","الذي","هذه","هذا","خبرة","مهارة","مهارات"
]);

const SKILL_LEXICON = [
  "python","sql","excel","power bi","tableau","r","java","javascript","html","css","react","node.js","node",
  "machine learning","data analysis","data visualization","statistics","pandas","numpy","scikit-learn","tensorflow",
  "pytorch","spark","hadoop","sas","git","github","azure","aws","gcp","oracle","mysql","postgresql","power query",
  "dax","etl","api","apis","dashboard","dashboards","communication","leadership","project management","agile",
  "scrum","figma","ui","ux","data science","business intelligence"
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function criterionTerms(criteria) {
  const normalized = normalizeText(criteria);

  const skills = SKILL_LEXICON.filter((skill) =>
    normalized.includes(normalizeText(skill))
  );

  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

  return [...new Set([...skills, ...tokens])].slice(0, 36);
}

function termPresent(text, term) {
  const haystack = normalizeText(text);
  const needle = normalizeText(term);
  return haystack.includes(needle);
}

function inferredCriteriaTerms(textA, textB, role = "") {
  const combined = `${textA || ""} ${textB || ""}`;
  const roleTerms = criterionTerms(role);

  const detectedSkills = SKILL_LEXICON.filter((skill) =>
    termPresent(combined, skill)
  );

  return [...new Set([...roleTerms, ...detectedSkills])].slice(0, 24);
}

function estimateExperienceYears(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?|سنوات|سنة)/g)];

  if (!matches.length) return null;

  return Math.max(
    ...matches.map((match) => Number(match[1])).filter(Number.isFinite)
  );
}

function educationEvidence(text) {
  const normalized = normalizeText(text);

  const checks = [
    ["PhD", ["phd","doctorate","دكتوراه"]],
    ["Master", ["master","msc","ماجستير"]],
    ["Bachelor", ["bachelor","bsc","bs ","بكالوريوس"]],
    ["Diploma", ["diploma","دبلوم"]]
  ];

  const found = checks.find(([, terms]) =>
    terms.some((term) => normalized.includes(term))
  );

  return found ? found[0] : null;
}

function analyzeCv(text, terms) {
  const matched = terms.filter((term) => termPresent(text, term));
  const missing = terms.filter((term) => !termPresent(text, term));

  const coverage = terms.length
    ? Math.round((matched.length / terms.length) * 100)
    : 0;

  const experience = estimateExperienceYears(text);
  const education = educationEvidence(text);

  const skills = SKILL_LEXICON.filter((skill) =>
    termPresent(text, skill)
  );

  const strengths = [];

  matched.slice(0, 8).forEach((term) => strengths.push(term));

  if (experience !== null) {
    strengths.push(
      getLanguage() === "ar"
        ? `خبرة موثقة تصل إلى ${experience} سنوات بحسب نص السيرة`
        : `CV mentions up to ${experience} years of experience`
    );
  }

  if (education) {
    strengths.push(
      getLanguage() === "ar"
        ? `مؤهل موثق: ${education}`
        : `Documented education: ${education}`
    );
  }

  if (!strengths.length) {
    strengths.push(
      getLanguage() === "ar"
        ? "لم تظهر مطابقة واضحة للمتطلبات المكتوبة."
        : "No clear documented match to the stated criteria was found."
    );
  }

  return {
    score: coverage,
    matched,
    missing,
    strengths: [...new Set(strengths)].slice(0, 10),
    skills: [...new Set(skills)].slice(0, 18),
    experience,
    education
  };
}

async function readPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    text += " " + content.items
      .map((item) => item.str)
      .join(" ");
  }

  return text;
}

async function readDocx(file) {
  if (!window.mammoth) {
    throw new Error("DOCX reader could not be loaded.");
  }

  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });

  return result.value || "";
}

async function readCv(file) {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return readPdf(file);
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return readDocx(file);
  }

  if (file.type.startsWith("text/") || name.endsWith(".txt")) {
    return file.text();
  }

  throw new Error(
    translate(
      "Unsupported file type. Upload PDF, DOCX or TXT.",
      "نوع الملف غير مدعوم. ارفع PDF أو DOCX أو TXT."
    )
  );
}

function renderList(id, items, positive = false) {
  const container = $(id);

  if (!container) return;

  container.innerHTML = "";

  const safeItems = items.length
    ? items
    : [translate("No item detected.", "لم يتم اكتشاف عنصر.")];

  safeItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "factor-item";
    row.innerHTML = `<i></i><p>${escapeHtml(item)}</p>`;
    container.appendChild(row);
  });

  container.classList.toggle("positive", positive);
}

function renderCriteriaChart(
  terms,
  candidateA,
  candidateB,
  nameA = "Candidate A",
  nameB = "Candidate B"
) {
  const chart = $("criteriaComparisonChart");
  const summary = $("criteriaChartSummary");

  if (!chart) return;

  if ($("chartCandidateA")) $("chartCandidateA").textContent = nameA;
  if ($("chartCandidateB")) $("chartCandidateB").textContent = nameB;

  if (!terms.length) {
    chart.innerHTML = `
      <p class="chart-note">${translate(
        "No criteria available for comparison.",
        "لا توجد معايير متاحة للمقارنة."
      )}</p>
    `;
    if (summary) summary.textContent = "";
    return;
  }

  const data = terms.slice(0, 12).map((term) => ({
    term,
    a: candidateA.matched.includes(term) ? 100 : 0,
    b: candidateB.matched.includes(term) ? 100 : 0
  }));

  const width = 920;
  const left = 175;
  const right = 40;
  const top = 48;
  const bottom = 54;
  const rowHeight = 38;
  const chartWidth = width - left - right;
  const height = top + bottom + data.length * rowHeight;

  const x = (value) => left + (value / 100) * chartWidth;

  const grid = [0, 25, 50, 75, 100].map((tick) => `
    <g>
      <line
        x1="${x(tick)}"
        y1="${top - 16}"
        x2="${x(tick)}"
        y2="${height - bottom + 4}"
        stroke="rgba(125,29,53,.12)"
        stroke-width="1"
      />
      <text
        x="${x(tick)}"
        y="${height - 18}"
        text-anchor="middle"
        font-size="12"
        fill="#92747d">${tick}%</text>
    </g>
  `).join("");

  const rows = data.map((item, index) => {
    const y = top + index * rowHeight;
    const barH = 9;

    return `
      <g>
        <text
          x="${left - 14}"
          y="${y + 12}"
          text-anchor="end"
          font-size="12"
          font-weight="700"
          fill="#681029">${escapeHtml(item.term)}</text>

        <rect x="${left}" y="${y}" width="${chartWidth}" height="${barH}" rx="5" fill="#f3e5e9"/>
        <rect x="${left}" y="${y}" width="${Math.max(0, x(item.a) - left)}" height="${barH}" rx="5" fill="#971c3c"/>

        <rect x="${left}" y="${y + 14}" width="${chartWidth}" height="${barH}" rx="5" fill="#f3e5e9"/>
        <rect x="${left}" y="${y + 14}" width="${Math.max(0, x(item.b) - left)}" height="${barH}" rx="5" fill="#d77f96"/>
      </g>
    `;
  }).join("");

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img">
      <text x="${left}" y="18" font-size="12" fill="#92747d">
        ${translate("Documented criteria coverage (%)", "نسبة تغطية المعايير الموثقة (%)")}
      </text>
      ${grid}
      ${rows}
    </svg>
  `;

  const aLeads = data.filter((item) => item.a > item.b).length;
  const bLeads = data.filter((item) => item.b > item.a).length;
  const ties = data.filter((item) => item.a === item.b).length;

  if (summary) {
    summary.textContent = translate(
      `${nameA} leads on ${aLeads} criteria, ${nameB} leads on ${bLeads}, and ${ties} criteria are tied. The horizontal axis summarizes documented coverage from 0% to 100%.`,
      `${nameA} يتفوق في ${aLeads} من المعايير، و${nameB} يتفوق في ${bLeads}، بينما ${ties} من المعايير متعادلة. يلخص المحور الأفقي نسبة التغطية الموثقة من 0٪ إلى 100٪.`
    );
  }
}

function getComparisonHistory() {
  try {
    return JSON.parse(localStorage.getItem(COMPARISON_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveComparisonHistory(items) {
  localStorage.setItem(COMPARISON_HISTORY_KEY, JSON.stringify(items));
}

function persistComparison({
  role,
  criteria,
  nameA,
  nameB,
  statusA,
  statusB,
  terms,
  resultA,
  resultB
}) {
  if (!currentComparisonId) {
    currentComparisonId =
      `compare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const items = getComparisonHistory();
  const old = items.find((item) => item.id === currentComparisonId);

  const record = {
    id: currentComparisonId,
    record_type: "comparison",
    created_at: old?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role_title: role,
    criteria_text: criteria || "",
    candidate_a_name: nameA,
    candidate_b_name: nameB,
    candidate_a_status: statusA,
    candidate_b_status: statusB,
    score_a: resultA.score,
    score_b: resultB.score,
    terms,
    result_a: resultA,
    result_b: resultB
  };

  const next = [
    record,
    ...items.filter((item) => item.id !== currentComparisonId)
  ].slice(0, 100);

  saveComparisonHistory(next);
}

function loadSavedComparison(id) {
  return getComparisonHistory().find((item) => item.id === id) || null;
}

function restoreSavedComparison(record) {
  currentComparisonId = record.id;

  $("roleTitle").value = record.role_title || "";
  $("roleCriteria").value = record.criteria_text || "";
  $("candidateAName").value = record.candidate_a_name || "Candidate A";
  $("candidateBName").value = record.candidate_b_name || "Candidate B";
  $("candidateAStatus").value = record.candidate_a_status || "applicant";
  $("candidateBStatus").value = record.candidate_b_status || "applicant";

  renderResults(
    record.role_title || "",
    record.candidate_a_name || "Candidate A",
    record.candidate_b_name || "Candidate B",
    record.candidate_a_status || "applicant",
    record.candidate_b_status || "applicant",
    record.terms || [],
    record.result_a || { score: 0, matched: [], missing: [], strengths: [] },
    record.result_b || { score: 0, matched: [], missing: [], strengths: [] }
  );
}

function candidateStatusText(value) {
  if (value === "employee") {
    return translate("Current employee", "موظف حالي");
  }

  return translate("Job applicant", "متقدم للوظيفة");
}

function renderResults(
  role,
  nameA,
  nameB,
  statusA,
  statusB,
  terms,
  resultA,
  resultB
) {
  $("comparisonRole").textContent = role;
  $("scoreNameA").textContent = nameA;
  $("scoreNameB").textContent = nameB;

  $("scoreStatusA").textContent = candidateStatusText(statusA);
  $("scoreStatusB").textContent = candidateStatusText(statusB);

  $("scoreA").textContent = String(Math.round(resultA.score));
  $("scoreB").textContent = String(Math.round(resultB.score));

  $("scoreBarA").style.width = `${Math.round(resultA.score)}%`;
  $("scoreBarB").style.width = `${Math.round(resultB.score)}%`;

  renderList("strengthsA", resultA.strengths, true);
  renderList("strengthsB", resultB.strengths, true);

  renderList(
    "gapsA",
    resultA.missing.slice(0, 10).map((term) =>
      translate(
        `No clear CV evidence for: ${term}`,
        `لا يوجد دليل واضح في السيرة على: ${term}`
      )
    ),
    false
  );

  renderList(
    "gapsB",
    resultB.missing.slice(0, 10).map((term) =>
      translate(
        `No clear CV evidence for: ${term}`,
        `لا يوجد دليل واضح في السيرة على: ${term}`
      )
    ),
    false
  );

  renderCriteriaChart(terms, resultA, resultB, nameA, nameB);
  const verify = $("comparisonNextSteps");
  if (verify) {
    const gaps = [...new Set([...(resultA.missing||[]),...(resultB.missing||[])])].slice(0,3);
    const steps = [
      translate('Confirm the required criteria with the hiring manager before interpreting coverage scores.','تحقق من المتطلبات مع مسؤول التوظيف قبل تفسير نسب التغطية.'),
      translate('Ask both candidates the same job-related questions and assess a consistent work sample.','اطرح الأسئلة المهنية نفسها على المرشحين، وقيّم عينة عمل بمعايير موحدة.'),
      gaps.length
        ? translate('Verify the missing CV evidence through questions or work samples: ','تحقق من الأدلة غير المذكورة في السيرة عبر الأسئلة أو عينة العمل: ') + gaps.join(', ')
        : translate('Document interview evidence before choosing the next stage.','وثّق أدلة المقابلة قبل اختيار الخطوة التالية.'),
      translate('Record any confirmed findings separately from text-matching scores; make the final decision with human review.','سجّل النتائج المؤكدة بعيدًا عن درجات المطابقة النصية، واتخذ القرار النهائي بمراجعة بشرية.')
    ];
    verify.replaceChildren();
    steps.forEach((label,index)=>{
      const row=document.createElement('div');row.className='action-item';
      const num=document.createElement('span');num.textContent=String(index+1).padStart(2,'0');
      const para=document.createElement('p');para.textContent=label;row.append(num,para);verify.appendChild(row);
    });
  }

  const diff = Math.abs(resultA.score - resultB.score);

  if (diff < 5) {
    $("matchSummaryTitle").textContent = translate(
      "The CV evidence is very close.",
      "أدلة السيرتين متقاربة جدًا."
    );

    $("matchSummaryText").textContent = translate(
      `${nameA} scores ${resultA.score}/100 and ${nameB} scores ${resultB.score}/100. The difference is small, so interviews or work samples should carry more weight in the next step.`,
      `${nameA} حصل على ${resultA.score}/100 و${nameB} حصل على ${resultB.score}/100. الفرق صغير، لذلك يفضّل الاعتماد أكثر على المقابلة أو عينة العمل في الخطوة التالية.`
    );
  } else {
    const strongerName =
      resultA.score > resultB.score ? nameA : nameB;

    const strongerScore =
      Math.max(resultA.score, resultB.score);

    const lowerName =
      resultA.score > resultB.score ? nameB : nameA;

    const lowerScore =
      Math.min(resultA.score, resultB.score);

    $("matchSummaryTitle").textContent = translate(
      `${strongerName} has the stronger documented CV match.`,
      `${strongerName} لديه مطابقة موثقة أقوى في السيرة الذاتية.`
    );

    $("matchSummaryText").textContent = translate(
      `${strongerName} covers ${strongerScore}/100 of the comparison criteria versus ${lowerName} at ${lowerScore}/100. This is a structured CV comparison, not a final hiring decision.`,
      `${strongerName} يغطي ${strongerScore}/100 من معايير المقارنة مقابل ${lowerName} بدرجة ${lowerScore}/100. هذه مقارنة منظمة للسير الذاتية وليست قرار توظيف نهائي.`
    );
  }

  $("compareResults").hidden = false;

  $("compareResults").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function bindFileName(inputId, outputId) {
  $(inputId)?.addEventListener("change", () => {
    const file = $(inputId).files?.[0];
    $(outputId).textContent = file ? file.name : "";
  });
}

bindFileName("candidateAFile", "candidateAFileName");
bindFileName("candidateBFile", "candidateBFileName");

$("compareForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const role = $("roleTitle").value.trim();
  const criteria = $("roleCriteria").value.trim();

  const fileA = $("candidateAFile").files?.[0];
  const fileB = $("candidateBFile").files?.[0];

  const nameA =
    $("candidateAName").value.trim() || "Candidate A";

  const nameB =
    $("candidateBName").value.trim() || "Candidate B";

  const statusA = $("candidateAStatus").value;
  const statusB = $("candidateBStatus").value;

  if (!role) {
    setToast(
      translate(
        "Enter the role title.",
        "أدخل المسمى الوظيفي."
      ),
      "error"
    );
    return;
  }

  if ((!fileA && !cachedCvTextA) || (!fileB && !cachedCvTextB)) {
    setToast(
      translate(
        "Upload both CVs before comparing.",
        "ارفع السيرتين الذاتيتين قبل المقارنة."
      ),
      "error"
    );
    return;
  }

  try {
    setToast(
      translate(
        "Reading both CVs...",
        "جارٍ قراءة السيرتين الذاتيتين..."
      ),
      "info"
    );

    const textA =
      fileA ? await readCv(fileA) : cachedCvTextA;

    const textB =
      fileB ? await readCv(fileB) : cachedCvTextB;

    cachedCvTextA = textA;
    cachedCvTextB = textB;

    if (
      textA.trim().length < 80 ||
      textB.trim().length < 80
    ) {
      throw new Error(
        translate(
          "One CV did not contain enough readable text. Scanned-image PDFs may need OCR before upload.",
          "إحدى السيرتين لا تحتوي نصًا قابلًا للقراءة بشكل كافٍ. ملفات PDF المصورة قد تحتاج OCR قبل الرفع."
        )
      );
    }

    const terms = criteria
      ? criterionTerms(criteria)
      : inferredCriteriaTerms(textA, textB, role);

    if (terms.length < 3) {
      setToast(
        translate(
          "Not enough job-related evidence was found for a useful general comparison. Add a few requirements and compare again.",
          "لم يتم العثور على أدلة مهنية كافية لمقارنة عامة مفيدة. أضف بعض المتطلبات ثم أعد المقارنة."
        ),
        "warning"
      );
      return;
    }

    const resultA = analyzeCv(textA, terms);
    const resultB = analyzeCv(textB, terms);

    renderResults(
      role,
      nameA,
      nameB,
      statusA,
      statusB,
      terms,
      resultA,
      resultB
    );

    persistComparison({
      role,
      criteria,
      nameA,
      nameB,
      statusA,
      statusB,
      terms,
      resultA,
      resultB
    });

    setToast(
      criteria
        ? translate(
            "Comparison complete.",
            "اكتملت المقارنة."
          )
        : translate(
            "General comparison complete. You can edit the requirements and compare again without uploading the CVs again.",
            "اكتملت المقارنة العامة. يمكنك تعديل المتطلبات وإعادة المقارنة دون رفع السيرتين من جديد."
          ),
      "success"
    );

  } catch (error) {
    console.error(error);

    setToast(
      error.message ||
      translate(
        "Could not compare the CVs.",
        "تعذرت مقارنة السير الذاتية."
      ),
      "error"
    );
  }
});

$("editCriteriaButton")?.addEventListener("click", () => {
  const criteria = $("roleCriteria");

  if (!criteria) return;

  criteria.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  setTimeout(() => criteria.focus(), 350);

  setToast(
    translate(
      "Edit the requirements, then press Compare CV evidence again. You do not need to upload the CVs again.",
      "عدّل المتطلبات ثم اضغط مقارنة أدلة السير الذاتية مرة أخرى. لا تحتاج إلى رفع السيرتين من جديد."
    ),
    "info"
  );
});


const savedComparisonId =
  new URLSearchParams(window.location.search).get("id");

if (savedComparisonId?.startsWith("compare-")) {
  const savedComparison = loadSavedComparison(savedComparisonId);

  if (savedComparison) {
    restoreSavedComparison(savedComparison);

    setToast(
      translate(
        "Saved comparison opened from History.",
        "تم فتح المقارنة المحفوظة من السجل."
      ),
      "success"
    );
  }
}

window.addEventListener("navigate:language", () => {
  if (!$("compareResults").hidden) {
    setToast(
      translate(
        "Re-run the comparison to refresh the generated result text in the selected language.",
        "أعد تشغيل المقارنة لتحديث نصوص النتائج باللغة المختارة."
      ),
      "info"
    );
  }
});
