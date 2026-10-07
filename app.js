let modelData = null;
let language = "en";

const $ = (id) => document.getElementById(id);

async function loadModel() {
  try {
    const response = await fetch("navigate_web_model.json");
    if (!response.ok) throw new Error("Model file could not be loaded.");
    modelData = await response.json();
  } catch (error) {
    showStatus(
      language === "ar"
        ? "تعذر تحميل ملف النموذج. تأكدي أن navigate_web_model.json موجود بجانب ملفات الموقع."
        : "Could not load the model. Make sure navigate_web_model.json is in the same folder as the website."
    );
  }
}

function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function predictProbability(values) {
  if (!modelData) throw new Error("Model is not loaded.");

  const probabilities = modelData.members.map((member) => {
    const standardized = modelData.features.map((feature, i) => {
      return (
        (values[feature] - member.scaler_mean[i]) /
        member.scaler_scale[i]
      );
    });

    let decision = member.intercept;

    member.coef.forEach((coefficient, i) => {
      decision += coefficient * standardized[i];
    });

    return sigmoid(
      -(member.calibration_a * decision + member.calibration_b)
    );
  });

  return probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
}

function getRiskLevel(probability, threshold) {
  if (probability < threshold * 0.5) {
    return language === "ar" ? "منخفض" : "Low";
  }
  if (probability < threshold) {
    return language === "ar" ? "متوسط" : "Moderate";
  }
  if (probability < 0.5) {
    return language === "ar" ? "مرتفع" : "High";
  }
  return language === "ar" ? "حرج" : "Critical";
}

function getFactors(values) {
  const ranges = modelData.feature_ranges || {};
  const factors = [];

  const median = (name, fallback) =>
    ranges[name] && Number.isFinite(ranges[name].median)
      ? ranges[name].median
      : fallback;

  if (values.SatisfactionScore <= 2) {
    factors.push(
      language === "ar"
        ? "درجة رضا العميل منخفضة."
        : "Customer satisfaction is low."
    );
  }

  if (values.Complain === 1) {
    factors.push(
      language === "ar"
        ? "يوجد سجل شكوى للعميل."
        : "A customer complaint is recorded."
    );
  }

  if (values.DaysSinceLastOrder > median("DaysSinceLastOrder", 7)) {
    factors.push(
      language === "ar"
        ? "مر وقت أطول من المعتاد منذ آخر نشاط."
        : "The time since the customer's last activity is above the training median."
    );
  }

  if (values.OrderCount < median("OrderCount", 2)) {
    factors.push(
      language === "ar"
        ? "تكرار التعامل أقل من المستوى الوسطي في بيانات التدريب."
        : "Customer activity frequency is below the training median."
    );
  }

  if (values.TenureMonths < median("TenureMonths", 12)) {
    factors.push(
      language === "ar"
        ? "مدة علاقة العميل بالشركة أقصر من المستوى الوسطي في بيانات التدريب."
        : "Customer tenure is below the training median."
    );
  }

  if (!factors.length) {
    factors.push(
      language === "ar"
        ? "لا توجد إشارة منفردة واضحة، والنتيجة ناتجة عن مجموعة العوامل معًا."
        : "No single review factor stands out; the score comes from the combined customer profile."
    );
  }

  return factors;
}

function getAction(probability, threshold) {
  if (probability >= 0.5) {
    return language === "ar"
      ? "ابدأ تواصلًا سريعًا مع العميل، راجع تجربته الأخيرة، وحدد سبب التراجع قبل تقديم عرض احتفاظ مناسب."
      : "Prioritize immediate outreach, review the customer's recent experience, and identify likely friction before offering a suitable retention option.";
  }

  if (probability >= threshold) {
    return language === "ar"
      ? "نفّذ تواصلًا استباقيًا مع العميل وراجع الرضا والنشاط والشكاوى قبل أن يرتفع الخطر."
      : "Use proactive outreach and review satisfaction, activity, and complaints before the risk increases.";
  }

  if (probability >= threshold * 0.5) {
    return language === "ar"
      ? "راقب العميل خلال الفترة القادمة وحافظ على تفاعل منتظم."
      : "Monitor the customer and maintain consistent engagement.";
  }

  return language === "ar"
    ? "استمر في العلاقة الحالية وراقب أي تغير واضح في النشاط أو الرضا."
    : "Continue regular engagement and watch for meaningful changes in activity or satisfaction.";
}

function showStatus(message) {
  const box = $("statusMessage");
  box.textContent = message;
  box.hidden = false;
}

function clearStatus() {
  $("statusMessage").hidden = true;
}

function renderResult(probability, values) {
  const threshold = Number(modelData.decision_threshold);
  const percent = Math.round(probability * 1000) / 10;
  const churnFlag = probability >= threshold;
  const riskLevel = getRiskLevel(probability, threshold);

  $("riskValue").textContent = `${percent}%`;
  $("riskLabel").textContent = riskLevel;
  $("riskMeterFill").style.width = `${Math.min(100, percent)}%`;
  $("thresholdValue").textContent = `${(threshold * 100).toFixed(1)}%`;

  if (churnFlag) {
    $("decisionText").textContent =
      language === "ar"
        ? "العميل يحتاج اهتمامًا للاحتفاظ به"
        : "Customer needs retention attention";

    $("decisionDescription").textContent =
      language === "ar"
        ? "احتمال المغادرة تجاوز حد القرار الذي تم اختياره أثناء التحقق من النموذج."
        : "Estimated churn probability is above the decision threshold selected during model validation.";
  } else {
    $("decisionText").textContent =
      language === "ar"
        ? "لا توجد إشارة مغادرة قوية حاليًا"
        : "No strong churn signal currently";

    $("decisionDescription").textContent =
      language === "ar"
        ? "احتمال المغادرة أقل من حد القرار، مع ضرورة الاستمرار في متابعة سلوك العميل."
        : "Estimated churn probability is below the model decision threshold, while continued monitoring is still recommended.";
  }

  const list = $("factorsList");
  list.innerHTML = "";
  getFactors(values).forEach((factor) => {
    const li = document.createElement("li");
    li.textContent = factor;
    list.appendChild(li);
  });

  $("actionText").textContent = getAction(probability, threshold);
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateLanguage() {
  document.body.classList.toggle("rtl", language === "ar");
  document.documentElement.lang = language === "ar" ? "ar" : "en";

  document.querySelectorAll("[data-en][data-ar]").forEach((element) => {
    element.textContent =
      language === "ar"
        ? element.dataset.ar
        : element.dataset.en;
  });

  $("langToggle").textContent = language === "ar" ? "EN" : "AR";
}

$("langToggle").addEventListener("click", () => {
  language = language === "en" ? "ar" : "en";
  updateLanguage();
});

$("analysisForm").addEventListener("submit", (event) => {
  event.preventDefault();
  clearStatus();

  if (!modelData) {
    showStatus(
      language === "ar"
        ? "النموذج لم يتم تحميله بعد."
        : "The model has not loaded yet."
    );
    return;
  }

  const values = {
    TenureMonths: Number($("TenureMonths").value),
    SatisfactionScore: Number($("SatisfactionScore").value),
    OrderCount: Number($("OrderCount").value),
    TotalSpend: Number($("TotalSpend").value),
    DaysSinceLastOrder: Number($("DaysSinceLastOrder").value),
    Complain: Number($("Complain").value),
  };

  if (
    Object.values(values).some((value) => !Number.isFinite(value))
  ) {
    showStatus(
      language === "ar"
        ? "تأكدي من إدخال جميع القيم بشكل صحيح."
        : "Please enter valid values in all fields."
    );
    return;
  }

  if (
    values.SatisfactionScore < 1 ||
    values.SatisfactionScore > 5
  ) {
    showStatus(
      language === "ar"
        ? "درجة الرضا يجب أن تكون بين 1 و5."
        : "Satisfaction score must be between 1 and 5."
    );
    return;
  }

  const probability = predictProbability(values);
  renderResult(probability, values);
});

updateLanguage();
loadModel();
