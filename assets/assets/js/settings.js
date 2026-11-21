/* Settings page (mirrors SettingsControls.tsx) with the extra options added in this version:
   motion, dyslexia-friendly font, letter spacing and line spacing. Choices apply instantly. */
(function () {
  "use strict";
  var PE = window.PE, R = window.PERender;
  var root = document.getElementById("settings-groups");
  if (!root) return;

  var GROUPS = [
    { key: "theme", legend: "Theme", options: [["light", "Light", ""], ["dark", "Dark", ""]] },
    { key: "cb", legend: "Colour mode (for colour blindness)", options: [
      ["none", "Default", "Standard colours"], ["protan", "Protanopia", "Red-blind safe palette"],
      ["deuter", "Deuteranopia", "Green-blind safe palette"], ["tritan", "Tritanopia", "Blue-blind safe palette"],
      ["mono", "High contrast", "Monochrome, maximum contrast"]] },
    { key: "text", legend: "Text size", options: [["base", "100%", "Default"], ["lg", "112%", "Large"], ["xl", "125%", "Extra large"], ["xxl", "137%", "Largest"]] },
    { key: "font", legend: "Font", options: [["default", "Standard", "Inter"], ["dyslexia", "Dyslexia-friendly", "OpenDyslexic"]] },
    { key: "ls", legend: "Letter and word spacing", options: [["normal", "Normal", ""], ["wide", "Wide", "Easier to scan"], ["wider", "Wider", "Maximum spacing"]] },
    { key: "lh", legend: "Line spacing", options: [["normal", "Normal", ""], ["relaxed", "Relaxed", "1.8"], ["loose", "Loose", "2.1"]] },
    { key: "motion", legend: "Motion", options: [["auto", "Match my device", "Follows your system setting"], ["reduce", "Reduce motion", "Turn off animations and transitions"]] }
  ];

  function render() {
    var current = PE.settings.get();
    root.innerHTML = GROUPS.map(function (g) {
      return '<fieldset data-key="' + g.key + '"><legend>' + R.esc(g.legend) + '</legend><div class="choice-group">' +
        g.options.map(function (o) {
          return '<button type="button" class="choice" data-value="' + o[0] + '" aria-pressed="' + (current[g.key] === o[0]) + '"><strong>' + R.esc(o[1]) + "</strong>" +
            (o[2] ? "<small>" + R.esc(o[2]) + "</small>" : "") + "</button>";
        }).join("") + "</div></fieldset>";
    }).join("");
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest("button.choice");
    if (!b) return;
    var key = b.closest("fieldset").getAttribute("data-key");
    var patch = {}; patch[key] = b.getAttribute("data-value");
    PE.settings.set(patch);
    // Update pressed states in place so keyboard focus is not lost.
    Array.prototype.forEach.call(b.closest(".choice-group").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
  });

  document.getElementById("settings-reset").addEventListener("click", function () {
    PE.settings.reset();
    render();
    document.getElementById("settings-reset-msg").textContent = "Display settings reset to defaults.";
  });

  render();
})();
