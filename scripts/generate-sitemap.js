// scripts/generate-sitemap.js
// Generates sitemap.xml from posts.json and interviews.json

const fs = require('fs');
const path = require('path');
const { POSTS_FILE, INTERVIEWS_FILE } = require('./content-paths');

const SITE_URL = 'https://sumanthbolle.com';
const SITEMAP_FILE = path.join(process.cwd(), 'sitemap.xml');

// Static pages on your site
const STATIC_PAGES = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/summaverick', priority: '1.0', changefreq: 'daily' },
  { url: '/servicenow', priority: '1.0', changefreq: 'hourly' },
  { url: '/flights', priority: '1.0', changefreq: 'daily' },
  { url: '/metals', priority: '0.9', changefreq: 'hourly' },
  { url: '/save-yourself', priority: '0.9', changefreq: 'weekly' },
  { url: '/upsc', priority: '0.9', changefreq: 'daily' },
  { url: '/blog', priority: '0.9', changefreq: 'daily' },
  { url: '/interviews', priority: '0.9', changefreq: 'daily' },
  { url: '/tutorials.html', priority: '0.9', changefreq: 'weekly' },
  { url: '/quiz.html', priority: '0.8', changefreq: 'weekly' },
  { url: '/technical-terms-quiz.html', priority: '0.8', changefreq: 'weekly' },
  { url: '/about', priority: '0.7', changefreq: 'monthly' },
  { url: '/contact', priority: '0.6', changefreq: 'monthly' },
];

/**
 * Format date to YYYY-MM-DD for sitemap
 */
function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  
  // Handle "Dec 13, 2025" format
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Fall through to default
  }
  
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate XML for a single URL entry
 */
function generateUrlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Load JSON file safely
 */
function loadJson(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.log(`Warning: Could not load ${file}`);
  }
  return [];
}

/**
 * Generate slug from title
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

/**
 * Main function to generate sitemap
 */
function buildSitemap(options = {}) {
  const siteUrl = options.siteUrl || SITE_URL;
  const outputPath = options.outputPath || SITEMAP_FILE;
  const archiveIndexPath = options.archiveIndexPath
    || path.join(process.cwd(), 'data', 'upsc', 'archive-index.json');
  console.log('🗺️  Generating sitemap.xml...\n');
  
  const today = options.today || new Date().toISOString().split('T')[0];
  const urls = [];
  
  // Add static pages
  console.log('📄 Adding static pages...');
  for (const page of STATIC_PAGES) {
    urls.push(generateUrlEntry(
      `${siteUrl}${page.url}`,
      today,
      page.changefreq,
      page.priority
    ));
  }
  console.log(`   Added ${STATIC_PAGES.length} static pages`);
  
  // Add blog posts
  console.log('📝 Adding blog posts...');
  const posts = options.posts || loadJson(POSTS_FILE);
  for (const post of posts) {
    const slug = slugify(post.title);
    const lastmod = formatDate(post.date);
    urls.push(generateUrlEntry(
      `${siteUrl}/blog/${post.id}/${slug}`,
      lastmod,
      'weekly',
      '0.8'
    ));
  }
  console.log(`   Added ${posts.length} blog posts`);
  
  // Add interview pages
  console.log('📚 Adding interview questions...');
  const interviews = options.interviews || loadJson(INTERVIEWS_FILE);
  for (const interview of interviews) {
    const slug = slugify(interview.question.substring(0, 50));
    const lastmod = formatDate(interview.date);
    urls.push(generateUrlEntry(
      `${siteUrl}/interviews/${interview.id}/${slug}`,
      lastmod,
      'weekly',
      '0.7'
    ));
  }
  console.log(`   Added ${interviews.length} interview pages`);

  console.log('📚 Adding UPSC study archive...');
  const archive = loadJson(archiveIndexPath);
  const notes = archive && Array.isArray(archive.notes) ? archive.notes : [];
  const publishedNotes = notes.filter((note) => (
    note && ['source-backed', 'reviewed'].includes(note.status)
    && typeof note.path === 'string'
    && note.path.startsWith('upsc-study/')
    && !note.path.split('/').includes('..')
    && !note.path.includes('://')
  ));
  const eligibleIds = new Set(publishedNotes.map((note) => note.sourceId).filter(Boolean));
  const upscEntries = [{ path: 'upsc-study/', lastmod: today, changefreq: 'daily', priority: '0.9' }];
  for (const note of publishedNotes) {
    upscEntries.push({ path: note.path, lastmod: note.date || today, changefreq: 'weekly', priority: '0.8' });
  }
  const addGroups = (groups, folder, transform = (key) => key) => {
    if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return;
    for (const [key, sourceIds] of Object.entries(groups)) {
      if (!Array.isArray(sourceIds) || !sourceIds.some((id) => eligibleIds.has(id))) continue;
      const slug = slugify(String(transform(key)));
      if (!slug) continue;
      upscEntries.push({ path: `upsc-study/${folder}/${slug}.html`, lastmod: today, changefreq: 'weekly', priority: '0.7' });
    }
  };
  addGroups(archive.days, 'daily');
  addGroups(archive.months, 'monthly');
  addGroups(archive.codes, 'syllabus', (key) => key.replace(/\./g, '-'));
  if (archive.anchors && typeof archive.anchors === 'object') {
    for (const [key, row] of Object.entries(archive.anchors)) {
      const ids = row && Array.isArray(row.noteIds) ? row.noteIds : [];
      if (!ids.some((id) => eligibleIds.has(id))) continue;
      const slug = slugify(key);
      if (slug) upscEntries.push({ path: `upsc-study/anchors/${slug}.html`, lastmod: today, changefreq: 'weekly', priority: '0.7' });
    }
  }
  for (const entry of upscEntries) {
    urls.push(generateUrlEntry(`${siteUrl}/${entry.path}`, entry.lastmod, entry.changefreq, entry.priority));
  }
  console.log(`   Added ${upscEntries.length} UPSC study pages`);
  
  // Build the sitemap XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  // Write to file
  fs.writeFileSync(outputPath, sitemap);
  
  console.log(`\n✅ Sitemap generated: ${outputPath}`);
  console.log(`   Total URLs: ${urls.length}`);
  console.log(`   File size: ${(sitemap.length / 1024).toFixed(2)} KB`);
  return sitemap;
}

if (require.main === module) {
  buildSitemap();
}

module.exports = { buildSitemap, formatDate, generateUrlEntry, slugify };
