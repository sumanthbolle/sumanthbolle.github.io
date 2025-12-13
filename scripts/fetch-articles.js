// scripts/fetch-articles.js
// Fetches latest tech articles using Perplexity API and generates posts.json

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';
const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

// Simplified, focused prompts for faster + complete responses
const TOPICS = [
  {
    query: `Write about latest ServiceNow platform updates: release notes, security patches, performance fixes. Include 2-3 code examples.`,
    category: "servicenow"
  },
  {
    query: `Write about ServiceNow AI features: Now Assist, Predictive Intelligence, Virtual Agent. Include 2 code examples.`,
    category: "ai"
  },
  {
    query: `Write about ServiceNow core APIs: GlideRecord, GlideAggregate, RESTMessageV2. Include 3 practical code examples.`,
    category: "tutorial"
  },
  {
    query: `Write about ServiceNow ITSM automation: CMDB best practices, workflow optimization. Include 2 code examples.`,
    category: "general"
  }
];

const INTERVIEW_TOPICS = [
  { query: `Create one ServiceNow interview question about GlideRecord vs GlideAggregate performance. Include code example in answer.`, category: "Performance" },
  { query: `Create one ServiceNow interview question about Business Rule execution order and when to use each type.`, category: "Architecture" },
  { query: `Create one ServiceNow interview question about Integration Hub vs Scripted REST APIs. Include code example.`, category: "Integration" },
  { query: `Create one ServiceNow interview question about ACL evaluation and security best practices.`, category: "Security" },
  { query: `Create one ServiceNow interview question about Script Include patterns and GlideAjax. Include code example.`, category: "Scripting" }
];

// ============ ROBUST PARSING ============

/**
 * Extract a JSON field value, handling multi-line content
 */
function extractField(text, fieldName) {
  // Pattern: "fieldName": "content" where content may span multiple lines
  // We need to find the opening quote and then find the closing quote
  // accounting for escaped quotes inside
  
  const fieldStart = text.indexOf(`"${fieldName}"`);
  if (fieldStart === -1) return null;
  
  // Find the colon and opening quote
  const colonPos = text.indexOf(':', fieldStart);
  if (colonPos === -1) return null;
  
  const openQuote = text.indexOf('"', colonPos + 1);
  if (openQuote === -1) return null;
  
  // Now find the closing quote (not escaped)
  let i = openQuote + 1;
  let value = '';
  while (i < text.length) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      // Escaped character - include both
      value += char + text[i + 1];
      i += 2;
    } else if (char === '"') {
      // End of string
      break;
    } else {
      value += char;
      i++;
    }
  }
  
  // Unescape the value
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Validate content is complete (not truncated mid-sentence)
 */
function isContentComplete(content) {
  if (!content || content.length < 100) return false;
  
  const trimmed = content.trim();
  
  // Check for obvious truncation signs
  const badEndings = ['\\', 'such as', 'including', 'for example', 'e.g.', 'i.e.', 'the following', 'contains'];
  const lowerEnd = trimmed.slice(-50).toLowerCase();
  
  for (const bad of badEndings) {
    if (lowerEnd.endsWith(bad)) return false;
  }
  
  // Should end with proper punctuation or closing tag
  const goodEndings = ['.', '!', '?', '>', '"', "'", ')', ']', '}'];
  const lastChar = trimmed.slice(-1);
  
  // Also check if it ends with a closing HTML tag
  if (trimmed.endsWith('</p>') || trimmed.endsWith('</ul>') || 
      trimmed.endsWith('</ol>') || trimmed.endsWith('</pre>') ||
      trimmed.endsWith('</li>') || trimmed.endsWith('</h2>') ||
      trimmed.endsWith('</h3>') || trimmed.endsWith('</h4>')) {
    return true;
  }
  
  return goodEndings.includes(lastChar);
}

/**
 * Try to fix truncated content by adding proper closure
 */
function fixTruncatedContent(content) {
  if (!content) return content;
  
  let fixed = content.trim();
  
  // Remove trailing backslash or incomplete escape
  if (fixed.endsWith('\\')) {
    fixed = fixed.slice(0, -1);
  }
  
  // Close any unclosed HTML tags (simple version)
  const openTags = [];
  const tagRegex = /<(\/?)(pre|p|ul|ol|li|h[234]|strong|em|code)[^>]*>/gi;
  let match;
  
  while ((match = tagRegex.exec(fixed)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    
    if (isClosing) {
      // Remove from stack if matching
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) openTags.splice(idx, 1);
    } else {
      openTags.push(tagName);
    }
  }
  
  // Close unclosed tags in reverse order
  for (let i = openTags.length - 1; i >= 0; i--) {
    fixed += `</${openTags[i]}>`;
  }
  
  // If it doesn't end with punctuation, add ellipsis
  if (fixed.length > 0 && !'.!?>'.includes(fixed.slice(-1))) {
    // Find last complete sentence
    const lastPeriod = Math.max(fixed.lastIndexOf('. '), fixed.lastIndexOf('.</'));
    if (lastPeriod > fixed.length * 0.7) {
      // Truncate to last complete sentence
      fixed = fixed.substring(0, lastPeriod + 1);
      // Re-close tags after truncation
      const stillOpen = [];
      tagRegex.lastIndex = 0;
      while ((match = tagRegex.exec(fixed)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2].toLowerCase();
        if (isClosing) {
          const idx = stillOpen.lastIndexOf(tagName);
          if (idx !== -1) stillOpen.splice(idx, 1);
        } else {
          stillOpen.push(tagName);
        }
      }
      for (let i = stillOpen.length - 1; i >= 0; i--) {
        fixed += `</${stillOpen[i]}>`;
      }
    }
  }
  
  return fixed;
}

/**
 * Parse article from API response
 */
function parseArticle(response, category) {
  console.log('   Parsing article...');
  
  // Clean response
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Try JSON parse first
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Fix newlines in string values
      let jsonStr = jsonMatch[0]
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // Try to fix newlines inside strings
      jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
        const fixed = content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t');
        return `"${fixed}"`;
      });
      
      const data = JSON.parse(jsonStr);
      
      let content = data.content || '';
      if (!isContentComplete(content)) {
        console.log('   Content appears truncated, attempting fix...');
        content = fixTruncatedContent(content);
      }
      
      // Clean content
      content = content
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[\d+\]/g, '');
      
      return {
        title: (data.title || 'Untitled').replace(/\[\d+\]/g, ''),
        excerpt: (data.excerpt || '').replace(/\[\d+\]/g, ''),
        readTime: data.readTime || '5 min read',
        content,
        category
      };
    }
  } catch (e) {
    console.log(`   JSON parse failed: ${e.message}`);
  }
  
  // Fallback: extract fields manually
  console.log('   Using field extraction fallback...');
  
  const title = extractField(cleaned, 'title');
  const excerpt = extractField(cleaned, 'excerpt');
  const readTime = extractField(cleaned, 'readTime');
  let content = extractField(cleaned, 'content');
  
  if (title && content) {
    if (!isContentComplete(content)) {
      console.log('   Content appears truncated, attempting fix...');
      content = fixTruncatedContent(content);
    }
    
    console.log('   Field extraction succeeded!');
    return {
      title: title.replace(/\[\d+\]/g, ''),
      excerpt: excerpt || '',
      readTime: readTime || '5 min read',
      content: content.replace(/\[\d+\]/g, ''),
      category
    };
  }
  
  console.log('   All parsing methods failed');
  return null;
}

/**
 * Parse interview from API response
 */
function parseInterview(response, category) {
  console.log('   Parsing interview...');
  
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Try JSON parse first
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0]
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
        const fixed = content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t');
        return `"${fixed}"`;
      });
      
      const data = JSON.parse(jsonStr);
      
      let answer = data.answer || '';
      if (!isContentComplete(answer)) {
        answer = fixTruncatedContent(answer);
      }
      
      return {
        question: (data.question || '').replace(/\[\d+\]/g, ''),
        answer: answer.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[\d+\]/g, ''),
        difficulty: data.difficulty || 'Senior',
        company: data.company || 'ServiceNow',
        category
      };
    }
  } catch (e) {
    console.log(`   JSON parse failed: ${e.message}`);
  }
  
  // Fallback: extract fields
  console.log('   Using field extraction fallback...');
  
  const question = extractField(cleaned, 'question');
  let answer = extractField(cleaned, 'answer');
  const difficulty = extractField(cleaned, 'difficulty');
  const company = extractField(cleaned, 'company');
  
  if (question) {
    if (answer && !isContentComplete(answer)) {
      answer = fixTruncatedContent(answer);
    }
    
    console.log('   Field extraction succeeded!');
    return {
      question: question.replace(/\[\d+\]/g, ''),
      answer: answer || '<p>Answer not available.</p>',
      difficulty: difficulty || 'Senior',
      company: company || 'ServiceNow',
      category
    };
  }
  
  console.log('   All parsing methods failed');
  return null;
}

// ============ API CALL ============

function callPerplexity(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('API timeout after 90s'));
    }, 90000);
    
    const data = JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: 3500,  // Increased for complete responses
      temperature: 0.6   // Slightly lower for more consistent formatting
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
            reject(new Error(`API status ${res.statusCode}: ${body.substring(0, 200)}`));
            return;
          }
          const response = JSON.parse(body);
          if (response.choices?.[0]?.message?.content) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error('Invalid API response structure'));
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

async function callWithRetry(prompt, systemPrompt, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) console.log(`   Retry ${attempt}/${maxRetries}...`);
      return await callPerplexity(prompt, systemPrompt);
    } catch (e) {
      console.log(`   Attempt ${attempt} failed: ${e.message}`);
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// System prompts - emphasize complete, valid JSON
const ARTICLE_PROMPT = `You are a ServiceNow technical writer. Generate a blog article.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep content between 400-600 words (not too long)
3. MUST end content with a complete sentence and closing </p> or </ul> tag
4. Use HTML: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>
5. For code: <pre>var gr = new GlideRecord('table');\\ngr.query();</pre>
6. No [1] citations, no **markdown**

JSON format:
{"title":"Specific Title Here","excerpt":"2-3 sentence summary.","readTime":"5 min read","content":"<h2>Overview</h2><p>Introduction paragraph.</p><h2>Details</h2><p>Main content here.</p><h2>Conclusion</h2><p>Summary and next steps.</p>"}`;

const INTERVIEW_PROMPT = `You are a ServiceNow interviewer. Create ONE technical interview question.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Keep answer between 200-350 words
3. MUST end answer with complete sentence and closing tag
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. For code: <pre>// example\\nvar gr = new GlideRecord('incident');</pre>
6. No [1] citations, no **markdown**

JSON format:
{"question":"Your specific technical question here?","answer":"<h4>Key Concept</h4><p>Explanation.</p><pre>// code example</pre><p>Summary point.</p>","difficulty":"Senior","company":"ServiceNow"}`;

// ============ FILE OPS ============

function loadJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.log(`Could not load ${file}`); }
  return [];
}

function formatDate() {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date();
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ============ MAIN ============

async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not set!');
    process.exit(1);
  }

  console.log(`🔑 API Key: ${PERPLEXITY_API_KEY.substring(0, 8)}...${PERPLEXITY_API_KEY.slice(-4)}`);
  console.log('🚀 Fetching content (1 article + 1 interview)...\n');
  
  const today = formatDate();

  // ===== FETCH 1 ARTICLE =====
  const existingPosts = loadJson(POSTS_FILE);
  const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5);
  const topic = shuffledTopics[0];  // Just 1 topic
  
  console.log(`📡 Article: ${topic.category}...`);
  let newArticle = null;
  
  try {
    const response = await callWithRetry(topic.query, ARTICLE_PROMPT);
    console.log(`   Response: ${response.length} chars`);
    const article = parseArticle(response, topic.category);
    
    if (article) {
      const isDupe = existingPosts.some(p => 
        p.title.toLowerCase().substring(0, 40) === article.title.toLowerCase().substring(0, 40)
      );
      if (!isDupe) {
        newArticle = { id: 1, ...article, date: today };
        console.log(`✅ Article: ${article.title.substring(0, 55)}...`);
      } else {
        console.log(`⏭️ Duplicate article, skipped`);
      }
    }
  } catch (e) {
    console.error(`❌ Article error: ${e.message}`);
  }

  // Save articles
  let allPosts = existingPosts;
  if (newArticle) {
    allPosts = [newArticle, ...existingPosts].slice(0, MAX_POSTS);
  }
  allPosts.forEach((p, i) => { p.id = i + 1; });
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));
  console.log(`📝 Articles: ${allPosts.length} total\n`);

  // Wait before next API call
  await new Promise(r => setTimeout(r, 3000));

  // ===== FETCH 1 INTERVIEW =====
  const existingInterviews = loadJson(INTERVIEWS_FILE);
  const shuffledInt = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5);
  const intTopic = shuffledInt[0];  // Just 1 topic
  
  console.log(`📡 Interview: ${intTopic.category}...`);
  let newInterview = null;
  
  try {
    const response = await callWithRetry(intTopic.query, INTERVIEW_PROMPT);
    console.log(`   Response: ${response.length} chars`);
    const interview = parseInterview(response, intTopic.category);
    
    if (interview) {
      const isDupe = existingInterviews.some(q => 
        q.question.substring(0, 40).toLowerCase() === interview.question.substring(0, 40).toLowerCase()
      );
      if (!isDupe) {
        newInterview = { id: 1, ...interview, date: today };
        console.log(`✅ Interview: ${interview.question.substring(0, 55)}...`);
      } else {
        console.log(`⏭️ Duplicate question, skipped`);
      }
    }
  } catch (e) {
    console.error(`❌ Interview error: ${e.message}`);
  }

  // Save interviews
  let allInterviews = existingInterviews;
  if (newInterview) {
    allInterviews = [newInterview, ...existingInterviews].slice(0, MAX_INTERVIEWS);
  }
  allInterviews.forEach((q, i) => { q.id = i + 1; });
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
  console.log(`📝 Interviews: ${allInterviews.length} total`);

  console.log('\n🎉 Done!');
}

main().then(() => {
  // Run validation after fetching
  console.log('\n🔍 Running content validation...\n');
  const { execSync } = require('child_process');
  try {
    execSync('node scripts/validate-content.js', { stdio: 'inherit' });
  } catch (e) {
    console.error('Validation script failed:', e.message);
  }
}).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
