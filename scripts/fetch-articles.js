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
      model: "llama-3.1-sonar-large-128k-online",
      messages: [
        {
          role: "system",
          content: `You are a tech blog writer specializing in ServiceNow and Enterprise AI. 
          Generate a well-structured blog article based on the latest information.
          
          Return ONLY valid JSON in this exact format (no markdown, no code blocks):
          {
            "title": "Compelling article title",
            "excerpt": "2-3 sentence summary for preview card",
            "readTime": "X min read",
            "content": "<h2>Section</h2><p>Paragraph with details...</p><h2>Another Section</h2><p>More content...</p><ul><li>Key point 1</li><li>Key point 2</li></ul>"
          }
          
          Make the content informative, practical, and valuable for ServiceNow developers.
          Include specific details, code examples where relevant, and actionable insights.
          Content should be 400-600 words in HTML format.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      return_citations: true
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
          const response = JSON.parse(body);
          if (response.choices && response.choices[0]) {
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
    process.exit(1);
  }

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
