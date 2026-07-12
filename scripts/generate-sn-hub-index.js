#!/usr/bin/env node
/**
 * Builds data/sn-hub-index.json — slim search + hub inventory for ServiceNow Central.
 * Run: node scripts/generate-sn-hub-index.js
 */
const fs = require('fs');
const path = require('path');
const { POSTS_FILE, INTERVIEWS_FILE } = require('./content-paths');

const root = path.resolve(__dirname, '..');
const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
const interviews = JSON.parse(fs.readFileSync(INTERVIEWS_FILE, 'utf8'));
const cats = JSON.parse(fs.readFileSync(path.join(root, 'quiz-categories.json'), 'utf8'));
const tut = fs.readFileSync(path.join(root, 'tutorials.js'), 'utf8');
const leaves = [...tut.matchAll(/\{id:"([^"]+)",title:"([^"]+)",difficulty:"([^"]+)"/g)].map((m) => ({
  id: m[1], title: m[2], difficulty: m[3]
}));

const items = [];

const library = [
  { id: 'lib-live', type: 'hub', title: 'Live ServiceNow feed', excerpt: 'Auto-refreshing AI, Agents, LLM and cost-optimization headlines with sources.', href: 'servicenow.html#live', meta: 'Hub' },
  { id: 'lib-blog', type: 'hub', title: 'ServiceNow blog & deep dives', excerpt: 'Practical articles on ServiceNow, GenAI, LLMs and agentic automation.', href: 'blog.html', meta: 'Hub' },
  { id: 'lib-tutorials', type: 'hub', title: 'ServiceNow developer tutorials', excerpt: 'Hands-on guides across scripting, integrations, CSA prep and architecture.', href: 'tutorials.html', meta: 'Hub' },
  { id: 'lib-interviews', type: 'hub', title: 'ServiceNow interview prep', excerpt: 'Real interview questions with model answers from top companies.', href: 'interviews.html', meta: 'Hub' },
  { id: 'lib-quiz', type: 'hub', title: 'ServiceNow practice quiz', excerpt: '1,300+ validated CSA, CSM, GRC, scripting and scenario questions.', href: 'quiz.html', meta: 'Hub' },
  { id: 'lib-ask', type: 'hub', title: 'Ask Summaverick about ServiceNow', excerpt: 'Live-research AI assistant for grounded, cited ServiceNow answers.', href: 'summaverick.html', meta: 'Ask' }
];
items.push(...library);

const paths = [
  { id: 'path-beginner', type: 'path', title: 'Start here: new to ServiceNow', excerpt: 'Platform foundations, data model, and your first scripts — a guided path for beginners and career switchers.', href: 'servicenow.html#paths', meta: 'Path · Beginner', keywords: 'beginner CSA foundations admin career switcher' },
  { id: 'path-csa', type: 'path', title: 'Path: pass the CSA exam', excerpt: 'Certification-focused practice with CSA modules and validated quiz drills.', href: 'quiz.html', meta: 'Path · CSA', keywords: 'CSA certification exam practice' },
  { id: 'path-script', type: 'path', title: 'Path: scripting & automation', excerpt: 'GlideRecord, business rules, client scripts, Flow Designer — build real platform skills.', href: 'tutorials.html', meta: 'Path · Developer', keywords: 'GlideRecord scripting Flow Designer business rules' },
  { id: 'path-interview', type: 'path', title: 'Path: interview ready', excerpt: 'Technical interview questions and stand-alone terms quiz used at Apple, Google and ServiceNow.', href: 'interviews.html', meta: 'Path · Interview', keywords: 'interview prep technical terms' },
  { id: 'path-ai', type: 'path', title: 'Path: AI on ServiceNow', excerpt: 'Now Assist, AI Agents, LLMs and cost optimization — live feed plus AI deep dives.', href: 'servicenow.html#live', meta: 'Path · AI', keywords: 'Now Assist AI Agents GenAI LLM' }
];
items.push(...paths);

for (const p of posts) {
  items.push({
    id: `post-${p.id}`, type: 'article', title: p.title || '', excerpt: p.excerpt || '',
    href: `blog.html#article/${p.id}`, meta: `Article · ${p.category || ''}`,
    category: p.category || '', difficulty: p.difficulty || '',
    keywords: [p.category, p.learningPath, p.difficulty, ...(p.forPersona || [])].filter(Boolean).join(' ')
  });
}

for (const i of interviews) {
  items.push({
    id: `iv-${i.id}`, type: 'interview', title: i.question || '',
    excerpt: String(i.answer || '').replace(/\n/g, ' ').slice(0, 220),
    href: `interviews.html#question/${i.id}`, meta: `Interview · ${i.company || i.category || ''}`,
    category: i.category || '', difficulty: i.difficulty || '',
    keywords: `${i.company || ''} ${i.category || ''} ${i.difficulty || ''} interview`
  });
}

for (const t of leaves) {
  items.push({
    id: `tut-${t.id}`, type: 'tutorial', title: t.title,
    excerpt: `Hands-on ServiceNow tutorial · ${t.difficulty}`,
    href: `tutorials.html#${t.id}`, meta: `Tutorial · ${t.difficulty[0].toUpperCase()}${t.difficulty.slice(1)}`,
    difficulty: t.difficulty, keywords: `tutorial ${t.difficulty} ServiceNow ${t.title}`
  });
}

for (const [key, c] of Object.entries(cats)) {
  items.push({
    id: `quiz-${key}`, type: 'quiz', title: `Quiz: ${c.name || key}`, excerpt: c.desc || '',
    href: `quiz.html#category/${key}`, meta: 'Quiz', keywords: `quiz practice ${c.name || ''} ${key}`
  });
}

const faqs = [
  { id: 'faq-what', type: 'faq', title: 'What is ServiceNow Central?', excerpt: 'A single source of truth for ServiceNow: live sourced headlines, tutorials, interview prep, quizzes, and AI answers.', href: 'servicenow.html', meta: 'FAQ', keywords: 'what is ServiceNow hub community' },
  { id: 'faq-csa', type: 'faq', title: 'How do I prepare for the ServiceNow CSA exam?', excerpt: 'Use the CSA quiz track plus beginner platform tutorials and certification blog posts.', href: 'quiz.html', meta: 'FAQ', keywords: 'CSA exam certification prepare' },
  { id: 'faq-gliderecord', type: 'faq', title: 'Where can I learn GlideRecord scripting?', excerpt: 'Start with the scripting tutorials, then drill GlideRecord interview questions and quiz scenarios.', href: 'tutorials.html', meta: 'FAQ', keywords: 'GlideRecord learn scripting' },
  { id: 'faq-agents', type: 'faq', title: 'What are ServiceNow AI Agents?', excerpt: 'Autonomous digital workers on the Now Platform — follow the live AI Agents feed and AI blog guides.', href: 'servicenow.html#live', meta: 'FAQ', keywords: 'AI Agents Now Assist Orchestrator' },
  { id: 'faq-ask', type: 'faq', title: 'How do I get a sourced answer to a ServiceNow question?', excerpt: 'Ask Summaverick — it researches live sources and returns grounded answers with citations.', href: 'summaverick.html', meta: 'FAQ', keywords: 'ask question AI Summaverick' }
];
items.push(...faqs);

let quizQuestions = 1318;
try {
  const qq = JSON.parse(fs.readFileSync(path.join(root, 'quiz-questions.json'), 'utf8'));
  quizQuestions = Array.isArray(qq) ? qq.length : Object.values(qq).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
} catch (_) {}

const out = {
  stats: {
    articles: posts.length,
    tutorials: leaves.length,
    interviews: interviews.length,
    quizQuestions,
    quizCategories: Object.keys(cats).length,
    generated: new Date().toISOString().slice(0, 10)
  },
  items
};

const dest = path.join(root, 'data', 'sn-hub-index.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote ${items.length} items → ${path.relative(root, dest)}`);
