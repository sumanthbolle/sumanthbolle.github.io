// scripts/validate-content.js
// IMPROVED VALIDATOR with detailed diagnostics
// - Prints exact post/interview that fails with full details
// - Outputs machine-readable validation-report.json
// - Only fails CI for newly generated content (strict window) or hard criticals

const fs = require('fs');
const path = require('path');
const { POSTS_FILE, INTERVIEWS_FILE } = require('./content-paths');

const REPORT_FILE = 'validation-report.json';

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

function loadJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) {
      console.log(`ℹ️  File not found: ${file} (skipping)`);
      return [];
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ Failed to read ${file}: ${e.message}`);
    return null;
  }
}

function hoursAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function isStrictItem(item) {
  if (!item?.dateISO) return false;
  return hoursAgo(item.dateISO) <= STRICT_WINDOW_HOURS;
}

function isContentComplete(content) {
  if (!content || content.length < 100) return { complete: false, reason: 'Content too short (<100 chars)' };
  const trimmed = content.trim();

  const badEndings = [
    '\\', 'such as', 'including', 'for example', 'e.g.', 'i.e.', 'the following', 'contains',
    'like', 'with', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', ':', ','
  ];

  const lastChars = trimmed.slice(-30).toLowerCase();
  for (const bad of badEndings) {
    if (lastChars.endsWith(bad) || lastChars.endsWith(bad + ' ')) {
      return { complete: false, reason: `Ends with incomplete phrase: "${bad}"`, lastChars: trimmed.slice(-50) };
    }
  }

  const openTags = (trimmed.match(/<(pre|p|ul|ol|li|h[234]|strong|em|code)(?:\s[^>]*)?>/gi) || []).length;
  const closeTags = (trimmed.match(/<\/(pre|p|ul|ol|li|h[234]|strong|em|code)>/gi) || []).length;
  if (openTags > closeTags + 2) {
    return { complete: false, reason: `Unclosed HTML tags (open: ${openTags}, close: ${closeTags})`, lastChars: trimmed.slice(-50) };
  }

  const validEndings = ['</p>', '</ul>', '</ol>', '</pre>', '</li>', '</h2>', '</h3>', '</h4>'];
  if (validEndings.some((e) => trimmed.endsWith(e))) {
    return { complete: true };
  }

  const validLastChars = ['.', '!', '?', '>', '"', "'", ')', ']', '}'];
  if (validLastChars.includes(trimmed.slice(-1))) {
    return { complete: true };
  }

  return { complete: false, reason: 'Does not end with valid HTML tag or punctuation', lastChars: trimmed.slice(-50) };
}

function hasCodeExample(content) {
  return (content || '').includes('<pre>') || (content || '').includes('<code>');
}

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

// Find invalid characters and return their positions
function findInvalidCharacters(content) {
  const invalidChars = [];
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = content.charCodeAt(i);
    if (code === 0x00 || code === 0x1F) {
      const context = content.substring(Math.max(0, i - 20), Math.min(content.length, i + 20));
      invalidChars.push({
        position: i,
        charCode: code,
        hex: `\\u${code.toString(16).padStart(4, '0')}`,
        context: context.replace(/[\x00-\x1F]/g, '�'),
      });
    }
  }
  return invalidChars;
}

function pushIssue(issues, strict, type, extra) {
  let severity = strict ? 'CRITICAL' : 'WARNING';

  // These are always CRITICAL regardless of age
  if (!strict && (type === 'missing_content' || type === 'missing_answer' || type === 'invalid_characters')) {
    severity = 'CRITICAL';
  }

  issues.push({ severity, type, ...extra });
}

function validatePost(post) {
  const strict = isStrictItem(post);
  const hoursOld = post.dateISO ? hoursAgo(post.dateISO).toFixed(1) : 'unknown';
  const rules = VALIDATION_RULES.posts;
  const issues = [];

  const required = strict ? rules.requiredFieldsStrict : rules.requiredFieldsLegacy;
  for (const field of required) {
    if (!post[field]) pushIssue(issues, strict, 'missing_field', { field });
  }

  if (post.title && post.title.length > rules.maxTitleLength) {
    pushIssue(issues, strict, 'title_too_long', { length: post.title.length, max: rules.maxTitleLength });
  }

  if (!post.content) {
    pushIssue(issues, strict, 'missing_content', {});
    return { strict, hoursOld, issues };
  }

  // Check for invalid characters with detailed position info
  const invalidChars = findInvalidCharacters(post.content);
  if (invalidChars.length > 0) {
    pushIssue(issues, strict, 'invalid_characters', {
      count: invalidChars.length,
      locations: invalidChars.slice(0, 3), // Show first 3 occurrences
    });
  }

  if (post.content.length < rules.minContentLength) {
    pushIssue(issues, strict, 'content_too_short', {
      current: post.content.length,
      required: rules.minContentLength,
    });
  }

  if (post.excerpt && post.excerpt.length < rules.minExcerptLength) {
    pushIssue(issues, strict, 'excerpt_too_short', { current: post.excerpt.length, required: rules.minExcerptLength });
  }

  const contentCheck = isContentComplete(post.content);
  if (!contentCheck.complete) {
    pushIssue(issues, strict, 'content_truncated', {
      reason: contentCheck.reason,
      lastChars: contentCheck.lastChars,
    });
  }

  if (rules.mustHaveCodeExample.includes(post.category) && !hasCodeExample(post.content)) {
    pushIssue(issues, strict, 'missing_code_example', { category: post.category });
  }

  if (hasCodeExample(post.content) && !hasAtLeastOneCompleteCodeExample(post.content)) {
    pushIssue(issues, strict, 'incomplete_code_example', {});
  }

  return { strict, hoursOld, issues };
}

function validateInterview(interview) {
  const strict = isStrictItem(interview);
  const hoursOld = interview.dateISO ? hoursAgo(interview.dateISO).toFixed(1) : 'unknown';
  const rules = VALIDATION_RULES.interviews;
  const issues = [];

  const required = strict ? rules.requiredFieldsStrict : rules.requiredFieldsLegacy;
  for (const field of required) {
    if (!interview[field]) pushIssue(issues, strict, 'missing_field', { field });
  }

  if (!interview.answer) {
    pushIssue(issues, strict, 'missing_answer', {});
    return { strict, hoursOld, issues };
  }

  const invalidChars = findInvalidCharacters(interview.answer);
  if (invalidChars.length > 0) {
    pushIssue(issues, strict, 'invalid_characters', {
      count: invalidChars.length,
      locations: invalidChars.slice(0, 3),
    });
  }

  if (interview.answer.length < rules.minAnswerLength) {
    pushIssue(issues, strict, 'answer_too_short', {
      current: interview.answer.length,
      required: rules.minAnswerLength,
    });
  }

  if (interview.question && interview.question.length < rules.minQuestionLength) {
    pushIssue(issues, strict, 'question_too_short', { current: interview.question.length, required: rules.minQuestionLength });
  }

  const contentCheck = isContentComplete(interview.answer);
  if (!contentCheck.complete) {
    pushIssue(issues, strict, 'answer_truncated', {
      reason: contentCheck.reason,
      lastChars: contentCheck.lastChars,
    });
  }

  if (hasCodeExample(interview.answer) && !hasAtLeastOneCompleteCodeExample(interview.answer)) {
    pushIssue(issues, strict, 'incomplete_code_example', {});
  }

  return { strict, hoursOld, issues };
}

function formatIssue(issue) {
  let details = [];
  if (issue.field) details.push(`field: ${issue.field}`);
  if (issue.current !== undefined) details.push(`current: ${issue.current}`);
  if (issue.required !== undefined) details.push(`required: ${issue.required}`);
  if (issue.length !== undefined) details.push(`length: ${issue.length}`);
  if (issue.max !== undefined) details.push(`max: ${issue.max}`);
  if (issue.category) details.push(`category: ${issue.category}`);
  if (issue.reason) details.push(`reason: ${issue.reason}`);
  if (issue.count !== undefined) details.push(`count: ${issue.count}`);
  if (issue.lastChars) details.push(`ending: "${issue.lastChars.replace(/\n/g, '\\n').substring(0, 40)}..."`);
  if (issue.locations) {
    details.push(`positions: ${issue.locations.map((l) => `${l.position}(${l.hex})`).join(', ')}`);
  }
  return details.length ? ` (${details.join(', ')})` : '';
}

function main() {
  const posts = loadJsonSafe(POSTS_FILE);
  const interviews = loadJsonSafe(INTERVIEWS_FILE);

  if (posts === null) {
    console.error('❌ Cannot proceed without posts.json');
    process.exit(1);
  }

  let criticalNew = 0;
  let warnings = 0;
  const report = {
    timestamp: new Date().toISOString(),
    strictWindowHours: STRICT_WINDOW_HOURS,
    posts: { total: posts.length, problems: [] },
    interviews: { total: (interviews || []).length, problems: [] },
    summary: { critical: 0, warnings: 0 },
  };

  // Validate posts
  for (const post of posts) {
    const r = validatePost(post);
    if (r.issues.length) {
      const problem = {
        id: post.id,
        title: (post.title || '').substring(0, 80),
        strict: r.strict,
        hoursOld: r.hoursOld,
        issues: r.issues,
      };
      report.posts.problems.push(problem);

      for (const i of r.issues) {
        if (r.strict && i.severity === 'CRITICAL') criticalNew++;
        else if (i.severity === 'WARNING') warnings++;
        else if (!r.strict && i.severity === 'CRITICAL') criticalNew++;
      }
    }
  }

  // Validate interviews
  if (interviews && interviews.length) {
    for (const interview of interviews) {
      const r = validateInterview(interview);
      if (r.issues.length) {
        const problem = {
          id: interview.id,
          question: (interview.question || '').substring(0, 80),
          strict: r.strict,
          hoursOld: r.hoursOld,
          issues: r.issues,
        };
        report.interviews.problems.push(problem);

        for (const i of r.issues) {
          if (r.strict && i.severity === 'CRITICAL') criticalNew++;
          else if (i.severity === 'WARNING') warnings++;
          else if (!r.strict && i.severity === 'CRITICAL') criticalNew++;
        }
      }
    }
  }

  report.summary.critical = criticalNew;
  report.summary.warnings = warnings;

  // Write report file
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  // Print human-readable summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              CONTENT VALIDATION REPORT                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Strict window: last ${STRICT_WINDOW_HOURS} hours (only new items fail the job)`);
  console.log('');

  // Posts summary
  console.log(`📝 Posts: ${posts.length} total, ${report.posts.problems.length} with issues`);
  if (report.posts.problems.length > 0) {
    console.log('');
    for (const item of report.posts.problems) {
      const tag = item.strict ? '🔴 STRICT' : '🟡 LEGACY';
      console.log(`  ${tag} Post ID ${item.id} (${item.hoursOld}h old):`);
      console.log(`    Title: "${item.title}..."`);
      for (const issue of item.issues) {
        const icon = issue.severity === 'CRITICAL' ? '❌' : '⚠️';
        console.log(`    ${icon} ${issue.severity}: ${issue.type}${formatIssue(issue)}`);
      }
      console.log('');
    }
  }

  // Interviews summary
  if (interviews && interviews.length) {
    console.log(`📋 Interviews: ${interviews.length} total, ${report.interviews.problems.length} with issues`);
    if (report.interviews.problems.length > 0) {
      console.log('');
      for (const item of report.interviews.problems) {
        const tag = item.strict ? '🔴 STRICT' : '🟡 LEGACY';
        console.log(`  ${tag} Interview ID ${item.id} (${item.hoursOld}h old):`);
        console.log(`    Question: "${item.question}..."`);
        for (const issue of item.issues) {
          const icon = issue.severity === 'CRITICAL' ? '❌' : '⚠️';
          console.log(`    ${icon} ${issue.severity}: ${issue.type}${formatIssue(issue)}`);
        }
        console.log('');
      }
    }
  }

  // Final summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ❌ Critical (job-failing): ${criticalNew}`);
  console.log(`  ⚠️  Warnings:              ${warnings}`);
  console.log(`  📄 Report written to:      ${REPORT_FILE}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (criticalNew > 0) {
    console.log('');
    console.log('💥 VALIDATION FAILED - Fix the CRITICAL issues above');
    console.log('');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('');
    console.log('✅ VALIDATION PASSED (with warnings for legacy content)');
    console.log('');
    process.exit(0);
  } else {
    console.log('');
    console.log('✅ VALIDATION PASSED - No issues found');
    console.log('');
    process.exit(0);
  }
}

main();
