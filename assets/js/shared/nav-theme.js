;(function () {
  function initNavMenu(options) {
    var settings = options || {};
    var toggleSelector = settings.toggleSelector || '.menu-toggle';
    var menuSelector = settings.menuSelector || '.mobile-menu';
    var menuLinkSelector = settings.menuLinkSelector || '.mobile-menu a';
    var menuOpenClass = settings.menuOpenClass || 'active';
    var toggleActiveClass = settings.toggleActiveClass || 'active';

    var menuToggle = document.querySelector(toggleSelector);
    var mobileMenu = document.querySelector(menuSelector);
    if (!menuToggle || !mobileMenu) return;

    menuToggle.addEventListener('click', function () {
      if (toggleActiveClass) menuToggle.classList.toggle(toggleActiveClass);
      mobileMenu.classList.toggle(menuOpenClass);
    });

    document.querySelectorAll(menuLinkSelector).forEach(function (link) {
      link.addEventListener('click', function () {
        if (toggleActiveClass) menuToggle.classList.remove(toggleActiveClass);
        mobileMenu.classList.remove(menuOpenClass);
      });
    });
  }

  function initNavDropdowns(options) {
    var settings = options || {};
    var dropdownSelector = settings.dropdownSelector || '.nav-drop';
    var buttonSelector = settings.buttonSelector || '.nav-drop-btn';
    var openClass = settings.openClass || 'open';

    var dropdowns = Array.prototype.slice.call(document.querySelectorAll(dropdownSelector));
    if (!dropdowns.length) return;

    function closeAll(except) {
      dropdowns.forEach(function (drop) {
        if (drop === except) return;
        if (!drop.classList.contains(openClass) && !drop.matches(':focus-within')) return;
        drop.classList.remove(openClass);
        var btn = drop.querySelector(buttonSelector);
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          // Drop the CSS-only :focus-within fallback too, so a JS-driven
          // close (outside click / Escape / picking a link) actually hides
          // the menu instead of leaving it open because the button/link
          // inside it still has focus.
          if (document.activeElement && drop.contains(document.activeElement)) {
            document.activeElement.blur();
          }
        }
      });
    }

    dropdowns.forEach(function (drop) {
      var btn = drop.querySelector(buttonSelector);
      if (!btn) return;
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        var willOpen = !drop.classList.contains(openClass);
        closeAll(drop);
        drop.classList.toggle(openClass, willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        if (!willOpen) btn.blur();
      });
      drop.querySelectorAll(buttonSelector + ' ~ * a').forEach(function (link) {
        link.addEventListener('click', function () { closeAll(null); });
      });
    });

    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAll(null);
    });
  }

  function initThemeToggle(options) {
    var settings = options || {};
    var toggleSelector = settings.toggleSelector || '#themeToggle';
    var storageKey = settings.storageKey || 'theme';
    var rootAttribute = settings.rootAttribute || 'data-theme';
    var darkValue = settings.darkValue || 'dark';
    var lightValue = settings.lightValue || 'light';
    var root = document.documentElement;

    var saved = localStorage.getItem(storageKey);
    if (saved) root.setAttribute(rootAttribute, saved);

    var themeToggle = document.querySelector(toggleSelector);
    if (!themeToggle) return;

    themeToggle.addEventListener('click', function () {
      var current = root.getAttribute(rootAttribute) || darkValue;
      var next = current === darkValue ? lightValue : darkValue;
      root.setAttribute(rootAttribute, next);
      localStorage.setItem(storageKey, next);
    });
  }

  window.SBShared = {
    initNavMenu: initNavMenu,
    initNavDropdowns: initNavDropdowns,
    initThemeToggle: initThemeToggle,
  };
})();
