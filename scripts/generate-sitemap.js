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
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
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
function generateSitemap() {
  console.log('🗺️  Generating sitemap.xml...\n');
  
  const today = new Date().toISOString().split('T')[0];
  const urls = [];
  
  // Add static pages
  console.log('📄 Adding static pages...');
  for (const page of STATIC_PAGES) {
    urls.push(generateUrlEntry(
      `${SITE_URL}${page.url}`,
      today,
      page.changefreq,
      page.priority
    ));
  }
  console.log(`   Added ${STATIC_PAGES.length} static pages`);
  
  // Add blog posts
  console.log('📝 Adding blog posts...');
  const posts = loadJson(POSTS_FILE);
  for (const post of posts) {
    const slug = slugify(post.title);
    const lastmod = formatDate(post.date);
    urls.push(generateUrlEntry(
      `${SITE_URL}/blog/${post.id}/${slug}`,
      lastmod,
      'weekly',
      '0.8'
    ));
  }
  console.log(`   Added ${posts.length} blog posts`);
  
  // Add interview pages
  console.log('📚 Adding interview questions...');
  const interviews = loadJson(INTERVIEWS_FILE);
  for (const interview of interviews) {
    const slug = slugify(interview.question.substring(0, 50));
    const lastmod = formatDate(interview.date);
    urls.push(generateUrlEntry(
      `${SITE_URL}/interviews/${interview.id}/${slug}`,
      lastmod,
      'weekly',
      '0.7'
    ));
  }
  console.log(`   Added ${interviews.length} interview pages`);
  
  // Build the sitemap XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  // Write to file
  fs.writeFileSync(SITEMAP_FILE, sitemap);
  
  console.log(`\n✅ Sitemap generated: ${SITEMAP_FILE}`);
  console.log(`   Total URLs: ${urls.length}`);
  console.log(`   File size: ${(sitemap.length / 1024).toFixed(2)} KB`);
}

generateSitemap();
