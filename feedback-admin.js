import "./shared.js";
import { supabase } from "./supabase-client.js";
import { refreshUser, translate, getLanguage } from "./shared.js";

const ADMIN_UID = "33837b6a-ec95-4250-b676-14c6e4e75979";
const $ = id => document.getElementById(id);
let feedback = [];

function showNotice(en, ar) {
  $("adminNotice").hidden = false;
  $("adminNotice").textContent = translate(en, ar);
}
function render() {
  const count = feedback.length;
  $("ratingCount").textContent = String(count);
  $("ratingAverage").textContent = count ? (feedback.reduce((sum, item) => sum + Number(item.rating), 0) / count).toFixed(1) + " / 5" : "—";
  $("ratingComments").textContent = String(feedback.filter(item => item.comment?.trim()).length);
  const breakdown = $("ratingBreakdown");
  breakdown.replaceChildren();
  for (let stars = 5; stars >= 1; stars--) {
    const n = feedback.filter(item => Number(item.rating) === stars).length;
    const row = document.createElement("div");
    row.className = "feedback-rating-row";
    const label = document.createElement("span");
    label.textContent = stars + " ★";
    const track = document.createElement("div");
    track.className = "feedback-rating-track";
    const fill = document.createElement("div");
    fill.className = "feedback-rating-fill";
    fill.style.width = (count ? n / count * 100 : 0) + "%";
    track.append(fill);
    const number = document.createElement("span");
    number.textContent = String(n);
    row.append(label, track, number);
    breakdown.append(row);
  }
  const entries = $("ratingEntries");
  entries.replaceChildren();
  if (!count) {
    const empty = document.createElement("p");
    empty.textContent = translate("No ratings yet.", "ما وصلت تقييمات حتى الآن.");
    entries.append(empty);
    return;
  }
  feedback.forEach(item => {
    const article = document.createElement("article");
    article.className = "feedback-entry";
    const top = document.createElement("div");
    top.className = "feedback-entry-head";
    const stars = document.createElement("strong");
    stars.textContent = "★".repeat(Number(item.rating)) + "☆".repeat(5 - Number(item.rating));
    const date = document.createElement("time");
    date.dateTime = item.created_at;
    date.textContent = new Date(item.created_at).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB", {dateStyle: "medium", timeStyle:"short"});
    top.append(stars, date);
    const text = document.createElement("p");
    text.textContent = item.comment?.trim() || translate("No written comment.", "بدون تعليق مكتوب.");
    article.append(top, text);
    entries.append(article);
  });
}
let supportRequests = [];
function renderSupportInbox() {
  const host = $("supportInbox");
  host.replaceChildren();
  if (!supportRequests.length) {
    const empty = document.createElement("p");
    empty.textContent = translate("No support messages yet.", "ما وصلت رسائل دعم حتى الآن.");
    host.append(empty);
    return;
  }
  for (const item of supportRequests) {
    const article = document.createElement("article");
    article.className = "feedback-entry";
    const heading = document.createElement("div");
    heading.className = "feedback-entry-head";
    const title = document.createElement("strong");
    title.textContent = item.issue_type || translate("Support message", "رسالة دعم");
    const date = document.createElement("time");
    date.dateTime = item.created_at;
    date.textContent = new Date(item.created_at).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB", {dateStyle:"medium",timeStyle:"short"});
    heading.append(title, date);
    const sender = document.createElement("p");
    sender.textContent = (item.name || "") + " — " + (item.email || "");
    const message = document.createElement("p");
    message.textContent = item.message || "";
    article.append(heading, sender, message);
    host.append(article);
  }
}
async function loadSupportInbox() {
  const { data, error } = await supabase.from("support_requests")
    .select("id,name,email,issue_type,message,created_at")
    .order("created_at", {ascending:false}).limit(1000);
  if (error) {
    console.error("Admin support inbox retrieval failed", error);
    $("supportInboxStatus").textContent = translate("Could not load support messages.", "تعذّر تحميل رسائل الدعم.");
    return;
  }
  $("supportInboxStatus").textContent = "";
  supportRequests = data || [];
  renderSupportInbox();
}
async function loadFeedback() {
  showNotice("Loading ratings...", "جارٍ تحميل التقييمات...");
  const {data, error} = await supabase.from("site_feedback").select("id,rating,comment,created_at").order("created_at", {ascending:false}).limit(1000);
  if (error) {
    console.error("Admin feedback retrieval failed", error);
    $("adminDashboard").hidden = true;
    showNotice("Ratings could not be loaded. Please try again.", "تعذر تحميل التقييمات. يرجى المحاولة مرة أخرى.");
    return;
  }
  feedback = data || [];
  $("adminNotice").hidden = true;
  $("adminDashboard").hidden = false;
  render();
  await loadSupportInbox();
}
async function initialize() {
  if (!supabase) {
    showNotice("The rating service is unavailable.", "خدمة التقييم غير متاحة حاليًا.");
    return;
  }
  const user = await refreshUser();
  if (!user) {
    showNotice("Sign in with the administrator account to view ratings.", "يلزم تسجيل الدخول بحساب الإدارة لعرض التقييمات.");
    const a = document.createElement("a");
    a.href = "auth.html?returnTo=feedback-admin.html";
    a.textContent = translate("Sign in", "تسجيل الدخول");
    $("adminNotice").append(" ", a);
    return;
  }
  if (user.id !== ADMIN_UID) {
    showNotice("This page is available only to the site administrator.", "هذه الصفحة مخصصة لحساب إدارة الموقع فقط.");
    return;
  }
  await loadFeedback();
}
$("refreshFeedback")?.addEventListener("click", loadFeedback);
window.addEventListener("navigate:language", () => {
  if ($("adminDashboard") && !$("adminDashboard").hidden) { render(); renderSupportInbox(); }
});
initialize();
