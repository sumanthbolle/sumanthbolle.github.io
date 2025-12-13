// scripts/fetch-articles.js
// Fetches latest tech articles using Perplexity API and generates posts.json

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';
const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

// Topics to fetch articles about - Optimized for ServiceNow official sources
const TOPICS = [
  {
    query: `Search community.servicenow.com, docs.servicenow.com, and support.servicenow.com for the most recent ServiceNow platform updates published this week. Curate insights relevant to ServiceNow Architects, Implementers, and Developers, covering:
	•	Latest release updates with architectural impact, upgrade considerations, and implementation risks
	•	Platform Health, Impact, and Observability enhancements affecting scalability, performance, and governance decisions
	•	ServiceNow Store app releases and Employee Center improvements, including adoption guidance and extensibility considerations
	•	Security patches, vulnerability fixes, and performance optimizations with implications for enterprise environments
	•	Actionable best practices from ServiceNow Knowledge Base and community posts, highlighting design patterns, configuration guidance, and scripting recommendations`,
    category: "servicenow"
  },
  {
    query: `Search for the latest developments in ServiceNow AI capabilities from docs.servicenow.com and community.servicenow.com. Include:
- Now Assist updates and GenAI features
- AI Control Tower and Predictive Intelligence enhancements
- Virtual Agent AI improvements and NLU updates
- Agent-to-Agent (A2A) protocols and MCP integration
- LLM integration patterns and AI Search capabilities
- Practical implementation examples for ServiceNow developers
Focus on actionable guidance with GlideRecord and Flow Designer examples.`,
    category: "ai"
  },
 {
  query: `Search docs.servicenow.com and community.servicenow.com for current and evolving ServiceNow developer APIs, platform primitives, and core fundamentals used to design, extend, and integrate the Now Platform. Focus on guidance that helps Architects, Implementers, and Developers reason about *how the platform works*, not just *what to configure*, including:

- Core server-side APIs and execution models (GlideRecord, GlideAggregate, GlideQuery, GlideAjax, Scoped APIs, async APIs, transaction boundaries)
- Integration and data-movement APIs (IntegrationHub APIs, RESTMessageV2, Scripted REST frameworks, pagination and rate-control patterns)
- Flow Designer and Automation Engine internals (Flow execution context, subflow reuse, error propagation, rollback behavior)
- Data ingestion and streaming foundations (Stream Connect APIs, Import Set & Transform Engine behavior, ETL scalability considerations)
- Client–server interaction fundamentals (Client Scripts, Script Includes, UI Actions, GlideAjax patterns, async client calls)
- Performance and scale primitives (index usage, query planning, async processing, caching strategies, batch vs transactional execution)
- Security and isolation fundamentals (scoped application boundaries, ACL evaluation order, API access controls)

Present findings as a living developer reference with:
- API intent and lifecycle (when and why the API exists)
- Usage patterns that scale and patterns that break at enterprise volume
- Copy-paste–ready examples tied to real execution contexts
- Anti-patterns that commonly cause performance, security, or upgrade issues.`,
  category: "tutorial"
}
  {
    query: `Search for latest enterprise ITSM trends and ServiceNow digital transformation strategies from community.servicenow.com and industry sources. Include:
- Hyperautomation strategies with ServiceNow
- ITSM modernization and proactive service delivery
- ServiceNow CMDB and Discovery best practices
- IT Operations Management (ITOM) automation patterns
- Workflow automation ROI metrics and case studies
- Low-code/no-code citizen developer enablement
Focus on practical implementation guidance for ServiceNow architects and developers.`,
    category: "general"
  }
];

// Interview question topics - Enhanced for deeper technical questions
const INTERVIEW_TOPICS = [
  {
    query: `Generate a deep technical ServiceNow interview question from topics covered in docs.servicenow.com about:
- GlideRecord vs GlideAggregate performance implications
- Database query optimization and index usage
- Script execution contexts (server vs client vs async)
- Memory management and governor limits
Include a detailed answer with code examples showing correct vs incorrect approaches.`,
    category: "Performance"
  },
  {
    query: `Generate a challenging ServiceNow architecture interview question from docs.servicenow.com covering:
- Business Rule execution order (before/after/async) and race conditions
- Client Script vs UI Policy vs UI Action use cases
- Scoped application design and cross-scope access patterns
- Update Set management and deployment strategies
Include detailed answer explaining the "why" behind best practices.`,
    category: "Architecture"
  },
  {
    query: `Generate an expert-level ServiceNow interview question about integration patterns from docs.servicenow.com:
- Integration Hub vs Scripted REST vs Import Sets decision tree
- Flow Designer error handling and retry patterns
- Outbound REST message authentication methods
- MID Server architecture and use cases
- Stream Connect vs Table API for high-volume integrations
Include code examples and performance considerations.`,
    category: "Integration"
  },
  {
    query: `Generate a difficult ServiceNow security interview question from support.servicenow.com and docs.servicenow.com:
- ACL evaluation order and multiple ACL behavior
- Row-level security with Before Query Business Rules
- Cross-scope privilege and application access controls
- OAuth 2.0 and SSO implementation patterns
- Data encryption and instance security hardening
Include specific scenarios and security best practices.`,
    category: "Security"
  },
  {
    query: `Generate a ServiceNow scripting interview question covering advanced patterns from docs.servicenow.com:
- Script Include design patterns (extending classes, prototype methods)
- GlideAjax client-server communication patterns
- Asynchronous script execution and scheduled jobs
- Transaction handling and database operations
- getValue() vs getDisplayValue() vs dot-walking implications
Include code examples demonstrating proper implementation.`,
    category: "Scripting"
  }
];

// Call Perplexity API for interview questions
function callPerplexityInterview(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: `You are a ServiceNow technical interviewer at Apple/Google/ServiceNow creating questions based on official ServiceNow documentation. Generate ONE challenging interview question with a comprehensive answer.

CRITICAL JSON RULES:
- Return ONLY a valid JSON object, no markdown code blocks
- Use HTML tags: <strong>, <p>, <h4>, <ul>, <li>, <ol>, <pre>
- For code in <pre> tags, use a single line or escape newlines as \\n
- NO markdown like **bold** - use <strong>bold</strong>
- NO citation numbers like [1] or [2]
- NO actual line breaks inside JSON string values - use \\n instead

EXACT FORMAT (single line JSON):
{"question":"Your detailed technical question here","answer":"<h4>Key Concept</h4><p>Explanation with context...</p><h4>Code Example</h4><pre>// Correct approach\\nvar gr = new GlideRecord('incident');\\ngr.addQuery('active', true);\\ngr.query();</pre><h4>Common Mistakes</h4><ul><li>Anti-pattern explanation</li></ul>","difficulty":"Senior","company":"Apple"}

Requirements:
- Question should be specific and test deep understanding
- Answer should be 300-500 words with practical examples
- Include both correct approach AND common mistakes
- Reference ServiceNow best practices from official docs`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    const options = {
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}`));
            return;
          }
          const response = JSON.parse(body);
          if (response.choices && response.choices[0] && response.choices[0].message) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error('Invalid API response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Parse interview question from API response
function parseInterview(response, category) {
  try {
    let cleaned = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    // Fix common JSON issues from API response
    cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/\n/g, '\\n');
    cleaned = cleaned.replace(/\t/g, '\\t');
    
    // Extract JSON object if there's extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    const interview = JSON.parse(cleaned);
    
    // Clean up the answer content
    let answer = interview.answer || '';
    answer = answer.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    answer = answer.replace(/\[\d+\](\[\d+\])*/g, '');
    answer = answer.replace(/\\n/g, '\n');
    
    let question = (interview.question || '').replace(/\[\d+\]/g, '');
    
    return {
      question: question,
      answer: answer,
      difficulty: interview.difficulty || 'Senior',
      company: interview.company || 'ServiceNow',
      category: category
    };
  } catch (e) {
    console.error('Failed to parse interview:', e.message);
    console.log('   Attempting fallback parse...');
    
    // Fallback: try to extract fields manually with regex
    try {
      const questionMatch = response.match(/"question"\s*:\s*"([^"]+)"/);
      const difficultyMatch = response.match(/"difficulty"\s*:\s*"([^"]+)"/);
      const companyMatch = response.match(/"company"\s*:\s*"([^"]+)"/);
      const answerMatch = response.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:difficulty|company|question)"/);
      
      if (questionMatch) {
        console.log('   Fallback parse succeeded!');
        return {
          question: questionMatch[1].replace(/\\n/g, ' ').replace(/\[\d+\]/g, ''),
          answer: answerMatch ? answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '<p>Answer parsing failed - please check source.</p>',
          difficulty: difficultyMatch ? difficultyMatch[1] : 'Senior',
          company: companyMatch ? companyMatch[1] : 'ServiceNow',
          category: category
        };
      }
    } catch (fallbackError) {
      console.log('   Fallback also failed:', fallbackError.message);
    }
    
    return null;
  }
}

// Load existing interviews
function loadExistingInterviews() {
  try {
    if (fs.existsSync(INTERVIEWS_FILE)) {
      return JSON.parse(fs.readFileSync(INTERVIEWS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('No existing interviews.json');
  }
  return [];
}

// Call Perplexity API for articles
function callPerplexity(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: `You are a technical documentation writer creating content for ServiceNow developers, following the style of Apple and Google technical documentation. Generate a blog article based on the latest information from official ServiceNow sources.

CONTENT QUALITY STANDARDS:
- Write like Apple/Google docs: clear, scannable, authoritative
- Include practical code snippets developers can copy-paste
- Explain the "why" not just the "how"
- Structure with clear headings and bullet points
- Include both best practices AND anti-patterns to avoid

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON, no markdown code blocks
- Use HTML tags: <strong>, <em>, <h2>, <h3>, <p>, <ul>, <li>, <ol>, <pre>, <code>
- Do NOT use markdown syntax like **bold** or *italic*
- Do NOT include citation numbers like [1] or [2]
- For code blocks use: <pre>// Comment\\nvar gr = new GlideRecord('table');\\ngr.query();</pre>

Return this exact JSON structure:
{
  "title": "Clear, specific title (not generic)",
  "excerpt": "2-3 sentence summary that explains the value to developers",
  "readTime": "X min read",
  "content": "<h2>Overview</h2><p>Context and why this matters...</p><h2>Implementation</h2><p>Step by step guidance...</p><pre>// Code example</pre><h2>Best Practices</h2><ul><li>Key recommendation</li></ul><h2>Common Pitfalls</h2><ul><li>What to avoid</li></ul>"
}

Write 500-800 words of practical, actionable content. Every article should have code examples where applicable.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 3000,
      temperature: 0.7
    });

    const options = {
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          console.log(`   API Status: ${res.statusCode}`);
          
          if (res.statusCode !== 200) {
            console.log(`   API Error Response: ${body.substring(0, 500)}`);
            reject(new Error(`API returned status ${res.statusCode}`));
            return;
          }
          
          const response = JSON.parse(body);
          
          if (response.choices && response.choices[0] && response.choices[0].message) {
            resolve(response.choices[0].message.content);
          } else if (response.error) {
            console.log(`   API Error: ${JSON.stringify(response.error)}`);
            reject(new Error(response.error.message || 'API error'));
          } else {
            console.log(`   Unexpected response structure: ${JSON.stringify(response).substring(0, 300)}`);
            reject(new Error('Invalid API response structure'));
          }
        } catch (e) {
          console.log(`   Parse error: ${e.message}`);
          console.log(`   Raw response: ${body.substring(0, 500)}`);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`   Request error: ${e.message}`);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

// Parse article JSON from API response
function parseArticle(response, category) {
  try {
    // Clean up response - remove markdown code blocks if present
    let cleaned = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const article = JSON.parse(cleaned);
    
    // Clean up the content
    let content = article.content || '<p>Content not available.</p>';
    
    // Convert any remaining markdown to HTML
    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Remove citation references
    content = content.replace(/\[\d+\](\[\d+\])*/g, '');
    
    // Remove any leftover markdown links
    content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Fix common encoding issues
    content = content
      .replace(/—/g, '—')
      .replace(/–/g, '–')
      .replace(/'/g, "'")
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/…/g, '...')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Clean up excerpt
    let excerpt = article.excerpt || '';
    excerpt = excerpt.replace(/\*\*([^*]+)\*\*/g, '$1');
    excerpt = excerpt.replace(/\[\d+\](\[\d+\])*/g, '');
    
    return {
      title: (article.title || 'Untitled Article').replace(/\[\d+\]/g, ''),
      excerpt: excerpt,
      readTime: article.readTime || '5 min read',
      content: content,
      category: category
    };
  } catch (e) {
    console.error('Failed to parse article:', e.message);
    return null;
  }
}

// Load existing posts
function loadExistingPosts() {
  try {
    if (fs.existsSync(POSTS_FILE)) {
      return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('No existing posts.json or invalid format');
  }
  return [];
}

// Generate unique ID
function generateId(existingItems) {
  const maxId = existingItems.reduce((max, item) => Math.max(max, item.id || 0), 0);
  return maxId + 1;
}

// Format today's date
function formatDate() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Main function
async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not set!');
    console.error('   Make sure you added the secret in GitHub repo settings.');
    process.exit(1);
  }

  // Show masked key to confirm it's loaded
  const maskedKey = PERPLEXITY_API_KEY.substring(0, 8) + '...' + PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4);
  console.log(`🔑 API Key loaded: ${maskedKey}`);
  console.log('🚀 Fetching latest tech articles from ServiceNow sources...\n');
  
  const existingPosts = loadExistingPosts();
  const newPosts = [];
  const today = formatDate();

  // Pick 2 random topics to fetch today (to vary content)
  const shuffled = [...TOPICS].sort(() => Math.random() - 0.5);
  const todaysTopics = shuffled.slice(0, 2);

  for (const topic of todaysTopics) {
    console.log(`📡 Fetching: ${topic.category}...`);
    
    try {
      const response = await callPerplexity(topic.query);
      const article = parseArticle(response, topic.category);
      
      if (article) {
        // Check for duplicate titles (case-insensitive, first 50 chars)
        const isDuplicate = existingPosts.some(
          p => p.title.toLowerCase().substring(0, 50) === article.title.toLowerCase().substring(0, 50)
        );
        
        if (!isDuplicate) {
          newPosts.push({
            id: generateId([...existingPosts, ...newPosts]),
            ...article,
            date: today
          });
          console.log(`✅ Added: ${article.title.substring(0, 60)}...`);
        } else {
          console.log(`⏭️ Skipped duplicate: ${article.title.substring(0, 50)}...`);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${topic.category}:`, e.message);
    }
    
    // Rate limiting - wait between requests
    await new Promise(r => setTimeout(r, 2500));
  }

  // Merge new posts at the beginning (newest first)
  const allPosts = [...newPosts, ...existingPosts].slice(0, MAX_POSTS);
  
  // Re-index IDs
  allPosts.forEach((post, index) => {
    post.id = index + 1;
  });

  // Save to posts.json
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));
  
  console.log(`\n✨ Articles Done! Total: ${allPosts.length}, New: ${newPosts.length}`);

  // ============ FETCH INTERVIEW QUESTIONS ============
  console.log('\n📚 Fetching interview questions...\n');
  
  const existingInterviews = loadExistingInterviews();
  const newInterviews = [];

  // Pick 1-2 random interview topics
  const shuffledInterviews = [...INTERVIEW_TOPICS].sort(() => Math.random() - 0.5);
  const todaysInterviewTopics = shuffledInterviews.slice(0, 2);

  for (const interviewTopic of todaysInterviewTopics) {
    console.log(`📡 Fetching: ${interviewTopic.category} question...`);
    
    try {
      const response = await callPerplexityInterview(interviewTopic.query);
      const interview = parseInterview(response, interviewTopic.category);
      
      if (interview) {
        // Check for duplicate questions
        const isDuplicate = existingInterviews.some(
          q => q.question.substring(0, 50).toLowerCase() === interview.question.substring(0, 50).toLowerCase()
        );
        
        if (!isDuplicate) {
          newInterviews.push({
            id: generateId([...existingInterviews, ...newInterviews]),
            ...interview,
            date: today
          });
          console.log(`✅ Added: ${interview.question.substring(0, 60)}...`);
        } else {
          console.log(`⏭️ Skipped duplicate question`);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching interview:`, e.message);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 2500));
  }

  // Merge interviews
  const allInterviews = [...newInterviews, ...existingInterviews].slice(0, MAX_INTERVIEWS);
  allInterviews.forEach((q, index) => { q.id = index + 1; });
  
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
  
  console.log(`\n🎯 Interviews Done! Total: ${allInterviews.length}, New: ${newInterviews.length}`);
  console.log('\n🎉 All updates complete!');
}

main().catch(console.error);
