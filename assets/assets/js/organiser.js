/* Organiser workspace (mirrors OrganiserView, ChecklistBoard, AiSuggestionPanel, RiskRegister).
   State lives in memory only, exactly like the Next.js version: refresh and it resets. */
(function () {
  "use strict";
  var D = window.PE_DATA, R = window.PERender;
  var $ = function (id) { return document.getElementById(id); };
  var esc = R.esc;

  /* ---------- Readiness checklist ---------- */
  var items = D.checklist;
  var statuses = {};
  items.forEach(function (i) { statuses[i.id] = i.status; });

  function needLabel(id) {
    var n = D.needs.filter(function (x) { return x.id === id; })[0];
    return n ? n.label : id;
  }
  function score() {
    var v = items.filter(function (i) { return statuses[i.id] === "verified"; }).length;
    return Math.round((v / items.length) * 100);
  }
  function renderChecklist() {
    var groups = [], seen = {};
    items.forEach(function (i) { if (!seen[i.need]) { seen[i.need] = []; groups.push(i.need); } seen[i.need].push(i); });
    $("checklist-body").innerHTML = groups.map(function (need) {
      return '<div><h3 class="semibold" style="font-size:1rem">' + esc(needLabel(need)) + '</h3><ul style="list-style:none;padding:0;margin:0">' +
        seen[need].map(function (i) {
          var opts = R.STATUS_ORDER.map(function (s) {
            return '<option value="' + s + '"' + (statuses[i.id] === s ? " selected" : "") + ">" + R.STATUS_META[s].label + "</option>";
          }).join("");
          return '<li class="check-item" data-item="' + esc(i.id) + '"><span class="small">' + esc(i.prompt) +
            (i.note ? '<span class="muted xsmall" style="display:block">' + esc(i.note) + "</span>" : "") + "</span>" +
            '<span class="row row-tight"><span class="badge-slot">' + R.statusBadge(statuses[i.id]) + "</span>" +
            '<label><span class="sr-only">Set status for ' + esc(i.prompt) + '</span><select class="compact" data-item="' + esc(i.id) + '">' + opts + "</select></label></span></li>";
        }).join("") + "</ul></div>";
    }).join("");
    $("score").textContent = score() + "% verified";
  }
  $("checklist-body").addEventListener("change", function (e) {
    var sel = e.target.closest("select[data-item]");
    if (!sel) return;
    var id = sel.getAttribute("data-item");
    statuses[id] = sel.value;
    sel.closest(".check-item").querySelector(".badge-slot").innerHTML = R.statusBadge(sel.value);
    $("score").textContent = score() + "% verified";
  });

  /* ---------- AI suggestions (client-side stand-in, see src/app/api/ai/suggest/route.ts) ---------- */
  var aiDecisions = {};
  function runAi() {
    var attrs = [];
    Object.keys(D.suggestionLibrary).forEach(function (need) {
      D.suggestionLibrary[need].forEach(function (s) { attrs.push(s); });
    });
    aiDecisions = {};
    var total = attrs.length + D.riskDrafts.length;
    function decisionButtons(key) {
      return '<span class="row row-tight">' +
        '<button type="button" class="decision approve" data-key="' + esc(key) + '" data-d="approved" aria-pressed="false">Approve</button>' +
        '<button type="button" class="decision reject" data-key="' + esc(key) + '" data-d="rejected" aria-pressed="false">Reject</button></span>';
    }
    $("ai-disclosure").hidden = false;
    $("ai-disclosure").textContent = "Simulated AI output for the prototype. Each item is a suggestion and requires human confirmation before it is published.";
    $("ai-results").innerHTML =
      '<p class="semibold small" id="ai-progress" role="status" style="margin-top:0.75rem">Reviewed 0 of ' + total + " suggestions</p>" +
      '<ul style="list-style:none;padding:0;margin:0.75rem 0 0" class="stack-sm">' +
      attrs.map(function (a) {
        var key = "attr-" + a.key;
        var value = typeof a.proposedValue === "boolean" ? (a.proposedValue ? "Yes" : "No") : (a.unit ? a.proposedValue + " " + a.unit : a.proposedValue);
        return '<li class="check-item"><span class="small"><span class="semibold">' + esc(a.label) + ": " + esc(value) + "</span>" +
          '<span class="muted xsmall" style="margin-left:0.5rem">Suggested, not yet verified</span>' +
          '<span class="muted xsmall" style="display:block">' + esc(a.reason) + "</span></span>" +
          '<span class="row row-tight">' + R.statusBadge("requires_confirmation") + decisionButtons(key) + "</span></li>";
      }).join("") +
      D.riskDrafts.map(function (r) {
        return '<li class="check-item"><span class="small semibold">Risk: ' + esc(r.description) + "</span>" + decisionButtons("risk-" + r.id) + "</li>";
      }).join("") + "</ul>";
    $("ai-results").setAttribute("data-total", String(total));
  }
  $("ai-run").addEventListener("click", function () {
    var btn = $("ai-run");
    btn.disabled = true; btn.textContent = "Thinking…";
    setTimeout(function () { runAi(); btn.disabled = false; btn.textContent = "Ask AI for suggestions"; }, 350);
  });
  $("ai-results").addEventListener("click", function (e) {
    var b = e.target.closest("button.decision");
    if (!b) return;
    var key = b.getAttribute("data-key"), d = b.getAttribute("data-d");
    aiDecisions[key] = d;
    Array.prototype.forEach.call($("ai-results").querySelectorAll('button.decision[data-key="' + key + '"]'), function (x) {
      x.setAttribute("aria-pressed", String(x.getAttribute("data-d") === d));
    });
    $("ai-progress").textContent = "Reviewed " + Object.keys(aiDecisions).length + " of " + $("ai-results").getAttribute("data-total") + " suggestions";
  });

  /* ---------- Risk register ---------- */
  var risks = D.risks.map(function (r) { return Object.assign({}, r); });
  function rating(l, c) { var s = l * c; return s >= 15 ? "High" : s >= 8 ? "Medium" : "Low"; }
  function renderRisks() {
    $("risk-list").innerHTML = risks.map(function (r) {
      var rt = rating(r.likelihood, r.consequence);
      return '<li class="card" data-risk="' + esc(r.id) + '" style="border-width:1px"><div class="row between" style="align-items:flex-start">' +
        '<p class="semibold small">' + esc(r.description) + "</p>" +
        '<span class="risk-rate risk-' + rt + '">' + rt + " (L" + r.likelihood + " × C" + r.consequence + ")</span></div>" +
        '<dl class="risk-grid">' +
        "<div><dt>Control</dt><dd>" + esc(r.control) + "</dd></div>" +
        "<div><dt>Responsible role</dt><dd>" + esc(r.responsibleRole) + "</dd></div>" +
        "<div><dt>Escalation trigger</dt><dd>" + esc(r.escalationTrigger) + "</dd></div>" +
        "<div><dt>Residual risk</dt><dd>" + esc(r.residualRisk) + "</dd></div></dl>" +
        '<div class="row row-tight" style="margin-top:0.75rem">' +
        '<button type="button" class="decision approve" data-risk="' + esc(r.id) + '" data-d="approved" aria-pressed="' + (r.status === "approved") + '">Approve</button>' +
        '<button type="button" class="decision reject" data-risk="' + esc(r.id) + '" data-d="rejected" aria-pressed="' + (r.status === "rejected") + '">Reject</button>' +
        '<span class="muted xsmall approver">' + (r.approvedBy ? "Approved by " + esc(r.approvedBy) : "") + "</span></div></li>";
    }).join("");
  }
  $("risk-list").addEventListener("click", function (e) {
    var b = e.target.closest("button.decision");
    if (!b) return;
    var id = b.getAttribute("data-risk"), d = b.getAttribute("data-d");
    risks.forEach(function (r) { if (r.id === id) { r.status = d; r.approvedBy = d === "approved" ? "Event organiser (demo)" : null; } });
    var li = b.closest("li");
    Array.prototype.forEach.call(li.querySelectorAll("button.decision"), function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-d") === d)); });
    li.querySelector(".approver").textContent = d === "approved" ? "Approved by Event organiser (demo)" : "";
  });

  /* ---------- Publish ---------- */
  $("publish-btn").addEventListener("click", function () { $("publish-msg").hidden = false; });

  renderChecklist();
  renderRisks();
})();
