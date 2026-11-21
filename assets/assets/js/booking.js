/* Prototype booking demo: runs entirely in the browser. No ticket is issued, no payment is taken,
   and nothing is sent anywhere. The request is saved to localStorage so it can be shown again on this device. */
(function () {
  "use strict";
  var PE = window.PE;
  var form = document.getElementById("book-form");
  if (!form) return;
  var section = document.getElementById("booking");
  var eventId = document.body.getAttribute("data-event");
  var price = Number(section.getAttribute("data-price")) || 0;
  var qty = document.getElementById("book-qty");
  var total = document.getElementById("book-total");
  var result = document.getElementById("book-result");
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function count() { var n = parseInt(qty.value, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(10, n)); }
  function money() { return price === 0 ? "Free" : "$" + (price * count()); }
  function updateTotal() { total.textContent = price === 0 ? "Free" : money() + " (" + count() + " × $" + price + ")"; }
  qty.addEventListener("input", updateTotal);
  updateTotal();

  function show(b) {
    result.innerHTML = '<div class="card-soft stack-sm"><h3>Demo booking request saved</h3>' +
      "<p><strong>Reference:</strong> " + esc(b.ref) + "</p>" +
      "<p><strong>Tickets:</strong> " + b.qty + " · <strong>Estimated cost:</strong> " + esc(b.cost) + "</p>" +
      '<p class="muted small">Prototype only. No ticket was issued, no payment was taken and nothing was sent to the organiser. Confirm tickets with the organiser. This request is saved only in this browser.</p></div>';
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var n = count();
    if (n < 1) { result.innerHTML = '<p class="notice" role="alert">Choose between 1 and 10 tickets.</p>'; qty.focus(); return; }
    var b = { ref: "DEMO-" + Math.random().toString(36).slice(2, 8).toUpperCase(), eventId: eventId, qty: n, cost: money(), at: new Date().toISOString() };
    var all = PE.ls.getJSON("pe-bookings", []);
    if (!Array.isArray(all)) all = [];
    all.push(b);
    PE.ls.setJSON("pe-bookings", all.slice(-20));
    show(b);
    result.focus();
  });
})();
