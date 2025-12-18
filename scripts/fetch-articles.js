// scripts/fetch-articles.js
// Fetches 1 article + 1 interview using Perplexity API and updates posts.json / interviews.json
// Key changes:
// - Stable IDs (no renumbering)
// - Adds dateISO for sorting
// - Keeps MAX_POSTS/MAX_INTERVIEWS without rewriting old IDs
// - Works with validate-content.js that does NOT modify files

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

// Topics (you can edit these prompts anytime)
const TOPICS = [
  {
    query:
      `Write an in-depth article on upgrade-safe scripting patterns in ServiceNow: Script Includes, GlideRecord best practices, avoiding hard-coded sys_ids, using properties, and safe refactoring. Include 3 practical code examples and a short anti-pattern section.`,
    category: 'tutorial',
  },
  {
    query:
      `Write an in-depth article on ServiceNow performance engineering for large tables: indexing strategy, GlideAggregate vs GlideRecord, encoded queries, pagination, and async processing. Include 3 code examples and a production checklist.`,
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
];

const INTERVIEW_TOPICS = [
  {
    query:
      `Create one senior ServiceNow interview question on ACL evaluation order and how to debug unexpected denies. Include a short code example and a step-by-step debugging approach.`,
    category: 'Security',
  },
  {
    query:
      `Create one senior ServiceNow interview question on designing idempotent inbound integrations (Import Set + Transform) with dedupe, correlation IDs, and replay safety. Include code example.`,
    category: 'Integration',
  },
  {
    query:
      `Create one senior ServiceNow interview question on performance: when GlideAggregate is faster, how indexes change query plans, and how to avoid N+1 queries. Include code example.`,
    category: 'Performance',
  },
  {
    query:
      `Create one senior ServiceNow interview question on async vs sync Business Rules and transaction boundaries (before/after/async) with real-world scenario.`,
    category: 'Architecture',
  },
  {
    query:
      `Create one senior ServiceNow interview question on Script Include patterns (Singleton, Factory, strategy), scoped access, and GlideAjax boundaries. Include code example.`,
    category: 'Scripting',
  },
];

// ----------------- Parsing helpers -----------------

function extractField(text, fieldName) {
  const fieldStart = text.indexOf(`"${fieldName}"`);
  if (fieldStart === -1) return null;

  const colonPos = text.indexOf(':', fieldStart);
  if (colonPos === -1) return null;

  const openQuote = text.indexOf('"', colonPos + 1);
  if (openQuote === -1) return null;

  let i = openQuote + 1;
  let value = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      value += ch + text[i + 1];
      i += 2;
    } else if (ch === '"') {
      break;
    } else {
      value += ch;
      i++;
    }
  }

  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function isContentComplete(content) {
  if (!content || content.length < 100) return false;

  const trimmed = content.trim();
  const badEndings = ['\\', 'such as', 'including', 'for example', 'e.g.', 'i.e.', 'the following', 'contains'];
  const lowerEnd = trimmed.slice(-50).toLowerCase();

  for (const bad of badEndings) {
    if (lowerEnd.endsWith(bad)) return false;
  }

  if (
    trimmed.endsWith('</p>') ||
    trimmed.endsWith('</ul>') ||
    trimmed.endsWith('</ol>') ||
    trimmed.endsWith('</pre>') ||
    trimmed.endsWith('</li>') ||
    trimmed.endsWith('</h2>') ||
    trimmed.endsWith('</h3>') ||
    trimmed.endsWith('</h4>')
  ) {
    return true;
  }

  const goodLast = ['.', '!', '?', '>', '"', "'", ')', ']', '}'];
  return goodLast.includes(trimmed.slice(-1));
}

function fixTruncatedContent(content) {
  // Best-effort local fix only (no API fix):
  if (!content) return content;
  let fixed = content.trim();

  if (fixed.endsWith('\\')) fixed = fixed.slice(0, -1);

  // Close simple HTML tags if unbalanced
  const openTags = [];
  const tagRegex = /<(\/?)(pre|p|ul|ol|li|h[234]|strong|em|code)[^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(fixed)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    if (isClosing) {
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) openTags.splice(idx, 1);
    } else {
      openTags.push(tagName);
    }
  }
  for (let i = openTags.length - 1; i >= 0; i--) fixed += `</${openTags[i]}>`;

  // If it still doesn't end well, do not over-edit; leave as-is
  return fixed;
}

function parseArticle(response, category) {
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      // Normalize raw newlines inside JSON string values
      jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
        const fixed = content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t');
        return `"${fixed}"`;
      });

      const data = JSON.parse(jsonStr);

      let content = data.content || '';
      if (!isContentComplete(content)) content = fixTruncatedContent(content);

      content = content
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[\d+\]/g, '');

      return {
        title: (data.title || 'Untitled').replace(/\[\d+\]/g, ''),
        excerpt: (data.excerpt || '').replace(/\[\d+\]/g, ''),
        readTime: data.readTime || '5 min read',
        content,
        category,
      };
    }
  } catch (e) {
    // fall through
  }

  // Fallback: extract fields manually
  const title = extractField(cleaned, 'title');
  const excerpt = extractField(cleaned, 'excerpt');
  const readTime = extractField(cleaned, 'readTime');
  let content = extractField(cleaned, 'content');

  if (title && content) {
    if (!isContentComplete(content)) content = fixTruncatedContent(content);

    return {
      title: title.replace(/\[\d+\]/g, ''),
      excerpt: (excerpt || '').replace(/\[\d+\]/g, ''),
      readTime: (readTime || '5 min read').replace(/\[\d+\]/g, ''),
      content: content.replace(/\[\d+\]/g, ''),
      category,
    };
  }

  return null;
}

function parseInterview(response, category) {
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
        const fixed = content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t');
        return `"${fixed}"`;
      });

      const data = JSON.parse(jsonStr);

      let answer = data.answer || '';
      if (!isContentComplete(answer)) answer = fixTruncatedContent(answer);

      return {
        question: (data.question || '').replace(/\[\d+\]/g, ''),
        answer: answer.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[\d+\]/g, ''),
        difficulty: data.difficulty || 'Senior',
        company: data.company || 'ServiceNow',
        category,
      };
    }
  } catch (e) {
    // fall through
  }

  const question = extractField(cleaned, 'question');
  let answer = extractField(cleaned, 'answer');
  const difficulty = extractField(cleaned, 'difficulty');
  const company = extractField(cleaned, 'company');

  if (question) {
    if (answer && !isContentComplete(answer)) answer = fixTruncatedContent(answer);
    return {
      question: question.replace(/\[\d+\]/g, ''),
      answer: (answer || '<p>Answer not available.</p>').replace(/\[\d+\]/g, ''),
      difficulty: difficulty || 'Senior',
      company: company || 'ServiceNow',
      category,
    };
  }

  return null;
}

// ----------------- API -----------------

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

// ----------------- Prompts -----------------

const ARTICLE_PROMPT = `You are a ServiceNow technical writer. Generate a blog article.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep content between 600-900 words
3. MUST end content with a complete sentence and closing </p> or </ul> tag
4. Use HTML: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>
5. For code: <pre>var gr = new GlideRecord('table');\\ngr.query();</pre>
6. No [1] citations, no **markdown**

JSON format:
{"title":"Specific Title Here","excerpt":"2-3 sentence summary.","readTime":"6 min read","content":"<h2>Overview</h2><p>Intro.</p><h2>Details</h2><p>Main content.</p><h2>Conclusion</h2><p>Wrap-up.</p>"}`;

const INTERVIEW_PROMPT = `You are a ServiceNow interviewer. Create ONE technical interview question.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep answer between 300-600 words
3. MUST end answer with complete sentence and closing tag
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. For code: <pre>// example\\nvar gr = new GlideRecord('incident');</pre>
6. No [1] citations, no **markdown**

JSON format:
{"question":"Your specific technical question here?","answer":"<h4>Key Concept</h4><p>Explanation.</p><pre>// code example</pre><p>Summary point.</p>","difficulty":"Senior","company":"ServiceNow"}`;

// ----------------- File ops -----------------

function loadJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // ignore
  }
  return [];
}

function nextId(items) {
  const max = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  return max + 1;
}

function formatDate(d = new Date()) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function isDuplicateByPrefix(existing, title, len = 45) {
  const t = (title || '').toLowerCase().substring(0, len);
  return existing.some((p) => (p.title || '').toLowerCase().substring(0, len) === t);
}

// ----------------- Main -----------------

async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  const today = formatDate();
  const iso = nowISO();

  // 1) Article
  const existingPosts = loadJson(POSTS_FILE);
  const topic = [...TOPICS].sort(() => Math.random() - 0.5)[0];

  let newArticle = null;
  try {
    const response = await callWithRetry(topic.query, ARTICLE_PROMPT);
    const article = parseArticle(response, topic.category);

    if (article && article.title) {
      if (!isDuplicateByPrefix(existingPosts, article.title)) {
        newArticle = {
          id: nextId(existingPosts),
          ...article,
          date: today,
          dateISO: iso,
        };
      }
    }
  } catch (e) {
    console.error(`Article fetch failed: ${e.message}`);
  }

  let allPosts = existingPosts;
  if (newArticle) {
    allPosts = [newArticle, ...existingPosts];
  }

  // Keep max, without renumbering IDs
  allPosts = allPosts.slice(0, MAX_POSTS);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));

  // small pause
  await new Promise((r) => setTimeout(r, 3000));

  // 2) Interview
  const existingInterviews = loadJson(INTERVIEWS_FILE);
  const intTopic = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5)[0];

  let newInterview = null;
  try {
    const response = await callWithRetry(intTopic.query, INTERVIEW_PROMPT);
    const interview = parseInterview(response, intTopic.category);

    if (interview && interview.question) {
      const dupe = existingInterviews.some(
        (q) => (q.question || '').substring(0, 45).toLowerCase() === interview.question.substring(0, 45).toLowerCase()
      );
      if (!dupe) {
        newInterview = {
          id: nextId(existingInterviews),
          ...interview,
          date: today,
          dateISO: iso,
        };
      }
    }
  } catch (e) {
    console.error(`Interview fetch failed: ${e.message}`);
  }

  let allInterviews = existingInterviews;
  if (newInterview) {
    allInterviews = [newInterview, ...existingInterviews];
  }

  allInterviews = allInterviews.slice(0, MAX_INTERVIEWS);
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
}

main()
  .then(() => {
    // Run validation (read-only)
    try {
      execSync('node scripts/validate-content.js', { stdio: 'inherit' });
    } catch (e) {
      // validation script sets exit code if critical issues exist
      process.exit(e.status || 1);
    }
  })
  .catch((e) => {
    console.error(`Fatal: ${e.message}`);
    process.exit(1);
  });
