// scripts/fetch-articles.js
// Fetches latest tech articles using Perplexity API and generates posts.json

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';
const MAX_POSTS = 20;
const MAX_INTERVIEWS = 15;

// Interview question topics
const INTERVIEW_TOPICS = [
  {
    query: "Generate a deep technical ServiceNow interview question about GlideRecord performance optimization, database queries, or script efficiency that would be asked at Apple, Google, or ServiceNow for senior developers",
    category: "Performance"
  },
  {
    query: "Generate a challenging ServiceNow architecture interview question about Business Rules, ACLs, scoped applications, or client-server interactions that top tech companies ask",
    category: "Architecture"
  },
  {
    query: "Generate an expert-level ServiceNow interview question about Flow Designer, Integration Hub, REST APIs, or asynchronous processing patterns",
    category: "Integration"
  },
  {
    query: "Generate a difficult ServiceNow security interview question about ACL evaluation, data isolation, cross-scope access, or authentication that FAANG companies ask",
    category: "Security"
  }
];

// Topics to fetch articles about
const TOPICS = [
  {
    query: "Latest ServiceNow platform updates, new features, and best practices released this week",
    category: "servicenow"
  },
  {
    query: "Latest developments in enterprise AI, GenAI, LLMs, and AI agents for business automation this week",
    category: "ai"
  },
  {
    query: "New ServiceNow integration patterns, Flow Designer tips, and Integration Hub updates",
    category: "tutorial"
  },
  {
    query: "Latest trends in enterprise automation, ITSM, and digital transformation",
    category: "general"
  }
];

// Call Perplexity API for interview questions
function callPerplexityInterview(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: `You are a ServiceNow technical interviewer at a top tech company (Apple, Google, ServiceNow). Generate ONE challenging interview question with a comprehensive answer.

CRITICAL RULES:
- Return ONLY valid JSON, no markdown code blocks
- Use HTML for formatting: <strong>, <p>, <h4>, <ul>, <li>, <ol>, <pre>, <code>
- Do NOT use markdown like **bold** or [citations]
- Include code examples in <pre> tags
- Make the question genuinely difficult - test deep platform knowledge

Return this exact JSON structure:
{"question": "The interview question text", "answer": "<p>Detailed answer with explanation...</p><h4>Code Example:</h4><pre>// code here</pre><ul><li>Key point</li></ul>", "difficulty": "Senior or Expert", "company": "Apple or Google or ServiceNow"}

The answer should be 300-500 words, technically accurate, with practical code examples.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.8
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
    let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const interview = JSON.parse(cleaned);
    
    let answer = interview.answer || '';
    answer = answer.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    answer = answer.replace(/\[\d+\](\[\d+\])*/g, '');
    
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

// Call Perplexity API
function callPerplexity(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: `You are a tech blog writer for ServiceNow developers. Generate a blog article based on the latest information.

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON, no markdown code blocks
- Use HTML tags for formatting: <strong>, <em>, <h2>, <p>, <ul>, <li>, <pre>
- Do NOT use markdown syntax like **bold** or *italic*
- Do NOT include citation numbers like [1] or [2]
- Do NOT include source references in the content

Return this exact JSON structure:
{"title": "Clear descriptive title", "excerpt": "2-3 sentence summary without citations", "readTime": "X min read", "content": "<h2>Section</h2><p>Paragraph content here...</p><ul><li>Point one</li></ul>"}

Write 400-600 words of practical, actionable content for ServiceNow developers.`
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
    
    // Convert markdown bold **text** to HTML <strong>text</strong>
    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert markdown italic *text* to HTML <em>text</em>
    content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Remove citation references like [1], [2], [1][2], etc.
    content = content.replace(/\[\d+\](\[\d+\])*/g, '');
    
    // Remove any leftover markdown links [text](url)
    content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Fix common encoding issues
    content = content
      .replace(/—/g, '—')
      .replace(/–/g, '–')
      .replace(/'/g, "'")
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/…/g, '...')
      .replace(/\u00A0/g, ' ')  // Non-breaking space
      .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width chars
    
    // Clean up excerpt too
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
function generateId(existingPosts) {
  const maxId = existingPosts.reduce((max, p) => Math.max(max, p.id || 0), 0);
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
  console.log('🚀 Fetching latest tech articles...\n');
  
  const existingPosts = loadExistingPosts();
  const newPosts = [];
  const today = formatDate();

  // Pick 1-2 random topics to fetch today (to vary content)
  const shuffled = TOPICS.sort(() => Math.random() - 0.5);
  const todaysTopics = shuffled.slice(0, 2);

  for (const topic of todaysTopics) {
    console.log(`📡 Fetching: ${topic.category}...`);
    
    try {
      const response = await callPerplexity(topic.query);
      const article = parseArticle(response, topic.category);
      
      if (article) {
        // Check for duplicate titles
        const isDuplicate = existingPosts.some(
          p => p.title.toLowerCase() === article.title.toLowerCase()
        );
        
        if (!isDuplicate) {
          newPosts.push({
            id: generateId([...existingPosts, ...newPosts]),
            ...article,
            date: today
          });
          console.log(`✅ Added: ${article.title}`);
        } else {
          console.log(`⏭️ Skipped duplicate: ${article.title}`);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${topic.category}:`, e.message);
    }
    
    // Rate limiting - wait between requests
    await new Promise(r => setTimeout(r, 2000));
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

  // Pick 1 random interview topic
  const interviewTopic = INTERVIEW_TOPICS[Math.floor(Math.random() * INTERVIEW_TOPICS.length)];
  
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

  // Merge interviews
  const allInterviews = [...newInterviews, ...existingInterviews].slice(0, MAX_INTERVIEWS);
  allInterviews.forEach((q, index) => { q.id = index + 1; });
  
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
  
  console.log(`\n🎯 Interviews Done! Total: ${allInterviews.length}, New: ${newInterviews.length}`);
  console.log('\n🎉 All updates complete!');
}

main().catch(console.error);
