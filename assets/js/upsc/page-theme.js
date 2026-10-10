/* Shared navigation and saved theme for standalone UPSC pages. */
(function () {
  if (!window.SBShared) return;
  window.SBShared.initNavMenu();
  window.SBShared.initThemeToggle();
  var toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  function syncTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  syncTheme();
  toggle.addEventListener('click', syncTheme);
})();
