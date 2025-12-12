// scripts/fetch-articles.js
// Fetches latest tech articles using Perplexity API and generates posts.json

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const MAX_POSTS = 20; // Keep last 20 articles

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

// Call Perplexity API
function callPerplexity(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "sonar",  // Updated model name
      messages: [
        {
          role: "system",
          content: `You are a tech blog writer specializing in ServiceNow and Enterprise AI. 
          Generate a well-structured blog article based on the latest information.
          
          Return ONLY valid JSON in this exact format (no markdown, no code blocks, no extra text):
          {"title": "Article title", "excerpt": "2-3 sentence summary", "readTime": "X min read", "content": "<h2>Section</h2><p>Content...</p>"}
          
          Make content informative and valuable for ServiceNow developers. 400-600 words in HTML.`
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
    
    return {
      title: article.title || 'Untitled Article',
      excerpt: article.excerpt || '',
      readTime: article.readTime || '5 min read',
      content: article.content || '<p>Content not available.</p>',
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
  
  console.log(`\n✨ Done! Total posts: ${allPosts.length}`);
  console.log(`📝 New articles added: ${newPosts.length}`);
}

main().catch(console.error);
