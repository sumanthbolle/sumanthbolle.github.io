// scripts/fetch-articles.js
// Fetches latest tech articles using Perplexity API and generates posts.json

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';
const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

const TOPICS = [
  {
    query: `Latest ServiceNow platform updates from docs.servicenow.com: recent release notes, security patches, performance improvements. Include practical code examples for developers.`,
    category: "servicenow"
  },
  {
    query: `ServiceNow AI features: Now Assist, Predictive Intelligence, Virtual Agent updates. Include implementation code examples.`,
    category: "ai"
  },
  {
    query: `ServiceNow core APIs guide: GlideRecord, GlideAggregate, RESTMessageV2, Flow Designer patterns. Include best practices and code examples.`,
    category: "tutorial"
  },
  {
    query: `ServiceNow ITSM automation: CMDB best practices, workflow optimization, hyperautomation patterns. Practical implementation guidance.`,
    category: "general"
  }
];

const INTERVIEW_TOPICS = [
  { query: `ServiceNow interview question: GlideRecord vs GlideAggregate performance, query optimization, governor limits. Include code example.`, category: "Performance" },
  { query: `ServiceNow interview question: Business Rule execution order, Client Script vs UI Policy, scoped app design. Include explanation.`, category: "Architecture" },
  { query: `ServiceNow interview question: Integration Hub vs Scripted REST, Flow Designer error handling, MID Server use cases. Include code.`, category: "Integration" },
  { query: `ServiceNow interview question: ACL evaluation order, row-level security, OAuth 2.0 implementation. Include scenario.`, category: "Security" },
  { query: `ServiceNow interview question: Script Include patterns, GlideAjax, getValue() vs dot-walking. Include code example.`, category: "Scripting" }
];

// ============ FAST & ROBUST JSON PARSING ============

/**
 * Quick regex-based field extraction - FAST fallback
 */
function extractFieldsRegex(response, fields) {
  const result = {};
  for (const field of fields) {
    // Try multiple patterns
    const patterns = [
      new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`),
      new RegExp(`"${field}"\\s*:\\s*"([^"]{0,50000})"`)
    ];
    for (const regex of patterns) {
      const match = response.match(regex);
      if (match && match[1]) {
        result[field] = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        break;
      }
    }
  }
  return result;
}

/**
 * Fast JSON parse with simple sanitization - no slow loops
 */
function fastJsonParse(raw) {
  // Step 1: Remove markdown
  let s = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
  // Step 2: Extract JSON object
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  s = match[0];
  
  // Step 3: Try as-is
  try { return JSON.parse(s); } catch (e) { /* continue */ }
  
  // Step 4: Remove control chars and fix newlines in one pass
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Step 5: Fix unescaped newlines inside strings using replace callback
  // This is MUCH faster than character-by-character
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (m, content) => {
    const fixed = content
      .replace(/[\r\n]+/g, '\\n')
      .replace(/\t/g, '\\t');
    return `"${fixed}"`;
  });
  
  // Step 6: Try again
  try { return JSON.parse(s); } catch (e) { /* continue */ }
  
  // Step 7: Truncate at last valid-looking position (fast heuristic)
  // Find the last complete field pattern
  const lastGoodField = s.lastIndexOf('","');
  if (lastGoodField > 100) {
    const truncated = s.substring(0, lastGoodField + 1) + '"}';
    try { return JSON.parse(truncated); } catch (e) { /* continue */ }
  }
  
  throw new Error('JSON parse failed after sanitization');
}

// ============ PARSING FUNCTIONS ============

function parseInterview(response, category) {
  // Try fast parse first
  try {
    const data = fastJsonParse(response);
    return {
      question: (data.question || '').replace(/\[\d+\]/g, ''),
      answer: (data.answer || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[\d+\]/g, ''),
      difficulty: data.difficulty || 'Senior',
      company: data.company || 'ServiceNow',
      category
    };
  } catch (e) {
    console.log(`   Fast parse failed: ${e.message}, trying regex extraction...`);
  }
  
  // Fallback to regex extraction
  const extracted = extractFieldsRegex(response, ['question', 'answer', 'difficulty', 'company']);
  if (extracted.question) {
    console.log('   Regex extraction succeeded!');
    return {
      question: extracted.question.replace(/\[\d+\]/g, ''),
      answer: extracted.answer || '<p>Answer unavailable</p>',
      difficulty: extracted.difficulty || 'Senior',
      company: extracted.company || 'ServiceNow',
      category
    };
  }
  
  console.log('   All parsing methods failed');
  return null;
}

function parseArticle(response, category) {
  // Try fast parse first
  try {
    const data = fastJsonParse(response);
    let content = data.content || '<p>Content not available.</p>';
    content = content
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[\d+\]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    return {
      title: (data.title || 'Untitled').replace(/\[\d+\]/g, ''),
      excerpt: (data.excerpt || '').replace(/\[\d+\]/g, ''),
      readTime: data.readTime || '5 min read',
      content,
      category
    };
  } catch (e) {
    console.log(`   Fast parse failed: ${e.message}, trying regex extraction...`);
  }
  
  // Fallback to regex extraction
  const extracted = extractFieldsRegex(response, ['title', 'excerpt', 'readTime', 'content']);
  if (extracted.title && extracted.content) {
    console.log('   Regex extraction succeeded!');
    return {
      title: extracted.title.replace(/\[\d+\]/g, ''),
      excerpt: extracted.excerpt || '',
      readTime: extracted.readTime || '5 min read',
      content: extracted.content,
      category
    };
  }
  
  console.log('   All parsing methods failed');
  return null;
}

// ============ API CALLS WITH TIMEOUT ============

function callPerplexityWithTimeout(prompt, systemPrompt, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`API call timed out after ${timeoutMs/1000}s`));
    }, timeoutMs);
    
    const data = JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: 1800,
      temperature: 0.7
    });

    const req = https.request({
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API status ${res.statusCode}`));
            return;
          }
          const response = JSON.parse(body);
          if (response.choices?.[0]?.message?.content) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error('Invalid API response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => { clearTimeout(timeout); reject(e); });
    req.write(data);
    req.end();
  });
}

const ARTICLE_SYSTEM_PROMPT = `You are a technical writer for ServiceNow developers.

CRITICAL: Return ONLY valid JSON. No markdown blocks. Use HTML tags for formatting.
Keep responses under 2000 words to avoid truncation.

Format:
{"title":"Specific title","excerpt":"2-3 sentence summary","readTime":"X min read","content":"<h2>Overview</h2><p>Content...</p><pre>// code</pre>"}

Use \\n for newlines in code. No [1] citations. No **markdown**.`;

const INTERVIEW_SYSTEM_PROMPT = `You are a ServiceNow interviewer creating technical questions.

CRITICAL: Return ONLY valid JSON. No markdown blocks. Use HTML tags.
Keep answer under 500 words.

Format:
{"question":"Technical question","answer":"<p>Explanation</p><pre>// code</pre>","difficulty":"Senior","company":"ServiceNow"}

Use \\n for newlines in code. No [1] citations. No **markdown**.`;

// ============ FILE OPERATIONS ============

function loadJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.log(`No existing ${file}`); }
  return [];
}

function generateId(items) {
  return items.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

function formatDate() {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date();
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ============ RETRY HELPER ============

async function callWithRetry(prompt, systemPrompt, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) console.log(`   Retry attempt ${attempt}/${maxRetries}...`);
      return await callPerplexityWithTimeout(prompt, systemPrompt, 60000);
    } catch (e) {
      if (attempt === maxRetries) throw e;
      console.log(`   ${e.message} - retrying in 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ============ MAIN ============

async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not set!');
    process.exit(1);
  }

  const maskedKey = PERPLEXITY_API_KEY.substring(0, 8) + '...' + PERPLEXITY_API_KEY.slice(-4);
  console.log(`🔑 API Key: ${maskedKey}`);
  console.log('🚀 Fetching articles...\n');
  
  const existingPosts = loadJson(POSTS_FILE);
  const newPosts = [];
  const today = formatDate();

  const shuffled = [...TOPICS].sort(() => Math.random() - 0.5).slice(0, 2);

  for (const topic of shuffled) {
    console.log(`📡 Fetching: ${topic.category}...`);
    try {
      const response = await callWithRetry(topic.query, ARTICLE_SYSTEM_PROMPT);
      console.log(`   Response length: ${response.length} chars`);
      const article = parseArticle(response, topic.category);
      
      if (article) {
        const isDupe = existingPosts.some(p => 
          p.title.toLowerCase().substring(0, 50) === article.title.toLowerCase().substring(0, 50)
        );
        if (!isDupe) {
          newPosts.push({ id: generateId([...existingPosts, ...newPosts]), ...article, date: today });
          console.log(`✅ Added: ${article.title.substring(0, 60)}...`);
        } else {
          console.log(`⏭️ Skipped duplicate`);
        }
      }
    } catch (e) {
      console.error(`❌ Error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const allPosts = [...newPosts, ...existingPosts].slice(0, MAX_POSTS);
  allPosts.forEach((p, i) => { p.id = i + 1; });
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));
  console.log(`\n✨ Articles: ${allPosts.length} total, ${newPosts.length} new`);

  // Interview questions
  console.log('\n📚 Fetching interviews...\n');
  const existingInterviews = loadJson(INTERVIEWS_FILE);
  const newInterviews = [];

  const shuffledInt = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5).slice(0, 2);

  for (const topic of shuffledInt) {
    console.log(`📡 Fetching: ${topic.category}...`);
    try {
      const response = await callWithRetry(topic.query, INTERVIEW_SYSTEM_PROMPT);
      console.log(`   Response length: ${response.length} chars`);
      const interview = parseInterview(response, topic.category);
      
      if (interview) {
        const isDupe = existingInterviews.some(q => 
          q.question.substring(0, 50).toLowerCase() === interview.question.substring(0, 50).toLowerCase()
        );
        if (!isDupe) {
          newInterviews.push({ id: generateId([...existingInterviews, ...newInterviews]), ...interview, date: today });
          console.log(`✅ Added: ${interview.question.substring(0, 60)}...`);
        } else {
          console.log(`⏭️ Skipped duplicate`);
        }
      }
    } catch (e) {
      console.error(`❌ Error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const allInterviews = [...newInterviews, ...existingInterviews].slice(0, MAX_INTERVIEWS);
  allInterviews.forEach((q, i) => { q.id = i + 1; });
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
  
  console.log(`\n🎯 Interviews: ${allInterviews.length} total, ${newInterviews.length} new`);
  console.log('\n🎉 Done!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
