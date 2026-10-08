import "./shared.js";
import { translate, getLanguage, setToast } from "./shared.js";
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);

let cachedCvTextA = "";
let cachedCvTextB = "";

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

  const uniqueTokens = [...new Set(tokens)];

  const terms = [...new Set([...skills, ...uniqueTokens])];

  return terms.slice(0, 36);
}


function inferredCriteriaTerms(textA, textB, role = "") {
  const combined = `${textA || ""} ${textB || ""}`;
  const roleTerms = criterionTerms(role);

  const skillTerms = SKILL_LEXICON.filter((skill) =>
    termPresent(combined, skill)
  );

  const terms = [...new Set([...roleTerms, ...skillTerms])];

  return terms.slice(0, 24);
}

function termPresent(text, term) {
  const haystack = normalizeText(text);
  const needle = normalizeText(term);
  return haystack.includes(needle);
}

function estimateExperienceYears(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?|سنوات|سنة)/g)];
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => Number(m[1])).filter(Number.isFinite));
}

function educationEvidence(text) {
  const normalized = normalizeText(text);
  const checks = [
    ["PhD", ["phd","doctorate","دكتوراه"]],
    ["Master", ["master","msc","ماجستير"]],
    ["Bachelor", ["bachelor","bsc","bs ","بكالوريوس"]],
    ["Diploma", ["diploma","دبلوم"]],
  ];

  const found = checks.find(([, terms]) => terms.some((term) => normalized.includes(term)));
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
  const skills = SKILL_LEXICON.filter((skill) => termPresent(text, skill));

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
    education,
  };
}

async function readPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buffer}).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += " " + content.items.map((item) => item.str).join(" ");
  }

  return text;
}

async function readDocx(file) {
  if (!window.mammoth) {
    throw new Error("DOCX reader could not be loaded.");
  }

  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({arrayBuffer: buffer});
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

function renderCriteriaChart(terms, a, b) {
  const rows = terms.slice(0, 14).map((term) => {
    const aMatch = a.matched.includes(term) ? 100 : 0;
    const bMatch = b.matched.includes(term) ? 100 : 0;

    return `<div class="criteria-row">
      <div class="criteria-label">${escapeHtml(term)}</div>
      <div class="criteria-pair">
        <div><span>A</span><div class="criteria-track"><i style="width:${aMatch}%"></i></div></div>
        <div><span>B</span><div class="criteria-track alt"><i style="width:${bMatch}%"></i></div></div>
      </div>
    </div>`;
  }).join("");

  $("criteriaComparisonChart").innerHTML = rows || `
    <p class="chart-note">${translate(
      "Add clearer role requirements to generate a criteria chart.",
      "أضف متطلبات وظيفية أوضح لإنشاء رسم المقارنة."
    )}</p>`;
}


function candidateStatusText(value) {
  if (value === "employee") {
    return translate("Current employee", "موظف حالي");
  }
  return translate("Job applicant", "متقدم للوظيفة");
}

function renderResults(role, nameA, nameB, statusA, statusB, terms, resultA, resultB) {
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
      translate(`No clear CV evidence for: ${term}`, `لا يوجد دليل واضح في السيرة على: ${term}`)
    ),
    false
  );

  renderList(
    "gapsB",
    resultB.missing.slice(0, 10).map((term) =>
      translate(`No clear CV evidence for: ${term}`, `لا يوجد دليل واضح في السيرة على: ${term}`)
    ),
    false
  );

  renderCriteriaChart(terms, resultA, resultB);

  const diff = Math.abs(resultA.score - resultB.score);

  if (diff < 5) {
    $("matchSummaryTitle").textContent = translate(
      "The CV evidence is very close.",
      "أدلة السيرتين متقاربة جدًا."
    );

    $("matchSummaryText").textContent = translate(
      `${nameA} scores ${resultA.score}/100 and ${nameB} scores ${resultB.score}/100 against the written role criteria. The difference is too small to treat as a meaningful advantage without interviews or work samples.`,
      `${nameA} حصل على ${resultA.score}/100 و${nameB} حصل على ${resultB.score}/100 وفق المتطلبات المكتوبة. الفرق صغير جدًا ولا يُعد أفضلية موثوقة بدون مقابلة أو عينة عمل.`
    );
  } else {
    const strongerName = resultA.score > resultB.score ? nameA : nameB;
    const strongerScore = Math.max(resultA.score, resultB.score);
    const lowerName = resultA.score > resultB.score ? nameB : nameA;
    const lowerScore = Math.min(resultA.score, resultB.score);

    $("matchSummaryTitle").textContent = translate(
      `${strongerName} has the stronger documented CV match.`,
      `${strongerName} لديه مطابقة موثقة أقوى في السيرة الذاتية.`
    );

    $("matchSummaryText").textContent = translate(
      `${strongerName} covers ${strongerScore}/100 of the extracted role criteria versus ${lowerName} at ${lowerScore}/100. This is a CV-to-criteria comparison only, not a hiring recommendation.`,
      `${strongerName} يغطي ${strongerScore}/100 من المتطلبات المستخرجة مقابل ${lowerName} بدرجة ${lowerScore}/100. هذه مقارنة بين السيرة والمتطلبات فقط وليست توصية توظيف.`
    );
  }

  $("compareResults").hidden = false;
  $("compareResults").scrollIntoView({behavior: "smooth", block: "start"});
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
  const nameA = $("candidateAName").value.trim() || "Candidate A";
  const nameB = $("candidateBName").value.trim() || "Candidate B";
  const statusA = $("candidateAStatus").value;
  const statusB = $("candidateBStatus").value;

  if (!role || (!fileA && !cachedCvTextA) || (!fileB && !cachedCvTextB)) {
    setToast(
      translate(
        "Enter the role title and upload both CVs.",
        "أدخل المسمى الوظيفي وارفع السيرتين الذاتيتين."
      ),
      "error"
    );
    return;
  }

  try {
    setToast(translate("Reading both CVs...", "جارٍ قراءة السيرتين الذاتيتين..."), "info");

    const textA = fileA ? await readCv(fileA) : cachedCvTextA;
    const textB = fileB ? await readCv(fileB) : cachedCvTextB;

    cachedCvTextA = textA;
    cachedCvTextB = textB;

    const terms = criteria
      ? criterionTerms(criteria)
      : inferredCriteriaTerms(textA, textB, role);

    if (terms.length < 3) {
      setToast(
        translate(
          "Not enough job-related evidence was found for a useful comparison. Add a few requirements and run it again.",
          "لم يتم العثور على أدلة مهنية كافية لمقارنة مفيدة. أضف بعض المتطلبات ثم أعد التشغيل."
        ),
        "warning"
      );
      return;
    }

    if (!criteria) {
      setToast(
        translate(
          "General comparison created. You can now edit the requirements and compare again for a role-specific result.",
          "تم إنشاء مقارنة عامة. يمكنك الآن تعديل المتطلبات وإعادة المقارنة للحصول على نتيجة أكثر تخصيصًا للوظيفة."
        ),
        "info"
      );
    }

    if (textA.trim().length < 80 || textB.trim().length < 80) {
      throw new Error(
        translate(
          "One CV did not contain enough readable text. Scanned-image PDFs may need OCR before upload.",
          "إحدى السيرتين لا تحتوي نصًا قابلًا للقراءة بشكل كافٍ. ملفات PDF المصورة قد تحتاج OCR قبل الرفع."
        )
      );
    }

    const resultA = analyzeCv(textA, terms);
    const resultB = analyzeCv(textB, terms);

    renderResults(role, nameA, nameB, statusA, statusB, terms, resultA, resultB);

    setToast(
      translate("Comparison complete.", "اكتملت المقارنة."),
      "success"
    );
  } catch (error) {
    console.error(error);
    setToast(error.message || translate("Could not compare the CVs.", "تعذرت مقارنة السير الذاتية."), "error");
  }
});

window.addEventListener("navigate:language", () => {
  if (!$("compareResults").hidden) {
    setToast(
      translate(
        "Re-run the comparison to refresh generated text in the selected language.",
        "أعد تشغيل المقارنة لتحديث النصوص المولدة باللغة المختارة."
      ),
      "info"
    );
  }
});


$("editCriteriaButton")?.addEventListener("click", () => {
  const criteria = $("roleCriteria");
  if (!criteria) return;

  criteria.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => criteria.focus(), 350);

  setToast(
    translate(
      "Edit the requirements, then press Compare candidates again. You do not need to upload the CVs again.",
      "عدّل المتطلبات ثم اضغط مقارنة المرشحين مرة أخرى. لا تحتاج إلى رفع السيرتين من جديد."
    ),
    "info"
  );
});
