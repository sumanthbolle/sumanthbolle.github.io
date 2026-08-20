/**
 * Worker-compatible UPSC domain pack for Summaverick chat.
 *
 * Turns the general-purpose research assistant into a UPSC Civil Services
 * exam coach: answers are constructed the way examiners reward, live search
 * is used only to attach the *current trigger* to a *static anchor*, and no
 * figure is ever invented — anything uncertain is pushed into a verify line.
 *
 * Applied when the caller sends { domain: 'upsc' } (the study-page widget
 * always does) or when isUpscDomainQuery() recognises the text.
 */

export const UPSC_DOMAIN_SYSTEM_ADDON = `You are now operating Summaverick's UPSC Civil Services exam-coach layer. The user is an Indian civil-services aspirant (UPSC CSE — Prelims, Mains GS1–GS4, Essay). Answer as an exam coach, not a general chatbot.

Non-negotiables:
- India is the default frame. Never ask which region.
- Never invent a statistic, year, article number, committee/commission name, case title, scheme name, or ranking. If you are not certain of an exact figure or name, do not state it — put it on a short "Verify" line naming what to confirm and where (PIB, PRS, the ministry, Supreme Court, RBI, Budget/Economic Survey).
- No "As an AI", no filler openers, no emojis, no code blocks. Tight administrative register. Use short bold labels and crisp bullets, never long paragraphs.
- Stay balanced and non-partisan. Present more than one viewpoint on contested issues.

How to construct each answer:
- Map the topic to its paper first (GS1 / GS2 / GS3 / GS4 / Essay) and, for Mains, to the fitting directive verb (examine, critically analyse, discuss, evaluate, comment).
- Mains answer or POV: intro (1–2 lines: definition or context, not a windup) → body of exactly three dimensions, each a crisp claim plus one value-addition hook (a constitutional Article, a landmark Supreme Court judgment, a committee/commission, a government scheme, an official report/index, or verifiable data) → a counter-view or limitation → a forward-looking, balanced close. Respect exam length: ~150 words for a 10-marker, ~250 for a 15-marker.
- Model answer: return the skeleton only — one intro line, three body dimensions, one counter-point, one closing line — each led by a directive verb. No prose padding.
- Prelims angle: give 2–3 statement-style facts, then name the exact trap type the examiner would use (only/except, incorrect pairing, a threshold or number, chronology, static-vs-current), then the single fact to verify in the official source.
- Quiz: ask one question at a time in real UPSC phrasing; mark the previous answer in one line before the next.

Value-additions examiners reward — reach for these, but only when you are sure of them: constitutional Articles and Schedules, landmark judgments, committee/commission names, flagship schemes, official reports and indices, and hard data (with the source, and only if verifiable).

Using live search and the study context:
- Treat any "Study context" the user provides — the anchor title, its static core, its traps, its verify list — as the settled static scaffold. Build on it; do not re-derive or contradict it.
- Use web search only to attach the current trigger (a recent event, report, judgment, scheme, or data release) to that static anchor. Prefer official and credible Indian sources — PIB, PRS Legislative Research, ministry and regulator sites (RBI, SEBI, NITI Aayog), the Supreme Court, the Union Budget and Economic Survey, and explainer journalism (The Hindu, Indian Express Explained). Down-rank coaching-site and blog regurgitation.
- Cite live facts inline with [1], [2] matching the sources you actually used. Keep the static core uncited — it is settled syllabus, not news.`;

/**
 * One-line page-metadata context the widget passes as { meta: {...} }.
 * @param {object} meta
 * @returns {string}
 */
export function upscMetaLine(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const parts = [];
  if (meta.gs_paper) parts.push(`GS paper: ${meta.gs_paper}`);
  if (meta.static_topic) parts.push(`Static topic: ${meta.static_topic}`);
  if (meta.pattern_tag) parts.push(`Pattern: ${meta.pattern_tag}`);
  if (meta.source) parts.push(`Source: ${meta.source}`);
  if (meta.date) parts.push(`Date: ${meta.date}`);
  if (!parts.length) return '';
  return `Page metadata (use it to map the paper and the static concept; do not contradict it): ${parts.join('; ')}.`;
}

/**
 * Per-chip exam-coach instruction. The widget sends { chip, mode, marks, format };
 * JSON chips must return a single raw JSON object so the widget can render exam
 * artefacts (MCQs, a Mains skeleton, a rubric) instead of chat prose.
 * @param {string} chip
 * @param {{mode?: string, marks?: number}} [opts]
 * @returns {string}
 */
export function upscChipInstruction(chip, opts) {
  const o = opts || {};
  const exam = o.mode === 'exam';
  const marks = Number(o.marks) === 15 ? 15 : 10;
  const words = marks === 15 ? 250 : 150;
  const introW = marks === 15 ? '30-40' : '20-25';
  const bodyW = marks === 15 ? '165-180' : '100-110';
  const strict = exam
    ? ` Exam mode: hold the word limit within 10% and keep coaching asides out.`
    : '';

  switch (chip) {
    case 'prelims':
      return `Task: PRELIMS ANGLE. Generate 1-2 UPSC Prelims-style questions on the STATIC concept behind this topic (provisions, schemes, committees, constitutional bodies), not headline trivia. Prefer statement-based ("Which of the statements is/are correct?") or match-the-pairs. Each question needs four options and a one-line explanation. Return ONLY a single raw JSON object — no prose, no markdown fences, no citation markers — of exactly this shape: {"questions":[{"stem":"...","options":["...","...","...","..."],"correct":"...","explanation":"..."}],"meta":{"format":"statement-based|match-pairs","topic":"...","difficulty":"Easy|Medium|Hard"}}`;
    case 'mains':
      return `Task: MAINS POV. Identify the most likely UPSC Mains question this topic leads to. Do NOT write a full answer. Return ONLY a single raw JSON object — no prose, no fences — of exactly this shape: {"gs_paper":"GS1|GS2|GS3|GS4","question":"...","directive":"Discuss|Examine|Analyse|Evaluate|Critically examine|Comment","demand":"...","dimensions":["...","...","..."]} with three or four dimensions.`;
    case 'answer':
      return `Task: MODEL ANSWER for a ${marks}-mark question (~${words} words).${strict} Use Introduction-Body-Conclusion and label the three sections on their own lines exactly as "Introduction:", "Body:", "Conclusion:". Introduction ${introW} words (define the key term or give context). Body ${bodyW} words as three to six sub-headed points, each backed by an example, datum, or scheme. Conclusion ${introW} words (forward-looking way forward or balanced judgment). Include at least one constitutional Article, committee/report, government scheme, or verifiable data point. Match the structure to the directive word. Plain text with the three labels — no JSON, no fences.`;
    case 'quiz':
      return `Task: QUICK QUIZ. Ask exactly ONE question now and never wrap up. Alternate between Prelims MCQs and short Mains prompts across turns. If the student answered the previous item, mark it in the "mark" field. Return ONLY a single raw JSON object — no prose, no fences. Prelims item: {"type":"prelims","mark":"...optional one-line mark of my last answer...","question":{"stem":"...","options":["...","...","...","..."],"correct":"...","explanation":"..."}}. Mains item: {"type":"mains","mark":"...optional...","question":"...","marks":${marks}}.`;
    case 'rubric':
      return `Task: RUBRIC. For the model answer you just gave, mark whether each criterion is present. Return ONLY a single raw JSON object — no prose, no fences: {"structure":true,"relevance":true,"data_examples":false,"committees_schemes":false,"way_forward":true}`;
    case 'evaluate':
      return `Task: EVALUATE the student's answer against UPSC Mains standards (structure, relevance to the demand, depth, value-addition, way forward). Be specific and encouraging but honest. Return ONLY a single raw JSON object — no prose, no fences: {"rubric":{"structure":true,"relevance":true,"data_examples":false,"committees_schemes":false,"way_forward":true},"suggestions":["...","...","..."]} with three to five concrete suggestions.`;
    default:
      return '';
  }
}

const DOMAIN_MARKERS = [
  'upsc', 'civil services exam', 'civil service exam', 'ias exam', 'cse mains',
  'prelims', 'mains answer', 'gs1', 'gs2', 'gs3', 'gs4', 'gs paper',
  'general studies paper', 'ethics case study', 'answer writing', 'model answer',
  'directive verb', 'value addition', 'static anchor', 'pyq',
];

/**
 * Fallback detection when the caller does not send { domain: 'upsc' }.
 * Deliberately conservative — the study-page widget sets the flag explicitly.
 * @param {string} query
 * @returns {boolean}
 */
export function isUpscDomainQuery(query) {
  const q = String(query || '').toLowerCase();
  return DOMAIN_MARKERS.some((m) => q.includes(m));
}

/**
 * Coarse intent for logging / tuning. Not required for the system prompt.
 * @param {string} query
 * @returns {{intent: string, paper: string|null}}
 */
export function classifyUpscIntent(query) {
  const q = String(query || '').toLowerCase();
  let intent = 'mains';
  if (/\bprelims?\b|statement|only\/except|which of the/.test(q)) intent = 'prelims';
  else if (/quiz|one question|ask me/.test(q)) intent = 'quiz';
  else if (/model answer|skeleton|how should my answer/.test(q)) intent = 'answer';

  let paper = null;
  if (/\bgs ?1\b|history|geography|society|culture/.test(q)) paper = 'GS1';
  else if (/\bgs ?2\b|polity|governance|constitution|international relations|\bir\b/.test(q)) paper = 'GS2';
  else if (/\bgs ?3\b|economy|environment|security|science and tech|disaster/.test(q)) paper = 'GS3';
  else if (/\bgs ?4\b|ethics|integrity|aptitude|case study/.test(q)) paper = 'GS4';
  else if (/essay/.test(q)) paper = 'ESSAY';

  return { intent, paper };
}
