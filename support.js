

const params = new URLSearchParams(window.location.search);
const sent = document.getElementById("supportSent");

if (params.get("sent") === "1" && sent) {
  sent.hidden = false;
  sent.scrollIntoView({behavior: "smooth", block: "center"});
}

import { translate, refreshUser } from "./shared.js";
import { supabase, supabaseConfigured } from "./supabase-client.js";

const ratingForm = document.getElementById("ratingForm");
const ratingStatus = document.getElementById("ratingStatus");
const ratingSubmit = document.getElementById("ratingSubmit");
const ratingChoices = [...document.querySelectorAll('input[name="rating"]')];

function paintStars() {
  const active = Number(ratingChoices.find(input => input.checked)?.value || 0);
  ratingChoices.forEach(input => {
    input.closest("label")?.classList.toggle("chosen", Number(input.value) <= active);
  });
}
ratingChoices.forEach(input => input.addEventListener("change", paintStars));
paintStars();

ratingForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const selected = ratingChoices.find(input => input.checked);
  if (!selected) {
    ratingStatus.hidden = false;
    ratingStatus.textContent = translate("Choose a rating first.", "يجب اختيار عدد النجوم أولًا.");
    ratingStatus.dataset.type = "error";
    return;
  }
  if (!supabaseConfigured || !supabase) {
    ratingStatus.hidden = false;
    ratingStatus.textContent = translate("Rating service is unavailable. Please try again later.", "خدمة التقييم غير متاحة حاليًا. يرجى المحاولة لاحقًا.");
    ratingStatus.dataset.type = "error";
    return;
  }
  ratingSubmit.disabled = true;
  ratingStatus.hidden = false;
  ratingStatus.dataset.type = "info";
  ratingStatus.textContent = translate("Sending rating...", "جارٍ إرسال التقييم...");
  try {
    const comment = document.getElementById("ratingComment").value.trim();
    const { error } = await supabase.from("site_feedback").insert({
      rating: Number(selected.value),
      comment: comment || null
    });
    if (error) throw error;

    // Keep Supabase as the primary record; a mail-provider outage must not lose feedback.
    let emailQueued = false;
    try {
      const mailResponse = await fetch("https://formsubmit.co/ajax/navigate.support@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          _subject: "NAVIGATE | New website rating: " + selected.value + "/5",
          _template: "table",
          _url: "https://app.navigateretention.site/support.html",
          submission_type: "Website rating",
          rating: selected.value + " / 5",
          feedback: comment || "No written comment",
          message: "A visitor submitted a new NAVIGATE website rating."
        })
      });
      const mailResult = await mailResponse.json();
      emailQueued = mailResponse.ok && mailResult.success !== false && mailResult.success !== "false";
    } catch (mailError) {
      console.warn("Rating was saved, but email notification could not be submitted.", mailError);
    }

    ratingForm.reset();
    paintStars();
    ratingStatus.dataset.type = emailQueued ? "success" : "info";
    ratingStatus.textContent = emailQueued
      ? translate("Thank you! Your rating was saved and the email notification was submitted.", "شكرًا لك! تم حفظ التقييم وإرسال إشعار البريد.")
      : translate("Your rating was saved. The email notification could not be confirmed.", "تم حفظ التقييم، لكن تعذّر تأكيد إشعار البريد.");
  } catch (error) {
    console.error("Feedback submission failed", error);
    ratingStatus.dataset.type = "error";
    ratingStatus.textContent = translate("Could not send the rating. Please try again.", "تعذّر إرسال التقييم. يرجى المحاولة مرة أخرى.");
  } finally {
    ratingSubmit.disabled = false;
  }
});

// Show the private dashboard entry only for the designated owner account.
refreshUser().then(user => {
  const link = document.getElementById("adminFeedbackLink");
  if (link && user?.id === "33837b6a-ec95-4250-b676-14c6e4e75979") link.hidden = false;
}).catch(error => console.error("Account check failed", error));
