import { supabase, supabaseConfigured } from "./supabase-client.js";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let authMode = "signin";
  let authChannel = "email";
  let pendingIdentifier = "";
  let pendingFullName = "";
  let pendingPhone = "";
  let pendingEmail = "";

  const signInTab = $("signInTab");
  const createTab = $("createTab");
  const emailChannel = $("emailChannel");
  const phoneChannel = $("phoneChannel");
  const phoneSetupNote = $("phoneSetupNote");

  const emailForm = $("emailForm");
  const otpForm = $("otpForm");
  const createFields = $("createFields");
  const fullNameInput = $("authFullName");
  const profilePhoneInput = $("authPhone");
  const emailInput = $("authEmail");
  const phoneLoginInput = $("authPhoneLogin");
  const emailAuthField = $("emailAuthField");
  const phoneAuthField = $("phoneAuthField");
  const otpInput = $("authOtp");
  const otpEmailLabel = $("otpEmailLabel");

  const sendCodeButton = $("sendCodeButton");
  const verifyButton = $("verifyButton");
  const authHeading = $("authHeading");
  const authIntro = $("authIntro");
  const authStatus = $("authStatus");

  const signedOutView = $("signedOutView");
  const signedInView = $("signedInView");
  const signedInEmail = $("signedInEmail");
  const signOutButton = $("signOutButton");
  const resendOtp = $("resendOtp");
  const changeEmail = $("changeEmail");

  const languageButton = document.querySelector("[data-language-toggle]");
  const themeButton = document.querySelector("[data-theme-toggle]");

  let language = localStorage.getItem("navigate_language") || "en";
  let theme = localStorage.getItem("navigate_theme") || "light";

  const tr = (en, ar) => (language === "ar" ? ar : en);

  function setStatus(message, type = "info") {
    if (!authStatus) return;
    authStatus.hidden = false;
    authStatus.textContent = message;
    authStatus.dataset.type = type;
  }

  function clearStatus() {
    if (!authStatus) return;
    authStatus.hidden = true;
    authStatus.textContent = "";
    authStatus.dataset.type = "";
  }

  function applyLanguage() {
    const isArabic = language === "ar";
    document.documentElement.lang = isArabic ? "ar" : "en";
    document.documentElement.dir = isArabic ? "rtl" : "ltr";

    document.querySelectorAll("[data-en][data-ar]").forEach((el) => {
      el.textContent = isArabic ? el.dataset.ar : el.dataset.en;
    });

    document.querySelectorAll("[data-placeholder-en][data-placeholder-ar]").forEach((el) => {
      el.placeholder = isArabic ? el.dataset.placeholderAr : el.dataset.placeholderEn;
    });

    if (languageButton) languageButton.textContent = isArabic ? "EN" : "عربي";
    applyMode(authMode, false);
    applyChannel(authChannel, false);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    if (!themeButton) return;

    themeButton.innerHTML = theme === "dark"
      ? `<span>☀</span><span>${tr("Light", "نهاري")}</span>`
      : `<span>☾</span><span>${tr("Dark", "ليلي")}</span>`;
  }

  function applyMode(mode, resetForms = true) {
    authMode = mode;
    const creating = mode === "create";

    signInTab?.classList.toggle("active", !creating);
    createTab?.classList.toggle("active", creating);
    signInTab?.setAttribute("aria-selected", String(!creating));
    createTab?.setAttribute("aria-selected", String(creating));

    if (createFields) createFields.hidden = !creating;
    if (fullNameInput) fullNameInput.required = creating;
    if (profilePhoneInput) profilePhoneInput.required = creating;

    if (authHeading) {
      authHeading.textContent = creating
        ? tr("Create your NAVIGATE account.", "أنشئ حسابك في NAVIGATE.")
        : tr("Welcome back.", "مرحبًا بعودتك.");
    }

    if (authIntro) {
      authIntro.textContent = creating
        ? tr(
            "Create an account and choose whether the verification code is delivered by email or SMS.",
            "أنشئ حسابك واختر وصول رمز التحقق عبر البريد الإلكتروني أو رسالة SMS."
          )
        : tr(
            "Choose email or phone, then enter the verification code you receive.",
            "اختر البريد أو رقم الجوال ثم أدخل رمز التحقق الذي يصلك."
          );
    }

    if (resetForms) {
      if (emailForm) emailForm.hidden = false;
      if (otpForm) otpForm.hidden = true;
      if (otpInput) otpInput.value = "";
      clearStatus();
    }

    applyChannel(authChannel, false);
  }

  function applyChannel(channel, resetOtp = true) {
    authChannel = channel;
    const isPhone = channel === "phone";

    emailChannel?.classList.toggle("active", !isPhone);
    phoneChannel?.classList.toggle("active", isPhone);

    if (emailAuthField) emailAuthField.hidden = isPhone;
    if (phoneAuthField) phoneAuthField.hidden = !isPhone || (isPhone && authMode === "create");
    if (phoneSetupNote) phoneSetupNote.hidden = !isPhone;

    if (emailInput) emailInput.required = !isPhone;
    if (phoneLoginInput) phoneLoginInput.required = isPhone && authMode !== "create";

    if (sendCodeButton) {
      sendCodeButton.textContent = isPhone
        ? tr("Send SMS code", "إرسال كود SMS")
        : authMode === "create"
          ? tr("Create account and send code", "إنشاء الحساب وإرسال الرمز")
          : tr("Send email code", "إرسال كود البريد");
    }

    if (verifyButton) {
      verifyButton.textContent = authMode === "create"
        ? tr("Verify and create account", "تحقق وأنشئ الحساب")
        : tr("Verify and sign in", "تحقق وسجّل الدخول");
    }

    if (otpInput) {
      otpInput.maxLength = isPhone ? 6 : 8;
      otpInput.minLength = isPhone ? 6 : 8;
      otpInput.placeholder = isPhone ? "000000" : "00000000";
    }

    if (resetOtp) {
      if (emailForm) emailForm.hidden = false;
      if (otpForm) otpForm.hidden = true;
      if (otpInput) otpInput.value = "";
      clearStatus();
    }
  }


  function setupMenu() {
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
      toggle.setAttribute(
        "aria-label",
        open ? tr("Close menu", "إغلاق القائمة") : tr("Open menu", "فتح القائمة")
      );
    };

    toggle.addEventListener("click", () => {
      setOpen(!nav.classList.contains("open"));
    });

    backdrop.addEventListener("click", () => setOpen(false));

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function safeReturnTo() {
    const raw = new URLSearchParams(window.location.search).get("returnTo");
    if (raw && /^[a-zA-Z0-9_-]+\.html(?:\?.*)?$/.test(raw)) return raw;
    return "analyze.html";
  }

  async function renderSession() {
    if (!supabaseConfigured || !supabase) {
      if (signedOutView) signedOutView.hidden = false;
      if (signedInView) signedInView.hidden = true;
      setStatus(tr("Supabase is not configured yet.", "لم يتم ربط Supabase بعد."), "warning");
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("Session error:", error);

    const user = data?.session?.user || null;
    if (signedOutView) signedOutView.hidden = Boolean(user);
    if (signedInView) signedInView.hidden = !user;

    if (user && signedInEmail) {
      signedInEmail.textContent = user.email || user.phone || "";
    }
  }

  function validateCreateFields() {
    if (authMode !== "create") return true;

    pendingFullName = (fullNameInput?.value || "").trim();
    pendingPhone = (profilePhoneInput?.value || "").trim();
    pendingEmail = (emailInput?.value || "").trim().toLowerCase();

    if (!pendingFullName) {
      setStatus(tr("Enter your full name.", "أدخل الاسم الكامل."), "error");
      fullNameInput?.focus();
      return false;
    }

    if (!pendingPhone) {
      setStatus(tr("Enter your phone number.", "أدخل رقم الجوال."), "error");
      profilePhoneInput?.focus();
      return false;
    }

    return true;
  }

  async function sendOtp() {
    clearStatus();

    if (!supabaseConfigured || !supabase) {
      setStatus(tr("Supabase is not configured yet.", "لم يتم ربط Supabase بعد."), "warning");
      return;
    }

    if (!validateCreateFields()) return;

    const isPhone = authChannel === "phone";

    pendingIdentifier = isPhone
      ? (
          authMode === "create"
            ? (profilePhoneInput?.value || "")
            : (phoneLoginInput?.value || "")
        ).replace(/\s+/g, "")
      : (emailInput?.value || "").trim().toLowerCase();

    if (!pendingIdentifier) {
      setStatus(
        isPhone ? tr("Enter your phone number.", "أدخل رقم الجوال.") : tr("Enter your email address.", "أدخل بريدك الإلكتروني."),
        "error"
      );
      (isPhone
        ? (authMode === "create" ? profilePhoneInput : phoneLoginInput)
        : emailInput)?.focus();
      return;
    }

    if (isPhone && !pendingIdentifier.startsWith("+")) {
      setStatus(tr("Use international phone format, for example +9665XXXXXXXX.", "استخدم صيغة دولية مثل +9665XXXXXXXX."), "error");
      (authMode === "create" ? profilePhoneInput : phoneLoginInput)?.focus();
      return;
    }

    if (sendCodeButton) {
      sendCodeButton.disabled = true;
      sendCodeButton.textContent = tr("Sending...", "جارٍ الإرسال...");
    }

    try {
      const options = {
        shouldCreateUser: authMode === "create",
      };

      if (authMode === "create") {
        options.data = {
          full_name: pendingFullName,
          phone_number: pendingPhone,
          email_address: pendingEmail || null,
        };
      }

      const request = isPhone
        ? { phone: pendingIdentifier, options }
        : { email: pendingIdentifier, options };

      const { error } = await supabase.auth.signInWithOtp(request);

      if (error) {
        console.error("OTP send error:", error);

        if (isPhone) {
          setStatus(
            tr(
              `${error.message} Phone login also requires Phone Auth and an SMS provider in Supabase.`,
              `${error.message} تسجيل الدخول بالجوال يتطلب أيضًا تفعيل Phone Auth وربط مزود SMS في Supabase.`
            ),
            "error"
          );
        } else {
          setStatus(error.message, "error");
        }
        return;
      }

      if (otpEmailLabel) otpEmailLabel.textContent = pendingIdentifier;
      if (emailForm) emailForm.hidden = true;
      if (otpForm) otpForm.hidden = false;

      setStatus(
        isPhone
          ? tr("SMS code sent. Enter the 6-digit code below.", "تم إرسال كود SMS. أدخل الكود المكوّن من 6 أرقام.")
          : tr("Email code sent. Enter the 8-digit code below.", "تم إرسال كود البريد. أدخل الكود المكوّن من 8 أرقام."),
        "success"
      );

      setTimeout(() => otpInput?.focus(), 50);

    } catch (error) {
      console.error("Unexpected OTP error:", error);
      setStatus(tr("Could not request the verification code. Please try again.", "تعذر طلب رمز التحقق. حاول مرة أخرى."), "error");
    } finally {
      if (sendCodeButton) {
        sendCodeButton.disabled = false;
        applyChannel(authChannel, false);
      }
    }
  }

  signInTab?.addEventListener("click", () => applyMode("signin"));
  createTab?.addEventListener("click", () => applyMode("create"));
  emailChannel?.addEventListener("click", () => applyChannel("email"));
  phoneChannel?.addEventListener("click", () => applyChannel("phone"));

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendOtp();
  });

  otpInput?.addEventListener("input", () => {
    const max = authChannel === "phone" ? 6 : 8;
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, max);
  });

  otpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!supabase) return;

    const token = (otpInput?.value || "").trim();
    const expected = authChannel === "phone" ? 6 : 8;

    if (!new RegExp(`^\\d{${expected}}$`).test(token)) {
      setStatus(
        tr(`Enter the ${expected}-digit verification code.`, `أدخل رمز التحقق المكوّن من ${expected} أرقام.`),
        "error"
      );
      return;
    }

    if (verifyButton) {
      verifyButton.disabled = true;
      verifyButton.textContent = tr("Verifying...", "جارٍ التحقق...");
    }

    try {
      const params = authChannel === "phone"
        ? { phone: pendingIdentifier, token, type: "sms" }
        : { email: pendingIdentifier, token, type: "email" };

      const { data, error } = await supabase.auth.verifyOtp(params);

      if (error) {
        console.error("OTP verify error:", error);
        setStatus(error.message, "error");
        return;
      }

      if (data?.session) {
        window.location.href = safeReturnTo();
      } else {
        setStatus(
          tr(
            "The code was accepted but no session was created. Please request a new code.",
            "تم قبول الرمز لكن لم يتم إنشاء جلسة دخول. اطلب رمزًا جديدًا."
          ),
          "error"
        );
      }
    } catch (error) {
      console.error("Unexpected verification error:", error);
      setStatus(tr("Verification failed. Please try again.", "فشل التحقق. حاول مرة أخرى."), "error");
    } finally {
      if (verifyButton) {
        verifyButton.disabled = false;
        applyChannel(authChannel, false);
      }
    }
  });

  resendOtp?.addEventListener("click", async () => {
    if (!pendingIdentifier) return;
    await sendOtp();
  });

  changeEmail?.addEventListener("click", () => {
    if (emailForm) emailForm.hidden = false;
    if (otpForm) otpForm.hidden = true;
    if (otpInput) otpInput.value = "";
    clearStatus();
  });

  signOutButton?.addEventListener("click", async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await renderSession();
    applyMode("signin");
  });

  languageButton?.addEventListener("click", () => {
    language = language === "en" ? "ar" : "en";
    localStorage.setItem("navigate_language", language);
    applyLanguage();
    applyTheme();
  });

  themeButton?.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    localStorage.setItem("navigate_theme", theme);
    applyTheme();
  });

  setupMenu();
  applyTheme();
  applyLanguage();
  applyMode("signin");
  applyChannel("email", false);
  renderSession();
});
