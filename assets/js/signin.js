/* Sign-in (mirrors src/components/SignInForm.tsx). Demo only: nothing is sent anywhere and the
   "role" is just a flag in this browser's localStorage. */
(function () {
  "use strict";
  var PE = window.PE;
  var $ = function (id) { return document.getElementById(id); };

  var COUNCIL_DOMAINS = ["cityofparramatta.nsw.gov.au"];
  var DEMO_INVITE_CODE = "PARRA-2026";
  var role = null;

  var result = $("si-result"), error = $("si-error");
  function clearMessages() { result.hidden = true; error.hidden = true; }
  function say(el, text) { el.textContent = text; el.hidden = false; }

  function renderSaved() {
    var saved = PE.role();
    $("si-saved").hidden = !saved;
    if (saved) $("si-saved-role").textContent = saved === "attendee" ? "attendee" : "Council organiser";
    $("si-org-links").hidden = saved !== "organiser";
  }

  function choose(r) {
    role = r;
    clearMessages();
    $("si-choose-attendee").setAttribute("aria-pressed", String(r === "attendee"));
    $("si-choose-organiser").setAttribute("aria-pressed", String(r === "organiser"));
    $("si-attendee").hidden = r !== "attendee";
    $("si-organiser").hidden = r !== "organiser";
  }
  $("si-choose-attendee").addEventListener("click", function () { choose("attendee"); });
  $("si-choose-organiser").addEventListener("click", function () { choose("organiser"); });

  $("si-continue").addEventListener("click", function () {
    PE.ls.set("pe-role", "attendee");
    renderSaved();
    say(result, "You're browsing as an attendee. No account is needed and nothing about your needs is stored.");
  });

  $("si-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clearMessages();
    var email = $("si-email").value.trim().toLowerCase();
    var code = $("si-code").value.trim().toUpperCase();
    var domainOk = COUNCIL_DOMAINS.some(function (d) { return email.slice(-("@" + d).length) === "@" + d; });
    var codeOk = code === DEMO_INVITE_CODE;
    if (!domainOk && !codeOk) {
      say(error, "We couldn't verify that email. Use your City of Parramatta work email, or an invite code from your Council events team. You can also ask to be verified manually.");
      return;
    }
    PE.ls.set("pe-role", "organiser");
    renderSaved();
    say(result, domainOk
      ? "Verification email sent to your Council address. Open it to finish signing in. (Demo: no email is actually sent.)"
      : "Invite code accepted. You're signed in as a Council organiser. (Demo only.)");
  });

  $("si-signout").addEventListener("click", function () {
    PE.ls.remove("pe-role");
    role = null;
    $("si-choose-attendee").setAttribute("aria-pressed", "false");
    $("si-choose-organiser").setAttribute("aria-pressed", "false");
    $("si-attendee").hidden = true;
    $("si-organiser").hidden = true;
    clearMessages();
    renderSaved();
  });

  renderSaved();
})();
