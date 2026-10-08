import { supabase } from './supabase-client.js';
import { supabaseConfigured } from './shared.js';

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let authMode = "signin";
  let pendingIdentifier = "";
  let pendingFullName = "";

  const signInTab = $("signInTab");
  const createTab = $("createTab");

  const emailForm = $("emailForm");
  const otpForm = $("otpForm");
  const createFields = $("createFields");
  const fullNameInput = $("authFullName");
  const emailInput = $("authEmail");
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
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.language = isArabic ? "ar" : "en";

    document.querySelectorAll("[data-en][data-ar]").forEach((el) => {
      el.textContent = isArabic ? el.dataset.ar : el.dataset.en;
    });

    document.querySelectorAll("[data-placeholder-en][data-placeholder-ar]").forEach((el) => {
      el.placeholder = isArabic ? el.dataset.placeholderAr : el.dataset.placeholderEn;
    });

    if (languageButton) languageButton.textContent = isArabic ? "EN" : "عربي";

    applyMode(authMode, false);
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
    if (emailInput) emailInput.required = true;

    if (authHeading) {
      authHeading.textContent = creating
        ? tr("Create your NAVIGATE account.", "أنشئ حسابك في NAVIGATE.")
        : tr("Welcome back.", "مرحبًا بعودتك.");
    }

    if (authIntro) {
      authIntro.textContent = creating
        ? tr(
            "Create your account with your email and an 8-digit verification code.",
            "أنشئ حسابك ببريدك الإلكتروني ورمز تحقق مكوّن من 8 أرقام."
          )
        : tr(
            "Sign in with your email and an 8-digit verification code.",
            "سجّل الدخول ببريدك الإلكتروني ورمز تحقق مكوّن من 8 أرقام."
          );
    }

    if (sendCodeButton) {
      sendCodeButton.textContent = creating
        ? tr("Create account and send code", "إنشاء الحساب وإرسال الرمز")
        : tr("Send email code", "إرسال كود البريد");
    }

    if (verifyButton) {
      verifyButton.textContent = creating
        ? tr("Verify and create account", "تحقق وأنشئ الحساب")
        : tr("Verify and sign in", "تحقق وسجّل الدخول");
    }

    if (otpInput) {
      otpInput.maxLength = 8;
      otpInput.minLength = 8;
      otpInput.placeholder = "00000000";
    }

    if (changeEmail) {
      changeEmail.textContent = tr("Use another email", "استخدام بريد آخر");
    }

    if (resetForms) {
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

      setStatus(
        tr("Supabase is not configured yet.", "لم يتم ربط Supabase بعد."),
        "warning"
      );
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) console.error("Session error:", error);

    const user = data?.session?.user || null;

    if (signedOutView) signedOutView.hidden = Boolean(user);
    if (signedInView) signedInView.hidden = !user;

    if (user && signedInEmail) {
      signedInEmail.textContent = user.email || "";
    }
  }

  function validateCreateFields() {
    if (authMode !== "create") return true;

    pendingFullName = (fullNameInput?.value || "").trim();

    if (!pendingFullName) {
      setStatus(
        tr("Enter your full name.", "أدخل الاسم الكامل."),
        "error"
      );
      fullNameInput?.focus();
      return false;
    }

    return true;
  }

  async function sendOtp() {
    clearStatus();

    if (!supabaseConfigured || !supabase) {
      setStatus(
        tr("Supabase is not configured yet.", "لم يتم ربط Supabase بعد."),
        "warning"
      );
      return;
    }

    if (!validateCreateFields()) return;

    pendingIdentifier = (emailInput?.value || "").trim().toLowerCase();

    if (!pendingIdentifier) {
      setStatus(
        tr("Enter your email address.", "أدخل بريدك الإلكتروني."),
        "error"
      );
      emailInput?.focus();
      return;
    }

    if (sendCodeButton) {
      sendCodeButton.disabled = true;
      sendCodeButton.textContent = tr("Sending...", "جارٍ الإرسال...");
    }

    try {
      const options = {
        shouldCreateUser: authMode === "create"
      };

      if (authMode === "create") {
        options.data = {
          full_name: pendingFullName,
          email_address: pendingIdentifier
        };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: pendingIdentifier,
        options
      });

      if (error) {
        console.error("OTP send error:", error);
        setStatus(error.message, "error");
        return;
      }

      if (otpEmailLabel) otpEmailLabel.textContent = pendingIdentifier;
      if (emailForm) emailForm.hidden = true;
      if (otpForm) otpForm.hidden = false;

      setStatus(
        tr(
          "Email code sent. Enter the 8-digit code below.",
          "تم إرسال كود البريد. أدخل الكود المكوّن من 8 أرقام."
        ),
        "success"
      );

      setTimeout(() => otpInput?.focus(), 50);

    } catch (error) {
      console.error("Unexpected OTP error:", error);

      setStatus(
        tr(
          "Could not request the verification code. Please try again.",
          "تعذر طلب رمز التحقق. حاول مرة أخرى."
        ),
        "error"
      );
    } finally {
      if (sendCodeButton) {
        sendCodeButton.disabled = false;
        sendCodeButton.textContent = authMode === "create"
          ? tr("Create account and send code", "إنشاء الحساب وإرسال الرمز")
          : tr("Send email code", "إرسال كود البريد");
      }
    }
  }

  signInTab?.addEventListener("click", () => applyMode("signin"));
  createTab?.addEventListener("click", () => applyMode("create"));

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendOtp();
  });

  otpInput?.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 8);
  });

  otpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!supabase) return;

    const token = (otpInput?.value || "").trim();

    if (!/^\d{8}$/.test(token)) {
      setStatus(
        tr(
          "Enter the 8-digit verification code.",
          "أدخل رمز التحقق المكوّن من 8 أرقام."
        ),
        "error"
      );
      return;
    }

    if (verifyButton) {
      verifyButton.disabled = true;
      verifyButton.textContent = tr("Verifying...", "جارٍ التحقق...");
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingIdentifier,
        token,
        type: "email"
      });

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

      setStatus(
        tr(
          "Verification failed. Please try again.",
          "فشل التحقق. حاول مرة أخرى."
        ),
        "error"
      );
    } finally {
      if (verifyButton) {
        verifyButton.disabled = false;
        verifyButton.textContent = authMode === "create"
          ? tr("Verify and create account", "تحقق وأنشئ الحساب")
          : tr("Verify and sign in", "تحقق وسجّل الدخول");
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
  renderSession();
});
