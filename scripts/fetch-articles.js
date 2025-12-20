// scripts/fetch-articles.js
// Fetches 1 article + 1 interview using Perplexity API and updates posts.json / interviews.json
// Stable IDs, dateISO added for new items, no renumbering.

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

const TOPICS = [
  {
    query:
      `Write an in-depth article on ServiceNow performance engineering for large tables: indexing strategy, GlideAggregate vs GlideRecord, encoded queries, pagination, and async processing. Include 3 practical code examples and a production checklist.`,
    category: 'servicenow',
  },
  {
    query:
      `Write an in-depth article on secure development in ServiceNow: ACL evaluation, role design, scoped app boundaries, GlideRecord security, and preventing data leaks. Include 2 code examples and a threat-model style section.`,
    category: 'security',
  },
  {
    query:
      `Write an in-depth article on integration architecture in ServiceNow: Import Sets vs Scripted REST vs Integration Hub, idempotency, retries, correlation IDs, error queues, and auditing. Include 3 code examples (RESTMessageV2 + transform + error handling).`,
    category: 'integration',
  },
  {
    query:
      `Write an in-depth article on upgrade-safe scripting patterns in ServiceNow: Script Includes, GlideRecord best practices, avoiding hard-coded sys_ids, using properties, and safe refactoring. Include 3 practical code examples and a short anti-pattern section.`,
    category: 'tutorial',
  },
];

const INTERVIEW_TOPICS = [
  {
    query:
      `Create ONE senior ServiceNow interview question on ACL evaluation order and how to debug unexpected denies. Include a 8-12 line code example that is NOT a stub.`,
    category: 'Security',
  },
  {
    query:
      `Create ONE senior ServiceNow interview question on designing idempotent inbound integrations (Import Set + Transform) with dedupe, correlation IDs, and replay safety. Include a 8-12 line code example that is NOT a stub.`,
    category: 'Integration',
  },
  {
    query:
      `Create ONE senior ServiceNow interview question on performance: when GlideAggregate is faster, how indexes change query plans, and how to avoid N+1 queries. Include a 8-12 line code example that is NOT a stub.`,
    category: 'Performance',
  },
  {
    query:
      `Create ONE senior ServiceNow interview question on async vs sync Business Rules and transaction boundaries (before/after/async) with a practical scenario.`,
    category: 'Architecture',
  },
  {
    query:
      `Create ONE senior ServiceNow interview question on Script Include patterns (Singleton/Factory/Strategy), scoped access, and GlideAjax boundaries. Include a 8-12 line code example that is NOT a stub.`,
    category: 'Scripting',
  },
];

// ---------- helpers ----------
function loadJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return [];
}

function nextId(items) {
  const max = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  return max + 1;
}

function formatDate(d = new Date()) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function isDuplicateByPrefix(existing, title, len = 45) {
  const t = (title || '').toLowerCase().substring(0, len);
  return existing.some((p) => (p.title || '').toLowerCase().substring(0, len) === t);
}

function cleanResponseToLikelyJson(text) {
  return (text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function parseJsonFromResponse(cleaned) {
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // normalize raw newlines inside JSON string literals
  jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
    const fixed = content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t');
    return `"${fixed}"`;
  });

  return JSON.parse(jsonStr);
}

// ---------- API ----------
function callPerplexity(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API timeout after 90s')), 90000);

    const data = JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3500,
      temperature: 0.6,
    });

    const req = https.request(
      {
        hostname: 'api.perplexity.ai',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`API status ${res.statusCode}: ${body.substring(0, 200)}`));
              return;
            }
            const response = JSON.parse(body);
            const content = response.choices?.[0]?.message?.content;
            if (content) resolve(content);
            else reject(new Error('Invalid API response structure'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function callWithRetry(prompt, systemPrompt, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callPerplexity(prompt, systemPrompt);
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ---------- prompts ----------
const ARTICLE_PROMPT = `You are a ServiceNow technical writer. Generate a blog article.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep content between 700-1000 words
3. MUST end content with a complete sentence and closing </p> or </ul> tag
4. Use HTML: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>
5. Code blocks must be 8-15 lines and NOT stubs. Show a full query and real logic.
6. No [1] citations, no **markdown**

JSON format:
{"title":"Specific Title Here","excerpt":"2-3 sentence summary.","readTime":"7 min read","content":"<h2>Overview</h2><p>Intro.</p><h2>Details</h2><p>Main content.</p><h2>Conclusion</h2><p>Wrap-up.</p>"}`;

const INTERVIEW_PROMPT = `You are a ServiceNow interviewer. Create ONE technical interview question.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Answer: 350-600 words
3. MUST end answer with complete sentence and closing tag
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. Code example MUST be 8-12 lines with REAL working logic:
   - Include variable declaration (var gr = new GlideRecord/GlideAggregate)
   - Include addQuery or addEncodedQuery with actual field conditions
   - Include query() call
   - Include while(gr.next()) loop with 2+ lines of processing logic inside
   - NO stubs, NO placeholders, NO "// your code here", NO empty loops
6. No [1] citations, no **markdown**

JSON format:
{"question":"Your specific technical question here?","answer":"<h4>Key Concept</h4><p>Explanation.</p><pre>var gr = new GlideRecord('incident');\\ngr.addEncodedQuery('state=1^priority=1');\\ngr.query();\\nwhile (gr.next()) {\\n  var count = gr.getValue('reassignment_count');\\n  gr.setValue('priority', 2);\\n  gr.update();\\n}</pre><p>Summary point.</p>","difficulty":"Senior","company":"ServiceNow"}`;

// ---------- main ----------
async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  const today = formatDate();
  const iso = nowISO();

  // ===== Article =====
  const existingPosts = loadJson(POSTS_FILE);
  const topic = [...TOPICS].sort(() => Math.random() - 0.5)[0];

  let newArticle = null;
  try {
    const raw = await callWithRetry(topic.query, ARTICLE_PROMPT);
    const cleaned = cleanResponseToLikelyJson(raw);
    const data = parseJsonFromResponse(cleaned);

    if (data?.title && data?.content) {
      if (!isDuplicateByPrefix(existingPosts, data.title)) {
        newArticle = {
          id: nextId(existingPosts),
          title: data.title,
          excerpt: data.excerpt || '',
          readTime: data.readTime || '7 min read',
          content: data.content,
          category: topic.category,
          date: today,
          dateISO: iso,
        };
      }
    }
  } catch (e) {
    console.error(`Article fetch failed: ${e.message}`);
  }

  let allPosts = existingPosts;
  if (newArticle) allPosts = [newArticle, ...existingPosts];
  allPosts = allPosts.slice(0, MAX_POSTS);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));

  await new Promise((r) => setTimeout(r, 3000));

  // ===== Interview =====
  const existingInterviews = loadJson(INTERVIEWS_FILE);
  const intTopic = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5)[0];

  let newInterview = null;
  try {
    const raw = await callWithRetry(intTopic.query, INTERVIEW_PROMPT);
    const cleaned = cleanResponseToLikelyJson(raw);
    const data = parseJsonFromResponse(cleaned);

    if (data?.question && data?.answer) {
      const dupe = existingInterviews.some(
        (q) =>
          (q.question || '').substring(0, 45).toLowerCase() ===
          String(data.question).substring(0, 45).toLowerCase()
      );

      if (!dupe) {
        newInterview = {
          id: nextId(existingInterviews),
          question: data.question,
          answer: data.answer,
          difficulty: data.difficulty || 'Senior',
          company: data.company || 'ServiceNow',
          category: intTopic.category,
          date: today,
          dateISO: iso,
        };
      }
    }
  } catch (e) {
    console.error(`Interview fetch failed: ${e.message}`);
  }

  let allInterviews = existingInterviews;
  if (newInterview) allInterviews = [newInterview, ...existingInterviews];
  allInterviews = allInterviews.slice(0, MAX_INTERVIEWS);
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
}

main()
  .then(() => {
    // Read-only validation
    try {
      execSync('node scripts/validate-content.js', { stdio: 'inherit' });
    } catch (e) {
      process.exit(e.status || 1);
    }
  })
  .catch((e) => {
    console.error(`Fatal: ${e.message}`);
    process.exit(1);
  });
