/**
 * Homepage Summaverick intro.
 * Motion language: Velorix IIC (cinematic type, dark void, white pill CTA)
 * + 3D Story (scroll-scrubbed pin). Glass arrow matches the product mark.
 */
(function () {
  'use strict';

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  var section = document.getElementById('summaverick-intro');
  if (!section) return;

  var pin = section.querySelector('.sm-intro__pin');
  var canvas = document.getElementById('smIntroCanvas');
  var bar = section.querySelector('.sm-intro__progress > span');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia('(max-width: 720px)').matches;

  var copy = {
    kicker: section.querySelector('.sm-intro__kicker'),
    line1: section.querySelector('.sm-intro__line--1'),
    line2: section.querySelector('.sm-intro__line--2'),
    brand: section.querySelector('.sm-intro__brand'),
    sub: section.querySelector('.sm-intro__sub'),
    cta: section.querySelector('.sm-intro__cta'),
    hint: section.querySelector('.sm-intro__hint')
  };

  function setCopy(el, opacity, y, blur) {
    if (!el) return;
    el.style.opacity = String(opacity);
    el.style.transform = 'translateY(' + y + 'px)';
    el.style.filter = blur ? 'blur(' + blur + 'px)' : 'none';
  }

  function applyCopy(p) {
    var aIn = smoothstep(0.02, 0.12, p);
    var aHold = 1 - smoothstep(0.30, 0.40, p);
    var manifesto = aIn * aHold;
    setCopy(copy.kicker, manifesto, lerp(14, 0, aIn), (1 - aIn) * 6);
    setCopy(copy.line1, manifesto * smoothstep(0.06, 0.16, p), lerp(22, 0, smoothstep(0.06, 0.16, p)), (1 - smoothstep(0.06, 0.18, p)) * 8);
    setCopy(copy.line2, manifesto * smoothstep(0.10, 0.22, p), lerp(22, 0, smoothstep(0.10, 0.22, p)), (1 - smoothstep(0.10, 0.24, p)) * 8);

    var bIn = smoothstep(0.36, 0.50, p);
    setCopy(copy.brand, bIn, lerp(28, 0, bIn), (1 - bIn) * 10);
    setCopy(copy.sub, smoothstep(0.44, 0.56, p), lerp(16, 0, smoothstep(0.44, 0.56, p)), 0);
    if (copy.cta) {
      var ctaOn = p > 0.54;
      copy.cta.style.opacity = ctaOn ? '1' : '0';
      copy.cta.style.transform = ctaOn ? 'translateY(0)' : 'translateY(12px)';
      copy.cta.style.filter = 'none';
      copy.cta.style.pointerEvents = ctaOn ? 'auto' : 'none';
    }
    if (copy.hint) setCopy(copy.hint, 1 - smoothstep(0.04, 0.12, p), 0, 0);
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
  }

  var sceneApi = null;
  var progress = reduced ? 1 : 0;
  var targetProgress = progress;
  var running = false;
  var raf = 0;

  function tick(now) {
    raf = 0;
    if (!running && !reduced) return;
    progress += (targetProgress - progress) * 0.12;
    if (sceneApi) sceneApi.render(progress, now);
    if (!reduced && Math.abs(targetProgress - progress) > 0.0008) {
      raf = requestAnimationFrame(tick);
    }
  }

  function setProgress(p) {
    targetProgress = clamp(p, 0, 1);
    applyCopy(targetProgress);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function bindScroll() {
    if (reduced) {
      applyCopy(1);
      if (sceneApi) sceneApi.render(1, 0);
      return;
    }

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.ScrollTrigger.create({
        trigger: section,
        pin: pin,
        start: 'top top',
        end: isMobile ? '+=220%' : '+=280%',
        scrub: 0.85,
        anticipatePin: 1,
        onUpdate: function (self) { setProgress(self.progress); },
        onToggle: function (self) {
          running = self.isActive;
          if (sceneApi) sceneApi.setActive(running);
          if (running && !raf) raf = requestAnimationFrame(tick);
        },
        onEnter: function () { running = true; if (sceneApi) sceneApi.setActive(true); },
        onEnterBack: function () { running = true; if (sceneApi) sceneApi.setActive(true); },
        onLeave: function () { running = false; if (sceneApi) sceneApi.setActive(false); },
        onLeaveBack: function () { running = false; if (sceneApi) sceneApi.setActive(false); }
      });
      return;
    }

    pin.style.position = 'sticky';
    pin.style.top = '0';
    section.style.height = isMobile ? '320vh' : '380vh';
    function onScroll() {
      var rect = section.getBoundingClientRect();
      var range = section.offsetHeight - window.innerHeight;
      var p = range > 0 ? clamp(-rect.top / range, 0, 1) : 0;
      running = p > 0 && p < 1 || rect.top < window.innerHeight && rect.bottom > 0;
      if (sceneApi) sceneApi.setActive(running);
      setProgress(p);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function createArrowShape() {
    var s = new THREE.Shape();
    s.moveTo(-2.15, -0.32);
    s.lineTo(0.28, -0.32);
    s.lineTo(0.28, -0.72);
    s.lineTo(1.95, 0);
    s.lineTo(0.28, 0.72);
    s.lineTo(0.28, 0.32);
    s.lineTo(-2.15, 0.32);
    s.closePath();
    return s;
  }

  function makeRibbon(curve, count, color) {
    var positions = new Float32Array(count * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: color,
      size: isMobile ? 0.045 : 0.032,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    var pts = new THREE.Points(geo, mat);
    pts.userData = { curve: curve, count: count, phase: Math.random() };
    return pts;
  }

  function initThree() {
    if (!canvas || !window.THREE) return null;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false
      });
    } catch (err) {
      return null;
    }
    if (!renderer.getContext()) return null;

    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.045);

    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.set(0, 0.35, 12);

    var envScene = new THREE.Scene();
    var envGeo = new THREE.SphereGeometry(12, 24, 24);
    var envMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      color: 0x0a0d14
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    var c1 = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0x33d6ff }));
    c1.position.set(5, 3, -4);
    envScene.add(c1);
    var c2 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
    c2.position.set(-6, -2, 3);
    envScene.add(c2);
    var c3 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    c3.position.set(0, 6, 2);
    envScene.add(c3);
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.08).texture;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0x1c2230, 0.55));
    var key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-3.2, 4.2, 5.4);
    scene.add(key);
    var cyan = new THREE.PointLight(0x33d6ff, 28, 18, 2);
    cyan.position.set(2.6, 1.1, 2.4);
    scene.add(cyan);
    var magenta = new THREE.PointLight(0xff4fd8, 22, 16, 2);
    magenta.position.set(-2.8, -0.8, 1.8);
    scene.add(magenta);

    var group = new THREE.Group();
    scene.add(group);

    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0xdde7f5,
        metalness: 0.15,
        roughness: 0.08,
        transmission: 0.88,
        thickness: 1.6,
        ior: 1.46,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        transparent: true,
        opacity: 1
      })
    );
    var coreWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.74, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9ad8ff,
        wireframe: true,
        transparent: true,
        opacity: 0.55
      })
    );
    group.add(core, coreWire);

    var arrowGeo = new THREE.ExtrudeGeometry(createArrowShape(), {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 4
    });
    arrowGeo.center();
    var arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0xf4f7fb,
        metalness: 0.05,
        roughness: 0.04,
        transmission: 0.86,
        thickness: 1.2,
        ior: 1.48,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0
      })
    );
    var arrowEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(arrowGeo, 18),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0
      })
    );
    arrow.add(arrowEdge);
    var innerArrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({
        color: 0x5ce1ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    innerArrow.scale.set(0.9, 0.9, 0.55);
    arrow.add(innerArrow);
    arrow.scale.set(0.95, 0.95, 0.95);
    group.add(arrow);

    var rings = [0.95, 1.22, 1.48].map(function (r, i) {
      var mesh = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012, 10, isMobile ? 64 : 96),
        new THREE.MeshStandardMaterial({
          color: i === 1 ? 0x33d6ff : i === 2 ? 0xff4fd8 : 0xffffff,
          metalness: 0.7,
          roughness: 0.22,
          emissive: i === 1 ? 0x0a3a48 : i === 2 ? 0x3a1030 : 0x111318,
          emissiveIntensity: 0.8
        })
      );
      mesh.rotation.set(i === 0 ? 1.2 : i === 1 ? 0.35 : -0.7, i * 0.8, i * 0.4);
      group.add(mesh);
      return mesh;
    });

    var dustCount = isMobile ? 420 : 1100;
    var dustPos = new Float32Array(dustCount * 3);
    var dustBase = new Float32Array(dustCount * 3);
    for (var i = 0; i < dustCount; i++) {
      var u = Math.random();
      var v = Math.random();
      var theta = u * Math.PI * 2;
      var phi = Math.acos(2 * v - 1);
      var rad = 2.2 + Math.random() * 6.5;
      var ix = i * 3;
      dustBase[ix] = Math.sin(phi) * Math.cos(theta) * rad;
      dustBase[ix + 1] = Math.sin(phi) * Math.sin(theta) * rad;
      dustBase[ix + 2] = Math.cos(phi) * rad;
      dustPos[ix] = dustBase[ix];
      dustPos[ix + 1] = dustBase[ix + 1];
      dustPos[ix + 2] = dustBase[ix + 2];
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xcfe8ff,
        size: isMobile ? 0.028 : 0.018,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    scene.add(dust);

    var ribbons = [
      makeRibbon(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.6, -0.15, 0.05),
        new THREE.Vector3(-0.4, 0.22, 0.12),
        new THREE.Vector3(0.5, -0.18, -0.08),
        new THREE.Vector3(1.55, 0.08, 0.04)
      ], false, 'catmullrom', 0.4), 180, 0x33d6ff),
      makeRibbon(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.5, 0.2, -0.06),
        new THREE.Vector3(-0.2, -0.25, 0.1),
        new THREE.Vector3(0.7, 0.18, 0.06),
        new THREE.Vector3(1.45, -0.05, -0.04)
      ], false, 'catmullrom', 0.4), 160, 0xff4fd8)
    ];
    ribbons.forEach(function (r) { arrow.add(r); });

    var pointer = { x: 0, y: 0 };
    function onPointer(e) {
      var cx = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX) || 0;
      var cy = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY) || 0;
      pointer.x = (cx / window.innerWidth) * 2 - 1;
      pointer.y = (cy / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('pointermove', onPointer, { passive: true });

    var dprCap = isMobile ? 1.4 : 1.75;
    function resize() {
      var w = pin.clientWidth || window.innerWidth;
      var h = pin.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    var tmp = new THREE.Vector3();
    var active = true;

    function render(p, now) {
      var t = (now || 0) * 0.001;
      var form = smoothstep(0.0, 0.28, p);
      var glass = smoothstep(0.18, 0.48, p);
      var mark = smoothstep(0.38, 0.68, p);
      var settle = smoothstep(0.62, 0.9, p);

      var keepCore = mark < 0.58;
      core.visible = keepCore;
      coreWire.visible = keepCore;
      core.scale.setScalar(lerp(0.15, 1.05, form));
      core.material.opacity = lerp(0.15, 1, form);
      core.material.transmission = lerp(0.2, 0.88, glass);
      coreWire.material.opacity = lerp(0.7, 0.08, glass);
      core.rotation.y = t * 0.25 + p * 1.4;
      core.rotation.x = t * 0.12;

      arrow.material.opacity = mark;
      arrowEdge.material.opacity = mark * 0.85;
      innerArrow.material.opacity = mark * 0.22;
      arrow.scale.setScalar(lerp(0.4, 1.35, mark));
      arrow.rotation.y = lerp(-1.55, 0.08, mark);
      arrow.rotation.x = lerp(0.9, 0, mark);
      arrow.rotation.z = lerp(0.25, 0, mark);
      arrow.position.set(0, lerp(0.1, 0.02, mark), lerp(-1.8, 0.2, mark));
      group.position.y = lerp(0.05, -1.05, mark);

      rings.forEach(function (ring, i) {
        ring.material.transparent = true;
        ring.material.opacity = keepCore ? 0.9 : 0;
        ring.visible = form > 0.08 && keepCore;
        ring.scale.setScalar(lerp(0.2, 1, form));
        ring.rotation.z += 0.003 + i * 0.0012;
        ring.rotation.x += 0.0015 * (i + 1);
      });

      var attr = dustGeo.getAttribute('position');
      var contract = lerp(1, 0.38, smoothstep(0.1, 0.7, p));
      for (var d = 0; d < dustCount; d++) {
        var di = d * 3;
        attr.array[di] = dustBase[di] * contract;
        attr.array[di + 1] = dustBase[di + 1] * contract;
        attr.array[di + 2] = dustBase[di + 2] * contract;
      }
      attr.needsUpdate = true;
      dust.rotation.y = t * 0.03 + p * 0.4;
      dust.material.opacity = lerp(0.22, 0.75, form) * lerp(1, 0.35, settle);

      ribbons.forEach(function (rib, ri) {
        var count = rib.userData.count;
        var pos = rib.geometry.getAttribute('position');
        for (var k = 0; k < count; k++) {
          var tt = (k / count + t * (0.12 + ri * 0.04) + rib.userData.phase) % 1;
          rib.userData.curve.getPoint(tt, tmp);
          pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
        }
        pos.needsUpdate = true;
        rib.material.opacity = mark * 0.95;
      });

      var camZ = lerp(11.8, 4.05, smoothstep(0.0, 0.82, p));
      var camX = lerp(0.15, 0.55, smoothstep(0.0, 0.4, p)) + lerp(0, -0.35, settle);
      var camY = lerp(0.55, 0.08, p);
      camera.position.x = camX + pointer.x * 0.28;
      camera.position.y = camY - pointer.y * 0.16;
      camera.position.z = camZ;
      camera.lookAt(0, 0.02, 0);

      group.rotation.y = pointer.x * 0.12;
      group.rotation.x = -pointer.y * 0.06;

      renderer.render(scene, camera);
    }

    return {
      render: render,
      setActive: function (on) { active = on; },
      resize: resize,
      isActive: function () { return active; }
    };
  }

  function initCssFallback() {
    section.classList.add('is-css3d');
    canvas.style.display = 'none';
  }

  if (reduced) {
    applyCopy(1);
  }

  function start() {
    sceneApi = initThree();
    if (!sceneApi) initCssFallback();
    bindScroll();
    if (sceneApi) {
      running = true;
      sceneApi.render(progress, 0);
    }
  }

  if (window.THREE) {
    start();
  } else {
    var waited = 0;
    var wait = setInterval(function () {
      waited += 50;
      if (window.THREE || waited > 2500) {
        clearInterval(wait);
        start();
      }
    }, 50);
  }
})();
