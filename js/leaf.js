(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var container = document.createElement("div");
  container.className = "leaf-widget";

  var leaf = document.createElement("div");
  leaf.className = "leaf falling";
  leaf.setAttribute("role", "button");
  leaf.setAttribute("aria-label", "falling leaf");

  container.appendChild(leaf);
  document.body.appendChild(container);

  function respawn() {
    leaf.style.top = "";
    leaf.style.left = "";
    leaf.style.transform = "";
    leaf.style.visibility = "";
    leaf.classList.remove("poof");
    void leaf.offsetWidth;
    leaf.classList.add("falling");
  }

  leaf.addEventListener("click", function () {
    if (leaf.classList.contains("poof")) return;

    var leafRect = leaf.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    leaf.style.top = leafRect.top - containerRect.top + "px";
    leaf.style.left = leafRect.left - containerRect.left + "px";
    leaf.style.transform = "none";

    leaf.classList.remove("falling");
    leaf.classList.add("poof");
  });

  leaf.addEventListener("animationend", function (event) {
    if (event.animationName !== "leaf-poof") return;
    leaf.style.visibility = "hidden";
    setTimeout(respawn, 1000 + Math.random() * 1500);
  });
})();
