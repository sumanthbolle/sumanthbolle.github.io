(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;

  document.documentElement.classList.add('sb-motion');

  var SELECTOR = [
    '.an-edition-head',
    '.an-viewhead',
    '.pk-hero',
    '.pk-stack',
    '.pk-packet',
    '.pk-catchup',
    '.pk-themes',
    '.pk-session',
    '.pk-due',
    '.ug-block',
    '.an-entry',
    '.an-block',
    '.an-daily',
    '.an-card',
    '.util-more__card'
  ].join(',');

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

  function bind(el) {
    if (el.getAttribute('data-sb-bound') === '1') return;
    el.setAttribute('data-sb-bound', '1');
    var rect = el.getBoundingClientRect();
    var inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    el.classList.add('sb-reveal');
    if (inView) {
      el.classList.add('is-in');
      return;
    }
    io.observe(el);
  }

  function stagger(root) {
    var kids = root.querySelectorAll('.pk-card, .an-entry, .ug-block, .util-more__card');
    for (var i = 0; i < kids.length; i += 1) {
      kids[i].style.setProperty('--sb-delay', (Math.min(i, 8) * 55) + 'ms');
    }
  }

  function scan(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i += 1) bind(nodes[i]);
    var stacks = document.querySelectorAll('.pk-stack, #atlasList, .ug, .util-more__grid');
    for (var j = 0; j < stacks.length; j += 1) stagger(stacks[j]);
  }

  function bindChrome() {
    var bar = document.createElement('div');
    bar.className = 'sb-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var mast = document.querySelector('.an-editorial-masthead, .util-head');
    var command = document.querySelector('.an-command');

    function onScroll() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var t = max > 0 ? window.scrollY / max : 0;
      bar.style.transform = 'scaleX(' + t + ')';
      if (mast) mast.style.setProperty('--sb-scroll', String(Math.min(1, window.scrollY / 280)));
      if (command) command.classList.toggle('is-scrolled', window.scrollY > 36);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init() {
    scan(document);
    bindChrome();
    var main = document.getElementById('main');
    if (!main) return;
    var mo = new MutationObserver(function () { scan(main); });
    mo.observe(main, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
