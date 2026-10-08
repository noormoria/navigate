import { supabase, supabaseConfigured } from "./supabase-client.js";

const state = {
  language: localStorage.getItem("navigate_language") || "en",
  theme: localStorage.getItem("navigate_theme") || "light",
  user: null,
};

export const getLanguage = () => state.language;
export const translate = (en, ar) => (state.language === "ar" ? ar : en);

function applyLanguage() {
  const ar = state.language === "ar";
  document.documentElement.lang = ar ? "ar" : "en";
  document.documentElement.dir = ar ? "rtl" : "ltr";

  document.querySelectorAll("[data-en][data-ar]").forEach((el) => {
    el.textContent = ar ? el.dataset.ar : el.dataset.en;
  });

  document.querySelectorAll("[data-placeholder-en][data-placeholder-ar]").forEach((el) => {
    el.placeholder = ar ? el.dataset.placeholderAr : el.dataset.placeholderEn;
  });

  const btn = document.querySelector("[data-language-toggle]");
  if (btn) btn.textContent = ar ? "EN" : "عربي";

  window.dispatchEvent(new CustomEvent("navigate:language"));
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const btn = document.querySelector("[data-theme-toggle]");

  if (btn) {
    const sunIcon = `
      <span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path>
          <path d="M12 20v2"></path>
          <path d="M4.93 4.93l1.41 1.41"></path>
          <path d="M17.66 17.66l1.41 1.41"></path>
          <path d="M2 12h2"></path>
          <path d="M20 12h2"></path>
          <path d="M6.34 17.66l-1.41 1.41"></path>
          <path d="M19.07 4.93l-1.41 1.41"></path>
        </svg>
      </span>`;

    const moonIcon = `
      <span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </span>`;

    btn.innerHTML = state.theme === "dark"
      ? `${sunIcon}<span>${translate("Light", "نهاري")}</span>`
      : `${moonIcon}<span>${translate("Dark", "ليلي")}</span>`;
  }
}

export function setToast(message, type = "info") {
  let toast = document.querySelector(".global-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "global-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("show");

  clearTimeout(window.__navToast);
  window.__navToast = setTimeout(() => toast.classList.remove("show"), 3200);
}

function renderAccount() {
  document.querySelectorAll("[data-account-button]").forEach((button) => {
    if (state.user) {
      const label = state.user.email || state.user.phone || translate("Account", "الحساب");
      button.innerHTML = `<span class="account-dot"></span><span>${label.length > 20 ? label.slice(0, 18) + "…" : label}</span>`;
      button.title = label;
      button.classList.remove("signed-out-button");
    } else {
      button.innerHTML = `<span class="account-dot signed-out"></span><span>${translate("Sign in", "تسجيل الدخول")}</span>`;
      button.classList.add("signed-out-button");
      button.removeAttribute("title");
    }
  });
}

export async function refreshUser() {
  if (!supabase) {
    state.user = null;
    renderAccount();
    return null;
  }

  const { data } = await supabase.auth.getUser();
  state.user = data?.user || null;
  renderAccount();
  return state.user;
}

export async function requireAuth(returnTo = "analyze.html") {
  const user = await refreshUser();

  if (!supabaseConfigured) {
    setToast(
      translate("Connect Supabase first.", "اربطي Supabase أولًا."),
      "warning"
    );
    return null;
  }

  if (!user) {
    window.location.href = `auth.html?returnTo=${encodeURIComponent(returnTo)}`;
    return null;
  }

  return user;
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
      open
        ? translate("Close menu", "إغلاق القائمة")
        : translate("Open menu", "فتح القائمة")
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

function setup() {
  const current = document.body.dataset.page;

  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === current) a.classList.add("active");
  });

  document.querySelector("[data-language-toggle]")?.addEventListener("click", () => {
    state.language = state.language === "en" ? "ar" : "en";
    localStorage.setItem("navigate_language", state.language);
    applyLanguage();
    applyTheme();
    renderAccount();
  });

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("navigate_theme", state.theme);
    applyTheme();
  });

  setupMenu();
}

applyTheme();
applyLanguage();
setup();
refreshUser();

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    renderAccount();
  });
}

export { supabase, supabaseConfigured };
