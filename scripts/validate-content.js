// scripts/validate-content.js
// Validates posts.json and interviews.json (READ-ONLY).
// Key changes:
// - No Perplexity calls, no auto-fix, no rewriting files
// - Improved code example validation (passes if at least one meaningful code block exists)
// - Exits with code 1 if any critical issues are found (useful for CI/cron logs)

const fs = require('fs');

const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

const VALIDATION_RULES = {
  posts: {
    requiredFields: ['id', 'title', 'excerpt', 'content', 'category', 'date', 'dateISO', 'readTime'],
    minContentLength: 800,
    minExcerptLength: 50,
    maxTitleLength: 150,
    mustEndProperly: true,
    mustHaveCodeExample: ['tutorial', 'servicenow', 'integration', 'security'],
  },
  interviews: {
    requiredFields: ['id', 'question', 'answer', 'difficulty', 'company', 'category', 'date', 'dateISO'],
    minAnswerLength: 300,
    minQuestionLength: 50,
    mustEndProperly: true,
  },
};

function isContentComplete(content) {
  if (!content || content.length < 100) return false;

  const trimmed = content.trim();

  const badEndings = [
    '\\',
    'such as',
    'including',
    'for example',
    'e.g.',
    'i.e.',
    'the following',
    'contains',
    'like',
    'with',
    'and',
    'or',
    'to',
    'in',
    'on',
    'at',
    'by',
    'for',
    ':',
    ',',
  ];

  const lastChars = trimmed.slice(-30).toLowerCase();
  for (const bad of badEndings) {
    if (lastChars.endsWith(bad) || lastChars.endsWith(bad + ' ')) return false;
  }

  // Unclosed tag imbalance check (rough)
  const openTags = (trimmed.match(/<(pre|p|ul|ol|li|h[234]|strong|em|code)(?:\s[^>]*)?>/gi) || []).length;
  const closeTags = (trimmed.match(/<\/(pre|p|ul|ol|li|h[234]|strong|em|code)>/gi) || []).length;
  if (openTags > closeTags + 2) return false;

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

  const goodEndings = ['.', '!', '?', '>', '"', "'", ')', ']', '}'];
  return goodEndings.includes(trimmed.slice(-1));
}

function hasCodeExample(content) {
  return (content || '').includes('<pre>') || (content || '').includes('<code>');
}

// Pass if at least one code block is meaningful (not stubs)
function hasAtLeastOneCompleteCodeExample(content) {
  if (!hasCodeExample(content)) return false;

  const codeBlocks = (content.match(/<pre>([\s\S]*?)<\/pre>/gi) || []).map((b) =>
    b.replace(/<\/?pre>/gi, '').trim()
  );

  if (!codeBlocks.length) return false;

  const stubPatterns = [
    /^\/\/\s*(example|todo|placeholder)/i,
    /^var\s+\w+\s*=\s*new\s+GlideRecord\([^)]+\);\s*$/i,
    /^\s*\/\/.*\n?\s*$/i,
  ];

  for (const code of codeBlocks) {
    const isStub = stubPatterns.some((p) => p.test(code));
    const meaningfulLines = code
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//')).length;

    if (!isStub && meaningfulLines >= 3) return true;
  }

  return false;
}

function checkTopicCoverage(title, excerpt, content) {
  const issues = [];

  const patterns = [/complete guide/i, /comprehensive/i, /in-depth/i, /everything you need/i, /from .* to .*/i];
  const isComprehensivePromise = patterns.some((p) => p.test(title || '') || p.test(excerpt || ''));

  if (isComprehensivePromise && (content || '').length < 2000) {
    issues.push('Title/excerpt promises comprehensive coverage but content is short');
  }

  const excerptLower = (excerpt || '').toLowerCase();
  const contentLower = (content || '').toLowerCase();

  const topicMatches =
    excerptLower.match(
      /\b(gliderecord|glideaggregate|flow designer|integration hub|acl|security|performance|api|rest|soap|cmdb|itsm|itom|ai|genai|now assist|virtual agent|predictive intelligence)\b/gi
    ) || [];

  for (const topic of [...new Set(topicMatches)]) {
    if (!contentLower.includes(topic.toLowerCase())) {
      // Keep as warning to avoid noisy false negatives
      issues.push(`Excerpt mentions "${topic}" but content may not cover it explicitly`);
    }
  }

  return issues;
}

function validatePost(post) {
  const issues = [];
  const rules = VALIDATION_RULES.posts;

  for (const field of rules.requiredFields) {
    if (!post[field]) issues.push({ type: 'missing_field', field, severity: 'critical' });
  }

  if (post.title && post.title.length > rules.maxTitleLength) {
    issues.push({ type: 'title_too_long', severity: 'warning' });
  }

  if (!post.content) return { valid: false, issues };

  if (post.content.length < rules.minContentLength) {
    issues.push({
      type: 'content_too_short',
      current: post.content.length,
      required: rules.minContentLength,
      severity: 'critical',
    });
  }

  if (post.excerpt && post.excerpt.length < rules.minExcerptLength) {
    issues.push({ type: 'excerpt_too_short', severity: 'warning' });
  }

  if (rules.mustEndProperly && !isContentComplete(post.content)) {
    issues.push({ type: 'content_truncated', severity: 'critical' });
  }

  if (rules.mustHaveCodeExample.includes(post.category) && !hasCodeExample(post.content)) {
    issues.push({ type: 'missing_code_example', severity: 'critical' });
  }

  if (hasCodeExample(post.content) && !hasAtLeastOneCompleteCodeExample(post.content)) {
    issues.push({ type: 'incomplete_code_example', severity: 'critical' });
  }

  const topicIssues = checkTopicCoverage(post.title, post.excerpt, post.content);
  for (const detail of topicIssues) {
    issues.push({ type: 'coverage_warning', detail, severity: 'warning' });
  }

  if (post.content.includes('\u0000') || post.content.includes('\u001F')) {
    issues.push({ type: 'invalid_characters', severity: 'critical' });
  }

  return { valid: issues.length === 0, issues };
}

function validateInterview(interview) {
  const issues = [];
  const rules = VALIDATION_RULES.interviews;

  for (const field of rules.requiredFields) {
    if (!interview[field]) issues.push({ type: 'missing_field', field, severity: 'critical' });
  }

  if (!interview.answer) return { valid: false, issues };

  if (interview.answer.length < rules.minAnswerLength) {
    issues.push({
      type: 'answer_too_short',
      current: interview.answer.length,
      required: rules.minAnswerLength,
      severity: 'critical',
    });
  }

  if (interview.question && interview.question.length < rules.minQuestionLength) {
    issues.push({ type: 'question_too_short', severity: 'warning' });
  }

  if (rules.mustEndProperly && !isContentComplete(interview.answer)) {
    issues.push({ type: 'answer_truncated', severity: 'critical' });
  }

  if (hasCodeExample(interview.answer) && !hasAtLeastOneCompleteCodeExample(interview.answer)) {
    issues.push({ type: 'incomplete_code_example', severity: 'critical' });
  }

  return { valid: issues.length === 0, issues };
}

function loadJsonOrExit(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Failed to read ${file}: ${e.message}`);
    process.exit(1);
  }
}

function main() {
  const posts = loadJsonOrExit(POSTS_FILE);
  const interviews = loadJsonOrExit(INTERVIEWS_FILE);

  let criticalCount = 0;
  let warningCount = 0;

  // Posts
  const postIssues = [];
  for (const post of posts) {
    const result = validatePost(post);
    if (!result.valid) postIssues.push({ post, ...result });
    for (const i of result.issues) {
      if (i.severity === 'critical') criticalCount++;
      else warningCount++;
    }
  }

  // Interviews
  const interviewIssues = [];
  for (const interview of interviews) {
    const result = validateInterview(interview);
    if (!result.valid) interviewIssues.push({ interview, ...result });
    for (const i of result.issues) {
      if (i.severity === 'critical') criticalCount++;
      else warningCount++;
    }
  }

  // Print report
  console.log('Content validation report');
  console.log('=========================');

  console.log(`Posts: ${posts.length} total, ${postIssues.length} with issues`);
  for (const item of postIssues) {
    console.log(`- Post ID ${item.post.id}: ${String(item.post.title || '').substring(0, 60)}`);
    for (const issue of item.issues) {
      const extra = issue.detail ? ` (${issue.detail})` : issue.field ? ` (${issue.field})` : '';
      console.log(`  - ${issue.severity.toUpperCase()}: ${issue.type}${extra}`);
    }
  }

  console.log(`Interviews: ${interviews.length} total, ${interviewIssues.length} with issues`);
  for (const item of interviewIssues) {
    console.log(`- Interview ID ${item.interview.id}: ${String(item.interview.question || '').substring(0, 60)}`);
    for (const issue of item.issues) {
      const extra = issue.detail ? ` (${issue.detail})` : issue.field ? ` (${issue.field})` : '';
      console.log(`  - ${issue.severity.toUpperCase()}: ${issue.type}${extra}`);
    }
  }

  console.log('=========================');
  console.log(`Critical: ${criticalCount}`);
  console.log(`Warnings:  ${warningCount}`);

  // Fail only on critical issues
  if (criticalCount > 0) process.exit(1);
  process.exit(0);
}

main();
