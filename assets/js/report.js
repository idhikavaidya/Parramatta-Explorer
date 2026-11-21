/* Report a problem + community status (mirrors ReportBoard.tsx and IssueList.tsx).
   Votes are one per device per issue (changing your answer moves your vote). */
(function () {
  "use strict";
  var PE = window.PE, D = window.PE_DATA, R = window.PERender;
  var $ = function (id) { return document.getElementById(id); };
  var esc = R.esc;

  var STATE_LABEL = { still_there: "Still there", being_resolved: "Being resolved", resolved: "Resolved" };

  /* ---------- Form ---------- */
  var evSel = $("r-event"), ftSel = $("r-feature"), tySel = $("r-type");
  evSel.innerHTML = D.events.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.title) + "</option>"; }).join("");
  ftSel.innerHTML = D.featureOptions.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.label) + "</option>"; }).join("");
  tySel.innerHTML = D.issueTypes.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("");

  var qEvent = PE.qs("event"), qFeature = PE.qs("feature");
  if (qEvent && D.events.some(function (e) { return e.id === qEvent; })) evSel.value = qEvent;
  if (qFeature && D.featureOptions.some(function (f) { return f.id === qFeature; })) ftSel.value = qFeature;

  function syncOther() { $("r-other-wrap").hidden = tySel.value !== "Other"; }
  tySel.addEventListener("change", syncOther);
  syncOther();

  var msg = $("r-msg");
  $("r-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var res = PE.store.addIssue({
      eventId: evSel.value, featureId: ftSel.value, issueType: tySel.value,
      issueOther: $("r-other").value, note: $("r-note").value
    });
    msg.hidden = false;
    msg.className = "notice" + (res.ok ? "" : " notice-error");
    if (res.ok) {
      msg.textContent = "Thanks — your report is now visible to other attendees on this device. They can confirm whether it's still there, being fixed, or resolved. In an emergency call 000.";
      $("r-note").value = ""; $("r-other").value = "";
      renderIssues();
    } else {
      msg.textContent = res.error;
    }
  });

  /* ---------- Issue list ---------- */
  var listEl = $("issue-list");
  var focusAfter = null;

  function renderIssues() {
    var issues = PE.store.listIssues(evSel.value);
    if (!issues.length) {
      listEl.innerHTML = '<li class="card">No open reports for this event yet. If you spot a problem, you can be the first to add one.</li>';
      return;
    }
    listEl.innerHTML = issues.map(function (i) {
      var buttons = PE.store.STATES.map(function (s) {
        return '<button type="button" class="vote" data-id="' + esc(i.id) + '" data-state="' + s + '" aria-pressed="' + (i.myVote === s) + '">' +
          STATE_LABEL[s] + " · " + i.counts[s] + "</button>";
      }).join("");
      return '<li class="card"><div class="row row-tight">' +
        '<span class="state-pill state-' + i.state + '">' + STATE_LABEL[i.state] + "</span>" +
        '<span class="semibold">' + esc(i.featureLabel) + "</span>" +
        '<span class="muted small">· ' + esc(i.issueType) + (i.issueOther ? ": " + esc(i.issueOther) : "") + "</span></div>" +
        (i.note ? '<p class="small" style="margin-top:0.5rem">' + esc(i.note) + "</p>" : "") +
        '<p class="muted xsmall" style="margin-top:0.25rem">' + esc(i.eventTitle) + " · reported " + new Date(i.createdAt).toLocaleDateString("en-AU") + "</p>" +
        '<div class="row row-tight" style="margin-top:0.75rem"><span class="small semibold" id="q-' + esc(i.id) + '">Is it still there?</span>' + buttons +
        '<button type="button" class="linkbtn ml-auto" data-flag="' + esc(i.id) + '">Report as inappropriate</button></div>' +
        (i.myVote ? '<p class="muted xsmall" style="margin-top:0.25rem">You voted “' + STATE_LABEL[i.myVote] + '”. One vote per device — tap another answer to change it.</p>' : "") +
        "</li>";
    }).join("");
    if (focusAfter) {
      var el = listEl.querySelector(focusAfter);
      if (el) el.focus();
      focusAfter = null;
    }
  }

  listEl.addEventListener("click", function (e) {
    var v = e.target.closest("button.vote");
    if (v) {
      var res = PE.store.vote(v.getAttribute("data-id"), v.getAttribute("data-state"));
      if (!res.ok) { $("flag-status").textContent = res.error; return; }
      $("flag-status").textContent = res.changed ? "Your vote was recorded." : "You have already voted that way.";
      focusAfter = 'button.vote[data-id="' + v.getAttribute("data-id") + '"][data-state="' + v.getAttribute("data-state") + '"]';
      renderIssues();
      return;
    }
    var f = e.target.closest("button[data-flag]");
    if (f) {
      PE.store.flag(f.getAttribute("data-flag"));
      renderIssues();
      var s = $("flag-status");
      s.textContent = "Thanks — that report is now hidden on this device.";
    }
  });

  evSel.addEventListener("change", renderIssues);
  renderIssues();
})();
