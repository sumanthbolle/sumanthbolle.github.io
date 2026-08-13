;(function () {
  var drops = [].slice.call(document.querySelectorAll('[data-nav-drop]'));
  if (!drops.length) return;

  var canHover = window.matchMedia && window.matchMedia('(hover:hover)').matches;

  function close(drop) {
    drop.classList.remove('open');
    var btn = drop.querySelector('.nav-drop__btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function open(drop) {
    drops.forEach(function (other) { if (other !== drop) close(other); });
    drop.classList.add('open');
    var btn = drop.querySelector('.nav-drop__btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  drops.forEach(function (drop) {
    var btn = drop.querySelector('.nav-drop__btn');
    if (!btn) return;

    btn.addEventListener('click', function (event) {
      event.preventDefault();
      if (drop.classList.contains('open')) close(drop);
      else open(drop);
    });

    btn.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      open(drop);
      var first = drop.querySelector('.nav-drop__menu a');
      if (first) first.focus();
    });

    if (canHover) {
      drop.addEventListener('mouseenter', function () { open(drop); });
      drop.addEventListener('mouseleave', function () { close(drop); });
    }

    drop.addEventListener('focusout', function (event) {
      if (!drop.contains(event.relatedTarget)) close(drop);
    });
  });

  document.addEventListener('click', function (event) {
    drops.forEach(function (drop) {
      if (!drop.contains(event.target)) close(drop);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    drops.forEach(function (drop) {
      if (!drop.classList.contains('open')) return;
      close(drop);
      var btn = drop.querySelector('.nav-drop__btn');
      if (btn) btn.focus();
    });
  });
})();
