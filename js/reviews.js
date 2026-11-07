(function () {
  var DATA_URL = "../data/books.json";

  var SORTS = {
    recent:   { label: "Recently read", cmp: function (a, b) { return cmpStr(a.read, b.read, true); } },
    rating:   { label: "Highest rated", cmp: function (a, b) { return cmpNum(a.rating, b.rating, true) || cmpStr(a.read, b.read, true); } },
    longest:  { label: "Longest",       cmp: function (a, b) { return cmpNum(a.pages, b.pages, true); } },
    shortest: { label: "Shortest",      cmp: function (a, b) { return cmpNum(a.pages, b.pages, false); } },
    title:    { label: "Title A–Z",     cmp: function (a, b) { return a.title.localeCompare(b.title); } }
  };

  // Muted spine colours that sit well on cream; text colour is picked per spine.
  var TEXTURES = ["t-cloth", "t-linen"];
  var PALETTE = ["#3f7d4c", "#7a3b3b", "#2f4a6b", "#b8862f", "#a4532f", "#5a3d6b", "#4a5d3a", "#2e5a5a", "#6b4a2f", "#8a3f5a"];

  var state = { books: [], sort: "recent", tags: [], query: "", view: "shelf", openId: "" };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var els = {};
  var lastFocus = null;

  // ---- helpers -------------------------------------------------------------

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  // Missing values always sort last, whichever direction.
  function cmpNum(a, b, desc) {
    var ma = !(a > 0), mb = !(b > 0);
    if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
    return desc ? b - a : a - b;
  }
  function cmpStr(a, b, desc) {
    var ma = !a, mb = !b;
    if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
    var r = a < b ? -1 : a > b ? 1 : 0;
    return desc ? -r : r;
  }

  function hash(s) {
    var n = 2166136261;
    for (var i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619); }
    return n >>> 0;
  }

  function fold(s) {
    return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function slugify(s) {
    return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "book";
  }

  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#2e2a20" : "#f7f1e1";
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso || "");
    if (!m) return "";
    var out = MONTHS[+m[2] - 1] + " " + m[1];
    return m[3] ? +m[3] + " " + out : out;
  }

  function normalize(raw, seen) {
    var title = String(raw.title || "").trim();
    if (!title) return null;
    var base = slugify(title), n = seen[base] || 0;
    seen[base] = n + 1;
    var rating = parseFloat(raw.rating);
    var review = Array.isArray(raw.review) ? raw.review : raw.review ? String(raw.review).split(/\n{2,}/) : [];
    var book = {
      id: raw.id ? slugify(raw.id) : n ? base + "-" + (n + 1) : base,
      title: title,
      author: String(raw.author || "").trim(),
      year: raw.year ? String(raw.year) : "",
      pages: parseInt(raw.pages, 10) || 0,
      isbn: String(raw.isbn || "").replace(/[^0-9Xx]/g, ""),
      rating: rating > 0 ? Math.min(5, Math.round(rating * 4) / 4) : 0,
      read: String(raw.read || "").trim(),
      tags: (Array.isArray(raw.tags) ? raw.tags : []).map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean),
      review: review.map(function (p) { return String(p).trim(); }).filter(Boolean),
      cover: /^https:\/\//.test(raw.cover || "") ? raw.cover : "",
      moods: (Array.isArray(raw.moods) ? raw.moods : []).map(function (m) { return String(m).trim().toLowerCase(); }).filter(Boolean),
      pace: String(raw.pace || "").trim().toLowerCase(),
      color: /^#[0-9a-f]{6}$/i.test(raw.color || "") ? raw.color : "",
      links: (Array.isArray(raw.links) ? raw.links : []).filter(function (l) { return l && /^https?:\/\//.test(l.href || ""); })
    };
    book.hay = fold([book.title, book.author, book.year, book.tags.join(" "), book.review.join(" ")].join(" "));
    return book;
  }

  function stars(rating) {
    var wrap = h("span", { class: "stars", role: "img", "aria-label": rating ? rating + " out of 5" : "not rated" });
    for (var i = 1; i <= 5; i++) {
      var fill = Math.max(0, Math.min(1, rating - (i - 1)));
      wrap.appendChild(h("span", { class: "star", style: "--f:" + Math.round(fill * 100) + "%", text: "★", "aria-hidden": "true" }));
    }
    return wrap;
  }

  // ---- derived view --------------------------------------------------------

  function matchesQuery(b) {
    if (!state.query) return true;
    return fold(state.query).split(/\s+/).filter(Boolean).every(function (term) { return b.hay.indexOf(term) !== -1; });
  }

  function visibleBooks() {
    return state.books
      .filter(function (b) { return state.tags.every(function (t) { return b.tags.indexOf(t) !== -1; }); })
      .filter(matchesQuery)
      .sort(SORTS[state.sort].cmp);
  }

  // ---- rendering -----------------------------------------------------------

  function spineHeight(b) {
    return b.pages ? Math.max(30, Math.min(90, Math.round(14 + b.pages / 7))) : 46;
  }

  function renderSpine(b) {
    var hs = hash(b.title + b.author);
    var color = b.color || PALETTE[hs % PALETTE.length];
    var btn = h("button", {
      type: "button",
      class: "spine " + TEXTURES[(hs >>> 3) % TEXTURES.length] + (b.id === state.openId ? " selected" : ""),
      "data-id": b.id,
      "aria-label": b.title + (b.author ? ", " + b.author : ""),
      style: "--c:" + color + ";--fg:" + textOn(color) + ";--h:" + spineHeight(b) + "px",
      onclick: function () { openBook(b.id, true); }
    }, [
      h("span", { class: "spine-title", text: b.title }),
      h("span", { class: "spine-author", text: b.author })
    ]);
    return btn;
  }

  function renderRow(b) {
    var meta = [fmtDate(b.read), b.pages ? b.pages + " pp" : ""].filter(Boolean).join(" · ");
    return h("li", {}, [
      h("button", {
        type: "button",
        class: "row" + (b.id === state.openId ? " selected" : ""),
        "data-id": b.id,
        onclick: function () { openBook(b.id, true); }
      }, [
        h("span", { class: "row-main" }, [
          h("span", { class: "row-title", text: b.title }),
          h("span", { class: "row-author", text: b.author })
        ]),
        h("span", { class: "row-side" }, [stars(b.rating), h("span", { class: "row-meta", text: meta })])
      ])
    ]);
  }

  function renderControls() {
    var select = els.sort;
    if (!select.options.length) {
      Object.keys(SORTS).forEach(function (k) { select.appendChild(h("option", { value: k, text: SORTS[k].label })); });
    }
    select.value = state.sort;

    syncTagMenu();

    Array.prototype.forEach.call(els.views.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view));
    });
  }

  // ---- genre / theme multiselect ---------------------------------------------

  function buildTagMenu() {
    var counts = {};
    state.books.forEach(function (b) { b.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    els.tagMenu.hidden = !names.length;
    els.tagList.textContent = "";
    names.forEach(function (t) {
      var input = h("input", { type: "checkbox", value: t });
      input.addEventListener("change", function () {
        state.tags = Array.prototype.map.call(els.tagList.querySelectorAll("input:checked"), function (i) { return i.value; });
        render();
      });
      els.tagList.appendChild(h("label", { class: "tag-option" }, [
        input, h("span", { class: "tag-name", text: t }), h("span", { class: "tag-count", text: String(counts[t]) })
      ]));
    });
  }

  function syncTagMenu() {
    Array.prototype.forEach.call(els.tagList.querySelectorAll("input"), function (i) { i.checked = state.tags.indexOf(i.value) !== -1; });
    els.tagBadge.textContent = state.tags.length ? String(state.tags.length) : "";
    els.tagBtn.classList.toggle("active", !!state.tags.length);
    els.tagClear.hidden = !state.tags.length;
  }

  function setTagMenu(open) {
    els.tagPanel.hidden = !open;
    els.tagBtn.setAttribute("aria-expanded", String(open));
  }

  // ---- charts ----------------------------------------------------------------

  function svgEl(tag, attrs, text) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }

  // bars: [{ label, value, tip, strong }]; labels shown where label !== "".
  function barChart(bars, ariaLabel) {
    var W = 300, H = 104, top = 14, base = 86;
    var max = Math.max.apply(null, bars.map(function (b) { return b.value; }).concat([1]));
    var step = W / bars.length, bw = Math.floor(step * 0.74);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart-svg", role: "img", "aria-label": ariaLabel });
    svg.appendChild(svgEl("line", { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, class: "axis" }));
    bars.forEach(function (b, i) {
      var x = Math.round(i * step + (step - bw) / 2);
      var ht = b.value ? Math.max(2, Math.round((b.value / max) * (base - top))) : 0;
      var g = svgEl("g", { class: "bar" + (b.strong ? " strong" : "") });
      g.appendChild(svgEl("title", {}, b.tip));
      if (ht) g.appendChild(svgEl("rect", { x: x, y: base - ht, width: bw, height: ht }));
      if (b.value) g.appendChild(svgEl("text", { x: x + bw / 2, y: base - ht - 3, class: "val", "text-anchor": "middle" }, String(b.value)));
      if (b.label) g.appendChild(svgEl("text", { x: x + bw / 2, y: H - 6, class: "lab", "text-anchor": "middle" }, b.label));
      svg.appendChild(g);
    });
    return svg;
  }

  function renderCharts(list) {
    // ratings, rounded to the nearest half star
    var bins = [], rated = 0, i;
    for (i = 1; i <= 10; i++) bins.push(0);
    list.forEach(function (b) {
      if (!b.rating) return;
      rated++;
      bins[Math.max(0, Math.min(9, Math.round(b.rating * 2) - 1))]++;
    });
    var rbars = bins.map(function (n, k) {
      var v = (k + 1) / 2;
      return { value: n, label: v % 1 === 0 ? String(v) : "", tip: v + " stars: " + n + (n === 1 ? " book" : " books") };
    });
    els.chartRatings.textContent = "";
    els.chartRatings.appendChild(barChart(rbars, "Histogram of ratings, " + rated + " rated books"));

    // last 12 months, ending with the current month
    var now = new Date(), months = [];
    for (i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), m: d.getMonth(), y: d.getFullYear(), n: 0 });
    }
    list.forEach(function (b) {
      if (!b.read) return;
      var hit = months.filter(function (mo) { return b.read.slice(0, 7) === mo.key; })[0];
      if (hit) hit.n++;
    });
    var mbars = months.map(function (mo, k) {
      return { value: mo.n, label: MONTHS[mo.m], strong: k === 11, tip: MONTHS[mo.m] + " " + mo.y + ": " + mo.n + (mo.n === 1 ? " book" : " books") };
    });
    els.chartMonths.textContent = "";
    els.chartMonths.appendChild(barChart(mbars, "Books read per month, " + MONTHS[months[0].m] + " " + months[0].y + " to " + MONTHS[months[11].m] + " " + months[11].y));
  }

  function render() {
    var list = visibleBooks();
    renderControls();
    renderCharts(list);
    els.count.textContent = list.length + (list.length === 1 ? " book" : " books") + (state.tags.length ? " · " + state.tags.join(" + ") : "") + (state.query ? " · \u201c" + state.query.trim() + "\u201d" : "");
    els.shelf.textContent = "";
    els.shelf.className = "shelf view-" + state.view;
    if (!list.length) {
      els.shelf.appendChild(h("p", { class: "empty-state", text: state.books.length ? "No books match." : "No books yet." }));
      buildRail();
      return;
    }
    if (state.view === "list") {
      var ul = h("ul", { class: "rows" });
      list.forEach(function (b) { ul.appendChild(renderRow(b)); });
      els.shelf.appendChild(ul);
    } else {
      var stack = h("div", { class: "stack" });
      list.forEach(function (b) { stack.appendChild(renderSpine(b)); });
      els.shelf.appendChild(stack);
      els.shelf.appendChild(h("div", { class: "floor" }));
    }
    buildRail();
  }

  // ---- scroll position rail --------------------------------------------------

  var rail = { el: null, ticks: null, count: null, items: [], pending: false };

  function buildRail() {
    var els2 = Array.prototype.slice.call(els.shelf.querySelectorAll("[data-id]"));
    rail.items = [];
    rail.ticks.textContent = "";
    rail.el.classList.toggle("show", els2.length > 1);
    rail.el.style.setProperty("--n", String(els2.length));
    els2.forEach(function (el, i) {
      var tick = h("button", {
        type: "button", class: "rail-tick", tabindex: "-1", "aria-hidden": "true",
        title: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim(),
        onclick: function () { el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" }); }
      });
      rail.ticks.appendChild(tick);
      rail.items.push({ el: el, tick: tick });
    });
    updateRail();
  }

  function updateRail() {
    rail.pending = false;
    var n = rail.items.length;
    if (!n) return;
    var vh = window.innerHeight, mid = vh / 2, best = 0, bestD = Infinity;
    rail.items.forEach(function (it, i) {
      var r = it.el.getBoundingClientRect();
      it.tick.classList.toggle("in-view", r.bottom > 0 && r.top < vh);
      var d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    rail.items.forEach(function (it, i) { it.tick.classList.toggle("current", i === best); });
    rail.count.textContent = (best + 1) + " / " + n;
  }

  function scheduleRail() {
    if (rail.pending) return;
    rail.pending = true;
    requestAnimationFrame(updateRail);
  }

  // ---- sidebar -------------------------------------------------------------

  function findBook(id) {
    return state.books.filter(function (b) { return b.id === id; })[0];
  }

  function fillPanel(b) {
    var p = els.panelBody;
    p.textContent = "";

    var head = h("div", { class: "panel-head" });
    var coverUrl = b.cover || (b.isbn ? "https://covers.openlibrary.org/b/isbn/" + b.isbn + "-M.jpg?default=false" : "");
    if (coverUrl) {
      var img = h("img", { class: "panel-cover", alt: "", loading: "lazy", src: coverUrl });
      img.addEventListener("error", function () { img.remove(); });
      head.appendChild(img);
    }
    head.appendChild(h("div", { class: "panel-titles" }, [
      h("h2", { id: "panel-title", text: b.title }),
      b.author ? h("p", { class: "panel-author", text: b.author + (b.year ? " (" + b.year + ")" : "") }) : null
    ]));
    p.appendChild(head);

    var facts = h("dl", { class: "facts" });
    function fact(k, v) { if (v) { facts.appendChild(h("dt", { text: k })); facts.appendChild(h("dd", {}, [typeof v === "string" ? document.createTextNode(v) : v])); } }
    fact("Rating", b.rating ? stars(b.rating) : "Not rated");
    fact("Read", fmtDate(b.read));
    fact("Length", b.pages ? b.pages + " pages" : "");
    fact("Mood", b.moods.concat(b.pace ? [b.pace] : []).join(", "));
    p.appendChild(facts);

    if (b.tags.length) {
      var tagWrap = h("div", { class: "panel-tags" });
      b.tags.forEach(function (t) {
        tagWrap.appendChild(h("button", {
          type: "button", class: "chip", text: t,
          onclick: function () { state.tags = [t]; render(); }
        }));
      });
      p.appendChild(tagWrap);
    }

    var body = h("div", { class: "panel-review" });
    if (b.review.length) b.review.forEach(function (para) { body.appendChild(h("p", { text: para })); });
    else body.appendChild(h("p", { class: "empty-state", text: "No review written yet." }));
    p.appendChild(body);

    if (b.links.length) {
      var links = h("p", { class: "panel-links" });
      b.links.forEach(function (l) {
        links.appendChild(h("a", { href: l.href, target: "_blank", rel: "noopener", text: l.label || l.href }));
      });
      p.appendChild(links);
    }
  }

  function openBook(id, push) {
    var b = findBook(id);
    if (!b) return closeBook(false);
    if (state.openId !== id) lastFocus = lastFocus || document.activeElement;
    state.openId = id;
    fillPanel(b);
    els.panel.classList.add("open");
    els.panel.removeAttribute("inert");
    els.panel.setAttribute("aria-hidden", "false");
    els.backdrop.classList.add("open");
    if (push && location.hash !== "#" + id) location.hash = id;
    markSelected();
    els.panelClose.focus({ preventScroll: true });
  }

  function closeBook(updateUrl) {
    if (!state.openId && !els.panel.classList.contains("open")) return;
    state.openId = "";
    els.panel.classList.remove("open");
    els.panel.setAttribute("inert", "");
    els.panel.setAttribute("aria-hidden", "true");
    els.backdrop.classList.remove("open");
    if (updateUrl && location.hash) history.replaceState(null, "", location.pathname + location.search);
    markSelected();
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function markSelected() {
    Array.prototype.forEach.call(els.shelf.querySelectorAll("[data-id]"), function (el) {
      el.classList.toggle("selected", el.getAttribute("data-id") === state.openId);
    });
  }

  function route() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (id && findBook(id)) openBook(id, false);
    else closeBook(false);
  }

  // ---- boot ----------------------------------------------------------------

  function boot() {
    els.sort = document.getElementById("sort");
    els.search = document.getElementById("search");
    if (window.matchMedia("(hover: none)").matches) els.search.placeholder = "Search title, author, genre…";
    els.tagMenu = document.getElementById("tag-menu");
    els.tagBtn = document.getElementById("tag-btn");
    els.tagBadge = document.getElementById("tag-badge");
    els.tagPanel = document.getElementById("tag-panel");
    els.tagList = document.getElementById("tag-list");
    els.tagClear = document.getElementById("tag-clear");
    els.chartRatings = document.getElementById("chart-ratings");
    els.chartMonths = document.getElementById("chart-months");
    els.views = document.getElementById("views");
    els.count = document.getElementById("count");
    els.shelf = document.getElementById("shelf");
    els.panel = document.getElementById("panel");
    els.panelBody = document.getElementById("panel-body");
    els.panelClose = document.getElementById("panel-close");
    els.backdrop = document.getElementById("backdrop");
    rail.el = h("nav", { class: "rail", "aria-hidden": "true" });
    rail.ticks = h("div", { class: "rail-ticks" });
    rail.count = h("div", { class: "rail-count" });
    rail.el.appendChild(rail.ticks);
    rail.el.appendChild(rail.count);
    document.body.appendChild(rail.el);
    window.addEventListener("scroll", scheduleRail, { passive: true });
    window.addEventListener("resize", scheduleRail);

    try { state.view = localStorage.getItem("reviews-view") === "list" ? "list" : "shelf"; } catch (e) {}

    els.search.addEventListener("input", function () { state.query = els.search.value; render(); });
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); els.search.focus(); }
    });
    els.sort.addEventListener("change", function () { state.sort = els.sort.value; render(); });
    els.views.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]");
      if (!b) return;
      state.view = b.getAttribute("data-view");
      try { localStorage.setItem("reviews-view", state.view); } catch (err) {}
      render();
    });
    els.tagBtn.addEventListener("click", function () { setTagMenu(els.tagPanel.hidden); });
    els.tagClear.addEventListener("click", function () { state.tags = []; render(); });
    document.addEventListener("click", function (e) { if (!els.tagPanel.hidden && !els.tagMenu.contains(e.target)) setTagMenu(false); });
    els.panelClose.addEventListener("click", function () { closeBook(true); });
    els.backdrop.addEventListener("click", function () { closeBook(true); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (document.activeElement === els.search && els.search.value) { els.search.value = ""; state.query = ""; render(); return; }
      if (!els.tagPanel.hidden) { setTagMenu(false); els.tagBtn.focus(); return; }
      closeBook(true);
    });
    window.addEventListener("hashchange", route);

    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status + " " + r.statusText); return r.json(); })
      .then(function (data) {
        var seen = {};
        state.books = (Array.isArray(data) ? data : data.books || []).map(function (raw) { return normalize(raw, seen); }).filter(Boolean);
        buildTagMenu();
        render();
        route();
      })
      .catch(function (err) {
        els.shelf.textContent = "";
        els.shelf.appendChild(h("p", { class: "empty-state", text: "Couldn't load books (" + err.message + ")." }));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
