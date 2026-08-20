/* Anchor — Summaverick coach widget for UPSC study pages.
 * Public chat only (POST /). Does not touch /upsc/enrich.
 *
 * Behaviour is UPSC-native: it sends structured page metadata and a per-chip
 * kind/format/mode/marks to the Worker (which applies the exam-coach pack),
 * then renders the reply as exam artefacts — Prelims MCQs, a Mains skeleton,
 * an IBC model answer with a word count and a rubric — not raw chat text. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AnchorCoach = api;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { api.mount(); });
      } else {
        api.mount();
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var QUERY_MAX = 1000;
  var CONTEXT_MAX = 4000;
  var HISTORY_KEEP = 8;
  var MAX_RETRIES = 3;            // give up (with a manual retry) after this many failures
  var MAX_TRUNCATE_CONTINUES = 1; // never chase a truncated reply more than once
  var MUTE_KEY = 'anchor-coach-muted';
  var MODE_KEY = 'summaverick_upsc_mode'; // 'study' | 'exam'
  var DOMAIN = 'upsc';           // tells the Worker to apply the UPSC exam-coach pack

  // Per-mark exam-hall timings (minutes) for the Mains writing timer.
  var MAINS_MINUTES = { 10: 8, 15: 13 };

  // kind    — routed to the Worker as `chip`, drives the exam-coach instruction.
  // format  — 'json' (structured render) or 'text' (prose render).
  // search  — whether the ask needs live Perplexity research. Structured/static
  //           asks opt out for cleaner output; free follow-ups keep it on.
  var PROMPTS = {
    prelims: {
      id: 'prelims', kind: 'prelims', label: 'Prelims angle', format: 'json', search: false,
      hint: 'How this can be asked or answered in Prelims',
      query: 'Give UPSC Prelims questions on the static concept behind this topic. Do not invent figures.'
    },
    mains: {
      id: 'mains', kind: 'mains', label: 'Mains POV', format: 'json', search: false,
      hint: 'What the Mains question wants',
      query: 'What is the Mains point of view on this topic? GS paper, directive, demand, and dimensions only — no full answer.'
    },
    answer: {
      id: 'answer', kind: 'answer', label: 'Model answer', format: 'text', search: false,
      hint: 'How your answer should look',
      query: 'How should my answer look? Write the UPSC model answer for this topic.'
    },
    quiz: {
      id: 'quiz', kind: 'quiz', label: 'Quick quiz', format: 'json', search: false,
      hint: 'One question at a time — it keeps going',
      query: 'Start a UPSC quick quiz on this topic. Ask exactly ONE question now. Never say we are done. Never wrap up. Keep going until I say stop.'
    }
  };

  var CONTINUE_QUIZ = 'Ask the next question now. One question only. Brief mark of my last answer first if I answered, then the next item. Do not recap. Do not stop.';
  var CONTINUE_TRUNCATED = 'Continue from the last sentence. Do not restart.';

  var TONE = [
    { f: 523.25, t: 0, d: 0.28 },
    { f: 659.25, t: 0.09, d: 0.34 },
    { f: 783.99, t: 0.18, d: 0.42 }
  ];

  var WRAP_UP = /that(?:'s|s| is) all|we(?:'| a)re done|end of (?:the )?quiz|good luck(?: with)?(?: your)?(?: prep)?[.!]?$|session is over|no more questions|wrap(?:ping)? up|quiz is over|we(?: will|'ll) stop here/i;

  var RUBRIC_LABELS = [
    ['structure', 'Structure'],
    ['relevance', 'Relevance'],
    ['data_examples', 'Data/examples'],
    ['committees_schemes', 'Committees/schemes'],
    ['way_forward', 'Way forward']
  ];

  function clip(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || QUERY_MAX);
  }

  function looksTruncated(answer) {
    var text = String(answer || '').trim();
    if (!text) return false;
    var lastLine = text.split('\n').pop().trim();
    if (!lastLine) return false;
    if (/^([-*•]|\d+\.)\s/.test(lastLine)) return false;
    if (/^```/.test(lastLine) || /^#{1,4}\s*$/.test(lastLine)) return false;
    return !/[.!?…]["')\]]*\s*$/.test(lastLine);
  }

  function looksLikeWrapUp(answer) {
    return WRAP_UP.test(String(answer || ''));
  }

  function nextQuizMove(text, quizActive) {
    if (looksTruncated(text)) return 'continue-truncated';
    if (quizActive && looksLikeWrapUp(text)) return 'continue-quiz';
    if (quizActive && !String(text || '').trim()) return 'continue-quiz';
    return 'wait';
  }

  function backoffMs(attempt) {
    var step = Math.max(0, Number(attempt) || 0);
    return Math.min(20000, 800 * Math.pow(2, step));
  }

  function shouldKeepTrying(stopped) {
    return stopped !== true;
  }

  function buildRequest(opts) {
    var settings = opts || {};
    var query = clip(settings.query, QUERY_MAX);
    if (query.length < 2) query = 'Continue.';
    var context = [];
    var snapshot = clip(settings.pageContext || '', 1400);
    if (snapshot) {
      context.push({ role: 'user', content: 'Study context (treat as the settled static scaffold): ' + snapshot });
      context.push({
        role: 'assistant',
        content: settings.quiz
          ? 'Understood. I will quiz you one question at a time on this anchor and keep going until you say stop.'
          : 'Understood. I will build on this static scaffold and use live search only for the current trigger.'
      });
    }
    (Array.isArray(settings.history) ? settings.history : []).slice(-HISTORY_KEEP).forEach(function (msg) {
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return;
      context.push({ role: msg.role, content: clip(msg.content, CONTEXT_MAX) });
    });
    var body = {
      query: query,
      context: context.slice(-10),
      domain: DOMAIN,
      liveSearch: settings.liveSearch !== false
    };
    if (settings.chip) body.chip = String(settings.chip);
    if (settings.format) body.format = String(settings.format);
    if (settings.mode) body.mode = String(settings.mode);
    if (settings.marks) body.marks = Number(settings.marks);
    if (settings.meta && hasMeta(settings.meta)) body.meta = trimMeta(settings.meta);
    return body;
  }

  /* ── formatting / escaping ── */

  function formatReply(answer) {
    var escaped = escHtml(answer);
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\n{2,}/g, '</p><p>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped ? '<p>' + escaped + '</p>' : '';
  }

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function escAttr(value) { return escHtml(value); }

  function safeHttpUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(raw) ? raw : '';
  }

  /* ── live citations + follow-ups ── */

  function sourcesHtml(sources) {
    var rows = (Array.isArray(sources) ? sources : []).map(function (s, i) {
      return s ? { url: safeHttpUrl(s.url), index: s.index || i + 1, title: s.title, source: s.source } : null;
    }).filter(function (s) { return s && s.url; }).slice(0, 8);
    if (!rows.length) return '';
    var items = rows.map(function (s) {
      var label = clip(s.title || s.source || s.url, 90) || s.url;
      return '<li><a href="' + escAttr(s.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="sv-coach-src__n">' + escAttr(s.index) + '</span>' + escAttr(label) + '</a></li>';
    }).join('');
    return '<div class="sv-coach-sources"><p class="sv-coach-sources__title">Sources</p><ol>' +
      items + '</ol></div>';
  }

  function relatedQuestions(list) {
    return (Array.isArray(list) ? list : []).map(function (q) { return clip(q, 140); })
      .filter(function (q) { return q.length > 4; }).slice(0, 4);
  }

  /* ── JSON extraction (Sonar may wrap JSON in prose/fences) ── */

  function extractJson(text) {
    var raw = String(text == null ? '' : text);
    if (!raw) return null;
    var fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      var parsedFence = tryParse(fence[1]);
      if (parsedFence) return parsedFence;
    }
    var start = raw.indexOf('{');
    while (start !== -1) {
      var depth = 0, inStr = false, esc = false;
      for (var i = start; i < raw.length; i++) {
        var ch = raw[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            var parsed = tryParse(raw.slice(start, i + 1));
            if (parsed) return parsed;
            break;
          }
        }
      }
      start = raw.indexOf('{', start + 1);
    }
    return null;
  }

  function tryParse(s) {
    try { var v = JSON.parse(s); return (v && typeof v === 'object') ? v : null; }
    catch (e) { return null; }
  }

  /* ── model-answer helpers ── */

  function wordCount(text) {
    var t = String(text == null ? '' : text).replace(/[#*_>`]/g, ' ').trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function marksToWords(marks) { return Number(marks) === 15 ? 250 : 150; }

  function mainsMinutes(marks) { return MAINS_MINUTES[Number(marks) === 15 ? 15 : 10]; }

  // Split a model answer into Introduction / Body / Conclusion by literal
  // labels. Returns null if the labels are absent (caller falls back to prose).
  function parseIBC(text) {
    var raw = String(text == null ? '' : text);
    var re = /(^|\n|[.;]\s+)\*{0,2}\s*(introduction|intro|body|conclusion|way forward)\s*\*{0,2}\s*[:\-–]/gi;
    var marks = [], m;
    while ((m = re.exec(raw))) {
      marks.push({ key: m[2].toLowerCase(), at: m.index + m[0].length, labelAt: m.index });
    }
    if (marks.length < 2) return null;
    var out = { intro: '', body: '', conclusion: '' };
    for (var i = 0; i < marks.length; i++) {
      var end = i + 1 < marks.length ? marks[i + 1].labelAt : raw.length;
      var seg = raw.slice(marks[i].at, end).trim();
      var k = marks[i].key;
      if (k === 'introduction' || k === 'intro') out.intro = seg;
      else if (k === 'body') out.body = seg;
      else out.conclusion = (out.conclusion ? out.conclusion + '\n' : '') + seg;
    }
    if (!out.intro && !out.body && !out.conclusion) return null;
    return out;
  }

  // Highlight examiner-rewarded anchors in already-escaped answer text.
  function valueAddHtml(escaped) {
    var s = String(escaped == null ? '' : escaped);
    var patterns = [
      /\bArticle\s+\d+[A-Z]?\b/g,
      /\b(?:[A-Z][A-Za-z.'&-]+\s+){0,3}(?:Committee|Commission)\b/g,
      /\b(?:[A-Z][A-Za-z.'&-]+\s+){0,4}(?:Yojana|Mission|Scheme|Abhiyan|Programme)\b/g,
      /\b[A-Z][A-Za-z.'&-]+(?:\s+[A-Za-z.'&-]+){0,4}\s+Act,?\s+\d{4}\b/g,
      /\b\d[\d,]*(?:\.\d+)?\s?(?:per\s?cent|%)/gi
    ];
    patterns.forEach(function (re) {
      s = s.replace(re, function (match) {
        if (match.indexOf('<mark') !== -1) return match;
        return '<mark class="sv-va">' + match + '</mark>';
      });
    });
    return s;
  }

  function parseRubric(source) {
    var obj = source && typeof source === 'object' ? (source.rubric || source) : extractJson(source);
    if (!obj || typeof obj !== 'object') return [];
    return RUBRIC_LABELS.map(function (row) {
      var v = obj[row[0]];
      var ok = v === true || v === 'true' || v === '✓' || v === 1 || v === 'yes';
      return { key: row[0], label: row[1], ok: ok };
    });
  }

  /* ── page metadata (the `meta` contract) ── */

  function hasMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    return ['gs_paper', 'static_topic', 'pattern_tag', 'source', 'date'].some(function (k) {
      return String(meta[k] || '').trim().length > 0;
    });
  }

  function trimMeta(meta) {
    var out = {};
    ['gs_paper', 'static_topic', 'pattern_tag', 'source', 'date'].forEach(function (k) {
      var v = clip(meta[k], 90);
      if (v) out[k] = v;
    });
    return out;
  }

  function gsFromCode(text) {
    var m = String(text || '').match(/\bGS\s?([1-4])\b/i);
    if (m) return 'GS' + m[1];
    if (/\bessay\b/i.test(String(text || ''))) return 'ESSAY';
    return '';
  }

  // Best-effort structured metadata from the page. A page may override any
  // field via window.UPSC_CONTEXT or data-upsc-* attributes on any element.
  function pageMetaFromDom(doc, win) {
    var root = doc || (typeof document !== 'undefined' ? document : null);
    var scope = win || (typeof window !== 'undefined' ? window : {});
    var meta = { gs_paper: '', static_topic: '', pattern_tag: '', source: '', date: '' };
    if (!root || !root.querySelector) return applyMetaOverride(meta, scope, root);

    var openAnchor = root.querySelector('.an-entry__expand[open], details.an-entry__expand[open]');
    if (openAnchor) {
      var body = openAnchor.parentNode;
      meta.static_topic = textOf(body && body.querySelector ? body.querySelector('.an-entry__title, h3') : null);
      var code = textOf(body && body.querySelector ? body.querySelector('.an-code, .an-entry__tags') : null);
      meta.gs_paper = gsFromCode(code) || gsFromCode(meta.static_topic);
      meta.pattern_tag = clip((meta.gs_paper ? meta.gs_paper + ' — ' : '') + meta.static_topic, 90);
    }
    if (!meta.static_topic && root.querySelector('#topicOfDay')) {
      meta.static_topic = textOf(root.querySelector('#topicOfDay h2'));
      var margin = textOf(root.querySelector('#topicOfDay .an-study-margin'));
      meta.gs_paper = gsFromCode(margin);
      meta.source = textOf(root.querySelector('#topicOfDay .an-topic__body footer span'));
      meta.pattern_tag = textOf(root.querySelector('#topicOfDay .an-study-margin a')) || meta.static_topic;
    }
    if (!meta.static_topic) {
      meta.static_topic = textOf(root.querySelector(
        '#mainsList .an-entry h3, #quizList .an-entry h3, #revisionList .an-entry h3'));
      if (meta.static_topic) meta.gs_paper = gsFromCode(meta.static_topic);
    }
    return applyMetaOverride(meta, scope, root);
  }

  function applyMetaOverride(meta, scope, root) {
    var override = scope && scope.UPSC_CONTEXT && typeof scope.UPSC_CONTEXT === 'object'
      ? scope.UPSC_CONTEXT : null;
    var el = root && root.querySelector ? root.querySelector('[data-static-topic], [data-upsc-static-topic], #upsc-root') : null;
    ['gs_paper', 'static_topic', 'pattern_tag', 'source', 'date'].forEach(function (k) {
      if (override && override[k]) meta[k] = clip(override[k], 90);
      if (el && el.getAttribute) {
        var v = el.getAttribute('data-' + k.replace(/_/g, '-')) || el.getAttribute('data-upsc-' + k.replace(/_/g, '-'));
        if (v) meta[k] = clip(v, 90);
      }
    });
    return meta;
  }

  function metaHeaderText(meta) {
    if (!meta) return '';
    var parts = [];
    if (meta.gs_paper) parts.push(meta.gs_paper);
    if (meta.static_topic) parts.push('Static: ' + meta.static_topic);
    if (meta.pattern_tag && meta.pattern_tag !== meta.static_topic) parts.push('Pattern: ' + meta.pattern_tag);
    if (meta.source) parts.push(meta.source);
    return parts.join(' · ');
  }

  function metaHeaderHtml(meta) {
    var text = metaHeaderText(meta);
    return text ? '<p class="sv-coach-metahead">' + escHtml(text) + '</p>' : '';
  }

  /* ── page context (textual grounding) ── */

  function pageContextFromDom(doc) {
    var root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelector) return '';
    var selection = '';
    try {
      if (root.getSelection) selection = String(root.getSelection());
      else if (typeof window !== 'undefined' && window.getSelection) selection = String(window.getSelection());
    } catch (error) { selection = ''; }
    if (clip(selection, 400).length >= 12) return clip(selection, 400);

    var grounded = openAnchorContext(root);
    if (grounded) return grounded;

    var bits = [
      textOf(root.querySelector('#topicOfDay h2')),
      textOf(root.querySelector('#topicOfDay .an-topic__dek')),
      textOf(root.querySelector('.atlas-card.is-open h3, .atlas-open h3, [data-atlas-open] h3')),
      textOf(root.querySelector('#mainsList .an-entry h3')),
      textOf(root.querySelector('#quizList .an-entry h3')),
      textOf(root.querySelector('#revisionList .an-entry h3')),
      textOf(root.querySelector('h1'))
    ].filter(Boolean);
    var seen = [];
    bits.forEach(function (bit) { if (seen.indexOf(bit) === -1) seen.push(bit); });
    return clip(seen.join('. '), 800);
  }

  function openAnchorContext(root) {
    if (!root || !root.querySelector) return '';
    var open = root.querySelector('.an-entry__expand[open], details.an-entry__expand[open]');
    if (!open) return '';
    var body = open.parentNode || open;
    var titleNode = body && body.querySelector ? body.querySelector('.an-entry__title, h3') : null;
    var title = textOf(titleNode);
    var detail = open.textContent ? clip(open.textContent.replace(/^\s*Pattern\s*/i, ''), 1100) : '';
    if (!title && !detail) return '';
    return clip((title ? 'Anchor: ' + title + '. ' : '') + detail, 1400);
  }

  function textOf(node) {
    return node && node.textContent ? clip(node.textContent, 280) : '';
  }

  function marksFromDom(doc) {
    var root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelector) return 0;
    var open = root.querySelector('.an-entry__expand[open], #mainsList .an-entry, [data-marks]');
    var text = open ? (open.getAttribute && open.getAttribute('data-marks')) || open.textContent : '';
    var m = String(text || '').match(/\b(10|15)\s*marks?\b/i);
    return m ? Number(m[1]) : 0;
  }

  /* ── endpoint / prefs / audio (unchanged) ── */

  function endpointFromWindow(win) {
    var scope = win || (typeof window !== 'undefined' ? window : {});
    return String(scope.SB_UPSC_ENDPOINT || scope.SB_AI_SEARCH_ENDPOINT || '').replace(/\/$/, '');
  }

  function readMuted(store) {
    try { return (store || localStorage).getItem(MUTE_KEY) === '1'; } catch (error) { return false; }
  }
  function writeMuted(flag, store) {
    try { (store || localStorage).setItem(MUTE_KEY, flag ? '1' : '0'); } catch (error) { /* private */ }
  }
  function readMode(store) {
    try { return (store || localStorage).getItem(MODE_KEY) === 'exam' ? 'exam' : 'study'; }
    catch (error) { return 'study'; }
  }
  function writeMode(mode, store) {
    try { (store || localStorage).setItem(MODE_KEY, mode === 'exam' ? 'exam' : 'study'); } catch (error) { /* private */ }
  }

  var audioCtx = null;

  function armAudio(opts) {
    var settings = opts || {};
    var Ctx = settings.AudioContext || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!Ctx) return false;
    try {
      if (!audioCtx || settings.fresh) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      return true;
    } catch (error) { return false; }
  }

  function playSweetTone(opts) {
    var settings = opts || {};
    if (settings.muted) return false;
    var Ctx = settings.AudioContext || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!Ctx) return false;
    try {
      if (!audioCtx || settings.fresh) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      var now = audioCtx.currentTime;
      (settings.notes || TONE).forEach(function (note) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var filter = audioCtx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.value = note.f;
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        var start = now + (note.t || 0);
        var dur = note.d || 0.3;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
      return true;
    } catch (error) { return false; }
  }

  function el(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }

  /* ─────────────────────────────── widget ─────────────────────────────── */

  function mount(options) {
    var settings = options || {};
    if (typeof document === 'undefined') return null;
    if (document.getElementById('svCoachToggle') && !settings.force) {
      return document.getElementById('svCoachPanel');
    }

    var endpoint = settings.endpoint || endpointFromWindow();
    var opener = settings.opener || fetch.bind(window);
    var state = {
      open: false, loading: false, quiz: false, stopped: false,
      muted: readMuted(), mode: readMode(),
      history: [], generation: 0, retryTimer: null,
      liveSearch: true, truncateStreak: 0, lastAsk: null,
      turn: null,               // { chip, format, marks, meta, header }
      attempted: 0, correct: 0  // quiz counters
    };
    // In exam mode the tone starts muted (spec 5.1) unless the user set a pref.
    if (state.mode === 'exam' && !localStorageHas(MUTE_KEY)) state.muted = true;

    var toggle = el(
      '<button type="button" class="sv-coach-toggle" id="svCoachToggle" aria-expanded="false" aria-controls="svCoachPanel" aria-haspopup="dialog">' +
        '<span class="sv-coach-toggle__mark" aria-hidden="true">S</span>' +
        '<span class="sv-coach-toggle__label">Ask Summaverick</span>' +
      '</button>'
    );
    var panel = el(
      '<section class="sv-coach-panel" id="svCoachPanel" hidden role="dialog" aria-labelledby="svCoachTitle">' +
        '<header class="sv-coach-head">' +
          '<div>' +
            '<p class="sv-coach-kicker">Summaverick</p>' +
            '<h2 id="svCoachTitle">Exam coach</h2>' +
          '</div>' +
          '<div class="sv-coach-head__tools">' +
            '<button type="button" class="sv-coach-icon" id="svCoachMode" aria-pressed="false" aria-label="Toggle study or exam mode">Study</button>' +
            '<button type="button" class="sv-coach-icon" id="svCoachMute" aria-pressed="false" aria-label="Mute reply tone">Tone on</button>' +
            '<button type="button" class="sv-coach-icon" id="svCoachClose" aria-label="Close coach">Close</button>' +
          '</div>' +
        '</header>' +
        '<p class="sv-coach-intro" id="svCoachIntro">Grounded in the topic on this page. Highlight a line first if you want a tighter ask.</p>' +
        '<div class="sv-coach-chips" id="svCoachChips"></div>' +
        '<p class="sv-coach-quizbar" id="svCoachQuizbar" hidden>' +
          '<span id="svCoachQuizStat">Quiz is running — it will keep asking.</span>' +
          '<button type="button" id="svCoachStopQuiz">Stop quiz</button>' +
        '</p>' +
        '<div class="sv-coach-log" id="svCoachLog" aria-live="polite"></div>' +
        '<form class="sv-coach-form" id="svCoachForm">' +
          '<label class="sr-only" for="svCoachInput">Message Summaverick</label>' +
          '<textarea id="svCoachInput" rows="2" maxlength="900" placeholder="Ask a follow-up, or answer the quiz…"></textarea>' +
          '<button type="submit" id="svCoachSend">Send</button>' +
        '</form>' +
        '<p class="sv-coach-status" id="svCoachStatus" role="status"></p>' +
      '</section>'
    );

    var chips = panel.querySelector('#svCoachChips');
    Object.keys(PROMPTS).forEach(function (key) {
      var prompt = PROMPTS[key];
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sv-coach-chip';
      chip.dataset.prompt = key;
      chip.textContent = prompt.label;
      chip.title = prompt.hint;
      chips.appendChild(chip);
    });

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    syncMute();
    syncMode();

    var log = panel.querySelector('#svCoachLog');
    var sendBtn = panel.querySelector('#svCoachSend');

    function setOpen(open) {
      state.open = open;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.classList.toggle('is-open', open);
      armAudio();
      if (open) panel.querySelector('#svCoachInput').focus();
    }
    function syncMute() {
      var btn = panel.querySelector('#svCoachMute');
      btn.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
      btn.textContent = state.muted ? 'Tone off' : 'Tone on';
    }
    function syncMode() {
      var btn = panel.querySelector('#svCoachMode');
      var exam = state.mode === 'exam';
      btn.setAttribute('aria-pressed', exam ? 'true' : 'false');
      btn.textContent = exam ? 'Exam' : 'Study';
      panel.classList.toggle('sv-coach-panel--exam', exam);
    }
    function setStatus(text) { panel.querySelector('#svCoachStatus').textContent = text || ''; }

    function appendBubble(role, html, extraClass) {
      var node = document.createElement('div');
      node.className = 'sv-coach-msg sv-coach-msg--' + role + (extraClass ? ' ' + extraClass : '');
      node.innerHTML = html;
      log.appendChild(node);
      log.scrollTop = log.scrollHeight;
      return node;
    }
    function scrollLog() { log.scrollTop = log.scrollHeight; }

    function setQuiz(on) {
      state.quiz = on;
      panel.querySelector('#svCoachQuizbar').hidden = !on;
      if (on) refreshQuizStat();
    }
    function refreshQuizStat() {
      var acc = state.attempted ? ' · ' + state.correct + '/' + state.attempted + ' correct' : '';
      panel.querySelector('#svCoachQuizStat').textContent = 'Quiz running' + acc + ' — it keeps asking.';
    }

    /* ── send / ask ── */

    function send(text, info) {
      info = info || {};
      // The visible bubble shows `text`; the model receives `text + appendQuery`
      // (used to append "ask the next question" without cluttering the chat).
      var visible = clip(text, QUERY_MAX);
      var query = clip(String(text || '') + (info.appendQuery || ''), QUERY_MAX);
      if (query.length < 2 || !endpoint) {
        if (!endpoint) setStatus('Summaverick is not configured on this page.');
        return;
      }
      armAudio();
      if (info.quiz) setQuiz(true);
      if (!info.silent) {
        state.truncateStreak = 0;
        if (typeof info.liveSearch === 'boolean') state.liveSearch = info.liveSearch;
        // A fresh, user-initiated ask defines the turn descriptor used to route
        // rendering. Silent auto-continues keep the standing descriptor.
        state.turn = {
          chip: info.chip || null,
          format: info.format || 'text',
          marks: info.marks || 0,
          meta: pageMetaFromDom(document, typeof window !== 'undefined' ? window : {}),
          header: !info.noHeader
        };
      }
      state.stopped = false;
      var generation = ++state.generation;
      if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }

      if (!info.silent) {
        appendBubble('user', '<p>' + escHtml(visible) + '</p>');
        state.history.push({ role: 'user', content: query });
      } else {
        appendBubble('system', '<p>' + escHtml(info.note || 'Continuing…') + '</p>', 'sv-coach-msg--quiet');
        state.history.push({ role: 'user', content: query });
      }
      ask(query, generation, 0);
    }

    function nextQuestion() {
      send('Next question', { chip: 'quiz', format: 'json', liveSearch: false, noHeader: true, appendQuery: '\n\n' + CONTINUE_QUIZ, quiz: true });
    }

    function ask(query, generation, attempt) {
      if (generation !== state.generation || !shouldKeepTrying(state.stopped)) return;
      state.loading = true;
      sendBtn.disabled = true;
      setStatus(attempt === 0 ? 'Summaverick is writing…' : 'Still reaching Summaverick… try ' + (attempt + 1));

      var turn = state.turn || {};
      var body = buildRequest({
        query: query,
        history: state.history.slice(0, -1),
        pageContext: pageContextFromDom(document),
        quiz: state.quiz,
        liveSearch: state.liveSearch !== false,
        chip: turn.chip,
        format: turn.format,
        mode: state.mode,
        marks: turn.marks,
        meta: turn.meta
      });

      opener(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (payload) {
        if (generation !== state.generation || state.stopped) return;
        var result = payload && payload.success && payload.result ? payload.result : null;
        var answer = result ? String(result.answer || '') : '';
        if (!answer) throw new Error('empty');
        state.loading = false;
        sendBtn.disabled = false;
        setStatus('');
        state.history.push({ role: 'assistant', content: answer });
        renderAssistant(answer, result, turn);
        playSweetTone({ muted: state.muted });
        var move = nextQuizMove(answer, state.quiz);
        if (move === 'continue-truncated' && state.truncateStreak < MAX_TRUNCATE_CONTINUES && turn.format !== 'json') {
          state.truncateStreak += 1;
          send(CONTINUE_TRUNCATED, { silent: true, note: 'Finishing that thought…' });
        } else if (move === 'continue-quiz') {
          state.truncateStreak = 0;
        } else {
          state.truncateStreak = 0;
        }
      }).catch(function () {
        if (generation !== state.generation || state.stopped) return;
        if (attempt + 1 >= MAX_RETRIES) {
          state.loading = false;
          sendBtn.disabled = false;
          state.lastAsk = query;
          setStatus('Could not reach Summaverick. Tap Send to try again.');
          return;
        }
        var wait = backoffMs(attempt);
        setStatus('Still here — retrying in ' + Math.round(wait / 1000) + 's.');
        state.retryTimer = setTimeout(function () { ask(query, generation, attempt + 1); }, wait);
      });
    }

    /* ── rendering router ── */

    function renderAssistant(answer, result, turn) {
      var header = (turn && turn.header) ? metaHeaderHtml(turn.meta) : '';
      var chip = turn && turn.chip;
      var data = (turn && turn.format === 'json') ? extractJson(answer) : null;
      var node;

      if (chip === 'rubric') {
        node = appendBubble('assistant', rubricHtml(parseRubric(data || answer)) || formatReply(answer));
      } else if (chip === 'evaluate') {
        node = appendBubble('assistant', evaluationHtml(data, answer));
      } else if (chip === 'prelims' && data && Array.isArray(data.questions)) {
        node = appendBubble('assistant', header);
        renderPrelims(node, data.questions);
      } else if (chip === 'mains' && data && (data.question || data.dimensions)) {
        node = appendBubble('assistant', header + mainsPovHtml(data));
      } else if (chip === 'answer') {
        node = appendBubble('assistant', header + modelAnswerHtml(answer, turn.marks));
        attachRubricButton(node, answer, turn);
      } else if (chip === 'quiz' && data && data.type) {
        node = appendBubble('assistant', header);
        renderQuizItem(node, data, turn);
      } else {
        node = appendBubble('assistant', header + formatReply(answer) + sourcesHtml(result && result.sources));
        renderRelated(result && result.relatedQuestions);
      }
      // Header only on the first reply of a turn.
      if (turn) turn.header = false;
      scrollLog();
    }

    function renderPrelims(node, questions) {
      questions.slice(0, 3).forEach(function (q, qi) {
        node.appendChild(buildMcq(q, qi));
      });
    }

    function buildMcq(q, qi) {
      var wrap = document.createElement('div');
      wrap.className = 'sv-coach-mcq';
      var name = 'mcq-' + state.generation + '-' + qi + '-' + Math.floor(state.attempted + qi);
      var opts = (Array.isArray(q.options) ? q.options : []).slice(0, 6);
      var optsHtml = opts.map(function (opt, oi) {
        var id = name + '-' + oi;
        return '<label class="sv-coach-mcq__opt"><input type="radio" name="' + escAttr(name) + '" value="' +
          escAttr(opt) + '" id="' + escAttr(id) + '"><span>' + escHtml(opt) + '</span></label>';
      }).join('');
      wrap.innerHTML =
        '<p class="sv-coach-mcq__stem">' + escHtml(q.stem || '') + '</p>' +
        '<div class="sv-coach-mcq__opts">' + optsHtml + '</div>' +
        '<button type="button" class="sv-coach-chip sv-coach-mcq__check">Check answer</button>' +
        '<div class="sv-coach-explain" hidden></div>';
      var checked = false;
      wrap.querySelector('.sv-coach-mcq__check').addEventListener('click', function () {
        if (checked) return;
        var sel = wrap.querySelector('input:checked');
        if (!sel) { setStatus('Pick an option first.'); return; }
        checked = true;
        state.attempted += 1;
        var correct = String(q.correct == null ? '' : q.correct).trim();
        var isRight = sel.value.trim() === correct ||
          (opts[letterIndex(correct)] && opts[letterIndex(correct)].trim() === sel.value.trim());
        if (isRight) state.correct += 1;
        Array.prototype.forEach.call(wrap.querySelectorAll('.sv-coach-mcq__opt'), function (labelEl) {
          var input = labelEl.querySelector('input');
          if (input.value.trim() === correct || (opts[letterIndex(correct)] && opts[letterIndex(correct)].trim() === input.value.trim())) {
            labelEl.classList.add('is-correct');
          } else if (input === sel && !isRight) {
            labelEl.classList.add('is-wrong');
          }
          input.disabled = true;
        });
        var exp = wrap.querySelector('.sv-coach-explain');
        exp.hidden = false;
        exp.innerHTML = '<strong>' + (isRight ? 'Correct' : 'Not quite') + '.</strong> ' +
          (correct ? 'Answer: ' + escHtml(correct) + '. ' : '') + escHtml(q.explanation || '');
        wrap.querySelector('.sv-coach-mcq__check').disabled = true;
        if (state.quiz) refreshQuizStat();
        scrollLog();
      });
      return wrap;
    }

    function renderQuizItem(node, data, turn) {
      if (data.mark) {
        node.insertAdjacentHTML('beforeend', '<p class="sv-coach-quizmark">' + escHtml(String(data.mark)) + '</p>');
      }
      if (data.type === 'prelims' && data.question) {
        node.appendChild(buildMcq(data.question, state.attempted));
      } else if (data.type === 'mains' && data.question) {
        node.appendChild(buildMainsPrompt(data.question, Number(data.marks) || turn.marks || 10));
      } else {
        node.insertAdjacentHTML('beforeend', formatReply(JSON.stringify(data)));
      }
      node.appendChild(nextButton());
    }

    function nextButton() {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sv-coach-chip sv-coach-next';
      b.textContent = 'Next question →';
      b.addEventListener('click', function () { b.disabled = true; nextQuestion(); });
      return b;
    }

    function buildMainsPrompt(question, marks) {
      var wrap = document.createElement('div');
      wrap.className = 'sv-coach-mainsq';
      var mins = mainsMinutes(marks);
      wrap.innerHTML =
        '<p class="sv-coach-mainsq__q">' + escHtml(question) + '</p>' +
        '<p class="sv-coach-mainsq__meta"><span>' + marks + ' marks · ~' + marksToWords(marks) + ' words</span>' +
        (state.mode === 'exam' ? '<span class="sv-coach-timer" data-secs="' + (mins * 60) + '">' + mins + ':00</span>' : '<span>Try writing in ~' + mins + ' min</span>') +
        '</p>' +
        '<button type="button" class="sv-coach-chip sv-coach-mainsq__paste">Paste my answer for feedback</button>';
      wrap.querySelector('.sv-coach-mainsq__paste').addEventListener('click', function () {
        openEvaluator(wrap, question, marks);
      });
      if (state.mode === 'exam') startTimer(wrap.querySelector('.sv-coach-timer'));
      return wrap;
    }

    function openEvaluator(afterNode, question, marks) {
      if (afterNode.querySelector('.sv-coach-eval')) return;
      var box = document.createElement('div');
      box.className = 'sv-coach-eval';
      box.innerHTML =
        '<textarea class="sv-coach-eval__ta" rows="4" maxlength="4000" placeholder="Paste or type your answer…"></textarea>' +
        '<button type="button" class="sv-coach-chip sv-coach-eval__go">Evaluate</button>';
      afterNode.appendChild(box);
      box.querySelector('.sv-coach-eval__go').addEventListener('click', function () {
        var text = box.querySelector('.sv-coach-eval__ta').value.trim();
        if (text.length < 20) { setStatus('Write a little more before evaluating.'); return; }
        box.querySelector('.sv-coach-eval__go').disabled = true;
        var q = 'Question: ' + clip(question, 300) + ' [' + marks + ' marks]. My answer: ' + clip(text, 650);
        send(q, { chip: 'evaluate', format: 'json', marks: marks, liveSearch: false, noHeader: true });
      });
      scrollLog();
    }

    function attachRubricButton(node, answer, turn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sv-coach-chip sv-coach-rubric__btn';
      btn.textContent = 'Rate this answer';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        send('Rate the model answer you just gave.', { chip: 'rubric', format: 'json', liveSearch: false, noHeader: true });
      });
      node.appendChild(btn);
    }

    function renderRelated(list) {
      var items = relatedQuestions(list);
      if (!items.length) return;
      var wrap = document.createElement('div');
      wrap.className = 'sv-coach-related';
      wrap.innerHTML = '<p class="sv-coach-related__title">Follow-ups</p>';
      items.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sv-coach-chip';
        b.dataset.related = '1';
        b.textContent = q;
        wrap.appendChild(b);
      });
      log.appendChild(wrap);
      scrollLog();
    }

    function startTimer(node) {
      if (!node) return;
      var secs = Number(node.getAttribute('data-secs')) || 0;
      var id = setInterval(function () {
        if (!document.body.contains(node)) { clearInterval(id); return; }
        secs -= 1;
        if (secs <= 0) { node.textContent = 'time up'; node.classList.add('is-up'); clearInterval(id); return; }
        var m = Math.floor(secs / 60), s = secs % 60;
        node.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      }, 1000);
    }

    /* ── listeners ── */

    toggle.addEventListener('click', function () { setOpen(!state.open); });
    panel.querySelector('#svCoachClose').addEventListener('click', function () { setOpen(false); });
    panel.querySelector('#svCoachMode').addEventListener('click', function () {
      state.mode = state.mode === 'exam' ? 'study' : 'exam';
      writeMode(state.mode);
      if (state.mode === 'exam' && !localStorageHas(MUTE_KEY)) { state.muted = true; syncMute(); }
      syncMode();
    });
    panel.querySelector('#svCoachMute').addEventListener('click', function () {
      state.muted = !state.muted;
      writeMuted(state.muted);
      syncMute();
      if (!state.muted) playSweetTone({ muted: false });
    });
    panel.querySelector('#svCoachStopQuiz').addEventListener('click', function () {
      state.stopped = true;
      state.generation += 1;
      setQuiz(false);
      setStatus('Quiz paused. Start it again whenever you want.');
    });
    chips.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-prompt]');
      if (!chip) return;
      var prompt = PROMPTS[chip.dataset.prompt];
      if (!prompt) return;
      setOpen(true);
      send(prompt.query, {
        quiz: prompt.id === 'quiz',
        chip: prompt.kind,
        format: prompt.format,
        marks: prompt.kind === 'answer' ? (marksFromDom(document) || (state.mode === 'exam' ? 15 : 10)) : 0,
        liveSearch: prompt.search !== false
      });
    });
    log.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-related]');
      if (!chip) return;
      send(chip.textContent, { liveSearch: true });
    });
    panel.querySelector('#svCoachForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = panel.querySelector('#svCoachInput');
      var text = input.value.trim();
      if (!text) {
        if (state.lastAsk) {
          var retry = state.lastAsk;
          state.lastAsk = null;
          send(retry, { silent: true, note: 'Retrying…', liveSearch: state.liveSearch !== false });
        }
        return;
      }
      input.value = '';
      state.lastAsk = null;
      // A free-form message in an active quiz answers the current item and
      // asks for the next; otherwise it is a researched follow-up.
      if (state.quiz) {
        send(text, { chip: 'quiz', format: 'json', liveSearch: false, noHeader: true, appendQuery: '\n\n' + CONTINUE_QUIZ });
      } else {
        send(text, { liveSearch: true });
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open) setOpen(false);
    });

    return panel;
  }

  /* ── structured HTML builders (pure) ── */

  function mainsPovHtml(data) {
    var dims = (Array.isArray(data.dimensions) ? data.dimensions : []).slice(0, 5);
    return '<div class="sv-coach-pov">' +
      '<p class="sv-coach-pov__head"><span class="sv-coach-pov__gs">' + escHtml(data.gs_paper || 'GS') + '</span>' +
      (data.directive ? '<span class="sv-coach-pov__dir">' + escHtml(data.directive) + '</span>' : '') + '</p>' +
      (data.question ? '<p class="sv-coach-pov__q">' + escHtml(data.question) + '</p>' : '') +
      (data.demand ? '<p class="sv-coach-pov__demand"><strong>Demand:</strong> ' + escHtml(data.demand) + '</p>' : '') +
      (dims.length ? '<p class="sv-coach-pov__label">Dimensions to cover</p><ul class="sv-coach-pov__dims">' +
        dims.map(function (d) { return '<li>' + escHtml(d) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>';
  }

  // Escape → highlight value-adds → bold → line breaks. Highlight/bold tags are
  // added after escaping, so the answer text is never double-escaped.
  function richText(raw) {
    var s = valueAddHtml(escHtml(raw));
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s.replace(/\n/g, '<br>');
  }

  function modelAnswerHtml(answer, marks) {
    var ibc = parseIBC(answer);
    var count = wordCount(answer);
    var target = marksToWords(marks);
    var wc = '<p class="sv-coach-wc">≈' + count + ' words' + (marks ? ' (' + marks + ' marks, target ~' + target + ')' : '') + '</p>';
    if (!ibc) {
      return '<div class="sv-coach-answer"><p>' + richText(answer) + '</p>' + wc + '</div>';
    }
    function sec(label, body) {
      if (!body) return '';
      return '<div class="sv-coach-answer__sec"><span class="sv-coach-answer__lbl">' + label +
        '</span><p>' + richText(body) + '</p></div>';
    }
    return '<div class="sv-coach-answer">' +
      sec('Introduction', ibc.intro) + sec('Body', ibc.body) + sec('Conclusion', ibc.conclusion) + wc + '</div>';
  }

  function rubricHtml(badges) {
    if (!badges || !badges.length) return '';
    return '<div class="sv-coach-rubric">' + badges.map(function (b) {
      return '<span class="sv-coach-rubric__b ' + (b.ok ? 'is-ok' : 'is-no') + '">' +
        escHtml(b.label) + ' ' + (b.ok ? '✓' : '✗') + '</span>';
    }).join('') + '</div>';
  }

  function evaluationHtml(data, fallback) {
    if (data && Array.isArray(data.suggestions) && data.suggestions.length) {
      var badges = data.rubric ? rubricHtml(parseRubric(data.rubric)) : '';
      return '<div class="sv-coach-evalout">' + badges +
        '<p class="sv-coach-evalout__lbl">Suggestions</p><ul>' +
        data.suggestions.slice(0, 6).map(function (s) { return '<li>' + escHtml(String(s)) + '</li>'; }).join('') +
        '</ul></div>';
    }
    return formatReply(fallback);
  }

  function letterIndex(value) {
    var m = String(value || '').trim().match(/^([A-D])\b/i);
    return m ? m[1].toUpperCase().charCodeAt(0) - 65 : -1;
  }

  function localStorageHas(key) {
    try { return localStorage.getItem(key) !== null; } catch (e) { return false; }
  }

  return {
    QUERY_MAX: QUERY_MAX,
    MAX_RETRIES: MAX_RETRIES,
    MAX_TRUNCATE_CONTINUES: MAX_TRUNCATE_CONTINUES,
    DOMAIN: DOMAIN,
    MODE_KEY: MODE_KEY,
    PROMPTS: PROMPTS,
    TONE: TONE,
    CONTINUE_QUIZ: CONTINUE_QUIZ,
    CONTINUE_TRUNCATED: CONTINUE_TRUNCATED,
    RUBRIC_LABELS: RUBRIC_LABELS,
    clip: clip,
    looksTruncated: looksTruncated,
    looksLikeWrapUp: looksLikeWrapUp,
    nextQuizMove: nextQuizMove,
    backoffMs: backoffMs,
    shouldKeepTrying: shouldKeepTrying,
    buildRequest: buildRequest,
    formatReply: formatReply,
    sourcesHtml: sourcesHtml,
    relatedQuestions: relatedQuestions,
    extractJson: extractJson,
    wordCount: wordCount,
    marksToWords: marksToWords,
    mainsMinutes: mainsMinutes,
    parseIBC: parseIBC,
    valueAddHtml: valueAddHtml,
    parseRubric: parseRubric,
    pageMetaFromDom: pageMetaFromDom,
    metaHeaderText: metaHeaderText,
    pageContextFromDom: pageContextFromDom,
    marksFromDom: marksFromDom,
    endpointFromWindow: endpointFromWindow,
    playSweetTone: playSweetTone,
    armAudio: armAudio,
    readMuted: readMuted,
    writeMuted: writeMuted,
    readMode: readMode,
    writeMode: writeMode,
    mount: mount
  };
});
