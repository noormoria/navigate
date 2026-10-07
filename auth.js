import { supabase, supabaseConfigured } from "./supabase-client.js";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let authMode = "signin";
  let pendingEmail = "";
  let pendingFullName = "";
  let pendingPhone = "";

  const signInTab = $("signInTab");
  const createTab = $("createTab");

  const emailForm = $("emailForm");
  const otpForm = $("otpForm");

  const createFields = $("createFields");
  const fullNameInput = $("authFullName");
  const phoneInput = $("authPhone");
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
    if (authStatus) {
      authStatus.hidden = true;
      authStatus.textContent = "";
      authStatus.dataset.type = "";
    }
  }

  function applyLanguage() {
    const isArabic = language === "ar";

    document.documentElement.lang = isArabic ? "ar" : "en";
    document.documentElement.dir = isArabic ? "rtl" : "ltr";

    document.querySelectorAll("[data-en][data-ar]").forEach((el) => {
      el.textContent = isArabic ? el.dataset.ar : el.dataset.en;
    });

    document
      .querySelectorAll("[data-placeholder-en][data-placeholder-ar]")
      .forEach((el) => {
        el.placeholder = isArabic
          ? el.dataset.placeholderAr
          : el.dataset.placeholderEn;
      });

    if (languageButton) {
      languageButton.textContent = isArabic ? "EN" : "عربي";
    }

    applyMode(authMode, false);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;

    if (themeButton) {
      themeButton.innerHTML =
        theme === "dark"
          ? `<span>☀</span><span>${tr("Light", "نهاري")}</span>`
          : `<span>☾</span><span>${tr("Dark", "ليلي")}</span>`;
    }
  }

  function applyMode(mode, resetForms = true) {
    authMode = mode;
    const creating = mode === "create";

    if (signInTab) {
      signInTab.classList.toggle("active", !creating);
      signInTab.setAttribute("aria-selected", String(!creating));
    }

    if (createTab) {
      createTab.classList.toggle("active", creating);
      createTab.setAttribute("aria-selected", String(creating));
    }

    if (createFields) {
      createFields.hidden = !creating;
    }

    if (fullNameInput) {
      fullNameInput.required = creating;
    }

    if (phoneInput) {
      phoneInput.required = creating;
    }

    if (authHeading) {
      authHeading.textContent = creating
        ? tr(
            "Create your NAVIGATE account.",
            "أنشئ حسابك في NAVIGATE."
          )
        : tr(
            "Welcome back.",
            "مرحبًا بعودتك."
          );
    }

    if (authIntro) {
      authIntro.textContent = creating
        ? tr(
            "Enter your name, phone number, and email. We will send an 8-digit verification code to confirm your email.",
            "أدخل اسمك ورقم الجوال والبريد الإلكتروني. سنرسل رمز تحقق مكوّنًا من 8 أرقام لتأكيد بريدك."
          )
        : tr(
            "Sign in with your existing email and an 8-digit verification code.",
            "سجّل الدخول ببريدك الحالي ورمز تحقق مكوّن من 8 أرقام."
          );
    }

    if (sendCodeButton) {
      sendCodeButton.textContent = creating
        ? tr(
            "Create account and send code",
            "إنشاء الحساب وإرسال الرمز"
          )
        : tr(
            "Send sign-in code",
            "إرسال رمز تسجيل الدخول"
          );
    }

    if (verifyButton) {
      verifyButton.textContent = creating
        ? tr(
            "Verify and create account",
            "تحقق وأنشئ الحساب"
          )
        : tr(
            "Verify and sign in",
            "تحقق وسجّل الدخول"
          );
    }

    if (resetForms) {
      if (emailForm) emailForm.hidden = false;
      if (otpForm) otpForm.hidden = true;
      if (otpInput) otpInput.value = "";

      pendingEmail = "";
      pendingFullName = "";
      pendingPhone = "";

      clearStatus();
    }
  }

  function safeReturnTo() {
    const raw = new URLSearchParams(window.location.search).get("returnTo");

    if (
      raw &&
      /^[a-zA-Z0-9_-]+\.html(?:\?.*)?$/.test(raw)
    ) {
      return raw;
    }

    return "analyze.html";
  }

  async function renderSession() {
    if (!supabaseConfigured || !supabase) {
      if (signedOutView) signedOutView.hidden = false;
      if (signedInView) signedInView.hidden = true;

      setStatus(
        tr(
          "Supabase is not configured yet.",
          "لم يتم ربط Supabase بعد."
        ),
        "warning"
      );

      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
    }

    const user = data?.session?.user || null;

    if (signedOutView) {
      signedOutView.hidden = Boolean(user);
    }

    if (signedInView) {
      signedInView.hidden = !user;
    }

    if (user && signedInEmail) {
      signedInEmail.textContent = user.email || "";
    }
  }

  function validateCreateFields() {
    if (authMode !== "create") {
      return true;
    }

    pendingFullName = (fullNameInput?.value || "").trim();
    pendingPhone = (phoneInput?.value || "").trim();

    if (!pendingFullName) {
      setStatus(
        tr(
          "Enter your full name.",
          "أدخل الاسم الكامل."
        ),
        "error"
      );

      fullNameInput?.focus();
      return false;
    }

    if (!pendingPhone) {
      setStatus(
        tr(
          "Enter your phone number.",
          "أدخل رقم الجوال."
        ),
        "error"
      );

      phoneInput?.focus();
      return false;
    }

    return true;
  }

  async function sendOtp() {
    clearStatus();

    if (!supabaseConfigured || !supabase) {
      setStatus(
        tr(
          "Supabase is not configured yet.",
          "لم يتم ربط Supabase بعد."
        ),
        "warning"
      );

      return;
    }

    pendingEmail = (emailInput?.value || "")
      .trim()
      .toLowerCase();

    if (!pendingEmail) {
      setStatus(
        tr(
          "Enter your email address first.",
          "أدخل بريدك الإلكتروني أولًا."
        ),
        "error"
      );

      emailInput?.focus();
      return;
    }

    if (!validateCreateFields()) {
      return;
    }

    if (sendCodeButton) {
      sendCodeButton.disabled = true;
      sendCodeButton.textContent = tr(
        "Sending...",
        "جارٍ الإرسال..."
      );
    }

    try {
      const otpOptions = {
        shouldCreateUser: authMode === "create",
      };

      if (authMode === "create") {
        otpOptions.data = {
          full_name: pendingFullName,
          phone_number: pendingPhone,
        };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: pendingEmail,
        options: otpOptions,
      });

      if (error) {
        console.error("OTP send error:", error);

        const message = (error.message || "").toLowerCase();

        if (
          message.includes("send") ||
          message.includes("smtp") ||
          message.includes("email")
        ) {
          setStatus(
            tr(
              "The account request reached Supabase, but the verification email could not be sent. Check the custom SMTP settings in Supabase.",
              "وصل طلب الحساب إلى Supabase، لكن تعذر إرسال رسالة التحقق. تحققي من إعدادات SMTP المخصصة في Supabase."
            ),
            "error"
          );
        } else {
          setStatus(
            authMode === "signin"
              ? tr(
                  `${error.message} If you do not have an account yet, choose Create account.`,
                  `${error.message} إذا لم يكن لديك حساب بعد، اختر إنشاء حساب.`
                )
              : error.message,
            "error"
          );
        }

        return;
      }

      if (otpEmailLabel) {
        otpEmailLabel.textContent = pendingEmail;
      }

      if (emailForm) {
        emailForm.hidden = true;
      }

      if (otpForm) {
        otpForm.hidden = false;
      }

      setStatus(
        authMode === "create"
          ? tr(
              "Verification code sent. Enter the 8-digit code below to finish creating your account.",
              "تم إرسال رمز التحقق. أدخل رمز الـ8 أرقام بالأسفل لإكمال إنشاء الحساب."
            )
          : tr(
              "Sign-in code sent. Enter the 8-digit code below.",
              "تم إرسال رمز تسجيل الدخول. أدخل رمز الـ8 أرقام بالأسفل."
            ),
        "success"
      );

      setTimeout(() => otpInput?.focus(), 50);

    } catch (error) {
      console.error("Unexpected OTP error:", error);

      setStatus(
        tr(
          "Something went wrong while requesting the verification code. Please try again.",
          "حدث خطأ أثناء طلب رمز التحقق. حاول مرة أخرى."
        ),
        "error"
      );

    } finally {
      if (sendCodeButton) {
        sendCodeButton.disabled = false;

        sendCodeButton.textContent =
          authMode === "create"
            ? tr(
                "Create account and send code",
                "إنشاء الحساب وإرسال الرمز"
              )
            : tr(
                "Send sign-in code",
                "إرسال رمز تسجيل الدخول"
              );
      }
    }
  }

  signInTab?.addEventListener("click", () => {
    applyMode("signin");
  });

  createTab?.addEventListener("click", () => {
    applyMode("create");
  });

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendOtp();
  });

  otpInput?.addEventListener("input", () => {
    otpInput.value = otpInput.value
      .replace(/\D/g, "")
      .slice(0, 8);
  });

  otpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!supabase) {
      return;
    }

    const token = (otpInput?.value || "").trim();

    if (!/^\d{8}$/.test(token)) {
      setStatus(
        tr(
          "Enter the 8-digit code from your email.",
          "أدخل رمز التحقق المكوّن من 8 أرقام."
        ),
        "error"
      );

      otpInput?.focus();
      return;
    }

    if (verifyButton) {
      verifyButton.disabled = true;
      verifyButton.textContent = tr(
        "Verifying...",
        "جارٍ التحقق..."
      );
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
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
          "Verification failed unexpectedly. Please try again.",
          "حدث خطأ غير متوقع أثناء التحقق. حاول مرة أخرى."
        ),
        "error"
      );

    } finally {
      if (verifyButton) {
        verifyButton.disabled = false;

        verifyButton.textContent =
          authMode === "create"
            ? tr(
                "Verify and create account",
                "تحقق وأنشئ الحساب"
              )
            : tr(
                "Verify and sign in",
                "تحقق وسجّل الدخول"
              );
      }
    }
  });

  resendOtp?.addEventListener("click", async () => {
    if (!pendingEmail) {
      return;
    }

    if (emailInput) {
      emailInput.value = pendingEmail;
    }

    if (authMode === "create") {
      if (fullNameInput) {
        fullNameInput.value = pendingFullName;
      }

      if (phoneInput) {
        phoneInput.value = pendingPhone;
      }
    }

    await sendOtp();
  });

  changeEmail?.addEventListener("click", () => {
    if (emailForm) {
      emailForm.hidden = false;
    }

    if (otpForm) {
      otpForm.hidden = true;
    }

    if (otpInput) {
      otpInput.value = "";
    }

    clearStatus();
    emailInput?.focus();
  });

  signOutButton?.addEventListener("click", async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();

    await renderSession();
    applyMode("signin");
  });

  languageButton?.addEventListener("click", () => {
    language = language === "en" ? "ar" : "en";

    localStorage.setItem(
      "navigate_language",
      language
    );

    applyLanguage();
    applyTheme();
  });

  themeButton?.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";

    localStorage.setItem(
      "navigate_theme",
      theme
    );

    applyTheme();
  });

  applyTheme();
  applyLanguage();
  applyMode("signin");
  renderSession();
});
