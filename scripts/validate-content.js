// scripts/validate-content.js
// READ-ONLY validator
// Strict validation ONLY for newly generated items (recent window).
// Older/legacy content: report issues as WARNINGS, do not fail the job.

const fs = require('fs');

const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

// Consider "new" content as content generated recently
const STRICT_WINDOW_HOURS = 48;

const VALIDATION_RULES = {
  posts: {
    requiredFieldsStrict: ['id', 'title', 'excerpt', 'content', 'category', 'date', 'dateISO', 'readTime'],
    requiredFieldsLegacy: ['id', 'title', 'excerpt', 'content', 'category', 'date', 'readTime'],
    minContentLength: 800,
    minExcerptLength: 50,
    maxTitleLength: 150,
    mustHaveCodeExample: ['tutorial', 'servicenow', 'integration', 'security'],
  },
  interviews: {
    requiredFieldsStrict: ['id', 'question', 'answer', 'difficulty', 'company', 'category', 'date', 'dateISO'],
    requiredFieldsLegacy: ['id', 'question', 'answer', 'difficulty', 'company', 'category', 'date'],
    minAnswerLength: 300,
    minQuestionLength: 50,
  },
};

function loadJsonOrExit(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Failed to read ${file}: ${e.message}`);
    process.exit(1);
  }
}

function hoursAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function isStrictItem(item) {
  // Strict if dateISO exists and is recent
  if (!item?.dateISO) return false;
  return hoursAgo(item.dateISO) <= STRICT_WINDOW_HOURS;
}

function isContentComplete(content) {
  if (!content || content.length < 100) return false;
  const trimmed = content.trim();

  const badEndings = [
    '\\','such as','including','for example','e.g.','i.e.','the following','contains',
    'like','with','and','or','to','in','on','at','by','for',':',','
  ];

  const lastChars = trimmed.slice(-30).toLowerCase();
  for (const bad of badEndings) {
    if (lastChars.endsWith(bad) || lastChars.endsWith(bad + ' ')) return false;
  }

  // Very rough HTML closure sanity
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
  ) return true;

  return ['.','!','?','>','"',"'",
          ')',']','}'].includes(trimmed.slice(-1));
}

function hasCodeExample(content) {
  return (content || '').includes('<pre>') || (content || '').includes('<code>');
}

// Strict: must have at least one meaningful code block
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

// Utility: push issue with severity based on strict vs legacy
function pushIssue(issues, strict, type, extra) {
  // Legacy should not break pipeline: downgrade everything to warning,
  // except completely missing content/answer or invalid chars.
  let severity = strict ? 'CRITICAL' : 'WARNING';

  if (!strict && (type === 'missing_content' || type === 'missing_answer' || type === 'invalid_characters')) {
    severity = 'CRITICAL';
  }

  issues.push({ severity, type, ...extra });
}

function validatePost(post) {
  const strict = isStrictItem(post);
  const rules = VALIDATION_RULES.posts;
  const issues = [];

  const required = strict ? rules.requiredFieldsStrict : rules.requiredFieldsLegacy;
  for (const field of required) {
    if (!post[field]) pushIssue(issues, strict, 'missing_field', { field });
  }

  if (post.title && post.title.length > rules.maxTitleLength) {
    pushIssue(issues, strict, 'title_too_long', {});
  }

  if (!post.content) {
    pushIssue(issues, strict, 'missing_content', {});
    return { strict, issues };
  }

  if (post.content.includes('\u0000') || post.content.includes('\u001F')) {
    pushIssue(issues, strict, 'invalid_characters', {});
  }

  if (post.content.length < rules.minContentLength) {
    pushIssue(issues, strict, 'content_too_short', {
      current: post.content.length,
      required: rules.minContentLength,
    });
  }

  if (post.excerpt && post.excerpt.length < rules.minExcerptLength) {
    pushIssue(issues, strict, 'excerpt_too_short', {});
  }

  if (!isContentComplete(post.content)) {
    pushIssue(issues, strict, 'content_truncated', {});
  }

  if (rules.mustHaveCodeExample.includes(post.category) && !hasCodeExample(post.content)) {
    pushIssue(issues, strict, 'missing_code_example', {});
  }

  if (hasCodeExample(post.content) && !hasAtLeastOneCompleteCodeExample(post.content)) {
    pushIssue(issues, strict, 'incomplete_code_example', {});
  }

  return { strict, issues };
}

function validateInterview(interview) {
  const strict = isStrictItem(interview);
  const rules = VALIDATION_RULES.interviews;
  const issues = [];

  const required = strict ? rules.requiredFieldsStrict : rules.requiredFieldsLegacy;
  for (const field of required) {
    if (!interview[field]) pushIssue(issues, strict, 'missing_field', { field });
  }

  if (!interview.answer) {
    pushIssue(issues, strict, 'missing_answer', {});
    return { strict, issues };
  }

  if (interview.answer.includes('\u0000') || interview.answer.includes('\u001F')) {
    pushIssue(issues, strict, 'invalid_characters', {});
  }

  if (interview.answer.length < rules.minAnswerLength) {
    pushIssue(issues, strict, 'answer_too_short', {
      current: interview.answer.length,
      required: rules.minAnswerLength,
    });
  }

  if (interview.question && interview.question.length < rules.minQuestionLength) {
    pushIssue(issues, strict, 'question_too_short', {});
  }

  if (!isContentComplete(interview.answer)) {
    pushIssue(issues, strict, 'answer_truncated', {});
  }

  if (hasCodeExample(interview.answer) && !hasAtLeastOneCompleteCodeExample(interview.answer)) {
    pushIssue(issues, strict, 'incomplete_code_example', {});
  }

  return { strict, issues };
}

function main() {
  const posts = loadJsonOrExit(POSTS_FILE);
  const interviews = loadJsonOrExit(INTERVIEWS_FILE);

  let criticalNew = 0;
  let warnings = 0;

  const postProblems = [];
  for (const post of posts) {
    const r = validatePost(post);
    if (r.issues.length) postProblems.push({ post, ...r });

    for (const i of r.issues) {
      if (r.strict && i.severity === 'CRITICAL') criticalNew++;
      else if (i.severity === 'WARNING') warnings++;
      else if (!r.strict && i.severity === 'CRITICAL') {
        // rare legacy-hard criticals (missing content / invalid chars)
        criticalNew++;
      }
    }
  }

  const interviewProblems = [];
  for (const interview of interviews) {
    const r = validateInterview(interview);
    if (r.issues.length) interviewProblems.push({ interview, ...r });

    for (const i of r.issues) {
      if (r.strict && i.severity === 'CRITICAL') criticalNew++;
      else if (i.severity === 'WARNING') warnings++;
      else if (!r.strict && i.severity === 'CRITICAL') criticalNew++;
    }
  }

  console.log('Content validation report');
  console.log('=========================');
  console.log(`Strict window: last ${STRICT_WINDOW_HOURS} hours (only new items fail the job)\n`);

  console.log(`Posts: ${posts.length} total, ${postProblems.length} with issues`);
  for (const item of postProblems) {
    const tag = item.strict ? 'STRICT' : 'LEGACY';
    console.log(`- [${tag}] Post ID ${item.post.id}: ${String(item.post.title || '').substring(0, 70)}`);
    for (const issue of item.issues) {
      const extra = issue.field ? ` (${issue.field})` : '';
      const more = issue.current ? ` (current=${issue.current}, required=${issue.required})` : '';
      console.log(`  - ${issue.severity}: ${issue.type}${extra}${more}`);
    }
  }

  console.log(`\nInterviews: ${interviews.length} total, ${interviewProblems.length} with issues`);
  for (const item of interviewProblems) {
    const tag = item.strict ? 'STRICT' : 'LEGACY';
    console.log(`- [${tag}] Interview ID ${item.interview.id}: ${String(item.interview.question || '').substring(0, 70)}`);
    for (const issue of item.issues) {
      const extra = issue.field ? ` (${issue.field})` : '';
      const more = issue.current ? ` (current=${issue.current}, required=${issue.required})` : '';
      console.log(`  - ${issue.severity}: ${issue.type}${extra}${more}`);
    }
  }

  console.log('\n=========================');
  console.log(`Critical (job-failing): ${criticalNew}`);
  console.log(`Warnings:              ${warnings}`);

  // Fail only when new/strict content is bad (or rare legacy-hard criticals)
  process.exit(criticalNew > 0 ? 1 : 0);
}

main();
