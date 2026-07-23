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
    initThemeToggle: initThemeToggle,
  };
})();
