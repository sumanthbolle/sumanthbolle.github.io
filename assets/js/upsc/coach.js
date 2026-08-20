/* Anchor — Summaverick coach widget for UPSC study pages.
 * Public chat only (POST /). Does not touch /upsc/enrich. */
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
  var MAX_RETRIES = 3;          // give up (with a manual retry) after this many failures
  var MAX_TRUNCATE_CONTINUES = 1; // never chase a truncated reply more than once
  var MUTE_KEY = 'anchor-coach-muted';
  var DOMAIN = 'upsc';         // tells the Worker to apply the UPSC exam-coach pack

  // search: whether this ask needs live Perplexity research. A model-answer
  // skeleton is structure only, so it opts out — faster, cheaper, cleaner.
  var PROMPTS = {
    prelims: {
      id: 'prelims',
      label: 'Prelims angle',
      hint: 'How this can be asked or answered in Prelims',
      search: true,
      query: 'Check how this topic can be asked or answered in UPSC Prelims. Give 2 or 3 statement-style items, the likely trap (only/except/threshold/date), and the exact fact to verify in the official source. Do not invent figures.'
    },
    mains: {
      id: 'mains',
      label: 'Mains POV',
      hint: 'What the Mains question wants',
      search: true,
      query: 'What is the Mains point of view on this topic? Name the GS paper, a fitting directive word, the demand of the question, and three answer dimensions with one value-addition hook each. No prediction.'
    },
    answer: {
      id: 'answer',
      label: 'Model answer',
      hint: 'How your answer should look',
      search: false,
      query: 'How should my answer look? Give a 150-word GS skeleton: one intro line, three body dimensions, a counter-point, and a one-line close. Lead with a directive verb. Keep it exam-hall short.'
    },
    quiz: {
      id: 'quiz',
      label: 'Quick quiz',
      hint: 'One question at a time — it keeps going',
      search: true,
      query: 'Start a UPSC quick quiz on this topic. Ask exactly ONE question now (Prelims statements or a short Mains stem). Wait for my answer. After each answer: mark it in one line, then immediately ask the next question. Never say we are done. Never wrap up. Keep going until I say stop.'
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
    return {
      query: query,
      context: context.slice(-10),
      domain: DOMAIN,
      liveSearch: settings.liveSearch !== false
    };
  }

  function formatReply(answer) {
    var escaped = String(answer || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\n{2,}/g, '</p><p>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped ? '<p>' + escaped + '</p>' : '';
  }

  function escAttr(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function safeHttpUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(raw) ? raw : '';
  }

  // Render the live Perplexity citations under an answer so the [1][2] markers
  // resolve and the reply reads as research, not opinion. Only http(s) links
  // survive — a javascript:/data: citation is dropped, never linked.
  function sourcesHtml(sources) {
    var rows = (Array.isArray(sources) ? sources : []).map(function (s, i) {
      return s ? { url: safeHttpUrl(s.url), index: s.index || i + 1, title: s.title, source: s.source } : null;
    }).filter(function (s) {
      return s && s.url;
    }).slice(0, 8);
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
    return (Array.isArray(list) ? list : []).map(function (q) {
      return clip(q, 140);
    }).filter(function (q) { return q.length > 4; }).slice(0, 4);
  }

  function pageContextFromDom(doc) {
    var root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelector) return '';
    var selection = '';
    try {
      if (root.getSelection) selection = String(root.getSelection());
      else if (typeof window !== 'undefined' && window.getSelection) {
        selection = String(window.getSelection());
      }
    } catch (error) {
      selection = '';
    }
    if (clip(selection, 400).length >= 12) return clip(selection, 400);

    // If a Pattern Atlas anchor is expanded, ground on its vetted scaffold
    // (static core, traps, verify) so the model reuses it instead of
    // re-deriving the static half — and researches only the live trigger.
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
    bits.forEach(function (bit) {
      if (seen.indexOf(bit) === -1) seen.push(bit);
    });
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

  function endpointFromWindow(win) {
    var scope = win || (typeof window !== 'undefined' ? window : {});
    return String(scope.SB_UPSC_ENDPOINT || scope.SB_AI_SEARCH_ENDPOINT || '')
      .replace(/\/$/, '');
  }

  function readMuted(store) {
    try {
      return (store || localStorage).getItem(MUTE_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function writeMuted(flag, store) {
    try {
      (store || localStorage).setItem(MUTE_KEY, flag ? '1' : '0');
    } catch (error) { /* private mode */ }
  }

  var audioCtx = null;

  function armAudio(opts) {
    var settings = opts || {};
    var Ctx = settings.AudioContext
      || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!Ctx) return false;
    try {
      if (!audioCtx || settings.fresh) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      return true;
    } catch (error) {
      return false;
    }
  }

  function playSweetTone(opts) {
    var settings = opts || {};
    if (settings.muted) return false;
    var Ctx = settings.AudioContext
      || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
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
    } catch (error) {
      return false;
    }
  }

  function el(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }

  function mount(options) {
    var settings = options || {};
    if (typeof document === 'undefined') return null;
    if (document.getElementById('svCoachToggle') && !settings.force) {
      return document.getElementById('svCoachPanel');
    }

    var endpoint = settings.endpoint || endpointFromWindow();
    var opener = settings.opener || fetch.bind(window);
    var state = {
      open: false,
      loading: false,
      quiz: false,
      stopped: false,
      muted: readMuted(),
      history: [],
      generation: 0,
      retryTimer: null,
      liveSearch: true,
      truncateStreak: 0,
      lastAsk: null
    };

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
            '<button type="button" class="sv-coach-icon" id="svCoachMute" aria-pressed="false" aria-label="Mute reply tone">Tone on</button>' +
            '<button type="button" class="sv-coach-icon" id="svCoachClose" aria-label="Close coach">Close</button>' +
          '</div>' +
        '</header>' +
        '<p class="sv-coach-intro" id="svCoachIntro">Grounded in the topic on this page. Highlight a line first if you want a tighter ask.</p>' +
        '<div class="sv-coach-chips" id="svCoachChips"></div>' +
        '<p class="sv-coach-quizbar" id="svCoachQuizbar" hidden>' +
          '<span>Quiz is running — it will keep asking.</span>' +
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

    function setStatus(text) {
      panel.querySelector('#svCoachStatus').textContent = text || '';
    }

    function appendBubble(role, html, extraClass) {
      var node = document.createElement('div');
      node.className = 'sv-coach-msg sv-coach-msg--' + role + (extraClass ? ' ' + extraClass : '');
      node.innerHTML = html;
      var log = panel.querySelector('#svCoachLog');
      log.appendChild(node);
      log.scrollTop = log.scrollHeight;
      return node;
    }

    function setQuiz(on) {
      state.quiz = on;
      panel.querySelector('#svCoachQuizbar').hidden = !on;
    }

    function send(text, meta) {
      var info = meta || {};
      var query = clip(text, QUERY_MAX);
      if (query.length < 2 || !endpoint) {
        if (!endpoint) setStatus('Summaverick is not configured on this page.');
        return;
      }
      armAudio();
      if (info.quiz) setQuiz(true);
      // A fresh, user-initiated turn resets the truncation guard and adopts
      // that prompt's search mode; silent auto-continues inherit it.
      if (!info.silent) {
        state.truncateStreak = 0;
        if (typeof info.liveSearch === 'boolean') state.liveSearch = info.liveSearch;
      }
      state.stopped = false;
      var generation = ++state.generation;
      if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
      }

      if (!info.silent) {
        appendBubble('user', '<p>' + formatReply(query).replace(/^<p>/, '').replace(/<\/p>$/, '') + '</p>');
        state.history.push({ role: 'user', content: query });
      } else {
        appendBubble('system', '<p>' + (info.note || 'Continuing…') + '</p>', 'sv-coach-msg--quiet');
        state.history.push({ role: 'user', content: query });
      }

      ask(query, generation, 0);
    }

    function ask(query, generation, attempt) {
      if (generation !== state.generation || !shouldKeepTrying(state.stopped)) return;
      state.loading = true;
      panel.querySelector('#svCoachSend').disabled = true;
      setStatus(attempt === 0 ? 'Summaverick is writing…' : 'Still reaching Summaverick… try ' + (attempt + 1));

      var body = buildRequest({
        query: query,
        history: state.history.slice(0, -1),
        pageContext: pageContextFromDom(document),
        quiz: state.quiz,
        liveSearch: state.liveSearch !== false
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
        panel.querySelector('#svCoachSend').disabled = false;
        setStatus('');
        state.history.push({ role: 'assistant', content: answer });
        var bubble = appendBubble('assistant', formatReply(answer) + sourcesHtml(result && result.sources));
        renderRelated(result && result.relatedQuestions);
        void bubble;
        playSweetTone({ muted: state.muted });
        var move = nextQuizMove(answer, state.quiz);
        if (move === 'continue-truncated' && state.truncateStreak < MAX_TRUNCATE_CONTINUES) {
          state.truncateStreak += 1;
          send(CONTINUE_TRUNCATED, { silent: true, note: 'Finishing that thought…' });
        } else if (move === 'continue-quiz') {
          state.truncateStreak = 0;
          send(CONTINUE_QUIZ, { silent: true, note: 'Next question…' });
        } else {
          state.truncateStreak = 0;
        }
      }).catch(function () {
        if (generation !== state.generation || state.stopped) return;
        if (attempt + 1 >= MAX_RETRIES) {
          state.loading = false;
          panel.querySelector('#svCoachSend').disabled = false;
          state.lastAsk = query;
          setStatus('Could not reach Summaverick. Tap Send to try again.');
          return;
        }
        var wait = backoffMs(attempt);
        setStatus('Still here — retrying in ' + Math.round(wait / 1000) + 's.');
        state.retryTimer = setTimeout(function () {
          ask(query, generation, attempt + 1);
        }, wait);
      });
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
      var log = panel.querySelector('#svCoachLog');
      log.appendChild(wrap);
      log.scrollTop = log.scrollHeight;
    }

    toggle.addEventListener('click', function () { setOpen(!state.open); });
    panel.querySelector('#svCoachClose').addEventListener('click', function () { setOpen(false); });
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
      send(prompt.query, { quiz: prompt.id === 'quiz', liveSearch: prompt.search !== false });
    });
    panel.querySelector('#svCoachLog').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-related]');
      if (!chip) return;
      send(chip.textContent, { liveSearch: true });
    });
    panel.querySelector('#svCoachForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = panel.querySelector('#svCoachInput');
      var text = input.value.trim();
      if (!text) {
        // Empty Send retries the last ask that failed, if any.
        if (state.lastAsk) {
          var retry = state.lastAsk;
          state.lastAsk = null;
          send(retry, { silent: true, note: 'Retrying…', liveSearch: state.liveSearch !== false });
        }
        return;
      }
      input.value = '';
      state.lastAsk = null;
      send(text, { liveSearch: true });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open) setOpen(false);
    });

    return panel;
  }

  return {
    QUERY_MAX: QUERY_MAX,
    MAX_RETRIES: MAX_RETRIES,
    MAX_TRUNCATE_CONTINUES: MAX_TRUNCATE_CONTINUES,
    DOMAIN: DOMAIN,
    PROMPTS: PROMPTS,
    TONE: TONE,
    CONTINUE_QUIZ: CONTINUE_QUIZ,
    CONTINUE_TRUNCATED: CONTINUE_TRUNCATED,
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
    pageContextFromDom: pageContextFromDom,
    endpointFromWindow: endpointFromWindow,
    playSweetTone: playSweetTone,
    armAudio: armAudio,
    readMuted: readMuted,
    writeMuted: writeMuted,
    mount: mount
  };
});
