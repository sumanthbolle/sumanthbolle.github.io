// scripts/validate-content.js
// Validates posts.json and interviews.json, auto-fixes issues via Perplexity API

const fs = require('fs');
const https = require('https');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

// ============ VALIDATION RULES ============

const VALIDATION_RULES = {
  posts: {
    requiredFields: ['id', 'title', 'excerpt', 'content', 'category', 'date', 'readTime'],
    minContentLength: 800,
    minExcerptLength: 50,
    maxTitleLength: 150,
    mustEndProperly: true,
    mustHaveCodeExample: ['tutorial', 'servicenow'], // Categories that should have code
  },
  interviews: {
    requiredFields: ['id', 'question', 'answer', 'difficulty', 'company', 'category', 'date'],
    minAnswerLength: 300,
    minQuestionLength: 50,
    mustEndProperly: true,
  }
};

// ============ VALIDATION FUNCTIONS ============

/**
 * Check if content ends properly (not truncated)
 */
function isContentComplete(content) {
  if (!content || content.length < 100) return false;
  
  const trimmed = content.trim();
  
  // Check for obvious truncation signs
  const badEndings = [
    '\\', 'such as', 'including', 'for example', 'e.g.', 'i.e.', 
    'the following', 'contains', 'like', 'with', 'and', 'or',
    'to', 'in', 'on', 'at', 'by', 'for', ':', ','
  ];
  
  const lastChars = trimmed.slice(-30).toLowerCase();
  for (const bad of badEndings) {
    if (lastChars.endsWith(bad) || lastChars.endsWith(bad + ' ')) {
      return false;
    }
  }
  
  // Check for unclosed HTML tags
  const openTags = (trimmed.match(/<(pre|p|ul|ol|li|h[234]|strong|em|code)(?:\s[^>]*)?>/gi) || []).length;
  const closeTags = (trimmed.match(/<\/(pre|p|ul|ol|li|h[234]|strong|em|code)>/gi) || []).length;
  if (openTags > closeTags + 2) return false; // Allow small imbalance
  
  // Should end with proper punctuation or closing tag
  const goodEndings = ['.', '!', '?', '>', '"', "'", ')', ']', '}'];
  const lastChar = trimmed.slice(-1);
  
  if (trimmed.endsWith('</p>') || trimmed.endsWith('</ul>') || 
      trimmed.endsWith('</ol>') || trimmed.endsWith('</pre>') ||
      trimmed.endsWith('</li>') || trimmed.endsWith('</h2>') ||
      trimmed.endsWith('</h3>') || trimmed.endsWith('</h4>')) {
    return true;
  }
  
  return goodEndings.includes(lastChar);
}

/**
 * Check if content has code examples
 */
function hasCodeExample(content) {
  return content.includes('<pre>') || content.includes('<code>');
}

/**
 * Check if content covers promised topics (basic check)
 */
function checkTopicCoverage(title, excerpt, content) {
  const issues = [];
  
  // Extract key terms from title and excerpt
  const promisedTerms = [];
  
  // Common patterns that indicate promises
  const patterns = [
    /complete guide/i,
    /comprehensive/i,
    /in-depth/i,
    /everything you need/i,
    /from .* to .*/i,
  ];
  
  const isComprehensivePromise = patterns.some(p => p.test(title) || p.test(excerpt));
  
  if (isComprehensivePromise && content.length < 2000) {
    issues.push('Title/excerpt promises comprehensive coverage but content is too short');
  }
  
  // Check if excerpt topics are covered in content
  const excerptLower = excerpt.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Extract topic keywords from excerpt
  const topicMatches = excerptLower.match(/\b(gliderecord|glideaggregate|flow designer|integration hub|acl|security|performance|api|rest|soap|cmdb|itsm|itom|ai|genai|now assist|virtual agent|predictive intelligence)\b/gi) || [];
  
  for (const topic of [...new Set(topicMatches)]) {
    if (!contentLower.includes(topic.toLowerCase())) {
      issues.push(`Excerpt mentions "${topic}" but content doesn't cover it`);
    }
  }
  
  return issues;
}

/**
 * Validate a single post
 */
function validatePost(post) {
  const issues = [];
  const rules = VALIDATION_RULES.posts;
  
  // Check required fields
  for (const field of rules.requiredFields) {
    if (!post[field]) {
      issues.push({ type: 'missing_field', field, severity: 'critical' });
    }
  }
  
  if (!post.content) return { valid: false, issues, fixable: false };
  
  // Check content length
  if (post.content.length < rules.minContentLength) {
    issues.push({ 
      type: 'content_too_short', 
      current: post.content.length, 
      required: rules.minContentLength,
      severity: 'critical'
    });
  }
  
  // Check excerpt length
  if (post.excerpt && post.excerpt.length < rules.minExcerptLength) {
    issues.push({ type: 'excerpt_too_short', severity: 'warning' });
  }
  
  // Check for truncation
  if (!isContentComplete(post.content)) {
    issues.push({ type: 'content_truncated', severity: 'critical' });
  }
  
  // Check for code examples in technical categories
  if (rules.mustHaveCodeExample.includes(post.category) && !hasCodeExample(post.content)) {
    issues.push({ type: 'missing_code_example', severity: 'critical' });
  }
  
  // Check topic coverage
  const topicIssues = checkTopicCoverage(post.title, post.excerpt, post.content);
  for (const issue of topicIssues) {
    issues.push({ type: 'incomplete_coverage', detail: issue, severity: 'critical' });
  }
  
  // Check for invalid JSON-breaking characters
  if (post.content.includes('\u0000') || post.content.includes('\u001F')) {
    issues.push({ type: 'invalid_characters', severity: 'critical' });
  }
  
  const hasCritical = issues.some(i => i.severity === 'critical');
  
  return {
    valid: issues.length === 0,
    issues,
    fixable: issues.some(i => 
      ['content_truncated', 'content_too_short', 'incomplete_coverage', 'missing_code_example'].includes(i.type)
    )
  };
}

/**
 * Validate a single interview
 */
function validateInterview(interview) {
  const issues = [];
  const rules = VALIDATION_RULES.interviews;
  
  // Check required fields
  for (const field of rules.requiredFields) {
    if (!interview[field]) {
      issues.push({ type: 'missing_field', field, severity: 'critical' });
    }
  }
  
  if (!interview.answer) return { valid: false, issues, fixable: false };
  
  // Check answer length
  if (interview.answer.length < rules.minAnswerLength) {
    issues.push({ 
      type: 'answer_too_short', 
      current: interview.answer.length, 
      required: rules.minAnswerLength,
      severity: 'critical'
    });
  }
  
  // Check question length
  if (interview.question && interview.question.length < rules.minQuestionLength) {
    issues.push({ type: 'question_too_short', severity: 'warning' });
  }
  
  // Check for truncation
  if (!isContentComplete(interview.answer)) {
    issues.push({ type: 'answer_truncated', severity: 'critical' });
  }
  
  const hasCritical = issues.some(i => i.severity === 'critical');
  
  return {
    valid: issues.length === 0,
    issues,
    fixable: hasCritical && issues.some(i => 
      ['answer_truncated', 'answer_too_short'].includes(i.type)
    )
  };
}

// ============ FIX FUNCTIONS ============

/**
 * Call Perplexity to fix/complete content
 */
function callPerplexityFix(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API timeout')), 90000);
    
    const data = JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: 4000,
      temperature: 0.6
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

/**
 * Fix a truncated/incomplete post
 */
async function fixPost(post, issues) {
  console.log(`   🔧 Fixing post: ${post.title.substring(0, 50)}...`);
  
  const issueTypes = issues.map(i => i.type);
  
  const systemPrompt = `You are a ServiceNow technical writer. You need to complete/fix an article that has issues.

CRITICAL RULES:
1. Return ONLY the fixed content field - no JSON wrapper, no markdown blocks
2. Use HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>
3. For code: <pre>var gr = new GlideRecord('table');\\ngr.query();</pre>
4. MUST end with a complete sentence and proper closing tags
5. Content should be 600-1000 words total
6. Include code examples where relevant
7. No [1] citations, no **markdown**`;

  let prompt = '';
  
  if (issueTypes.includes('content_truncated') || issueTypes.includes('content_too_short')) {
    prompt = `This ServiceNow article is incomplete/truncated. Complete it properly.

TITLE: ${post.title}
EXCERPT: ${post.excerpt}
CATEGORY: ${post.category}

CURRENT CONTENT (incomplete):
${post.content}

Please provide the COMPLETE content that:
1. Covers all topics mentioned in the excerpt
2. Has a proper conclusion
3. Includes relevant code examples
4. Ends with properly closed HTML tags

Return ONLY the complete HTML content, starting from <h2>Overview</h2>.`;
  } else if (issueTypes.includes('incomplete_coverage')) {
    const missingTopics = issues
      .filter(i => i.type === 'incomplete_coverage')
      .map(i => i.detail)
      .join(', ');
    
    prompt = `This ServiceNow article is missing coverage of promised topics.

TITLE: ${post.title}
EXCERPT: ${post.excerpt}
MISSING: ${missingTopics}

CURRENT CONTENT:
${post.content}

Please provide COMPLETE content that covers ALL topics from the excerpt, including the missing ones.
Return ONLY the complete HTML content.`;
  } else if (issueTypes.includes('missing_code_example')) {
    prompt = `This ServiceNow technical article needs code examples added.

TITLE: ${post.title}
CATEGORY: ${post.category}

CURRENT CONTENT:
${post.content}

Add 2-3 relevant ServiceNow code examples using <pre> tags. The code should be practical GlideRecord, Flow Designer, or API examples relevant to the article topic.

Return the COMPLETE updated content with the new code examples integrated naturally into the existing sections. Keep all existing content and add code examples where they make sense.`;
  }
  
  if (!prompt) {
    console.log(`   ⚠️ No fix strategy for these issues`);
    return false;
  }
  
  try {
    const fixedContent = await callPerplexityFix(prompt, systemPrompt);
    
    // Clean up the response
    let cleaned = fixedContent
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // Validate the fix
    if (cleaned.length > post.content.length && isContentComplete(cleaned)) {
      post.content = cleaned;
      console.log(`   ✅ Fixed! New length: ${cleaned.length} chars`);
      return true;
    } else {
      console.log(`   ⚠️ Fix didn't improve content, keeping original`);
      return false;
    }
  } catch (e) {
    console.log(`   ❌ Fix failed: ${e.message}`);
    return false;
  }
}

/**
 * Fix a truncated/incomplete interview
 */
async function fixInterview(interview, issues) {
  console.log(`   🔧 Fixing interview: ${interview.question.substring(0, 50)}...`);
  
  const systemPrompt = `You are a ServiceNow technical interviewer. Complete this interview Q&A.

CRITICAL RULES:
1. Return ONLY the answer content - no JSON wrapper
2. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
3. Include code examples where relevant
4. Answer should be 300-500 words
5. MUST end with complete sentence and closed tags
6. No [1] citations, no **markdown**`;

  const prompt = `This ServiceNow interview answer is incomplete. Complete it.

QUESTION: ${interview.question}
CATEGORY: ${interview.category}
DIFFICULTY: ${interview.difficulty}

CURRENT ANSWER (incomplete):
${interview.answer}

Provide the COMPLETE answer with:
1. Clear explanation of the concept
2. Code example if applicable
3. Best practices and common mistakes
4. Proper conclusion

Return ONLY the HTML content for the answer.`;

  try {
    const fixedAnswer = await callPerplexityFix(prompt, systemPrompt);
    
    let cleaned = fixedAnswer
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    
    if (cleaned.length > interview.answer.length && isContentComplete(cleaned)) {
      interview.answer = cleaned;
      console.log(`   ✅ Fixed! New length: ${cleaned.length} chars`);
      return true;
    } else {
      console.log(`   ⚠️ Fix didn't improve answer, keeping original`);
      return false;
    }
  } catch (e) {
    console.log(`   ❌ Fix failed: ${e.message}`);
    return false;
  }
}

// ============ MAIN ============

async function main() {
  console.log('🔍 Content Validation & Auto-Fix\n');
  console.log('================================\n');
  
  if (!PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not set!');
    process.exit(1);
  }
  
  let totalIssues = 0;
  let totalFixed = 0;
  
  // ===== VALIDATE POSTS =====
  console.log('📝 Validating posts.json...\n');
  
  let posts = [];
  try {
    posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  } catch (e) {
    console.error(`❌ Failed to read ${POSTS_FILE}: ${e.message}`);
    process.exit(1);
  }
  
  const postIssues = [];
  
  for (const post of posts) {
    const result = validatePost(post);
    if (!result.valid) {
      postIssues.push({ post, ...result });
    }
  }
  
  console.log(`Found ${postIssues.length} posts with issues:\n`);
  
  for (const item of postIssues) {
    console.log(`📄 ID ${item.post.id}: ${item.post.title.substring(0, 50)}...`);
    for (const issue of item.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : '🟡';
      console.log(`   ${icon} ${issue.type}${issue.detail ? ': ' + issue.detail : ''}`);
    }
    
    if (item.fixable) {
      const fixed = await fixPost(item.post, item.issues);
      if (fixed) totalFixed++;
      await new Promise(r => setTimeout(r, 3000)); // Rate limit
    }
    
    totalIssues += item.issues.length;
    console.log('');
  }
  
  // Save fixed posts
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  console.log(`✅ Posts validated. ${postIssues.length} with issues, ${totalFixed} fixed.\n`);
  
  // ===== VALIDATE INTERVIEWS =====
  console.log('📚 Validating interviews.json...\n');
  
  let interviews = [];
  try {
    interviews = JSON.parse(fs.readFileSync(INTERVIEWS_FILE, 'utf8'));
  } catch (e) {
    console.error(`❌ Failed to read ${INTERVIEWS_FILE}: ${e.message}`);
    process.exit(1);
  }
  
  const interviewIssues = [];
  let interviewsFixed = 0;
  
  for (const interview of interviews) {
    const result = validateInterview(interview);
    if (!result.valid) {
      interviewIssues.push({ interview, ...result });
    }
  }
  
  console.log(`Found ${interviewIssues.length} interviews with issues:\n`);
  
  for (const item of interviewIssues) {
    console.log(`❓ ID ${item.interview.id}: ${item.interview.question.substring(0, 50)}...`);
    for (const issue of item.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : '🟡';
      console.log(`   ${icon} ${issue.type}`);
    }
    
    if (item.fixable) {
      const fixed = await fixInterview(item.interview, item.issues);
      if (fixed) interviewsFixed++;
      await new Promise(r => setTimeout(r, 3000)); // Rate limit
    }
    
    totalIssues += item.issues.length;
    console.log('');
  }
  
  // Save fixed interviews
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(interviews, null, 2));
  
  // ===== SUMMARY =====
  console.log('================================');
  console.log('📊 VALIDATION SUMMARY');
  console.log('================================');
  console.log(`Posts:      ${posts.length} total, ${postIssues.length} with issues, ${totalFixed} fixed`);
  console.log(`Interviews: ${interviews.length} total, ${interviewIssues.length} with issues, ${interviewsFixed} fixed`);
  console.log(`Total issues found: ${totalIssues}`);
  console.log(`Total auto-fixed: ${totalFixed + interviewsFixed}`);
  
  if (totalIssues > 0 && (totalFixed + interviewsFixed) < totalIssues) {
    console.log('\n⚠️ Some issues could not be auto-fixed. Manual review recommended.');
  } else if (totalIssues === 0) {
    console.log('\n✨ All content passed validation!');
  } else {
    console.log('\n✅ All fixable issues were resolved!');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
