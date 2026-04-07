const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('data/posts.json','utf8'));
const interviews = JSON.parse(fs.readFileSync('data/interviews.json','utf8'));
const all = [...posts.map(p=>p.content), ...interviews.map(i=>i.answer)].join(' ');

const terms = [
  'GlideRecord', 'GlideAggregate', 'GlideAjax', 'GlideSystem', 'GlideDateTime',
  'GlideElement', 'GlideForm', 'GlideUser', 'GlideSession',
  'g_form', 'g_user', 'g_list', 'g_navigation', 'g_scratchpad',
  'current', 'previous',
  'gs.addInfoMessage', 'gs.addErrorMessage', 'gs.eventQueue',
  'gs.getUser', 'gs.getUserID', 'gs.nil', 'gs.include',
  'gs.getProperty', 'gs.log', 'gs.info',
  'Business Rule', 'Client Script', 'UI Policy', 'UI Action',
  'Script Include', 'Scheduled Job', 'Fix Script', 'Background Script',
  'Access Control', 'ACL', 'Data Policy', 'UI Script',
  'Flow Designer', 'Subflow', 'Spoke',
  'Import Set', 'Transform Map', 'Coalesce', 'Update Set',
  'Encoded Query', 'Dot-walking', 'Reference field', 'sys_id',
  'Journal field', 'Choice list',
  'CMDB', 'CSDM', 'Discovery', 'Service Mapping',
  'Identification Rules', 'Reconciliation',
  'Catalog Item', 'Record Producer', 'Variable Set',
  'Catalog Client Script', 'Catalog UI Policy', 'Order Guide',
  'Service Portal', 'Widget', 'Angular Provider',
  'REST Message', 'Scripted REST API', 'Table API', 'SOAP Message',
  'MID Server', 'Integration Hub',
  'ATF', 'Automated Test Framework',
  'Scoped Application', 'Global scope', 'Application scope',
  'Notification', 'Email Script', 'Event',
  'Domain Separation', 'Impersonation', 'Elevated Privilege',
  'Slow Query Log', 'Transaction Log', 'System Diagnostics',
];

console.log('=== TECHNICAL TERM COVERAGE ===');
const covered = [];
const mentioned = [];
const missing = [];

terms.forEach(term => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  const count = (all.match(re)||[]).length;
  if (count >= 10) covered.push({term, count});
  else if (count >= 1) mentioned.push({term, count});
  else missing.push(term);
});

console.log('\nWell covered (10+ mentions): ' + covered.length);
covered.sort((a,b)=>b.count-a.count).forEach(t => console.log('  OK ' + t.term + ': ' + t.count));

console.log('\nMentioned but shallow (1-9): ' + mentioned.length);
mentioned.sort((a,b)=>b.count-a.count).forEach(t => console.log('  SHALLOW ' + t.term + ': ' + t.count));

console.log('\nNot covered at all: ' + missing.length);
missing.forEach(t => console.log('  MISSING ' + t));

// Also check which posts are thin
console.log('\n=== THIN POSTS (no code) ===');
posts.filter(p => !p.content.includes('<pre')).forEach(p => {
  console.log('  Post ' + p.id + ' [' + p.difficulty + '/' + p.category + ']: ' + p.title.substring(0,70));
});
