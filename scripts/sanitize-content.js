// scripts/sanitize-content.js
// Removes invalid characters (NULL, control chars) from posts.json and interviews.json
// Run this to fix existing content or add to your fetch pipeline

const fs = require('fs');
const { POSTS_FILE, INTERVIEWS_FILE } = require('./content-paths');

// Characters to remove (control characters that cause validation failures)
const INVALID_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(INVALID_CHARS_REGEX, '');
}

function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeObject(obj[key]);
    }
    return result;
  }
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  return obj;
}

function countInvalidChars(str) {
  if (typeof str !== 'string') return 0;
  const matches = str.match(INVALID_CHARS_REGEX);
  return matches ? matches.length : 0;
}

function findInvalidCharsInObject(obj, path = '') {
  const issues = [];
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      issues.push(...findInvalidCharsInObject(item, `${path}[${index}]`));
    });
  } else if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      issues.push(...findInvalidCharsInObject(obj[key], `${path}.${key}`));
    }
  } else if (typeof obj === 'string') {
    const count = countInvalidChars(obj);
    if (count > 0) {
      const matches = obj.match(INVALID_CHARS_REGEX);
      const positions = [];
      let idx = 0;
      for (const match of matches || []) {
        idx = obj.indexOf(match, idx);
        positions.push({ pos: idx, char: `\\x${match.charCodeAt(0).toString(16).padStart(2, '0')}` });
        idx++;
      }
      issues.push({ path, count, positions: positions.slice(0, 5) });
    }
  }
  
  return issues;
}

function processFile(filename) {
  if (!fs.existsSync(filename)) {
    console.log(`ℹ️  ${filename} not found, skipping`);
    return { found: 0, fixed: false };
  }

  console.log(`\n📄 Processing ${filename}...`);
  
  const raw = fs.readFileSync(filename, 'utf8');
  let data;
  
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to parse ${filename}: ${e.message}`);
    return { found: 0, fixed: false };
  }

  // Find issues before sanitizing
  const issues = findInvalidCharsInObject(data);
  
  if (issues.length === 0) {
    console.log(`✅ No invalid characters found`);
    return { found: 0, fixed: false };
  }

  console.log(`⚠️  Found ${issues.length} field(s) with invalid characters:`);
  for (const issue of issues) {
    console.log(`   ${issue.path}: ${issue.count} char(s) at positions ${issue.positions.map(p => `${p.pos}(${p.char})`).join(', ')}`);
  }

  // Sanitize
  const sanitized = sanitizeObject(data);
  
  // Verify fix
  const remaining = findInvalidCharsInObject(sanitized);
  if (remaining.length > 0) {
    console.error(`❌ Sanitization incomplete - ${remaining.length} issues remain`);
    return { found: issues.length, fixed: false };
  }

  // Write back
  fs.writeFileSync(filename, JSON.stringify(sanitized, null, 2), 'utf8');
  console.log(`✅ Sanitized and saved ${filename}`);
  
  return { found: issues.length, fixed: true };
}

function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              CONTENT SANITIZER                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('Removing invalid control characters (\\x00-\\x1F except newlines/tabs)');

  const postsResult = processFile(POSTS_FILE);
  const interviewsResult = processFile(INTERVIEWS_FILE);

  console.log('\n═══════════════════════════════════════════════════════════════');
  const totalFound = postsResult.found + interviewsResult.found;
  const anyFixed = postsResult.fixed || interviewsResult.fixed;
  
  if (totalFound === 0) {
    console.log('✅ All content is clean - no sanitization needed');
  } else if (anyFixed) {
    console.log(`✅ Sanitized ${totalFound} issue(s) - content is now clean`);
  } else {
    console.log(`⚠️  Found ${totalFound} issue(s) but could not fix all`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
