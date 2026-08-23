/**
 * Summaverick product page — scroll film for search, live search,
 * reasoning, and accuracy. Motion language matches the homepage intro.
 */
(function () {
  'use strict';

  var section = document.getElementById('summaverick-how');
  if (!section) return;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  var pin = section.querySelector('.sm-how__pin');
  var canvas = document.getElementById('smHowCanvas');
  var bar = section.querySelector('.sm-how__progress > span');
  var acts = section.querySelectorAll('.sm-how__act');
  var pips = section.querySelectorAll('.sm-how__pips li');
  var cta = section.querySelector('.sm-how__cta');
  var kicker = section.querySelector('.sm-how__kicker');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia('(max-width: 720px)').matches;
  var ACTS = 4;

  var progress = reduced ? 1 : 0;
  var targetProgress = progress;
  var running = false;
  var raf = 0;
  var trigger = null;

  function actState(p) {
    var scaled = p * ACTS;
    var index = Math.min(ACTS - 1, Math.floor(scaled));
    return { index: index, local: scaled - index, scaled: scaled };
  }

  function applyCopy(p) {
    var state = actState(p);
    for (var i = 0; i < acts.length; i++) {
      var dist = Math.abs(state.scaled - (i + 0.5));
      var vis = 1 - smoothstep(0.28, 0.72, dist);
      var el = acts[i];
      el.style.opacity = String(vis);
      el.style.transform = 'translateY(' + lerp(18, 0, vis) + 'px)';
      el.style.filter = vis > 0.92 ? 'none' : 'blur(' + ((1 - vis) * 8) + 'px)';
    }
    for (var j = 0; j < pips.length; j++) {
      pips[j].classList.toggle('is-on', j === state.index);
    }
    if (kicker) kicker.style.opacity = String(0.4 + 0.6 * (1 - smoothstep(0.92, 1, p)));
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    if (cta) {
      var on = p > 0.78;
      cta.style.opacity = on ? '1' : '0';
      cta.style.transform = on ? 'translateY(0)' : 'translateY(10px)';
      cta.classList.toggle('is-on', on);
    }
  }

  function tick(now) {
    raf = 0;
    if (!running && !reduced) return;
    progress += (targetProgress - progress) * 0.14;
    applyCopy(progress);
    draw(progress, now || 0);
    if (!reduced && Math.abs(targetProgress - progress) > 0.0008) {
      raf = requestAnimationFrame(tick);
    }
  }

  function setProgress(p) {
    targetProgress = clamp(p, 0, 1);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  var ctx = null;
  var W = 1;
  var H = 1;
  var dpr = 1;
  var dust = [];

  function resize() {
    if (!canvas || !ctx) return;
    var w = pin.clientWidth || window.innerWidth;
    var h = pin.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.4 : 1.75);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w;
    H = h;
  }

  function seedDust() {
    dust = [];
    var n = isMobile ? 70 : 140;
    for (var i = 0; i < n; i++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.3 + 0.3,
        a: Math.random() * 0.45 + 0.12,
        s: Math.random() * 0.08 + 0.02
      });
    }
  }

  function roundRect(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function glassPanel(x, y, w, h, r, alpha) {
    ctx.save();
    roundRect(x, y, w, h, r);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.045 * alpha) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.16 * alpha) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawDust(t, p) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      var x = ((d.x + t * d.s * 0.015) % 1) * W;
      var y = ((d.y + Math.sin(t * 0.12 + i) * 0.01) % 1) * H;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(207,232,255,' + (d.a * (0.35 + p * 0.4)) + ')';
      ctx.fill();
    }
  }

  function drawSearch(cx, cy, local, t) {
    var w = Math.min(520, W * 0.72);
    var h = 64;
    var x = cx - w / 2;
    var y = cy - h / 2;
    var appear = smoothstep(0, 0.18, local);
    ctx.save();
    ctx.globalAlpha = appear;
    glassPanel(x, y, w, h, 20, appear);
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('SUMMAVERICK', x + 22, y + 22);
    var q = 'Is it true that this claim holds up?';
    var typed = q.slice(0, Math.floor(smoothstep(0.16, 0.62, local) * q.length));
    ctx.fillStyle = '#f5f5f7';
    ctx.font = '500 17px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(typed, x + 22, y + 44);
    if (local < 0.72 && Math.floor(t * 0.006) % 2 === 0) {
      var tw = ctx.measureText(typed).width;
      ctx.fillRect(x + 22 + tw + 3, y + 30, 1.5, 16);
    }
    var pulse = smoothstep(0.58, 1, local);
    if (pulse > 0) {
      for (var i = 0; i < 7; i++) {
        var ang = -Math.PI + (i / 6) * Math.PI;
        var len = 70 + pulse * 90;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.strokeStyle = i % 2 ? 'rgba(51,214,255,' + (0.22 * pulse) + ')' : 'rgba(255,79,216,' + (0.16 * pulse) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLive(cx, cy, local, t) {
    var cards = [
      { d: 'reuters.com', t: 'Markets open mixed after overnight data', c: '#33d6ff' },
      { d: 'nature.com', t: 'Peer-reviewed methods, not a press note', c: '#a78bfa' },
      { d: 'docs.servicenow.com', t: 'Official product behavior, current release', c: '#ff4fd8' },
      { d: 'arxiv.org', t: 'Preprint — treat findings as provisional', c: '#34d399' }
    ];
    for (var i = 0; i < cards.length; i++) {
      var enter = smoothstep(0.08 + i * 0.12, 0.28 + i * 0.12, local);
      if (enter <= 0) continue;
      var w = Math.min(420, W * 0.7);
      var x = cx - w / 2 + Math.sin(t * 0.0004 + i) * 6;
      var y = cy - 92 + i * 52 + (1 - enter) * 24;
      ctx.save();
      ctx.globalAlpha = enter;
      glassPanel(x, y, w, 44, 14, enter);
      ctx.fillStyle = cards[i].c;
      ctx.beginPath();
      ctx.arc(x + 18, y + 22, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(cards[i].d.toUpperCase() + '  ·  LIVE', x + 32, y + 16);
      ctx.fillStyle = '#f0f3f8';
      ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(cards[i].t, x + 32, y + 32);
      ctx.restore();
    }
  }

  function drawReason(cx, cy, local, t) {
    var nodes = [
      { l: 'Understand', x: -150, y: -10 },
      { l: 'Search', x: -20, y: -70 },
      { l: 'Read', x: 120, y: -10 },
      { l: 'Check', x: -20, y: 60 }
    ];
    var on = [
      smoothstep(0.05, 0.22, local),
      smoothstep(0.22, 0.42, local),
      smoothstep(0.42, 0.62, local),
      smoothstep(0.62, 0.84, local)
    ];
    ctx.save();
    ctx.translate(cx, cy);
    for (var e = 0; e < 4; e++) {
      var a = nodes[e];
      var b = nodes[(e + 1) % 4];
      var lit = Math.min(on[e], on[(e + 1) % 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(51,214,255,' + (0.12 + lit * 0.45) + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      var pr = (t * 0.00025 + e * 0.25) % 1;
      if (lit > 0.4) {
        ctx.beginPath();
        ctx.arc(lerp(a.x, b.x, pr), lerp(a.y, b.y, pr), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,79,216,0.85)';
        ctx.fill();
      }
    }
    for (var i = 0; i < 4; i++) {
      var n = nodes[i];
      var a2 = on[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,16,' + (0.7 + a2 * 0.2) + ')';
      ctx.fill();
      ctx.strokeStyle = a2 > 0.6 ? 'rgba(51,214,255,0.8)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = a2 > 0.5 ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.l, n.x, n.y);
    }
    ctx.restore();
  }

  function drawAccuracy(cx, cy, local) {
    var w = Math.min(480, W * 0.74);
    var h = 168;
    var x = cx - w / 2;
    var y = cy - h / 2;
    var appear = smoothstep(0.05, 0.28, local);
    ctx.save();
    ctx.globalAlpha = appear;
    glassPanel(x, y, w, h, 22, appear);
    ctx.fillStyle = '#f5f5f7';
    ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('The claim holds — with limits.', x + 24, y + 36);
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = '400 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Primary sources agree on the mechanism.', x + 24, y + 60);
    ctx.fillText('Two outlets disagree on the timeline.', x + 24, y + 80);
    var chips = ['Reuters', 'Nature', 'ServiceNow Docs'];
    for (var i = 0; i < chips.length; i++) {
      var cOn = smoothstep(0.34 + i * 0.12, 0.5 + i * 0.12, local);
      var cw = 118;
      var cx2 = x + 24 + i * (cw + 10);
      ctx.globalAlpha = appear * cOn;
      roundRect(cx2, y + 108, cw, 32, 999);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(52,211,153,0.55)';
      ctx.stroke();
      ctx.fillStyle = '#d1fae5';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('✓  ' + chips[i], cx2 + 14, y + 128);
    }
    ctx.restore();
  }

  function draw(p, now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.58, 0, W * 0.5, H * 0.58, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#0b1018');
    g.addColorStop(1, '#050608');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawDust(now, p);

    var state = actState(p);
    var cx = W * 0.5;
    var cy = H * (isMobile ? 0.62 : 0.6);
    var drawers = [drawSearch, drawLive, drawReason, drawAccuracy];
    for (var i = 0; i < ACTS; i++) {
      var dist = Math.abs(state.scaled - (i + 0.5));
      var vis = 1 - smoothstep(0.32, 0.78, dist);
      if (vis <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = vis;
      drawers[i](cx, cy, i === state.index ? state.local : (i < state.index ? 1 : 0), now);
      ctx.restore();
    }
  }

  function bindScroll() {
    if (reduced) {
      applyCopy(1);
      return;
    }

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      trigger = window.ScrollTrigger.create({
        trigger: section,
        pin: pin,
        start: 'top top',
        end: isMobile ? '+=240%' : '+=300%',
        scrub: 0.8,
        anticipatePin: 1,
        onUpdate: function (self) { setProgress(self.progress); },
        onToggle: function (self) {
          running = self.isActive;
          if (running && !raf) raf = requestAnimationFrame(tick);
        }
      });
      return;
    }

    pin.style.position = 'sticky';
    pin.style.top = '0';
    section.style.height = isMobile ? '340vh' : '400vh';
    function onScroll() {
      var rect = section.getBoundingClientRect();
      var range = section.offsetHeight - window.innerHeight;
      var p = range > 0 ? clamp(-rect.top / range, 0, 1) : 0;
      running = rect.bottom > 0 && rect.top < window.innerHeight;
      setProgress(p);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function watchChat() {
    var shell = document.getElementById('appShell');
    if (!shell || typeof MutationObserver === 'undefined') return;
    function sync() {
      var hidden = shell.classList.contains('app-active');
      if (trigger) {
        if (hidden) trigger.disable();
        else trigger.enable();
      }
      running = !hidden && !reduced;
    }
    new MutationObserver(sync).observe(shell, { attributes: true, attributeFilter: ['class'] });
  }

  if (cta) {
    cta.addEventListener('click', function () {
      var input = document.getElementById('queryInput');
      if (input) {
        input.focus();
        input.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
      }
    });
  }

  if (canvas) {
    ctx = canvas.getContext('2d');
    if (ctx) {
      seedDust();
      resize();
      window.addEventListener('resize', function () {
        isMobile = window.matchMedia('(max-width: 720px)').matches;
        resize();
        draw(progress, 0);
      }, { passive: true });
    }
  }

  applyCopy(progress);
  if (ctx) draw(progress, 0);
  bindScroll();
  watchChat();
})();
