// scripts/fetch-articles.js
// Generates ServiceNow learning content in Scenario-Question-Answer format
// Organized by learning paths: Foundations → ITSM → Modules → Architecture
// Target: sumanthbolle.com - The definitive ServiceNow learning resource

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const POSTS_FILE = 'posts.json';
const INTERVIEWS_FILE = 'interviews.json';

const MAX_POSTS = 30;
const MAX_INTERVIEWS = 20;

// =============================================================================
// LEARNING PATH STRUCTURE - Certification Aligned
// =============================================================================

const LEARNING_PATHS = {
  foundations: { order: 1, name: 'Platform Foundations', cert: 'CSA' },
  itsm: { order: 2, name: 'IT Service Management', cert: 'CSA, CIS-ITSM' },
  development: { order: 3, name: 'Development & Scripting', cert: 'CAD' },
  integration: { order: 4, name: 'Integration & Automation', cert: 'CAD' },
  modules: { order: 5, name: 'Specialized Modules', cert: 'CIS-*' },
  architecture: { order: 6, name: 'Architecture & Best Practices', cert: 'CTA' },
};

// =============================================================================
// TOPIC LIBRARY - 25+ Scenario-Based Topics
// =============================================================================

const TOPICS = [
  // =========================================================================
  // FOUNDATIONS - Why ServiceNow Exists & Core Concepts
  // =========================================================================
  {
    query: `Write an educational article: "What is ServiceNow and Why Did It Disrupt Enterprise IT?"

SCENARIO: A 15-year IT veteran (sysadmin/developer) is evaluating whether to learn ServiceNow. They've used Jira, Remedy, and built custom apps. They ask: "What makes ServiceNow different from dozens of ITSM tools I've seen?"

QUESTIONS TO ANSWER:
- Q: How is ServiceNow different from Jira/Remedy/BMC? (It's a platform, not just ticketing)
- Q: What does "single platform" actually mean for enterprises? (One data model, one workflow engine)
- Q: Why do Fortune 500 companies pay millions for this? (ROI from consolidation, automation)
- Q: What real problems can I solve that I couldn't before? (Cross-department workflows, CMDB-driven automation)
- Q: Is the job market real or hype? (231,000 developers needed by 2028, salary data)

Include the market context: 85% of Fortune 500 use ServiceNow, $103B projected market.`,
    category: 'foundations',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'CSA',
    forPersona: ['Career Changers', 'IT Veterans'],
  },
  {
    query: `Write an educational article: "ServiceNow Architecture for Experienced Developers"

SCENARIO: A .NET developer with 10 years experience starts a ServiceNow role. Day one confusion: "Where's the database? Where do I write code? What's this Update Set thing? Why does everything feel different?"

QUESTIONS TO ANSWER:
- Q: Where is my code stored? (Script fields in database records - code IS data)
- Q: Why can't I just use SQL? (GlideRecord abstracts security, business logic)
- Q: What's the difference between Global and Scoped apps? (Isolation, upgrade safety)
- Q: Why Update Sets instead of Git? (Instance-based development model)
- Q: Where's the MVC pattern I'm used to? (Server scripts, UI policies, client scripts)
- Q: What will feel familiar vs completely different? (JavaScript yes, but platform-specific APIs)

Use analogies to .NET/Java patterns they already know.`,
    category: 'foundations',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'CSA',
    forPersona: ['Developers', 'Career Changers'],
  },
  {
    query: `Write an educational article: "ServiceNow Tables, Records, and Data Model Explained"

SCENARIO: A DBA with Oracle/SQL Server experience starts ServiceNow work. They think in tables, joins, foreign keys. They ask: "How does ServiceNow's database work? What are these sys_id values everywhere?"

QUESTIONS TO ANSWER:
- Q: Can I access the database directly? (No - and why that's actually good for security)
- Q: What's a sys_id and why is everything referenced by it? (32-char GUID, universal key)
- Q: How does table inheritance work? (Task → Incident, extends pattern)
- Q: How do "joins" work in ServiceNow? (Reference fields, dot-walking)
- Q: What's the Dictionary and why does it matter? (Schema metadata, field definitions)
- Q: How do I see the actual ERD/schema? (Table relationships, schema map)

Show SQL-to-GlideRecord mental mapping.`,
    category: 'foundations',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'CSA',
    forPersona: ['DBAs', 'Developers'],
  },
  {
    query: `Write an educational article: "Navigating ServiceNow Like a Power User"

SCENARIO: A new admin opens their first ServiceNow instance. Application Navigator, forms, lists, dozens of modules. They ask: "How do I find anything? How do experienced users work 10x faster?"

QUESTIONS TO ANSWER:
- Q: What's the fastest way to find anything? (Global search, .list trick, navigator filter)
- Q: How is navigation organized? (Applications, Modules, Menus hierarchy)
- Q: What are these sys_* tables I keep seeing? (System tables pattern)
- Q: What keyboard shortcuts save the most time? (Ctrl+Shift+J, .config, etc.)
- Q: How do I see what's happening under the hood? (System logs, debugging)
- Q: How do I customize my own navigation? (Favorites, homepage)

Include the .list, .do, .config URL hacks.`,
    category: 'foundations',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'CSA',
    forPersona: ['Admins', 'All Roles'],
  },

  // =========================================================================
  // ITSM - The Core That Powers 80% of Jobs
  // =========================================================================
  {
    query: `Write an educational article: "Incident Management Done Right in ServiceNow"

SCENARIO: A help desk manager with 8 years using Remedy/Zendesk implements ServiceNow Incident Management. They ask: "I know ITIL incident process. What does ServiceNow add? How do I configure it properly?"

QUESTIONS TO ANSWER:
- Q: What's the default incident workflow and when should I customize it? (States, transitions)
- Q: How do assignment rules actually work? (Group rules, user rules, priority)
- Q: What's the relationship between Priority, Impact, and Urgency? (Matrix calculation)
- Q: How do SLAs attach and drive notifications? (Task SLA, breach rules)
- Q: When do I use Business Rule vs Flow for automation? (Decision framework)
- Q: What integrations make incidents more powerful? (CMDB, monitoring, email)

Include before/after: email support chaos vs ServiceNow automation.`,
    category: 'itsm',
    learningPath: 'itsm',
    difficulty: 'Intermediate',
    certAlignment: 'CSA, CIS-ITSM',
    forPersona: ['Admins', 'ITSM Practitioners'],
  },
  {
    query: `Write an educational article: "Change Management - Balancing Control and Speed"

SCENARIO: An IT manager's team makes production changes without tracking. Outages happen, nobody knows what changed. They ask: "How do I implement Change Management without slowing developers to a crawl?"

QUESTIONS TO ANSWER:
- Q: Standard vs Normal vs Emergency - when to use each? (Risk-based selection)
- Q: Do I really need a CAB (Change Advisory Board)? (When yes, when no)
- Q: How do I automate low-risk while controlling high-risk? (Auto-approval rules)
- Q: How does Change connect to CMDB? (Affected CIs, impact analysis)
- Q: What's the conflict detection and blackout window? (Change collision)
- Q: How do I measure Change Management success? (Metrics, failed change rate)

Balance governance with developer productivity.`,
    category: 'itsm',
    learningPath: 'itsm',
    difficulty: 'Intermediate',
    certAlignment: 'CSA, CIS-ITSM',
    forPersona: ['IT Managers', 'Admins'],
  },
  {
    query: `Write an educational article: "CMDB - Why It Matters and How to Keep It Accurate"

SCENARIO: An architect hears "we need a CMDB" but the org failed twice before. Data got stale, nobody trusted it. They ask: "What makes ServiceNow CMDB different? How do I keep it accurate this time?"

QUESTIONS TO ANSWER:
- Q: What's a CI vs just an asset? (Configuration vs ownership)
- Q: How does Discovery actually work? (Probes, sensors, patterns)
- Q: What CI relationships matter most? (runs_on, depends_on, hosted_on)
- Q: How do I connect CMDB to Incident/Change/Problem? (Impact, root cause)
- Q: What's Service Mapping vs Discovery? (Application topology)
- Q: How do I measure CMDB health? (Completeness, compliance, correctness)

Address the real problem: "Server down - who's affected? What services break?"`,
    category: 'itsm',
    learningPath: 'itsm',
    difficulty: 'Advanced',
    certAlignment: 'CIS-ITSM',
    forPersona: ['Architects', 'ITSM Practitioners'],
  },
  {
    query: `Write an educational article: "Service Catalog - Building an IT Storefront Employees Actually Use"

SCENARIO: IT gets hundreds of emails asking for the same things: laptop, software, new hire setup. They want a Service Catalog but ask: "How do I design it so people actually use it instead of emailing?"

QUESTIONS TO ANSWER:
- Q: Catalog Items vs Record Producers - when to use each? (Request vs create record)
- Q: How do Variables and Variable Sets work? (Dynamic forms)
- Q: How do I handle multi-level approvals? (Approval workflows)
- Q: What makes a catalog "employee-friendly"? (UX, categories, search)
- Q: How do I add dynamic behavior to catalog forms? (Catalog client scripts)
- Q: How do I measure catalog adoption? (Usage metrics, time savings)

Include a real "New Hire Onboarding" item example.`,
    category: 'itsm',
    learningPath: 'itsm',
    difficulty: 'Intermediate',
    certAlignment: 'CSA, CIS-ITSM',
    forPersona: ['Admins', 'Developers'],
  },

  // =========================================================================
  // DEVELOPMENT - No-Code to Pro-Code Progression
  // =========================================================================
  {
    query: `Write an educational article: "GlideRecord Mastery - The Most Important ServiceNow API"

SCENARIO: A JavaScript developer joins a ServiceNow team. They know JS but GlideRecord isn't standard JavaScript. They ask: "What is GlideRecord? Why can't I use fetch() or SQL? How do I do CRUD?"

QUESTIONS TO ANSWER:
- Q: Why does ServiceNow have its own data API? (ACLs, business rules, abstraction)
- Q: GlideRecord vs GlideAggregate - when to use each? (Row data vs counts/sums)
- Q: Why gr.next() instead of forEach? (Record-by-record processing pattern)
- Q: How do I query with multiple conditions? (addQuery, addEncodedQuery)
- Q: What's the N+1 query problem and how do I avoid it? (Performance anti-pattern)
- Q: Server-side vs client-side GlideRecord? (GlideAjax for client needs)

Include 4+ complete code examples with real tables.`,
    category: 'development',
    learningPath: 'development',
    difficulty: 'Intermediate',
    certAlignment: 'CAD',
    forPersona: ['Developers'],
  },
  {
    query: `Write an educational article: "Business Rules - The Complete Execution Model"

SCENARIO: A developer creates a Business Rule to auto-set a field. Strange things happen: infinite loops, performance issues, fields not updating. They ask: "What did I do wrong? How do Business Rules actually execute?"

QUESTIONS TO ANSWER:
- Q: Before vs After vs Async vs Display - which do I choose? (Execution timing)
- Q: What do 'current' and 'previous' contain at each stage? (Data availability)
- Q: Why did my rule cause an infinite loop? How to prevent it? (Recursion guard)
- Q: When is Business Rule vs Flow Designer vs Workflow? (Decision framework)
- Q: How do I update related records without performance issues? (Best practices)
- Q: What's setWorkflow(false) and when is it dangerous? (Bypass patterns)

Include working code for each Business Rule type.`,
    category: 'development',
    learningPath: 'development',
    difficulty: 'Intermediate',
    certAlignment: 'CAD',
    forPersona: ['Developers', 'Admins'],
  },
  {
    query: `Write an educational article: "Script Includes - Building Reusable Code Libraries"

SCENARIO: A developer copies the same code into multiple Business Rules. A senior dev says "put that in a Script Include" but doesn't explain. They ask: "What's a Script Include? How do I call it? What's this 'extend' syntax?"

QUESTIONS TO ANSWER:
- Q: Class-based vs function-based Script Includes - when to use each? (Patterns)
- Q: How do I call a Script Include from a Business Rule? (Instantiation)
- Q: What's 'Client Callable' and how does GlideAjax work? (Client-server bridge)
- Q: How does scope affect Script Include access? (Cross-scope patterns)
- Q: What's the prototype and extend pattern? (Inheritance)
- Q: How do I unit test a Script Include? (ATF patterns)

Show complete Script Include + calling code + GlideAjax example.`,
    category: 'development',
    learningPath: 'development',
    difficulty: 'Intermediate',
    certAlignment: 'CAD',
    forPersona: ['Developers'],
  },
  {
    query: `Write an educational article: "Client Scripts vs UI Policies - Making Forms Dynamic"

SCENARIO: An admin needs to make a field mandatory when another field equals a value. They can use UI Policy or Client Script. They ask: "What's the difference? When do I use code vs configuration?"

QUESTIONS TO ANSWER:
- Q: UI Policy vs Client Script - decision matrix? (Complexity, maintenance)
- Q: onChange vs onLoad vs onSubmit - when does each fire? (Event timing)
- Q: What's g_form and what are the key methods? (Form API)
- Q: Why doesn't my Client Script work on mobile/Service Portal? (Context issues)
- Q: How do I get server data without page refresh? (GlideAjax pattern)
- Q: What are the performance implications? (Script execution cost)

Show same use case solved both ways.`,
    category: 'development',
    learningPath: 'development',
    difficulty: 'Intermediate',
    certAlignment: 'CAD, CSA',
    forPersona: ['Developers', 'Admins'],
  },
  {
    query: `Write an educational article: "Flow Designer - The Future of ServiceNow Automation"

SCENARIO: A team has hundreds of legacy Workflows. ServiceNow pushes Flow Designer. The architect asks: "Should we migrate? What can Flow Designer do that Workflow can't?"

QUESTIONS TO ANSWER:
- Q: Flow Designer vs Workflow Editor - real differences? (Architecture, capabilities)
- Q: What are Triggers, Actions, Subflows, and Spokes? (Component model)
- Q: Can I use JavaScript in Flow Designer? When should I? (Script steps)
- Q: What about Integration Hub and Spokes? (Pre-built connectors)
- Q: How do I handle errors and retries? (Error handling patterns)
- Q: What's the migration strategy? (When to move, when to leave)

Connect to no-code → low-code → pro-code philosophy.`,
    category: 'development',
    learningPath: 'development',
    difficulty: 'Intermediate',
    certAlignment: 'CAD',
    forPersona: ['Developers', 'Architects'],
  },

  // =========================================================================
  // INTEGRATION - Connecting ServiceNow to the Enterprise
  // =========================================================================
  {
    query: `Write an educational article: "REST API Integration - Consuming and Exposing APIs"

SCENARIO: A developer needs to integrate ServiceNow with an external HR system. They've done REST before but ask: "How does ServiceNow handle outbound calls? How do I expose ServiceNow data?"

QUESTIONS TO ANSWER:
- Q: RESTMessageV2 - how do I make outbound calls? (Configuration + scripting)
- Q: How do I handle authentication (Basic, OAuth, API Keys)? (Auth profiles)
- Q: Scripted REST APIs - how do I expose ServiceNow data? (Custom endpoints)
- Q: What about error handling, retries, timeouts? (Production patterns)
- Q: How do I debug integration failures? (Logging, REST API Explorer)
- Q: REST vs Integration Hub - when to use which? (Decision framework)

Include complete outbound + inbound examples.`,
    category: 'integration',
    learningPath: 'integration',
    difficulty: 'Advanced',
    certAlignment: 'CAD',
    forPersona: ['Developers', 'Architects'],
  },
  {
    query: `Write an educational article: "Import Sets and Transform Maps - Bulk Data Integration"

SCENARIO: An org needs to import 50,000 user records from HR nightly. API is too slow. Someone mentions "Import Sets." They ask: "What's the pattern for bulk data loading?"

QUESTIONS TO ANSWER:
- Q: What's an Import Set Table and why is it needed? (Staging concept)
- Q: How do Transform Maps work? What's coalesce? (Mapping, deduplication)
- Q: How do I handle updates vs inserts (upsert)? (Coalesce fields)
- Q: What about data validation and error handling? (Transform scripts)
- Q: How do I schedule recurring imports? (Data sources, scheduled jobs)
- Q: Performance considerations for large imports? (Batch size, indexing)

Show complete Import Set → Transform → Target flow.`,
    category: 'integration',
    learningPath: 'integration',
    difficulty: 'Advanced',
    certAlignment: 'CAD',
    forPersona: ['Developers', 'Architects'],
  },

  // =========================================================================
  // MODULES - Specialized Product Deep-Dives
  // =========================================================================
  {
    query: `Write an educational article: "HRSD Explained - Why Organizations Buy It"

SCENARIO: An HR director evaluates ServiceNow HRSD. They use spreadsheets, email, legacy portal. They ask: "What problems does HRSD solve? Is it worth the license cost?"

QUESTIONS TO ANSWER:
- Q: What's included in HRSD vs add-ons? (Core vs additional products)
- Q: What's Employee Center vs Service Portal? (Employee experience)
- Q: What's Employee Journey Management? (Lifecycle orchestration)
- Q: How does HRSD handle sensitive data and access? (Security model)
- Q: What are typical use cases? (Onboarding, offboarding, inquiries)
- Q: What ROI do organizations actually see? (Metrics: hours saved, satisfaction)

Include real metrics: "10,000+ hours saved, 23% satisfaction improvement."`,
    category: 'modules',
    learningPath: 'modules',
    difficulty: 'Intermediate',
    certAlignment: 'CIS-HR',
    forPersona: ['HR Professionals', 'Decision Makers'],
  },
  {
    query: `Write an educational article: "CSM - How ServiceNow Competes with Salesforce"

SCENARIO: A CTO's company uses Salesforce Service Cloud but hates the complexity and cost. They hear ServiceNow CSM is a Gartner Leader. They ask: "How is CSM different? Can it replace our CRM?"

QUESTIONS TO ANSWER:
- Q: What does CSM include vs what needs other modules? (Scope)
- Q: How does Case management differ from Incident? (External vs internal)
- Q: What's the customer portal capability? (Self-service)
- Q: How does CSM integrate with ServiceNow ITSM? (Single platform advantage)
- Q: What about field service, contracts, entitlements? (Extended capabilities)
- Q: Honest Salesforce vs ServiceNow CSM comparison? (Strengths/weaknesses)

Reference 2024 Gartner Magic Quadrant Leader positioning.`,
    category: 'modules',
    learningPath: 'modules',
    difficulty: 'Intermediate',
    certAlignment: 'CIS-CSM',
    forPersona: ['Decision Makers', 'Customer Service Leaders'],
  },
  {
    query: `Write an educational article: "SecOps - Connecting Security Alerts to IT Remediation"

SCENARIO: A CISO's security team uses SIEM for alerts but handoff to IT for remediation is broken. Emails get lost, vulnerabilities sit unfixed. They ask: "How does SecOps close this gap?"

QUESTIONS TO ANSWER:
- Q: What's Security Incident Response vs Vulnerability Response? (Two products)
- Q: How does SecOps connect to ITSM? (Incident, Change, CMDB)
- Q: What integrations exist with security tools? (SIEM, scanners, threat intel)
- Q: How do I prioritize thousands of vulnerabilities? (Risk scoring, CMDB)
- Q: What's Threat Intelligence? (Enrichment, indicators)
- Q: What skills do I need to implement SecOps? (Career opportunity)

Premium salary module - highlight career opportunity.`,
    category: 'modules',
    learningPath: 'modules',
    difficulty: 'Advanced',
    certAlignment: 'CIS-SecOps',
    forPersona: ['Security Professionals', 'Architects'],
  },
  {
    query: `Write an educational article: "ITOM - Managing Infrastructure Through ServiceNow"

SCENARIO: An infrastructure manager has dozens of monitoring tools (Nagios, Datadog, CloudWatch) but no single view. Alert fatigue is real. They ask: "Can ServiceNow ITOM actually unify this?"

QUESTIONS TO ANSWER:
- Q: What are the ITOM components? (Discovery, Event Management, etc.)
- Q: How does Discovery find and map infrastructure? (Probes, patterns)
- Q: What's the MID Server and why do I need it? (On-premise bridge)
- Q: How does Event Management reduce alert noise? (Correlation, dedup)
- Q: What's Service Mapping vs Discovery? (Application topology)
- Q: How does ITOM connect to ITSM? (Incident, Change, CMDB)

Infrastructure/DevOps career path content.`,
    category: 'modules',
    learningPath: 'modules',
    difficulty: 'Advanced',
    certAlignment: 'CIS-ITOM',
    forPersona: ['Infrastructure Engineers', 'DevOps'],
  },

  // =========================================================================
  // ARCHITECTURE - Senior/Architect Level
  // =========================================================================
  {
    query: `Write an educational article: "Instance Strategy - Dev/Test/Prod and Update Set Management"

SCENARIO: A company scales ServiceNow. One instance does everything. The architect asks: "Should we have multiple instances? How do we move changes safely?"

QUESTIONS TO ANSWER:
- Q: Dev/Test/Prod - what's the ideal instance strategy? (Environment model)
- Q: How do Update Sets actually work? (Capture, move, commit)
- Q: When should I clone vs manually refresh? (Data strategies)
- Q: What are Application Scopes and why do they matter? (Isolation)
- Q: How do I handle data in non-prod instances? (Sanitization, subsets)
- Q: What's ATF's role in CI/CD? (Automated testing)

Connect to DevOps/CI-CD patterns they know.`,
    category: 'architecture',
    learningPath: 'architecture',
    difficulty: 'Advanced',
    certAlignment: 'CTA',
    forPersona: ['Architects', 'Senior Developers'],
  },
  {
    query: `Write an educational article: "Performance Engineering - Building ServiceNow for Scale"

SCENARIO: An organization's ServiceNow is slow. Forms take 5+ seconds, reports time out. A senior developer must fix it. They ask: "How do I diagnose and fix performance issues?"

QUESTIONS TO ANSWER:
- Q: What are common causes of slow instances? (Scripts, queries, ACLs)
- Q: How do I identify slow queries? (Query rules, slow query log)
- Q: What's the impact of too many Business Rules? (Execution time)
- Q: How do indexes work? When do I need custom ones? (Database tuning)
- Q: Client-side vs server-side performance issues? (Diagnosis)
- Q: What platform limits should I know? (Quotas, timeouts)

Include before/after optimization examples.`,
    category: 'architecture',
    learningPath: 'architecture',
    difficulty: 'Advanced',
    certAlignment: 'CTA, CAD',
    forPersona: ['Senior Developers', 'Architects'],
  },
  {
    query: `Write an educational article: "ServiceNow Certification Path - CSA to CTA Strategy"

SCENARIO: An IT professional wants to break into ServiceNow. Dozens of certifications exist. They ask: "What's the order? Which certifications matter for jobs? How long does each take?"

QUESTIONS TO ANSWER:
- Q: CSA first - what does it cover? How to prepare? (Foundation cert)
- Q: CAD vs CIS - developer vs specialist path? (Career direction)
- Q: Which CIS certification should I get first? (Market demand)
- Q: What's the CTA and is it worth $7000? (Elite certification)
- Q: How do I maintain certifications? (Delta exams, annual renewal)
- Q: Do certifications alone get you hired? (Experience reality)

Address: official training doesn't match exam format.`,
    category: 'career',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'All',
    forPersona: ['Career Changers', 'All Roles'],
  },
  {
    query: `Write an educational article: "Career Transition - Leveraging IT Experience for ServiceNow"

SCENARIO: A 15-year IT veteran (sysadmin, developer, DBA) wants to move into ServiceNow. Strong skills but no ServiceNow experience. They ask: "How do I leverage what I know? Why hire me over someone with ServiceNow experience?"

QUESTIONS TO ANSWER:
- Q: I'm a sysadmin - which ServiceNow role fits me? (Admin path)
- Q: I'm a developer - how is ServiceNow dev different? (JavaScript + platform)
- Q: I'm a DBA - does database knowledge help? (Data model understanding)
- Q: How do I get "experience" without a ServiceNow job? (PDI portfolio)
- Q: What should I build to show skills? (Demo projects)
- Q: How do I position my background in interviews? (Translation strategy)

Address chicken-and-egg: need experience to get experience.`,
    category: 'career',
    learningPath: 'foundations',
    difficulty: 'Beginner',
    certAlignment: 'CSA',
    forPersona: ['Career Changers'],
  },
];

// =============================================================================
// INTERVIEW TOPICS - Scenario-Based Senior Questions
// =============================================================================

const INTERVIEW_TOPICS = [
  {
    query: `Create ONE senior ServiceNow interview question on GlideRecord performance.

SCENARIO: A developer writes a Business Rule that loops through incidents and updates related records. Works in dev, times out in production with 100k records.

Test understanding of:
- How to identify the performance problem
- GlideAggregate vs GlideRecord decision
- setLimit, encoded queries, pagination
- N+1 query anti-pattern

Include 8-12 line code showing inefficient pattern AND optimized solution.`,
    category: 'Performance',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Business Rule execution order.

SCENARIO: A developer creates an after Business Rule that updates a related record. Sometimes works, sometimes the update doesn't happen. Confused about when current.update() is needed.

Test understanding of:
- Before vs After timing and 'current' contents
- When setWorkflow(false) is needed/dangerous
- Transaction boundaries
- Recursion prevention

Include 8-12 line code demonstrating proper after rule with related updates.`,
    category: 'Architecture',
  },
  {
    query: `Create ONE senior ServiceNow interview question on ACL design and debugging.

SCENARIO: Security admin creates ACL to restrict access but users who should have access are blocked. Debug logs show confusing "ACL evaluation" messages.

Test understanding of:
- ACL evaluation order (table → field → row)
- How to read security debug logs
- Role requirements vs condition/script
- Common ACL mistakes

Include 8-12 line ACL script with role checks and conditions.`,
    category: 'Security',
  },
  {
    query: `Create ONE senior ServiceNow interview question on REST integration error handling.

SCENARIO: Developer builds outbound REST integration that usually works. Occasionally external system returns errors or times out, team has no visibility into failures.

Test understanding of:
- RESTMessageV2 try-catch pattern
- HTTP status code checking
- Retry logic with backoff
- Production logging/debugging

Include 8-12 line code with complete error handling.`,
    category: 'Integration',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Import Set duplicate prevention.

SCENARIO: Integration imports 50,000 records nightly. Duplicates keep appearing - same record inserted instead of updated.

Test understanding of:
- Coalesce fields and common mistakes
- Transform Map scripting
- Error handling without failing entire import
- Performance for large imports

Include 8-12 line Transform script with proper deduplication.`,
    category: 'Integration',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Script Include patterns.

SCENARIO: Team has copy-pasted the same function into 15 Business Rules. Want to refactor but unsure about structure.

Test understanding of:
- Class-based vs function-based design
- Cross-scope accessibility
- Client-callable with GlideAjax
- Unit testing approaches

Include 8-12 line Script Include with proper structure + calling example.`,
    category: 'Scripting',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Flow Designer vs scripted automation.

SCENARIO: Architect deciding between Flow Designer and Business Rules for complex approval workflow. Team is split.

Test understanding of:
- When Flow Designer is right vs scripted
- Error handling and retry in flows
- Subflow patterns
- Performance and debugging

Provide clear decision criteria with practical example.`,
    category: 'Architecture',
  },
  {
    query: `Create ONE senior ServiceNow interview question on Update Set best practices.

SCENARIO: Development team has Update Set collisions. Changes work in dev but break in prod. Need better process.

Test understanding of:
- Update Set naming and scoping
- Handling conflicts
- Proper promotion order
- What should NOT be in Update Sets

Practical guidance, not just theory.`,
    category: 'Architecture',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function loadJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return [];
}

function nextId(items) {
  return items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

function formatDate(d = new Date()) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function isDuplicateByPrefix(existing, title, len = 60) {
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, len);
  return existing.some((p) => normalize(p.title) === normalize(title));
}

function cleanResponseToLikelyJson(text) {
  return (text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function parseJsonFromResponse(cleaned) {
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let jsonStr = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  jsonStr = jsonStr.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (m, content) => {
    return `"${content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t')}"`;
  });
  return JSON.parse(jsonStr);
}

function pickTopic(topics, existing) {
  const shuffled = [...topics].sort(() => Math.random() - 0.5);
  for (const topic of shuffled.slice(0, 5)) {
    const keyTerms = topic.query.match(/\b(GlideRecord|GlideAggregate|ACL|Import Set|REST|Flow Designer|Business Rule|Script Include|CMDB|ITSM|HRSD|CSM|SecOps|ITOM|Change|Incident|Catalog|Update Set|CSA|CAD|CTA)\b/gi) || [];
    const hasSimilar = existing.some(p => {
      const title = (p.title || '').toLowerCase();
      return keyTerms.filter(t => title.includes(t.toLowerCase())).length >= 2;
    });
    if (!hasSimilar) return topic;
  }
  return shuffled[0];
}

// =============================================================================
// API
// =============================================================================

function callPerplexity(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API timeout')), 120000);
    const data = JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4500,
      temperature: 0.7,
    });

    const req = https.request({
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode}: ${body.substring(0, 200)}`));
            return;
          }
          const content = JSON.parse(body).choices?.[0]?.message?.content;
          content ? resolve(content) : reject(new Error('Invalid response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); reject(e); });
    req.write(data);
    req.end();
  });
}

async function callWithRetry(prompt, systemPrompt, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      return await callPerplexity(prompt, systemPrompt);
    } catch (e) {
      console.log(`Attempt ${i} failed: ${e.message}`);
      if (i === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

// =============================================================================
// PROMPTS - Scenario-Question-Answer Format
// =============================================================================

const ARTICLE_PROMPT = `You are a senior ServiceNow architect writing for sumanthbolle.com - the definitive ServiceNow learning resource for global developers, admins, and architects.

TARGET AUDIENCE:
- IT professionals with 10+ years in OTHER domains (Java, .NET, infrastructure) learning ServiceNow
- They understand IT concepts but need ServiceNow-specific patterns explained
- They want "WHY" not just "HOW"
- They learn through scenarios connecting to problems they already understand

WRITING STYLE:
- Mentor-like: friendly, expert, never condescending
- Use analogies to concepts they know (SQL→GlideRecord, Git→Update Sets)
- Every section answers a specific QUESTION
- Include "I've seen this in production" examples
- Be honest about trade-offs

REQUIRED STRUCTURE (Scenario-Question-Answer):

<h2>The Scenario</h2>
<p>3-4 sentences painting a realistic problem.</p>

<h2>Key Questions Answered</h2>
<h3>Q: [First specific question they'd ask]?</h3>
<p><strong>A:</strong> Detailed answer with explanation...</p>

<h3>Q: [Second question]?</h3>
<p><strong>A:</strong> Answer...</p>
(Continue for 4-6 questions)

<h2>Hands-On Example</h2>
<pre>// 8-15 lines of working code with comments
// Use real table names (incident, sys_user, etc.)
// Complete logic, NOT stubs</pre>
<p>Explanation of the code...</p>

<h2>Common Mistakes to Avoid</h2>
<ul>
<li><strong>Mistake:</strong> Description. <strong>Fix:</strong> Solution.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
<li>Main point 1</li>
<li>Main point 2</li>
<li>Main point 3</li>
</ul>

RULES:
1. Return ONLY valid JSON - no markdown
2. Content: 1000-1400 words
3. End with complete sentence and closing tag
4. Use HTML only: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>, <em>
5. Code: 8-15 lines, real tables, complete logic
6. No citations [1], no **markdown**

JSON FORMAT:
{"title":"Clear Title Describing What They Learn","excerpt":"2-3 sentences: scenario + what reader can do after.","readTime":"10 min read","content":"<h2>The Scenario</h2><p>...</p>..."}`;

const INTERVIEW_PROMPT = `You are a senior ServiceNow architect conducting interviews. Create challenging scenario-based questions testing real problem-solving.

STYLE:
- Realistic production scenarios
- Test "why" not just "how"
- Include what senior candidates should mention

RULES:
1. Return ONLY valid JSON
2. Answer: 500-700 words
3. End with complete sentence
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. Code: 8-12 lines, real tables, working logic, NO stubs
6. No citations, no markdown

JSON FORMAT:
{"question":"Scenario-based question?","answer":"<h4>Understanding the Problem</h4><p>...</p><h4>The Solution</h4><pre>// code</pre><h4>Senior Considerations</h4><ul><li>...</li></ul>","difficulty":"Senior","company":"ServiceNow"}`;

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  if (!PERPLEXITY_API_KEY) {
    console.error('PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  const today = formatDate();
  const iso = nowISO();

  // Article
  const posts = loadJson(POSTS_FILE);
  const topic = pickTopic(TOPICS, posts);

  console.log(`\n📚 ARTICLE: ${topic.learningPath} | ${topic.category} | ${topic.difficulty}`);

  let newArticle = null;
  for (let attempt = 1; attempt <= 2 && !newArticle; attempt++) {
    try {
      const raw = await callWithRetry(topic.query, ARTICLE_PROMPT);
      const data = parseJsonFromResponse(cleanResponseToLikelyJson(raw));
      if (data?.title && data?.content && !isDuplicateByPrefix(posts, data.title)) {
        newArticle = {
          id: nextId(posts),
          title: data.title,
          excerpt: data.excerpt || '',
          readTime: data.readTime || '10 min read',
          content: data.content,
          category: topic.category,
          learningPath: topic.learningPath,
          difficulty: topic.difficulty,
          certAlignment: topic.certAlignment,
          forPersona: topic.forPersona,
          date: today,
          dateISO: iso,
        };
        console.log(`✅ ${data.title.substring(0, 60)}...`);
      }
    } catch (e) {
      console.error(`❌ Attempt ${attempt}: ${e.message}`);
    }
  }

  const allPosts = (newArticle ? [newArticle, ...posts] : posts).slice(0, MAX_POSTS);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));

  await new Promise((r) => setTimeout(r, 3000));

  // Interview
  const interviews = loadJson(INTERVIEWS_FILE);
  const intTopic = INTERVIEW_TOPICS[Math.floor(Math.random() * INTERVIEW_TOPICS.length)];

  console.log(`\n🎯 INTERVIEW: ${intTopic.category}`);

  let newInterview = null;
  try {
    const raw = await callWithRetry(intTopic.query, INTERVIEW_PROMPT);
    const data = parseJsonFromResponse(cleanResponseToLikelyJson(raw));
    if (data?.question && data?.answer) {
      const isDupe = interviews.some(q => 
        (q.question || '').substring(0, 45).toLowerCase() === data.question.substring(0, 45).toLowerCase()
      );
      if (!isDupe) {
        newInterview = {
          id: nextId(interviews),
          question: data.question,
          answer: data.answer,
          difficulty: data.difficulty || 'Senior',
          company: data.company || 'ServiceNow',
          category: intTopic.category,
          date: today,
          dateISO: iso,
        };
        console.log(`✅ ${data.question.substring(0, 60)}...`);
      }
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
  }

  const allInterviews = (newInterview ? [newInterview, ...interviews] : interviews).slice(0, MAX_INTERVIEWS);
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
}

main()
  .then(() => {
    console.log('\n--- Validation ---\n');
    try {
      execSync('node scripts/validate-content.js', { stdio: 'inherit' });
    } catch (e) {
      process.exit(e.status || 1);
    }
  })
  .catch((e) => {
    console.error(`Fatal: ${e.message}`);
    process.exit(1);
  });
