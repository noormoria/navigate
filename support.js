import "./shared.js";

const params = new URLSearchParams(window.location.search);
const sent = document.getElementById("supportSent");

if (params.get("sent") === "1" && sent) {
  sent.hidden = false;
  sent.scrollIntoView({behavior: "smooth", block: "center"});
}
