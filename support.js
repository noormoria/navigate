

const params = new URLSearchParams(window.location.search);
const sent = document.getElementById("supportSent");

if (params.get("sent") === "1" && sent) {
  sent.hidden = false;
  sent.scrollIntoView({behavior: "smooth", block: "center"});
}

import { supabase, supabaseConfigured, translate } from "./shared.js";

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
    ratingForm.reset();
    paintStars();
    ratingStatus.dataset.type = "success";
    ratingStatus.textContent = translate("Thank you! Your rating was received.", "شكرًا لك! تم استلام التقييم بنجاح.");
  } catch (error) {
    console.error("Feedback submission failed", error);
    ratingStatus.dataset.type = "error";
    ratingStatus.textContent = translate("Could not send the rating. Please try again.", "تعذّر إرسال التقييم. يرجى المحاولة مرة أخرى.");
  } finally {
    ratingSubmit.disabled = false;
  }
});
