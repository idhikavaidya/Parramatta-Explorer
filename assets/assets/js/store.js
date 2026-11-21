/* Community store: issue reports, votes, flags and after-event feedback.
 *
 * The Next.js app keeps these in server memory (src/lib/community.ts). A plain static site has no
 * server, so this version keeps them in THIS browser's localStorage, seeded with the same two example
 * reports. That means reports are visible only on the device that made them. Sharing them between
 * people needs a real backend; see static-site/README.md.
 *
 * New here: one vote per device per issue (a device can change its vote, not stack votes), and one
 * flag per device per issue. This is a convenience for honest users, not a security control: anyone
 * can clear their storage. Real dedupe has to happen on a server.
 */
(function () {
  "use strict";
  var PE = window.PE;
  var D = window.PE_DATA;

  var K = { issues: "pe-issues", votes: "pe-votes", flags: "pe-flags", feedback: "pe-feedback", rate: "pe-rate" };
  var HIDE_AT_FLAGS = 3;
  var STATES = ["still_there", "being_resolved", "resolved"];
  var MAX_NOTE_LENGTH = 240;

  /* ---------- Moderation (src/lib/moderation.ts) ---------- */
  var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  var PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
  var URL_RE = /https?:\/\/\S+|www\.\S+/gi;

  function screenText(raw) {
    var trimmed = String(raw || "").trim().slice(0, MAX_NOTE_LENGTH);
    var lower = trimmed.toLowerCase();
    var hit = (D.blocklist || []).some(function (w) { return new RegExp("\\b" + w + "\\b", "i").test(lower); });
    if (hit) return { ok: false, text: "", reason: "Please remove inappropriate language before posting." };
    var cleaned = trimmed.replace(EMAIL_RE, "[removed]").replace(URL_RE, "[removed]").replace(PHONE_RE, "[removed]");
    return { ok: true, text: cleaned };
  }

  /* Per-device rate limit (client side: slows accidental spam, does not stop a determined person). */
  function rateLimit(key, limit, windowMs) {
    var now = Date.now();
    var all = PE.ls.getJSON(K.rate, {});
    var recent = (all[key] || []).filter(function (t) { return now - t < windowMs; });
    if (recent.length >= limit) { all[key] = recent; PE.ls.setJSON(K.rate, all); return false; }
    recent.push(now);
    all[key] = recent;
    PE.ls.setJSON(K.rate, all);
    return true;
  }

  /* ---------- Issues ---------- */
  function loadIssues() {
    var stored = PE.ls.getJSON(K.issues, null);
    if (stored && Array.isArray(stored)) return stored;
    return JSON.parse(JSON.stringify(D.seedIssues));
  }
  function saveIssues(list) { PE.ls.setJSON(K.issues, list); }
  function loadVotes() { return PE.ls.getJSON(K.votes, {}); }
  function loadFlags() { return PE.ls.getJSON(K.flags, []); }

  function winner(counts) {
    return STATES.reduce(function (best, s) { return counts[s] > counts[best] ? s : best; }, STATES[0]);
  }

  function listIssues(eventId) {
    var votes = loadVotes();
    var flags = loadFlags();
    return loadIssues()
      .filter(function (i) { return !i.hidden && flags.indexOf(i.id) === -1 && (!eventId || i.eventId === eventId); })
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); })
      .map(function (i) { return Object.assign({}, i, { myVote: votes[i.id] || null }); });
  }

  function addIssue(input) {
    if (!rateLimit("issue", 5, 60 * 60 * 1000)) {
      return { ok: false, error: "Too many reports from this device. Please try again later." };
    }
    if (!input.eventId || !input.featureId || !input.issueType) return { ok: false, error: "Please choose an event, a feature and an issue type." };
    if (D.issueTypes.indexOf(input.issueType) === -1) return { ok: false, error: "Unknown issue type." };
    var feature = D.featureOptions.filter(function (f) { return f.id === input.featureId; })[0];
    if (!feature) return { ok: false, error: "Unknown feature." };

    var other = (input.issueOther || "").trim();
    if (input.issueType === "Other") {
      if (!other) return { ok: false, error: "Please describe the issue type." };
      var so = screenText(other);
      if (!so.ok) return { ok: false, error: so.reason };
      other = so.text;
    } else { other = ""; }

    var note = screenText(input.note);
    if (!note.ok) return { ok: false, error: note.reason };

    var ev = D.events.filter(function (e) { return e.id === input.eventId; })[0];
    var issue = {
      id: "iss-" + Date.now().toString(36),
      eventId: input.eventId,
      eventTitle: ev ? ev.title : input.eventId,
      featureId: feature.id,
      featureLabel: feature.label,
      issueType: input.issueType,
      issueOther: other || undefined,
      note: note.text,
      createdAt: new Date().toISOString(),
      state: "still_there",
      counts: { still_there: 1, being_resolved: 0, resolved: 0 },
      flags: 0,
      hidden: false
    };
    var list = loadIssues();
    list.unshift(issue);
    saveIssues(list);
    // The reporter's own report counts as their one vote.
    var votes = loadVotes(); votes[issue.id] = "still_there"; PE.ls.setJSON(K.votes, votes);
    return { ok: true, issue: issue };
  }

  /* One vote per device per issue. Voting again with a different answer MOVES the vote. */
  function vote(id, state) {
    if (STATES.indexOf(state) === -1) return { ok: false, error: "Unknown status." };
    var votes = loadVotes();
    var previous = votes[id] || null;
    if (previous === state) return { ok: true, changed: false, previous: previous };
    if (!rateLimit("vote", 40, 60 * 60 * 1000)) return { ok: false, error: "Too many updates. Try again later." };

    var list = loadIssues();
    var found = null;
    list = list.map(function (i) {
      if (i.id !== id) return i;
      var counts = Object.assign({}, i.counts);
      if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
      counts[state] = counts[state] + 1;
      found = Object.assign({}, i, { counts: counts, state: winner(counts) });
      return found;
    });
    if (!found) return { ok: false, error: "Issue not found." };
    saveIssues(list);
    votes[id] = state;
    PE.ls.setJSON(K.votes, votes);
    return { ok: true, changed: true, previous: previous, issue: found };
  }

  /* One flag per device per issue. A flagged report is hidden on this device straight away,
     and for everyone once it has HIDE_AT_FLAGS flags (only meaningful with a shared backend). */
  function flag(id) {
    var flags = loadFlags();
    if (flags.indexOf(id) !== -1) return { ok: true, changed: false };
    var list = loadIssues().map(function (i) {
      if (i.id !== id) return i;
      var n = i.flags + 1;
      return Object.assign({}, i, { flags: n, hidden: n >= HIDE_AT_FLAGS });
    });
    saveIssues(list);
    flags.push(id);
    PE.ls.setJSON(K.flags, flags);
    return { ok: true, changed: true };
  }

  /* ---------- Feedback ---------- */
  var ACCURACY = ["yes", "mostly", "no", "unused"];
  function addFeedback(input) {
    if (!rateLimit("feedback", 10, 60 * 60 * 1000)) {
      return { ok: false, error: "Too many submissions from this device. Please try again later." };
    }
    var stars = parseInt(input.stars, 10);
    if (!(stars >= 1 && stars <= 5)) return { ok: false, error: "Please choose a star rating from 1 to 5." };
    var accuracy = ACCURACY.indexOf(input.accuracy) !== -1 ? input.accuracy : "";
    var screened = screenText(input.details);
    var entry = {
      id: "fb-" + Date.now().toString(36),
      eventId: input.eventId,
      stars: stars,
      accuracy: accuracy,
      details: screened.ok ? screened.text : "",
      createdAt: new Date().toISOString()
    };
    var all = PE.ls.getJSON(K.feedback, []);
    all.unshift(entry);
    PE.ls.setJSON(K.feedback, all.slice(0, 200));
    return { ok: true, feedback: entry, summary: feedbackSummary(input.eventId) };
  }
  function feedbackSummary(eventId) {
    var all = PE.ls.getJSON(K.feedback, []).filter(function (f) { return (!eventId || f.eventId === eventId) && f.stars >= 1 && f.stars <= 5; });
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sum = 0;
    all.forEach(function (f) { counts[f.stars]++; sum += f.stars; });
    return { total: all.length, average: all.length ? sum / all.length : 0, counts: counts };
  }

  PE.store = {
    screenText: screenText, listIssues: listIssues, addIssue: addIssue, vote: vote, flag: flag,
    addFeedback: addFeedback, feedbackSummary: feedbackSummary, STATES: STATES
  };
})();
