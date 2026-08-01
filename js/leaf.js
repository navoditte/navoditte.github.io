(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var SVG_NS = "http://www.w3.org/2000/svg";

  var GRID = [
    "....L....",
    "...LLL...",
    "..LLLLL..",
    "L.LLLLL.L",
    "LLLLLLLLL",
    "LLLLVLLLL",
    ".LLLVLLL.",
    "..LLVLL..",
    "...LVL...",
    "....V....",
    "....S...."
  ];
  var COLORS = { L: "#4f9d5c", V: "#2f6b3a", S: "#7a5230" };
  var COLS = GRID[0].length;
  var ROWS = GRID.length;

  var footer = document.querySelector("footer.site-footer");
  if (!footer || !footer.parentNode) return;

  var container = document.createElement("div");
  container.className = "leaf-strip";

  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + COLS + " " + ROWS);
  svg.setAttribute("class", "leaf drifting");
  svg.setAttribute("role", "button");
  svg.setAttribute("aria-label", "drifting leaf, click for a surprise");

  var hitArea = document.createElementNS(SVG_NS, "rect");
  hitArea.setAttribute("x", "0");
  hitArea.setAttribute("y", "0");
  hitArea.setAttribute("width", String(COLS));
  hitArea.setAttribute("height", String(ROWS));
  hitArea.setAttribute("fill", "transparent");
  hitArea.setAttribute("pointer-events", "all");
  svg.appendChild(hitArea);

  GRID.forEach(function (row, r) {
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === "." || !COLORS[ch]) continue;
      var px = document.createElementNS(SVG_NS, "rect");
      px.setAttribute("x", String(c));
      px.setAttribute("y", String(r));
      px.setAttribute("width", "1");
      px.setAttribute("height", "1");
      px.setAttribute("fill", COLORS[ch]);
      svg.appendChild(px);
    }
  });

  container.appendChild(svg);
  footer.parentNode.insertBefore(container, footer);

  function syncDriftWidth() {
    container.style.setProperty("--drift-w", container.getBoundingClientRect().width + "px");
  }
  syncDriftWidth();
  window.addEventListener("resize", syncDriftWidth);

  function respawn() {
    svg.style.top = "";
    svg.style.left = "";
    svg.style.transform = "";
    svg.style.visibility = "";
    svg.classList.remove("poof");
    void svg.getBoundingClientRect();
    svg.classList.add("drifting");
  }

  svg.addEventListener("click", function () {
    if (svg.classList.contains("poof")) return;

    var leafRect = svg.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    svg.style.top = leafRect.top - containerRect.top + "px";
    svg.style.left = leafRect.left - containerRect.left + "px";
    svg.style.transform = "none";

    svg.classList.remove("drifting");
    svg.classList.add("poof");
  });

  svg.addEventListener("animationend", function (event) {
    if (event.animationName !== "leaf-poof") return;
    svg.style.visibility = "hidden";
    setTimeout(respawn, 1000 + Math.random() * 1500);
  });
})();
