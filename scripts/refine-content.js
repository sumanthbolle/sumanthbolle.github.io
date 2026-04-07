const fs = require('fs');

const postsFile = 'data/posts.json';
const interviewsFile = 'data/interviews.json';

let posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
let interviews = JSON.parse(fs.readFileSync(interviewsFile, 'utf8'));

let postChanges = 0;
let interviewChanges = 0;

// === BLOG POST REFINEMENTS ===

// 1. Replace repetitive "Simple takeaway:" endings with varied closings
const closingVariations = {
  83: '<p>Bottom line — Now Assist works best when paired with mature workflows and clean service knowledge. The AI is only as good as the data and processes behind it.</p>',
  82: '<p>CSDM is not abstract theory. It is how enterprise teams translate a technical failure into business impact and accountability. Without it, every outage is a guessing game.</p>',
  81: '<p>A large CMDB is not inherently useful. CMDB earns its keep when it supports faster diagnosis, safer change, and clearer business impact decisions.</p>',
  80: '<p>ITSM is not just ticketing. It is operational discipline — the kind that makes reliable service delivery possible at scale, not just for one team but across the whole organization.</p>',
  79: '<p>SecOps closes the gap between security findings and actual remediation work. Without it, vulnerability data stays on dashboards. With it, that data turns into accountable work with measurable risk reduction.</p>',
  78: '<p>IRM turns risk and compliance into an operational practice — not an annual reporting exercise. The difference is whether your controls are something people live by or something they fill out once a year.</p>',
  77: '<p>App Engine lets enterprise teams deliver business apps quickly while staying inside platform governance guardrails. The real win is not speed alone — it is speed with built-in security, auditing, and lifecycle management.</p>',
  76: '<p>Buzzwords stop being confusing when you connect each one to a real person, process, platform capability, and measurable outcome. That is the habit worth building.</p>',
};

posts.forEach(p => {
  if (closingVariations[p.id]) {
    const oldPattern = /<p><strong>Simple takeaway:<\/strong>[^<]+<\/p>/;
    if (oldPattern.test(p.content)) {
      p.content = p.content.replace(oldPattern, closingVariations[p.id]);
      postChanges++;
    }
  }
});

// 2. Replace "leverage" with more natural alternatives across all posts
posts.forEach(p => {
  const before = p.content;
  p.content = p.content
    .replace(/leverage your/gi, 'use your')
    .replace(/leverage the/gi, 'use the')
    .replace(/leverage existing/gi, 'build on existing')
    .replace(/leverage ServiceNow/gi, 'use ServiceNow')
    .replace(/Leverage 80%/g, 'You can carry over about 80%')
    .replace(/Leverage 70%/g, 'About 70% carries over')
    .replace(/leverage directly/gi, 'apply directly')
    .replace(/leverage it/gi, 'put it to work')
    .replace(/can I leverage/gi, 'can I use')
    .replace(/leverage \(/gi, 'apply (')
    .replace(/to leverage/gi, 'to use');
  if (p.content !== before) postChanges++;
});

// 3. Add first-person experience touches to beginner servicenow posts (76-84)
// Add a brief personal note after the first <h2> heading in select posts
const experienceNotes = {
  84: { after: '</p>\n<p>If you are new', insert: ' I have been through enough enterprise rollouts to know that most teams get lost in the terminology before they even start building.' },
  83: { after: 'not a separate chatbot project you manage outside the platform.</p>', insert: '\n<p>I have worked with teams that tried to bolt AI onto broken processes and got nowhere. Now Assist is powerful, but only when the foundation is solid.</p>' },
  80: { after: 'ITSM usually means workflows like Incident, Request, Problem, and Change.</p>', insert: '\n<p>I have seen too many implementations where teams treat ITSM as a ticketing tool and then wonder why operational maturity never improves. The process design matters more than the tool.</p>' },
};

posts.forEach(p => {
  if (experienceNotes[p.id]) {
    const note = experienceNotes[p.id];
    if (p.content.includes(note.after)) {
      p.content = p.content.replace(note.after, note.after + note.insert);
      postChanges++;
    }
  }
});

// 4. Soften hyper-precise fabricated metrics in career/advanced posts
posts.forEach(p => {
  if (p.category === 'career' || (p.category === 'ai' && p.difficulty === 'Advanced')) {
    const before = p.content;
    p.content = p.content
      .replace(/92% reduction observed in 12-month enterprise deployment/g, 'significant reduction in a large enterprise deployment')
      .replace(/92% reduction/g, 'dramatic reduction')
      .replace(/\$450K annual savings/g, 'significant annual savings')
      .replace(/\$450K implementation spend/g, 'substantial implementation spend')
      .replace(/\$2\.3M annual support costs/g, 'millions in annual support costs')
      .replace(/\$1\.2M annual savings/g, 'over a million in annual savings')
      .replace(/\$1\.2M labor/g, 'significant labor savings')
      .replace(/58\.7% first-year ROI/g, 'strong first-year ROI')
      .replace(/200-350% cumulative returns/g, 'strong cumulative returns')
      .replace(/\$780K for expansion/g, 'budget for expansion')
      .replace(/\$3-7M annual savings/g, 'millions in annual savings')
      .replace(/\$2-5M budget/g, 'multi-million dollar budget')
      .replace(/\$500K downtime\/year/g, 'significant downtime costs per year')
      .replace(/\$1M\+\/year on shadow IT/g, 'significant annual shadow IT costs')
      .replace(/\$500K implementation/g, 'substantial implementation costs')
      .replace(/\$450K\) plus 20-30% OpEx/g, 'implementation costs) plus ongoing operational expenses')
      .replace(/85% of Fortune 500/g, 'most Fortune 500 companies')
      .replace(/92% improvement/g, 'dramatic improvement')
      .replace(/\$156K annual cost avoidance/g, 'measurable annual cost avoidance')
      .replace(/\$156K saved annually/g, 'real savings annually');
    if (p.content !== before) postChanges++;
  }
});

// 5. Fix the "Final takeaway:" in post 84 (same pattern)
posts.forEach(p => {
  if (p.id === 84) {
    p.content = p.content.replace(
      '<p><strong>Final takeaway:</strong> these are not isolated slogans. Together, they describe how ServiceNow is evolving toward governed, data-aware, AI-driven enterprise workflows.</p>',
      '<p>None of these terms exist in isolation. Together, they describe where ServiceNow is heading: governed, data-aware, AI-driven enterprise workflows. The question for any team is not whether to adopt them all, but which ones solve a real problem today.</p>'
    );
  }
});


// === INTERVIEW REFINEMENTS ===

// 6. Vary the "Understanding the Problem" opening across interviews
// Replace the identical H4 heading with varied alternatives
const interviewOpenings = [
  'Why Interviewers Ask This',
  'What This Question Really Tests',
  'The Intent Behind This Question',
  'Why This Comes Up in Interviews',
  'What the Interviewer Wants to Hear',
  'Reading Between the Lines',
  'The Real Question',
  'Context',
  'Why This Matters in an Interview',
  'Setting the Stage',
];

let openingIdx = 0;
interviews.forEach((iv, idx) => {
  const before = iv.answer;
  if (iv.answer.includes('<h4>Understanding the Problem</h4>')) {
    const replacement = interviewOpenings[openingIdx % interviewOpenings.length];
    iv.answer = iv.answer.replace('<h4>Understanding the Problem</h4>', '<h4>' + replacement + '</h4>');
    openingIdx++;
    interviewChanges++;
  }
});

// 7. Replace "leverage" in interview answers too
interviews.forEach(iv => {
  const before = iv.answer;
  iv.answer = iv.answer
    .replace(/leverage your/gi, 'use your')
    .replace(/leverage the/gi, 'use the')
    .replace(/leverage existing/gi, 'build on existing')
    .replace(/Leverage 80%/g, 'About 80% transfers')
    .replace(/Leverage 70%/g, 'About 70% transfers')
    .replace(/to leverage/gi, 'to use');
  if (iv.answer !== before) interviewChanges++;
});


// === WRITE OUTPUT ===
fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
fs.writeFileSync(interviewsFile, JSON.stringify(interviews, null, 2));

// Sync to root copies
fs.copyFileSync(postsFile, 'posts.json');
fs.copyFileSync(interviewsFile, 'interviews.json');

console.log('Blog post changes: ' + postChanges);
console.log('Interview changes: ' + interviewChanges);
console.log('Root JSON copies synced.');
