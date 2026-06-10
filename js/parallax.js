/* Safe Shelf — homepage parallax & reveal effects */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- scroll parallax: background layers + tagged foreground elements ---- */
  var layers = Array.prototype.slice.call(document.querySelectorAll(".px-layer"));
  var tagged = Array.prototype.slice.call(document.querySelectorAll("[data-px]")).map(function (el) {
    return { el: el, depth: parseFloat(el.dataset.px) || 0, top: 0, height: 1 };
  });
  var mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
  var ticking = false;

  // document-space position, independent of any applied transform
  function docTop(el) {
    var t = 0;
    while (el) { t += el.offsetTop; el = el.offsetParent; }
    return t;
  }
  function measure() {
    tagged.forEach(function (it) {
      it.top = docTop(it.el);
      it.height = it.el.offsetHeight || 1;
    });
  }

  function apply() {
    ticking = false;
    var y = window.scrollY || 0;

    // ease mouse drift toward target
    mouseX += (targetX - mouseX) * 0.06;
    mouseY += (targetY - mouseY) * 0.06;

    layers.forEach(function (layer) {
      var depth = parseFloat(layer.dataset.depth) || 0;
      var tx = mouseX * depth * 36;
      var ty = -y * depth + mouseY * depth * 24;
      layer.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
    });

    // viewport-relative drift: zero when the element is centered on screen,
    // clamped so it can never collide with neighbouring sections
    var viewCenter = y + window.innerHeight / 2;
    tagged.forEach(function (it) {
      var delta = viewCenter - (it.top + it.height / 2);
      var ty = Math.max(-70, Math.min(70, delta * it.depth * 0.25));
      it.el.style.transform = "translate3d(0," + ty + "px,0)";
    });

    // keep easing while the mouse drift settles
    if (Math.abs(targetX - mouseX) > 0.001 || Math.abs(targetY - mouseY) > 0.001) {
      requestTick();
    }
  }

  function requestTick() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  }

  if (!reduceMotion) {
    measure();
    window.addEventListener("resize", function () { measure(); requestTick(); });
    window.addEventListener("load", function () { measure(); requestTick(); });
    window.addEventListener("scroll", requestTick, { passive: true });

    // subtle pointer parallax on devices with a fine pointer
    if (window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("mousemove", function (e) {
        targetX = (e.clientX / window.innerWidth) * 2 - 1;
        targetY = (e.clientY / window.innerHeight) * 2 - 1;
        requestTick();
      }, { passive: true });
    }

    // gyroscope drift on mobile, when available without a permission prompt
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma == null || e.beta == null) return;
        targetX = Math.max(-1, Math.min(1, e.gamma / 30));
        targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
        requestTick();
      }, { passive: true });
    }

    requestTick();
  }

  /* ---- reveal on scroll ---- */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".reveal").forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 70 + "ms";
    observer.observe(el);
  });
})();
