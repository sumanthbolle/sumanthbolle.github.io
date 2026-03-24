#!/usr/bin/env node
// scripts/diagnose-content.js
// Quick diagnostic to find which post is causing validation failures
// Run: node scripts/diagnose-content.js

const fs = require('fs');
const { POSTS_FILE } = require('./content-paths');

console.log('🔍 CONTENT DIAGNOSTIC TOOL');
console.log('══════════════════════════════════════════════════════════════\n');

if (!fs.existsSync(POSTS_FILE)) {
  console.error(`❌ ${POSTS_FILE} not found`);
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
console.log(`📄 Loaded ${posts.length} posts\n`);

// Check for invalid characters (the most likely cause of CRITICAL failures)
console.log('🔎 Checking for invalid characters (\\x00-\\x1F)...\n');

let issuesFound = 0;

for (const post of posts) {
  const issues = [];
  
  // Check content field
  if (post.content) {
    const invalidMatches = post.content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
    if (invalidMatches) {
      issues.push({
        field: 'content',
        count: invalidMatches.length,
        chars: [...new Set(invalidMatches)].map(c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`),
      });
    }
  } else {
    issues.push({ field: 'content', error: 'MISSING' });
  }
  
  // Check other text fields
  for (const field of ['title', 'excerpt']) {
    if (post[field]) {
      const matches = post[field].match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
      if (matches) {
        issues.push({
          field,
          count: matches.length,
          chars: [...new Set(matches)].map(c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`),
        });
      }
    }
  }
  
  if (issues.length > 0) {
    issuesFound++;
    console.log(`❌ POST ID ${post.id}: "${(post.title || 'NO TITLE').substring(0, 60)}..."`);
    for (const issue of issues) {
      if (issue.error) {
        console.log(`   🔴 ${issue.field}: ${issue.error}`);
      } else {
        console.log(`   ⚠️  ${issue.field}: ${issue.count} invalid char(s): ${issue.chars.join(', ')}`);
      }
    }
    console.log('');
  }
}

if (issuesFound === 0) {
  console.log('✅ No invalid characters found in any post\n');
  
  // If no invalid chars, check for truncation issues
  console.log('🔎 Checking for truncation issues...\n');
  
  const badEndings = ['\\', 'such as', 'including', 'for example', 'e.g.', 'i.e.', 'the following', 'contains', 'like', 'with', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', ':', ','];
  
  for (const post of posts) {
    if (!post.content) continue;
    
    const trimmed = post.content.trim();
    const lastChars = trimmed.slice(-30).toLowerCase();
    
    for (const bad of badEndings) {
      if (lastChars.endsWith(bad) || lastChars.endsWith(bad + ' ')) {
        console.log(`⚠️  POST ID ${post.id}: Content ends with "${bad}"`);
        console.log(`   Last 50 chars: "${trimmed.slice(-50).replace(/\n/g, '\\n')}"`);
        console.log('');
        issuesFound++;
        break;
      }
    }
  }
}

console.log('══════════════════════════════════════════════════════════════');
if (issuesFound > 0) {
  console.log(`Found ${issuesFound} post(s) with potential issues`);
  console.log('\n💡 To fix: Run "node scripts/sanitize-content.js"');
} else {
  console.log('No obvious issues found. Run the full validator for detailed analysis.');
}
