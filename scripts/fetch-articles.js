// scripts/fetch-articles.js
// =============================================================================
// SERVICENOW LEARNING CONTENT GENERATOR v3.1 (OpenAI)
// =============================================================================
// Target: sumanthbolle.com - The definitive ServiceNow learning resource
//
// PHILOSOPHY:
// - Dynamic content generation for ANY tech professional transitioning to ServiceNow
// - AI-first approach: ServiceNow + AI solving real enterprise problems
// - Senior professional focus: Respect existing expertise, show translation paths
// - Enterprise-grade: Real scenarios, production patterns, business impact
//
// ARCHITECTURE:
// - Domain templates (not hardcoded topics) enable infinite scalability
// - AI content pillars address real organizational transformation
// - Dynamic prompt composition creates unique, relevant articles
//
// MIGRATION NOTE (v3.1):
// - Switched from Perplexity sonar-pro to OpenAI GPT-4o
// - Auth: Authorization: Bearer header (same pattern as Perplexity)
// - Request: messages array with system/user roles (same as Perplexity)
// - Response: choices[0].message.content (same as Perplexity)
// - Hostname: api.openai.com (was api.perplexity.ai)
// =============================================================================

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const { POSTS_FILE, INTERVIEWS_FILE } = require('./content-paths');

// =============================================================================
// CONFIGURATION
// =============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o'; // Options: 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'

const MAX_POSTS = 30;
const MAX_INTERVIEWS = 20;

// =============================================================================
// SERVICENOW KNOWLEDGE BASE - Core Concepts for Translation
// =============================================================================

const SN_CONCEPTS = {
  architecture: {
    core: ['Tables', 'Records', 'sys_id', 'Dictionary', 'ACLs', 'Scoped Applications'],
    data: ['GlideRecord', 'GlideAggregate', 'Reference fields', 'Dot-walking', 'Encoded queries'],
    automation: ['Business Rules', 'Flow Designer', 'Scheduled Jobs', 'Events', 'Script Includes'],
    integration: ['REST API', 'Integration Hub', 'MID Server', 'Import Sets', 'Transform Maps'],
    ui: ['Service Portal', 'Now Experience', 'UI Builder', 'Workspaces', 'Mobile'],
  },

  modules: {
    itsm: { name: 'IT Service Management', tables: ['incident', 'change_request', 'problem', 'sc_request'] },
    itom: { name: 'IT Operations Management', tables: ['em_alert', 'cmdb_ci', 'sa_metric'] },
    hrsd: { name: 'HR Service Delivery', tables: ['sn_hr_core_case', 'sn_hr_core_profile'] },
    csm: { name: 'Customer Service Management', tables: ['sn_customerservice_case', 'customer_account'] },
    secops: { name: 'Security Operations', tables: ['sn_si_incident', 'sn_vul_vulnerability'] },
    spm: { name: 'Strategic Portfolio Management', tables: ['pm_project', 'dmn_demand'] },
  },

  careers: {
    admin: { cert: 'CSA', focus: 'Configuration, user management, basic automation' },
    developer: { cert: 'CAD', focus: 'Scripting, integration, custom applications' },
    implementer: { cert: 'CIS-*', focus: 'Module-specific deep expertise' },
    architect: { cert: 'CTA', focus: 'Enterprise strategy, performance, governance' },
  },
};

// =============================================================================
// DYNAMIC DOMAIN SYSTEM - Scales to Any Tech Background
// =============================================================================

const DOMAIN_CATEGORIES = {
  // HOT DOMAINS - Current high-demand transitions
  hot: {
    weight: 3,
    domains: [
      {
        name: 'Cloud & Infrastructure',
        sources: ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Terraform', 'Docker'],
        snTarget: ['ITOM', 'Cloud Management', 'Discovery', 'Event Management'],
        skills: ['Infrastructure as Code', 'Container orchestration', 'Cloud architecture', 'Multi-cloud management'],
        businessValue: 'unified infrastructure visibility and automated remediation',
      },
      {
        name: 'Modern Frontend',
        sources: ['React', 'Angular', 'Vue.js', 'Next.js', 'TypeScript', 'Svelte'],
        snTarget: ['Service Portal', 'UI Builder', 'Now Experience', 'Workspaces'],
        skills: ['Component architecture', 'State management', 'Responsive design', 'API consumption'],
        businessValue: 'modern employee experiences on enterprise platform',
      },
      {
        name: 'Data Engineering',
        sources: ['Spark', 'Airflow', 'Snowflake', 'dbt', 'Kafka', 'BigQuery'],
        snTarget: ['CMDB', 'Performance Analytics', 'Integration Hub', 'Reporting'],
        skills: ['ETL pipelines', 'Data modeling', 'Stream processing', 'Data quality'],
        businessValue: 'enterprise data architecture with operational intelligence',
      },
      {
        name: 'DevOps & SRE',
        sources: ['Jenkins', 'GitLab CI', 'ArgoCD', 'Prometheus', 'Grafana', 'Ansible'],
        snTarget: ['DevOps Change Velocity', 'Event Management', 'Service Mapping', 'ATF'],
        skills: ['CI/CD pipelines', 'Monitoring', 'Incident response', 'Automation'],
        businessValue: 'enterprise DevOps with change risk intelligence',
      },
      {
        name: 'AI & Machine Learning',
        sources: ['PyTorch', 'TensorFlow', 'Hugging Face', 'LangChain', 'OpenAI API', 'scikit-learn'],
        snTarget: ['Now Assist', 'Predictive Intelligence', 'Virtual Agent', 'AI Search'],
        skills: ['Model training', 'NLP', 'RAG architecture', 'ML pipelines', 'Prompt engineering'],
        businessValue: 'enterprise AI with governance and security built in',
      },
      {
        name: 'Full Stack Development',
        sources: ['Node.js', 'Python', 'Ruby on Rails', 'Django', 'Express', 'MongoDB'],
        snTarget: ['App Engine', 'Scripted REST', 'Script Includes', 'Flow Designer'],
        skills: ['API development', 'Database design', 'Authentication', 'Full-stack architecture'],
        businessValue: 'rapid enterprise application development with built-in governance',
      },
      {
        name: 'CRM & Customer Platforms',
        sources: ['Salesforce', 'HubSpot', 'Zendesk', 'Dynamics 365', 'Freshdesk'],
        snTarget: ['CSM', 'Customer Workflows', 'Agent Workspace', 'Case Management'],
        skills: ['Customer journey mapping', 'Case management', 'SLA management', 'Omnichannel support'],
        businessValue: 'unified customer service across IT and business',
      },
      {
        name: 'Security & Compliance',
        sources: ['Splunk', 'CrowdStrike', 'Palo Alto', 'Qualys', 'Tenable', 'SIEM tools'],
        snTarget: ['SecOps', 'GRC', 'Vulnerability Response', 'Threat Intelligence'],
        skills: ['Threat detection', 'Vulnerability management', 'Compliance automation', 'Security orchestration'],
        businessValue: 'security operations integrated with IT remediation',
      },
    ],
  },

  // LEGACY DOMAINS - Still valuable, platforms declining
  legacy: {
    weight: 2,
    domains: [
      {
        name: 'Legacy ITSM Platforms',
        sources: ['BMC Remedy', 'HP Service Manager', 'CA Service Desk', 'Cherwell', 'Ivanti'],
        snTarget: ['ITSM', 'ITOM', 'Service Catalog', 'CMDB'],
        skills: ['ITIL processes', 'Workflow design', 'Integration patterns', 'Change management'],
        businessValue: 'modern cloud-native ITSM with faster innovation cycles',
      },
      {
        name: 'Enterprise ERP',
        sources: ['SAP', 'Oracle EBS', 'PeopleSoft', 'JD Edwards', 'Workday'],
        snTarget: ['HRSD', 'Integration Hub', 'Employee Center', 'Strategic Portfolio Management'],
        skills: ['Enterprise processes', 'Master data management', 'Compliance', 'Integration architecture'],
        businessValue: 'employee experience layer and workflow orchestration across ERP',
      },
      {
        name: 'Traditional Development',
        sources: ['Java Enterprise', '.NET Framework', 'C#', 'Spring Boot', 'WebSphere', 'WCF'],
        snTarget: ['App Engine', 'Scoped Applications', 'Script Includes', 'Integration'],
        skills: ['Object-oriented design', 'Enterprise patterns', 'API development', 'Transaction management'],
        businessValue: 'rapid application development with built-in governance',
      },
      {
        name: 'Database Administration',
        sources: ['Oracle DBA', 'SQL Server', 'PostgreSQL', 'MySQL', 'DB2'],
        snTarget: ['Platform data model', 'Performance optimization', 'CMDB architecture', 'Reporting'],
        skills: ['Query optimization', 'Data modeling', 'Indexing strategies', 'Backup and recovery'],
        businessValue: 'platform performance and data architecture expertise',
      },
      {
        name: 'Mainframe & Legacy Systems',
        sources: ['COBOL', 'JCL', 'CICS', 'AS/400', 'z/OS', 'VSAM'],
        snTarget: ['Scheduled Jobs', 'Business Rules', 'Integration', 'Batch processing'],
        skills: ['Enterprise-scale thinking', 'Batch processing', 'Transaction integrity', 'Mission-critical systems'],
        businessValue: 'enterprise discipline applied to modern cloud platform',
      },
      {
        name: 'Microsoft Ecosystem',
        sources: ['SharePoint', 'Power Platform', 'Power Automate', 'Dynamics', 'Teams'],
        snTarget: ['Flow Designer', 'Employee Center', 'Virtual Agent', 'Integration Hub'],
        skills: ['Workflow automation', 'Portal development', 'Business process design', 'Collaboration'],
        businessValue: 'enterprise service management beyond document workflows',
      },
      {
        name: 'Project & Portfolio Tools',
        sources: ['Jira', 'Confluence', 'Monday.com', 'Asana', 'MS Project', 'CA Clarity'],
        snTarget: ['Strategic Portfolio Management', 'ITBM', 'Agile Development', 'Resource Management'],
        skills: ['Agile methodologies', 'Portfolio management', 'Resource planning', 'Reporting'],
        businessValue: 'integrated IT business management with service delivery',
      },
    ],
  },

  // EMERGING DOMAINS - Future-forward transitions
  emerging: {
    weight: 2,
    domains: [
      {
        name: 'Platform Engineering',
        sources: ['Backstage', 'Port', 'Humanitec', 'Internal Developer Platforms'],
        snTarget: ['App Engine', 'Developer Portal', 'Service Catalog', 'Flow Designer'],
        skills: ['Developer experience', 'Self-service platforms', 'Golden paths', 'API management'],
        businessValue: 'enterprise developer platform with governance built-in',
      },
      {
        name: 'Low-Code/No-Code',
        sources: ['OutSystems', 'Mendix', 'Appian', 'Bubble', 'Retool'],
        snTarget: ['App Engine Studio', 'Flow Designer', 'UI Builder', 'Creator Workflows'],
        skills: ['Visual development', 'Citizen development', 'Process automation', 'Rapid prototyping'],
        businessValue: 'enterprise-grade low-code with security and compliance',
      },
      {
        name: 'Observability & AIOps',
        sources: ['Datadog', 'New Relic', 'Dynatrace', 'PagerDuty', 'Moogsoft'],
        snTarget: ['Event Management', 'Health Log Analytics', 'AIOps', 'Service Mapping'],
        skills: ['Event correlation', 'Anomaly detection', 'Root cause analysis', 'Alert management'],
        businessValue: 'intelligent operations with automated incident creation',
      },
    ],
  },
};

// =============================================================================
// AI CONTENT PILLARS - Enterprise AI Transformation
// =============================================================================

const AI_PILLARS = {
  capabilities: [
    {
      name: 'Now Assist',
      focus: 'Generative AI for enterprise service delivery',
      businessProblems: [
        'Agents spending 40% of time on documentation',
        'Employees waiting hours for simple answers',
        'Knowledge articles outdated and unfindable',
        'Code development bottlenecks',
      ],
      outcomes: ['70% faster case resolution', '50% reduction in documentation time', '24/7 intelligent self-service'],
    },
    {
      name: 'Predictive Intelligence',
      focus: 'Machine learning for classification and routing',
      businessProblems: [
        'Inconsistent ticket categorization',
        'Misrouted requests causing delays',
        'Manual triage consuming skilled resources',
        'No pattern recognition in incident data',
      ],
      outcomes: ['85% auto-classification accuracy', '60% reduction in routing errors', 'Proactive problem identification'],
    },
    {
      name: 'Virtual Agent',
      focus: 'Conversational AI for self-service',
      businessProblems: [
        'Help desk overwhelmed with repetitive questions',
        'Employees frustrated with menu-based systems',
        'After-hours support gaps',
        'Inconsistent answers across channels',
      ],
      outcomes: ['40-60% deflection rates', '24/7 availability', 'Consistent employee experience'],
    },
    {
      name: 'Document Intelligence',
      focus: 'AI-powered document processing',
      businessProblems: [
        'Manual data entry from forms and PDFs',
        'Onboarding document processing delays',
        'Contract review bottlenecks',
        'Compliance document management',
      ],
      outcomes: ['90% reduction in manual entry', 'Hours to minutes processing', 'Automated workflow triggering'],
    },
    {
      name: 'AI-Powered Search',
      focus: 'Intelligent knowledge retrieval',
      businessProblems: [
        'Employees can\'t find relevant information',
        'Search returns too many irrelevant results',
        'Knowledge silos across departments',
        'Duplicate questions to support teams',
      ],
      outcomes: ['3x improvement in search relevance', '50% reduction in duplicate tickets', 'Cross-silo knowledge access'],
    },
  ],

  strategies: [
    {
      name: 'AI-First Service Desk',
      description: 'Transform traditional help desk into intelligent support',
      components: ['Virtual Agent', 'Now Assist', 'Predictive Intelligence', 'Knowledge Management'],
      metrics: ['MTTR', 'First Contact Resolution', 'Employee Satisfaction', 'Cost per Ticket'],
    },
    {
      name: 'Intelligent IT Operations',
      description: 'AIOps-driven infrastructure management',
      components: ['Event Management', 'Health Log Analytics', 'Service Mapping', 'Auto-remediation'],
      metrics: ['MTTR', 'Alert Noise Reduction', 'Automated Resolutions', 'Availability'],
    },
    {
      name: 'AI-Enhanced Employee Experience',
      description: 'Personalized, proactive employee services',
      components: ['Employee Center', 'Now Assist', 'Journey Management', 'Predictive HR'],
      metrics: ['eNPS', 'Time to Resolution', 'Self-Service Adoption', 'Onboarding Time'],
    },
    {
      name: 'Cognitive Security Operations',
      description: 'AI-powered threat detection and response',
      components: ['SecOps', 'Threat Intelligence', 'Vulnerability Prioritization', 'Auto-containment'],
      metrics: ['MTTR for Security', 'False Positive Reduction', 'Vulnerability Closure Rate'],
    },
    {
      name: 'Intelligent Automation Factory',
      description: 'Scale automation with AI-assisted development',
      components: ['Now Assist for Code', 'Flow Designer', 'Integration Hub', 'Process Mining'],
      metrics: ['Automation Rate', 'Development Velocity', 'Process Efficiency'],
    },
  ],

  challenges: [
    { name: 'Data Quality', solution: 'Foundation before AI: clean data, consistent categorization' },
    { name: 'Change Management', solution: 'Human-in-the-loop, gradual automation, trust building' },
    { name: 'ROI Measurement', solution: 'Baseline metrics, A/B testing, business outcome focus' },
    { name: 'Security & Privacy', solution: 'Data governance, ACL awareness, audit trails' },
    { name: 'Hallucination Risk', solution: 'RAG architecture, grounding, confidence thresholds' },
    { name: 'Integration Complexity', solution: 'Knowledge source strategy, data pipeline design' },
  ],
};

// =============================================================================
// DYNAMIC TOPIC GENERATORS
// =============================================================================

function generateDomainTransitionTopic(domain, category) {
  const source = domain.sources[Math.floor(Math.random() * domain.sources.length)];
  const target = domain.snTarget[Math.floor(Math.random() * domain.snTarget.length)];
  const skill = domain.skills[Math.floor(Math.random() * domain.skills.length)];

  const templates = [
    {
      titlePattern: `From ${source} to ServiceNow: A Senior Engineer's Translation Guide`,
      scenario: `A senior ${domain.name.toLowerCase()} professional with 10+ years of ${source} experience joins a ServiceNow project. They have deep expertise in ${skill.toLowerCase()} but the ServiceNow paradigm feels foreign.`,
      questions: [
        `How does my ${source} experience translate to ServiceNow ${target}?`,
        `What concepts from ${skill.toLowerCase()} apply directly vs need rethinking?`,
        `Where will I feel at home and where will I struggle?`,
        `How do I leverage my background to add value faster?`,
        `What's the realistic timeline to become productive?`,
        `How do I position my experience in ServiceNow interviews?`,
      ],
    },
    {
      titlePattern: `${source} Expert's Guide to ServiceNow ${target}`,
      scenario: `An organization is implementing ServiceNow ${target}. They need someone who understands both ${source} patterns and ServiceNow. A ${domain.name.toLowerCase()} specialist asks: "Can I bridge both worlds?"`,
      questions: [
        `What's the ServiceNow equivalent of ${source}'s core features?`,
        `How do integration patterns differ between platforms?`,
        `What ${skill.toLowerCase()} knowledge transfers directly?`,
        `Where does ServiceNow's approach fundamentally differ?`,
        `How do I become the ${source}-ServiceNow bridge expert?`,
        `What salary premium does dual expertise command?`,
      ],
    },
    {
      titlePattern: `Why ${domain.name} Professionals Thrive in ServiceNow`,
      scenario: `A ${domain.name.toLowerCase()} professional considers ServiceNow. They hear mixed signals - some say it's "just ticketing," others say it's a massive platform. They ask: "Is this a real career move or a step backward?"`,
      questions: [
        `Is ServiceNow a legitimate career path for ${domain.name.toLowerCase()} experts?`,
        `What makes ${skill.toLowerCase()} valuable in ServiceNow?`,
        `How does ServiceNow compare architecturally to ${source}?`,
        `What's the job market like for people with my background?`,
        `Do I need to "start over" or can I leverage my experience?`,
        `What's the business value of ${domain.businessValue}?`,
      ],
    },
  ];

  const template = templates[Math.floor(Math.random() * templates.length)];

  return {
    query: `Write an educational article: "${template.titlePattern}"

SCENARIO: ${template.scenario}

QUESTIONS TO ANSWER:
${template.questions.map((q) => `- Q: ${q}`).join('\n')}

KEY CONTEXT:
- Source expertise: ${domain.sources.join(', ')}
- ServiceNow targets: ${domain.snTarget.join(', ')}
- Transferable skills: ${domain.skills.join(', ')}
- Business value: ${domain.businessValue}

Write for a senior professional who doesn't need basic concepts explained, but needs the translation map to their new environment. Include specific analogies, honest trade-offs, and production-learned insights.`,
    category: 'career',
    learningPath: 'career',
    difficulty: category === 'hot' ? 'Intermediate' : 'Beginner',
    forPersona: [domain.name, 'Career Changers'],
    uniqueId: `career-${domain.name.toLowerCase().replace(/\s+/g, '-')}-${source.toLowerCase().replace(/\s+/g, '-')}`,
  };
}

function generateAITopic() {
  const pillarTypes = ['capability', 'strategy', 'challenge', 'implementation'];
  const pillarType = pillarTypes[Math.floor(Math.random() * pillarTypes.length)];

  if (pillarType === 'capability') {
    const capability = AI_PILLARS.capabilities[Math.floor(Math.random() * AI_PILLARS.capabilities.length)];
    const problem = capability.businessProblems[Math.floor(Math.random() * capability.businessProblems.length)];

    return {
      query: `Write an educational article: "Solving '${problem}' with ServiceNow ${capability.name}"

SCENARIO: An organization struggles with: "${problem}". Leadership has heard about ServiceNow ${capability.name} but is skeptical. They ask: "Does this actually work, or is it just AI hype?"

QUESTIONS TO ANSWER:
- Q: What is ServiceNow ${capability.name} technically? (Architecture, not marketing)
- Q: How does it specifically address "${problem}"?
- Q: What data and prerequisites are needed? (Honest assessment)
- Q: What are realistic outcomes? (${capability.outcomes.join(', ')})
- Q: What are the limitations and edge cases?
- Q: How do I build a business case? (ROI metrics, implementation timeline)

Focus on ${capability.focus}. Include technical architecture for architects and business value for executives. Be honest about what works and what doesn't.`,
      category: 'ai',
      learningPath: 'ai',
      difficulty: 'Intermediate',
      forPersona: ['Architects', 'IT Leaders', 'AI Engineers'],
      uniqueId: `ai-${capability.name.toLowerCase().replace(/\s+/g, '-')}-${problem.slice(0, 20).toLowerCase().replace(/\s+/g, '-')}`,
    };
  }

  if (pillarType === 'strategy') {
    const strategy = AI_PILLARS.strategies[Math.floor(Math.random() * AI_PILLARS.strategies.length)];

    return {
      query: `Write an educational article: "${strategy.name}: A Complete Implementation Blueprint"

SCENARIO: A CIO wants to implement "${strategy.name}" but needs a concrete plan, not vendor slides. They ask: "What does this actually look like? What do we need to succeed?"

QUESTIONS TO ANSWER:
- Q: What components make up ${strategy.name}? (${strategy.components.join(', ')})
- Q: What's the implementation sequence? (Phase 1, 2, 3)
- Q: What metrics prove success? (${strategy.metrics.join(', ')})
- Q: What organizational changes are required?
- Q: What's the realistic timeline and budget?
- Q: What are common failure modes and how to avoid them?

CONTEXT: ${strategy.description}

Write for a senior IT leader who will present this to the board. Include executive summary, technical architecture, and change management considerations.`,
      category: 'ai',
      learningPath: 'ai',
      difficulty: 'Advanced',
      forPersona: ['Executives', 'Architects', 'Program Managers'],
      uniqueId: `ai-strategy-${strategy.name.toLowerCase().replace(/\s+/g, '-')}`,
    };
  }

  if (pillarType === 'challenge') {
    const challenge = AI_PILLARS.challenges[Math.floor(Math.random() * AI_PILLARS.challenges.length)];

    return {
      query: `Write an educational article: "Conquering ${challenge.name} in ServiceNow AI Implementation"

SCENARIO: An organization's AI initiative is struggling because of ${challenge.name.toLowerCase()} issues. The team asks: "How do successful organizations overcome this?"

QUESTIONS TO ANSWER:
- Q: Why does ${challenge.name.toLowerCase()} derail AI projects?
- Q: What are the warning signs early in implementation?
- Q: What's the solution approach? (${challenge.solution})
- Q: What tools and processes help?
- Q: How do we measure improvement?
- Q: What does "good enough" look like to proceed?

Be practical and honest. Include real examples, anti-patterns, and recovery strategies for teams already struggling.`,
      category: 'ai',
      learningPath: 'ai',
      difficulty: 'Advanced',
      forPersona: ['Project Managers', 'Architects', 'Data Engineers'],
      uniqueId: `ai-challenge-${challenge.name.toLowerCase().replace(/\s+/g, '-')}`,
    };
  }

  // Implementation deep-dive
  const capability = AI_PILLARS.capabilities[Math.floor(Math.random() * AI_PILLARS.capabilities.length)];

  return {
    query: `Write an educational article: "Hands-On: Building Production-Ready ${capability.name} Solutions"

SCENARIO: A ServiceNow developer needs to implement ${capability.name} for real users. They've seen demos but ask: "How do I build this properly? What do the demos skip?"

QUESTIONS TO ANSWER:
- Q: What's the technical architecture I need to build?
- Q: What are the step-by-step implementation phases?
- Q: How do I handle security, ACLs, and data access?
- Q: What testing strategy ensures quality?
- Q: How do I monitor and improve over time?
- Q: What production issues should I anticipate?

Include working code examples, configuration details, and troubleshooting guides. Focus on what the official documentation doesn't tell you.`,
    category: 'ai',
    learningPath: 'ai',
    difficulty: 'Advanced',
    forPersona: ['Developers', 'Architects'],
    uniqueId: `ai-impl-${capability.name.toLowerCase().replace(/\s+/g, '-')}`,
  };
}

function generateCoreTechnicalTopic() {
  const areas = [
    {
      area: 'Performance Engineering',
      scenarios: [
        'Instance running slow with 5+ second form loads',
        'Reports timing out with large datasets',
        'Business Rules causing transaction delays',
        'Client-side scripts freezing browser',
      ],
      concepts: ['Query optimization', 'Index strategy', 'Script efficiency', 'Caching', 'Async patterns'],
    },
    {
      area: 'Integration Architecture',
      scenarios: [
        'Integrating with 20+ external systems',
        'Real-time vs batch integration decisions',
        'Error handling across distributed systems',
        'API versioning and backward compatibility',
      ],
      concepts: ['REST patterns', 'Integration Hub', 'MID Server', 'Error handling', 'Retry logic'],
    },
    {
      area: 'Security & Access Control',
      scenarios: [
        'Complex ACL requirements by department',
        'Data segregation for multi-tenant',
        'Audit and compliance requirements',
        'Sensitive data handling',
      ],
      concepts: ['ACL design', 'Role hierarchy', 'Domain separation', 'Encryption', 'Audit trails'],
    },
    {
      area: 'Upgrade-Safe Development',
      scenarios: [
        'Customizations breaking on every upgrade',
        'Update Set conflicts in team development',
        'OOB functionality overwritten',
        'Instance divergence from baseline',
      ],
      concepts: ['Extension vs modification', 'Scoped apps', 'Update Set strategy', 'ATF testing'],
    },
    {
      area: 'Flow Designer Patterns',
      scenarios: [
        'Complex multi-level approval workflows',
        'Error handling and retry in flows',
        'Integration with external systems',
        'Parallel processing requirements',
      ],
      concepts: ['Subflows', 'Error handling', 'Data pills', 'Actions', 'Triggers'],
    },
    {
      area: 'CMDB & Data Architecture',
      scenarios: [
        'CMDB data nobody trusts',
        'Discovery gaps and stale data',
        'Complex CI relationships',
        'CMDB-driven automation failing',
      ],
      concepts: ['CI identification', 'Reconciliation', 'Discovery patterns', 'Data quality metrics'],
    },
  ];

  const selected = areas[Math.floor(Math.random() * areas.length)];
  const scenario = selected.scenarios[Math.floor(Math.random() * selected.scenarios.length)];

  return {
    query: `Write an educational article: "Mastering ${selected.area}: ${scenario.split(' ').slice(0, 4).join(' ')}..."

SCENARIO: ${scenario}. The team has tried basic fixes but nothing works. A senior architect is brought in. They ask: "What do experts do differently?"

QUESTIONS TO ANSWER:
- Q: What's the root cause diagnosis approach?
- Q: What are the key concepts I need to master? (${selected.concepts.join(', ')})
- Q: What's the step-by-step solution pattern?
- Q: What are the common mistakes and anti-patterns?
- Q: How do I prevent this in future development?
- Q: How do I measure success?

Include production-tested code examples, before/after comparisons, and real metrics. Write for a senior professional who needs depth, not basics.`,
    category: 'architecture',
    learningPath: 'architecture',
    difficulty: 'Advanced',
    forPersona: ['Senior Developers', 'Architects'],
    uniqueId: `tech-${selected.area.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
  };
}

// =============================================================================
// TOPIC SELECTION ENGINE
// =============================================================================

function selectTopic(existingPosts) {
  const categoryCounts = {};
  const uniqueIds = new Set();

  for (const post of existingPosts) {
    const cat = post.category || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    if (post.uniqueId) uniqueIds.add(post.uniqueId);
  }

  console.log(`  📊 Current distribution:`, JSON.stringify(categoryCounts));

  const aiCount = categoryCounts['ai'] || 0;
  const careerCount = categoryCounts['career'] || 0;
  const techCount = (categoryCounts['architecture'] || 0) + (categoryCounts['development'] || 0);

  // Weighted random selection favoring underrepresented categories
  // Target: ~40% AI, ~35% Career, ~25% Technical
  const aiWeight = Math.max(1, 12 - aiCount);
  const careerWeight = Math.max(1, 10 - careerCount);
  const techWeight = Math.max(1, 8 - techCount);
  const totalWeight = aiWeight + careerWeight + techWeight;

  const rand = Math.random() * totalWeight;

  let topic;
  if (rand < aiWeight) {
    console.log(`  🎯 Generating AI topic...`);
    topic = generateAITopic();
  } else if (rand < aiWeight + careerWeight) {
    console.log(`  🎯 Generating career transition topic...`);
    const categories = Object.entries(DOMAIN_CATEGORIES);
    const totalDomainWeight = categories.reduce((sum, [_, cat]) => sum + cat.weight, 0);
    let domainRand = Math.random() * totalDomainWeight;

    let selectedDomains = DOMAIN_CATEGORIES.hot.domains;
    let selectedCategory = 'hot';

    for (const [catName, cat] of categories) {
      if (domainRand < cat.weight) {
        selectedCategory = catName;
        selectedDomains = cat.domains;
        break;
      }
      domainRand -= cat.weight;
    }

    const domain = selectedDomains[Math.floor(Math.random() * selectedDomains.length)];
    topic = generateDomainTransitionTopic(domain, selectedCategory);
  } else {
    console.log(`  🎯 Generating technical topic...`);
    topic = generateCoreTechnicalTopic();
  }

  // Check for duplicate uniqueId (regenerate if needed)
  let attempts = 0;
  while (uniqueIds.has(topic.uniqueId) && attempts < 5) {
    console.log(`  ⚠️ Duplicate uniqueId, regenerating...`);
    topic =
      rand < aiWeight
        ? generateAITopic()
        : rand < aiWeight + careerWeight
          ? generateDomainTransitionTopic(
              DOMAIN_CATEGORIES.hot.domains[Math.floor(Math.random() * DOMAIN_CATEGORIES.hot.domains.length)],
              'hot'
            )
          : generateCoreTechnicalTopic();
    attempts++;
  }

  return topic;
}

// =============================================================================
// INTERVIEW TOPIC GENERATORS
// =============================================================================

function generateInterviewTopic() {
  const categories = [
    {
      category: 'AI Implementation',
      scenarios: [
        'Now Assist returning irrelevant or hallucinated responses',
        'Predictive Intelligence accuracy stuck at 60%',
        'Virtual Agent adoption extremely low',
        'AI implementation not showing ROI',
      ],
    },
    {
      category: 'Performance',
      scenarios: [
        'Business Rule causing 100k record update timeout',
        'Complex report timing out in production',
        'Form load taking 8+ seconds',
        'Integration causing transaction delays',
      ],
    },
    {
      category: 'Architecture',
      scenarios: [
        'Update Set conflicts in 10-developer team',
        'Customizations breaking on every upgrade',
        'Multi-instance strategy decisions',
        'CMDB nobody trusts or uses',
      ],
    },
    {
      category: 'Integration',
      scenarios: [
        'REST integration failing intermittently',
        'Import Set creating duplicates nightly',
        'Real-time vs batch integration decision',
        'External system authentication complexity',
      ],
    },
    {
      category: 'Security',
      scenarios: [
        'ACL blocking users who should have access',
        'Sensitive data exposure concerns',
        'Cross-scope access requirements',
        'Audit compliance gaps',
      ],
    },
  ];

  const selected = categories[Math.floor(Math.random() * categories.length)];
  const scenario = selected.scenarios[Math.floor(Math.random() * selected.scenarios.length)];

  return {
    query: `Create ONE senior ServiceNow interview question.

SCENARIO: ${scenario}

Test understanding of:
- Root cause diagnosis approach
- Multiple solution options with trade-offs
- Production considerations
- What separates good from great answers

Include 8-12 line code example showing problem AND solution. Focus on "why" not just "how".`,
    category: selected.category,
  };
}

// =============================================================================
// PROMPTS - Scenario-Question-Answer Format
// =============================================================================

const ARTICLE_PROMPT = `You are a senior ServiceNow architect writing for sumanthbolle.com - the definitive ServiceNow learning resource serving as a SINGLE INTERFACE for ALL tech professionals in the enterprise era.

TARGET AUDIENCE:
- Senior IT professionals (10-25 years experience) transitioning from other platforms to ServiceNow
- They have deep expertise in their domain (Java, .NET, SAP, Oracle, Salesforce, AWS, Remedy, mainframe, etc.)
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
1. Return ONLY valid JSON - no markdown, no text before/after
2. Content: 1200-1600 words
3. End with complete sentence and closing tag
4. Use HTML only: <h2>, <h3>, <p>, <ul>, <li>, <pre>, <strong>, <em>
5. Code must be complete and working (8-15 lines, real tables)
6. No citations [1], no **markdown**

JSON FORMAT:
{"title":"Unique Specific Title","excerpt":"2-3 sentences: scenario + outcome.","readTime":"12 min read","content":"<h2>The Scenario</h2><p>...</p>..."}`;

const INTERVIEW_PROMPT = `You are a senior ServiceNow architect conducting interviews for senior/lead positions.

CANDIDATE PROFILE:
- 5+ years ServiceNow OR 10+ years other enterprise platforms transitioning
- Should demonstrate deep understanding, production experience
- Must show problem-solving approach, not just syntax

QUESTION STYLE:
- Realistic production scenario with specific context
- Test diagnosis approach, not just solution
- Include what separates good from great answers
- Cover edge cases and failure modes

RULES:
1. Return ONLY valid JSON - no markdown, no text before/after
2. Answer: 500-700 words
3. End with complete sentence and closing tag
4. Use HTML: <p>, <h4>, <ul>, <li>, <pre>, <strong>
5. Code MUST be 8-12 lines with REAL working logic:
   - Include variable declarations with real table names
   - Include actual query conditions (addQuery/addEncodedQuery)
   - Include processing logic inside loops
   - NO stubs, NO placeholders, NO "// your code here"
6. No citations, no markdown

JSON FORMAT:
{"question":"Scenario-based question?","answer":"<h4>Understanding the Problem</h4><p>...</p><h4>The Solution</h4><pre>// complete working code</pre><h4>Senior Considerations</h4><ul><li>...</li></ul>","difficulty":"Senior","company":"ServiceNow"}`;

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
  const max = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  return max + 1;
}

function formatDate(d = new Date()) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function isDuplicateByPrefix(existing, title, len = 60) {
  const normalize = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, len);
  const t = normalize(title);
  return existing.some((p) => normalize(p.title) === t);
}

function cleanResponseToLikelyJson(text) {
  return (text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function parseJsonFromResponse(cleaned) {
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize raw newlines inside JSON string literals
  jsonStr = jsonStr.replace(/"([^"]*(?:\\.)*([^"]*)*)"/g, (m, content) => {
    return `"${content.replace(/[\r\n]+/g, '\\n').replace(/\t/g, '\\t')}"`;
  });
  return JSON.parse(jsonStr);
}

// Strip citation markers (safety net - keeps content clean)
function stripCitations(text) {
  if (!text) return text;
  // Preserve code blocks, strip citations only from prose
  const codeBlocks = [];
  let preserved = text.replace(/<pre>([\s\S]*?)<\/pre>/gi, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  // Remove [1], [2][3], [1,2], [1-3] style citations
  preserved = preserved.replace(/\s*\[\d+(?:[,\-]\d+)*\](?:\[\d+(?:[,\-]\d+)*\])*/g, '');
  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    preserved = preserved.replace(`__CODE_BLOCK_${i}__`, block);
  });
  return preserved;
}

// =============================================================================
// OPENAI API (replaces Perplexity)
// =============================================================================

function callOpenAI(prompt, systemPrompt, { maxTokens = 5000, temperature = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API timeout (120s)')), 120000);

    const data = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
    });

    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`OpenAI API ${res.statusCode}: ${body.substring(0, 300)}`));
              return;
            }

            const content = JSON.parse(body).choices?.[0]?.message?.content;
            content ? resolve(content) : reject(new Error('No content in OpenAI response'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

async function callWithRetry(prompt, systemPrompt, maxRetries = 3, options = {}) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      return await callOpenAI(prompt, systemPrompt, options);
    } catch (e) {
      console.log(`  Attempt ${i} failed: ${e.message}`);
      if (i === maxRetries) throw e;
      // Backoff between retries
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  const today = formatDate();
  const iso = nowISO();

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  🚀 ServiceNow Content Generator v3.1 (OpenAI)                              ║
║  Dynamic Topic Engine • AI-First Strategy • Enterprise Professional Focus    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  🤖 Model: ${OPENAI_MODEL.padEnd(66)}║
║  🔑 API Key: ${(OPENAI_API_KEY.substring(0, 8) + '...' + OPENAI_API_KEY.slice(-4)).padEnd(64)}║
║  📅 Date: ${today.padEnd(67)}║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // =========================================================================
  // ARTICLE GENERATION
  // =========================================================================
  const posts = loadJson(POSTS_FILE);
  console.log(`📚 ARTICLE GENERATION`);
  console.log(`   Existing posts: ${posts.length}/${MAX_POSTS}`);

  const topic = selectTopic(posts);
  console.log(`   Learning Path: ${topic.learningPath}`);
  console.log(`   Category: ${topic.category}`);
  console.log(`   Difficulty: ${topic.difficulty || 'N/A'}`);
  console.log(`   Query preview: ${topic.query.substring(0, 80)}...`);

  let newArticle = null;
  for (let attempt = 1; attempt <= 2 && !newArticle; attempt++) {
    try {
      const raw = await callWithRetry(topic.query, ARTICLE_PROMPT, 3);
      const data = parseJsonFromResponse(cleanResponseToLikelyJson(raw));
      if (data?.title && data?.content && !isDuplicateByPrefix(posts, data.title)) {
        newArticle = {
          id: nextId(posts),
          title: data.title,
          excerpt: stripCitations(data.excerpt || ''),
          readTime: data.readTime || '12 min read',
          content: stripCitations(data.content),
          category: topic.category,
          learningPath: topic.learningPath,
          difficulty: topic.difficulty,
          forPersona: topic.forPersona,
          uniqueId: topic.uniqueId,
          date: today,
          dateISO: iso,
        };
        console.log(`   ✅ ${data.title.substring(0, 60)}...`);
      } else if (data?.title) {
        console.log(`   ⚠️ Duplicate title detected`);
      }
    } catch (e) {
      console.error(`   ❌ Attempt ${attempt}: ${e.message}`);
    }
  }

  const allPosts = (newArticle ? [newArticle, ...posts] : posts).slice(0, MAX_POSTS);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));
  console.log(`   💾 Saved ${allPosts.length} posts`);

  await new Promise((r) => setTimeout(r, 3000));

  // =========================================================================
  // INTERVIEW GENERATION
  // =========================================================================
  const interviews = loadJson(INTERVIEWS_FILE);
  console.log(`\n🎯 INTERVIEW GENERATION`);
  console.log(`   Existing: ${interviews.length}/${MAX_INTERVIEWS}`);

  const intTopic = generateInterviewTopic();
  console.log(`   Category: ${intTopic.category}`);

  let newInterview = null;
  try {
    // Interviews are scenario-based - generative content
    const raw = await callWithRetry(intTopic.query, INTERVIEW_PROMPT, 3);
    const data = parseJsonFromResponse(cleanResponseToLikelyJson(raw));

    if (data?.question && data?.answer) {
      const isDupe = interviews.some(
        (q) => (q.question || '').substring(0, 50).toLowerCase() === data.question.substring(0, 50).toLowerCase()
      );

      if (!isDupe) {
        newInterview = {
          id: nextId(interviews),
          question: data.question,
          answer: stripCitations(data.answer),
          difficulty: data.difficulty || 'Senior',
          company: 'ServiceNow',
          category: intTopic.category,
          date: today,
          dateISO: iso,
        };
        console.log(`   ✅ Created: ID ${newInterview.id}`);
      } else {
        console.log(`   ⚠️ Duplicate question`);
      }
    }
  } catch (e) {
    console.log(`   ❌ ${e.message}`);
  }

  const allInterviews = (newInterview ? [newInterview, ...interviews] : interviews).slice(0, MAX_INTERVIEWS);
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(allInterviews, null, 2));
  console.log(`   💾 Saved ${allInterviews.length} interviews`);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  📊 GENERATION SUMMARY                                                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Article:   ${(newArticle ? '✅ ' + newArticle.title.substring(0, 55) + '...' : '❌ None generated').padEnd(66)}║
║  Interview: ${(newInterview ? '✅ ' + newInterview.category : '❌ None generated').padEnd(66)}║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
}

main()
  .then(() => {
    console.log('--- Running Validation ---\n');
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
