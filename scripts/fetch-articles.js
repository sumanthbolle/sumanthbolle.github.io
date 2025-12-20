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

// Expanded topic pool with specific, diverse angles to reduce duplicates
const TOPICS = [
  // Performance & Optimization
  {
    query: `Write an in-depth beginner-friendly article explaining GlideRecord vs GlideAggregate in ServiceNow. Cover: when to use each (with decision flowchart logic), how indexes affect query performance, real-world use case of counting incidents by priority vs fetching incident details. Include 3 working code examples with inline comments explaining each line. Reference ServiceNow docs best practices.`,
    category: 'servicenow',
  },
  {
    query: `Write an in-depth article on ServiceNow encoded queries: what they are, how to build them using list filters, common operators (LIKE, STARTSWITH, IN, ISEMPTY), and how to combine conditions. Include use case: building a dynamic report filter. Provide 3 progressive code examples from basic to advanced. Explain like teaching a new ServiceNow developer.`,
    category: 'servicenow',
  },
  {
    query: `Write an explanatory article on ServiceNow table indexing strategy for large datasets (1M+ records). Cover: how to identify slow queries using Query Business Rules log, when to request custom indexes, composite vs single-column indexes, and the Before Query Business Rule pattern. Include 2 code examples and a troubleshooting checklist. Use simple analogies.`,
    category: 'servicenow',
  },
  // Security & ACLs
  {
    query: `Write a beginner-friendly deep-dive on ServiceNow ACL (Access Control List) evaluation order. Explain: how ACLs are evaluated (table → field → row level), the wildcard (*) ACL, role requirements, and debugging with security.debug. Include use case: restricting HR case visibility to assignment group only. Provide 2 ACL script examples with detailed comments.`,
    category: 'security',
  },
  {
    query: `Write an explanatory article on ServiceNow scoped application security boundaries. Cover: what scope isolation means, how to safely expose Script Includes to other scopes, API access policies, and common security mistakes. Include use case: building a reusable utility app. Provide 2 code examples showing correct cross-scope access patterns.`,
    category: 'security',
  },
  {
    query: `Write an in-depth article on preventing data leaks in ServiceNow: client-side vs server-side security, why client scripts aren't secure, GlideSystem user checks, and secure GlideAjax patterns. Include real-world scenario: a client script exposing sensitive data and how to fix it. Provide 3 before/after code examples.`,
    category: 'security',
  },
  // Integration Patterns
  {
    query: `Write a beginner-friendly article comparing ServiceNow integration methods: Import Sets vs Scripted REST APIs vs Integration Hub (Flow Designer). Create a decision matrix for when to use each. Include use case: syncing employee data from external HR system. Provide 2 code examples (Import Set transform script + Scripted REST endpoint).`,
    category: 'integration',
  },
  {
    query: `Write an explanatory article on building idempotent integrations in ServiceNow. Explain: what idempotency means (with real-world analogy), correlation IDs, coalesce fields in Import Sets, and replay safety. Include use case: preventing duplicate incident creation from monitoring tool. Provide 3 code examples with error handling.`,
    category: 'integration',
  },
  {
    query: `Write an in-depth article on ServiceNow REST API error handling patterns: try-catch in RESTMessageV2, retry logic with exponential backoff, error queues for failed transactions, and alerting. Include use case: calling external payment API with proper failure handling. Provide 3 progressive code examples.`,
    category: 'integration',
  },
  {
    query: `Write a practical guide on ServiceNow Integration Hub (Flow Designer) for beginners: spokes vs custom integrations, when to use Flow Designer vs scripted approach, connection aliases, and error handling in flows. Include use case: Slack notification on P1 incident. Explain concepts simply with 2 examples.`,
    category: 'integration',
  },
  // Scripting Patterns & Best Practices
  {
    query: `Write an explanatory article on ServiceNow Script Include patterns: when to use them, class-based vs function-based, the 'extend' pattern, and making them client-callable (GlideAjax). Include use case: creating a reusable utility for date calculations. Provide 3 code examples with detailed inline comments.`,
    category: 'tutorial',
  },
  {
    query: `Write a beginner-friendly article on ServiceNow Business Rules: before vs after vs async vs display rules, when to use each type, and transaction boundaries. Include use case: auto-populating fields vs sending notifications. Provide 3 working code examples with explanations of execution timing.`,
    category: 'tutorial',
  },
  {
    query: `Write an in-depth article on upgrade-safe scripting in ServiceNow: avoiding hard-coded sys_ids, using system properties, GlideRecord best practices, and the sys_properties table. Include anti-patterns section with bad vs good code comparisons. Provide 3 refactoring examples showing unsafe → safe transformations.`,
    category: 'tutorial',
  },
  {
    query: `Write an explanatory article on ServiceNow Client Scripts vs UI Policies: when to use each, performance implications, the g_form API, and mobile considerations. Include decision flowchart logic and use case: mandatory field based on category selection. Provide 2 code examples comparing both approaches.`,
    category: 'tutorial',
  },
  {
    query: `Write a practical guide on GlideAjax in ServiceNow: how client-server communication works, the Script Include setup, handling responses, and common mistakes. Include use case: live validation of user input against database. Provide 3 progressive code examples (Script Include + Client Script pairs).`,
    category: 'tutorial',
  },
  // Flow Designer & Automation
  {
    query: `Write a beginner-friendly article on ServiceNow Flow Designer fundamentals: triggers vs actions vs subflows, when to use flows vs Business Rules, and the Flow execution context. Include use case: automated incident escalation workflow. Explain with simple analogies and 2 configuration examples.`,
    category: 'servicenow',
  },
  {
    query: `Write an explanatory article on ServiceNow Scheduled Jobs (Scheduled Script Executions): use cases, the GlideDateTime API for scheduling logic, avoiding long-running jobs, and monitoring job performance. Include use case: nightly data cleanup job. Provide 2 working code examples with logging.`,
    category: 'servicenow',
  },
  // ITSM Concepts
  {
    query: `Write a practical article on ServiceNow Incident Management customization: state model modifications, SLA definitions, assignment rules, and notification strategies. Include use case: implementing VIP incident handling. Provide 2 code examples for assignment rules and SLA scripts.`,
    category: 'servicenow',
  },
  {
    query: `Write an explanatory article on ServiceNow CMDB and CI relationships: CI classes, relationship types, dependent vs runs-on relationships, and Impact Analysis. Include use case: understanding blast radius of server outage. Explain with diagrams described in text and 1 relationship query example.`,
    category: 'servicenow',
  },
  {
    query: `Write a beginner-friendly article on ServiceNow Service Catalog: catalog items vs record producers, variable types, variable sets, and catalog client scripts. Include use case: building an employee onboarding request. Provide 2 code examples for catalog scripts.`,
    category: 'servicenow',
  },
];

const INTERVIEW_TOPICS = [
  {
    query: `Create ONE senior ServiceNow interview question on ACL evaluation order and debugging unexpected access denies using security.debug. The question should test real troubleshooting skills. Include an 8-12 line working code example showing an ACL script with role checks and conditions.`,
    category: 'Security',
  },
  {
    query: `Create ONE senior ServiceNow interview question on designing idempotent inbound integrations using Import Sets with coalesce fields, correlation IDs, and handling duplicate prevention. Include an 8-12 line Transform Map script example with actual field mappings and duplicate checks.`,
    category: 'Integration',
  },
  {
    query: `Create ONE senior ServiceNow interview question on GlideAggregate performance optimization: when it outperforms GlideRecord, proper use of groupBy and addAggregate, and avoiding N+1 query patterns. Include an 8-12 line working code example comparing inefficient vs efficient approaches.`,
    category: 'Performance',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Business Rule execution order and transaction boundaries: before vs after vs async, when current.update() causes recursion, and the setWorkflow pattern. Include a practical 8-12 line code example demonstrating proper async rule usage.`,
    category: 'Architecture',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Script Include design patterns: class inheritance with AbstractAjaxProcessor, making Script Includes client-callable, and scope access controls. Include an 8-12 line working GlideAjax-compatible Script Include example.`,
    category: 'Scripting',
  },
  {
    query: `Create ONE senior ServiceNow interview question on debugging slow GlideRecord queries: using session debug, identifying missing indexes, and query plan analysis. Include an 8-12 line code example showing a slow query pattern and its optimized version.`,
    category: 'Performance',
  },
  {
    query: `Create ONE senior ServiceNow interview question on RESTMessageV2 error handling: implementing retries, handling timeouts, parsing error responses, and logging for troubleshooting. Include an 8-12 line working code example with try-catch and response validation.`,
    category: 'Integration',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Client Script best practices: avoiding synchronous GlideAjax, g_form performance, and when to use UI Policies instead. Include an 8-12 line working code example showing proper async callback handling.`,
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

// More lenient duplicate detection - compare more characters and normalize
function isDuplicateByPrefix(existing, title, len = 60) {
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, len);
  const t = normalize(title);
  return existing.some((p) => normalize(p.title) === t);
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

// Pick a random topic, but prefer ones less likely to duplicate
function pickTopic(topics, existing, maxAttempts = 5) {
  const shuffled = [...topics].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < Math.min(maxAttempts, shuffled.length); i++) {
    const topic = shuffled[i];
    // Extract key terms from query to check against existing titles
    const keyTerms = topic.query.match(/\b(GlideRecord|GlideAggregate|ACL|Import Set|REST|Flow Designer|Business Rule|Script Include|CMDB|Catalog|encoded quer|Client Script|UI Polic|Scheduled Job|Integration Hub)\b/gi) || [];
    
    // Check if we already have an article with similar key terms
    const hasSimilar = existing.some(p => {
      const title = (p.title || '').toLowerCase();
      return keyTerms.some(term => title.includes(term.toLowerCase()));
    });
    
    if (!hasSimilar || i === maxAttempts - 1) {
      return topic;
    }
  }
  
  return shuffled[0];
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
      max_tokens: 4000,
      temperature: 0.7,
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

async function callWithRetry(prompt, systemPrompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callPerplexity(prompt, systemPrompt);
    } catch (e) {
      console.log(`Attempt ${attempt} failed: ${e.message}`);
      if (attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt)); // Increasing backoff
    }
  }
}

// ---------- prompts ----------
const ARTICLE_PROMPT = `You are a senior ServiceNow technical writer creating educational content for the ServiceNow developer community. Your articles should feel like guidance from an experienced mentor.

WRITING STYLE:
- Write in a friendly, explanatory tone as if teaching a colleague
- Use real-world analogies to explain complex concepts
- Include "why" explanations, not just "how"
- Reference ServiceNow documentation concepts and community best practices
- Structure content progressively: concept → use case → implementation → gotchas

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep content between 800-1200 words
3. MUST end content with a complete sentence and closing </p> or </ul> tag
4. Use HTML: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>
5. Include 2-3 code blocks that are 8-15 lines each with:
   - Inline comments explaining key lines
   - Real table/field names (incident, sys_user, assignment_group, etc.)
   - Complete working logic (not stubs)
6. Include a "Common Mistakes" or "Pro Tips" section
7. No [1] citations, no **markdown bold**

JSON format:
{"title":"Specific Descriptive Title Here","excerpt":"2-3 sentence summary explaining what reader will learn and why it matters.","readTime":"8 min read","content":"<h2>Understanding the Concept</h2><p>Opening explanation with analogy.</p><h2>When to Use This</h2><p>Use cases and decision criteria.</p><h2>Implementation</h2><p>Step by step with code.</p><pre>// Working code with comments</pre><h2>Common Mistakes to Avoid</h2><ul><li>Mistake and fix</li></ul><h2>Summary</h2><p>Key takeaways.</p>"}`;

const INTERVIEW_PROMPT = `You are a senior ServiceNow architect conducting technical interviews. Create a challenging but fair interview question that tests real-world problem-solving skills.

QUESTION STYLE:
- Ask about practical scenarios, not just definitions
- Test understanding of "why" not just "how"
- Include follow-up considerations in the answer

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Answer: 400-650 words
3. MUST end answer with complete sentence and closing tag
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. Code example MUST be 8-12 lines with REAL working logic:
   - Include variable declaration (var gr = new GlideRecord/GlideAggregate)
   - Include addQuery or addEncodedQuery with actual field conditions
   - Include query() call
   - Include while(gr.next()) loop with 2+ lines of processing logic inside
   - Use real table names (incident, sys_user, cmdb_ci, etc.)
   - NO stubs, NO placeholders, NO "// your code here", NO empty loops
6. No [1] citations, no **markdown**

JSON format:
{"question":"Scenario-based technical question here?","answer":"<h4>Key Concept</h4><p>Core explanation.</p><h4>Implementation Approach</h4><pre>var gr = new GlideRecord('incident');\\ngr.addEncodedQuery('state=1^priority=1');\\ngr.query();\\nwhile (gr.next()) {\\n  var assignee = gr.getValue('assigned_to');\\n  gs.log('Processing: ' + gr.number);\\n  gr.setValue('state', 2);\\n  gr.update();\\n}</pre><p>Code explanation.</p><h4>Follow-up Considerations</h4><ul><li>Edge case or optimization</li></ul>","difficulty":"Senior","company":"ServiceNow"}`;

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
  const topic = pickTopic(TOPICS, existingPosts);

  console.log(`Selected topic category: ${topic.category}`);
  console.log(`Topic query preview: ${topic.query.substring(0, 100)}...`);

  let newArticle = null;
  let articleAttempts = 0;
  const maxArticleAttempts = 2;

  while (!newArticle && articleAttempts < maxArticleAttempts) {
    articleAttempts++;
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
            readTime: data.readTime || '8 min read',
            content: data.content,
            category: topic.category,
            date: today,
            dateISO: iso,
          };
          console.log(`✓ Article generated: ${data.title.substring(0, 60)}...`);
        } else {
          console.log(`Duplicate title detected, attempt ${articleAttempts}/${maxArticleAttempts}`);
        }
      } else {
        console.log(`Invalid response structure, attempt ${articleAttempts}/${maxArticleAttempts}`);
      }
    } catch (e) {
      console.error(`Article fetch failed (attempt ${articleAttempts}): ${e.message}`);
    }
  }

  let allPosts = existingPosts;
  if (newArticle) {
    allPosts = [newArticle, ...existingPosts];
    console.log(`Added new article, total: ${allPosts.length}`);
  } else {
    console.log('No new article added this run');
  }
  allPosts = allPosts.slice(0, MAX_POSTS);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));

  await new Promise((r) => setTimeout(r, 3000));

  // ===== Interview =====
  const existingInterviews = loadJson(INTERVIEWS_FILE);
  const intTopic = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5)[0];

  console.log(`\nSelected interview category: ${intTopic.category}`);

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
        console.log(`✓ Interview generated: ${data.question.substring(0, 60)}...`);
      } else {
        console.log('Duplicate interview question detected');
      }
    }
  } catch (e) {
    console.error(`Interview fetch failed: ${e.message}`);
  }

  let allInterviews = existingInterviews;
  if (newInterview) {
    allInterviews = [newInterview, ...existingInterviews];
    console.log(`Added new interview, total: ${allInterviews.length}`);
  }
  allInterviews = allInterviews.slice(0, MAX_INTERVIEWS);
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
}

main()
  .then(() => {
    console.log('\n--- Running validation ---\n');
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
