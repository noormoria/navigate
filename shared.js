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
    btn.innerHTML = state.theme === "dark"
      ? `<span>☀</span><span>${translate("Light", "نهاري")}</span>`
      : `<span>☾</span><span>${translate("Dark", "ليلي")}</span>`;
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
      const email = state.user.email || "";
      button.innerHTML = `<span class="account-dot"></span><span>${email.length > 20 ? email.slice(0, 18) + "…" : email}</span>`;
      button.title = email;
    } else {
      button.innerHTML = `<span class="account-dot signed-out"></span><span>${translate("Sign in", "تسجيل الدخول")}</span>`;
      button.removeAttribute("title");
    }
  });
}

export async function refreshUser() {
  if (!supabase) { state.user = null; renderAccount(); return null; }
  const { data } = await supabase.auth.getUser();
  state.user = data?.user || null;
  renderAccount();
  return state.user;
}

export async function requireAuth(returnTo = "analyze.html") {
  const user = await refreshUser();
  if (!supabaseConfigured) {
    setToast(translate("Connect Supabase first in config.js.", "اربطي Supabase أولًا داخل config.js."), "warning");
    return null;
  }
  if (!user) {
    window.location.href = `auth.html?returnTo=${encodeURIComponent(returnTo)}`;
    return null;
  }
  return user;
}

function setup() {
  const current = document.body.dataset.page;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === current) a.classList.add("active");
  });
  document.querySelector("[data-language-toggle]")?.addEventListener("click", () => {
    state.language = state.language === "en" ? "ar" : "en";
    localStorage.setItem("navigate_language", state.language);
    applyLanguage(); applyTheme(); renderAccount();
  });
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("navigate_theme", state.theme);
    applyTheme();
  });
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector(".main-nav");
  toggle?.addEventListener("click", () => nav?.classList.toggle("open"));
}

applyTheme(); applyLanguage(); setup(); refreshUser();
if (supabase) supabase.auth.onAuthStateChange((_e, session) => { state.user = session?.user || null; renderAccount(); });
export { supabase, supabaseConfigured };
