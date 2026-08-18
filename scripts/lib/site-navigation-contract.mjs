export const PAGE_GROUPS = Object.freeze({
  'index.html': 'none',
  'servicenow.html': 'learn',
  'blog.html': 'learn',
  'interviews.html': 'learn',
  'tutorials.html': 'learn',
  'quiz.html': 'learn',
  'technical-terms-quiz.html': 'learn',
  'upsc.html': 'learn',
  'upsc-patterns.html': 'learn',
  'flights.html': 'tools',
  'metals.html': 'tools',
  'save-yourself.html': 'tools',
  'summaverick.html': 'summaverick'
});

export const CURRENT_LINKS = Object.freeze({
  'servicenow.html': 'servicenow.html',
  'blog.html': 'blog.html',
  'interviews.html': 'interviews.html',
  'upsc.html': 'upsc.html',
  'flights.html': 'flights.html',
  'metals.html': 'metals.html',
  'save-yourself.html': 'save-yourself.html',
  'summaverick.html': 'summaverick.html'
});

export const LEARN_LINKS = Object.freeze([
  ['servicenow.html', 'ServiceNow Central'],
  ['blog.html', 'Articles & Tutorials'],
  ['interviews.html', 'Interview Prep'],
  ['upsc.html', 'UPSC Today']
]);

export const TOOL_LINKS = Object.freeze([
  ['flights.html', 'SkyFare'],
  ['metals.html', 'Metals'],
  ['save-yourself.html', 'Save Yourself']
]);

function firstMatch(html, expression, label) {
  const match = html.match(expression);
  if (!match) throw new Error(`Missing ${label}`);
  return match[0];
}

export function extractPrimaryNavigation(html) {
  return firstMatch(html, /<nav\b[\s\S]*?<\/nav>/i, 'primary navigation');
}

export function extractMobileNavigation(html) {
  return firstMatch(
    html,
    /<div\b[^>]*(?:data-mobile-nav|class="[^"]*\bmobile-menu\b[^"]*")[^>]*>[\s\S]*?<\/div>/i,
    'mobile navigation'
  );
}

export function stripNavigation(html) {
  let value = html.replace(/<nav\b[\s\S]*?<\/nav>/i, '\n<!-- PRIMARY_NAV -->\n');
  value = value.replace(
    /<div\b[^>]*(?:data-mobile-nav|class="[^"]*\bmobile-menu\b[^"]*")[^>]*>[\s\S]*?<\/div>/i,
    '\n<!-- MOBILE_NAV -->\n'
  );
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\s*<!-- PRIMARY_NAV -->\s*/g, '\n<!-- PRIMARY_NAV -->\n')
    .replace(/\s*<!-- MOBILE_NAV -->\s*/g, '\n<!-- MOBILE_NAV -->\n');
}

function count(source, expression) {
  return (source.match(expression) || []).length;
}

function requireLink(errors, source, [href, label], region) {
  const encodedLabel = label.replace('&', '&amp;');
  if (!source.includes(`href="${href}"`) || (!source.includes(encodedLabel) && !source.includes(label))) {
    errors.push(`${region} is missing ${label} (${href})`);
  }
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return startIndex >= 0 && endIndex > startIndex ? source.slice(startIndex, endIndex) : '';
}

function hrefs(source) {
  return Array.from(source.matchAll(/<a\b[^>]*href="([^"]+)"/g), match => match[1]);
}

function currentHrefs(source) {
  return Array.from(source.matchAll(/<a\b([^>]*)>/g))
    .map(match => match[1])
    .filter(attributes => attributes.includes('aria-current="page"'))
    .map(attributes => attributes.match(/href="([^"]+)"/))
    .filter(Boolean)
    .map(match => match[1]);
}

function requireExactHrefs(errors, source, expected, region) {
  const actual = hrefs(source);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${region} links must be ${expected.join(', ')}; received ${actual.join(', ')}`);
  }
}

function requireCurrentDestination(errors, file, desktop, mobile) {
  const expected = CURRENT_LINKS[file] ? [CURRENT_LINKS[file]] : [];
  const desktopCurrent = currentHrefs(desktop);
  const mobileCurrent = currentHrefs(mobile);
  if (JSON.stringify(desktopCurrent) !== JSON.stringify(expected)) {
    errors.push(`desktop current destination must be ${expected[0] || 'unset'}; received ${desktopCurrent.join(', ') || 'unset'}`);
  }
  if (JSON.stringify(mobileCurrent) !== JSON.stringify(expected)) {
    errors.push(`mobile current destination must be ${expected[0] || 'unset'}; received ${mobileCurrent.join(', ') || 'unset'}`);
  }
}

export function validateNavigation(file, html) {
  const errors = [];
  let primary = '';
  let mobile = '';
  try {
    primary = extractPrimaryNavigation(html);
  } catch (error) {
    errors.push(error.message);
  }
  try {
    mobile = extractMobileNavigation(html);
  } catch (error) {
    errors.push(error.message);
  }
  if (!primary || !mobile) return errors;

  if (count(primary, /data-nav-group="learn"/g) !== 1) errors.push('desktop must contain exactly one Learn disclosure');
  if (count(primary, /data-nav-group="tools"/g) !== 1) errors.push('desktop must contain exactly one Tools disclosure');
  if (count(primary, /id="navLearn"/g) !== 1 || count(primary, /aria-controls="navLearn"/g) !== 1) {
    errors.push('navLearn id/control pair must be unique');
  }
  if (count(primary, /id="navTools"/g) !== 1 || count(primary, /aria-controls="navTools"/g) !== 1) {
    errors.push('navTools id/control pair must be unique');
  }
  if (/role="menu(?:item)?"/.test(primary)) errors.push('role="menu" and role="menuitem" are forbidden');
  if (/\bUtilities\b|>Anchor<|Pattern Atlas/.test(primary + mobile)) errors.push('legacy global navigation entry found');

  const learnRegion = between(primary, 'data-nav-group="learn"', 'data-nav-group="tools"');
  const toolsRegion = between(primary, 'data-nav-group="tools"', 'data-nav-link="summaverick"');
  const mobileLearnRegion = between(mobile, 'data-mobile-group="learn"', 'data-mobile-group="tools"');
  const mobileToolsRegion = between(mobile, 'data-mobile-group="tools"', 'href="summaverick.html"');

  for (const link of LEARN_LINKS) {
    requireLink(errors, learnRegion, link, 'desktop Learn');
    requireLink(errors, mobileLearnRegion, link, 'mobile Learn');
  }
  for (const link of TOOL_LINKS) {
    requireLink(errors, toolsRegion, link, 'desktop Tools');
    requireLink(errors, mobileToolsRegion, link, 'mobile Tools');
  }
  requireExactHrefs(errors, learnRegion, LEARN_LINKS.map(link => link[0]), 'desktop Learn');
  requireExactHrefs(errors, toolsRegion, TOOL_LINKS.map(link => link[0]), 'desktop Tools');
  requireExactHrefs(errors, mobileLearnRegion, LEARN_LINKS.map(link => link[0]), 'mobile Learn');
  requireExactHrefs(errors, mobileToolsRegion, TOOL_LINKS.map(link => link[0]), 'mobile Tools');

  const mobileMarker = primary.indexOf('data-mobile-nav');
  const desktop = mobileMarker >= 0 ? primary.slice(0, mobileMarker) : primary;
  if (count(desktop, /data-nav-link="summaverick"/g) !== 1) errors.push('desktop Summaverick link must appear exactly once');
  if (count(desktop, /data-nav-link="about"/g) !== 1) errors.push('desktop About link must appear exactly once');
  if (!mobile.includes('data-mobile-group="learn"') || !mobile.includes('data-mobile-group="tools"')) {
    errors.push('mobile group labels are missing');
  }

  const activeGroup = PAGE_GROUPS[file];
  const learnIsActive = /nav-drop__btn active/.test(learnRegion);
  const toolsIsActive = /nav-drop__btn active/.test(toolsRegion);
  if (activeGroup === 'learn' && !learnIsActive) errors.push('Learn parent must be active');
  if (activeGroup !== 'learn' && learnIsActive) errors.push('Learn parent must not be active');
  if (activeGroup === 'tools' && !toolsIsActive) errors.push('Tools parent must be active');
  if (activeGroup !== 'tools' && toolsIsActive) errors.push('Tools parent must not be active');

  requireCurrentDestination(errors, file, desktop, mobile);
  return errors;
}

export function compareOutsideNavigation(baseHtml, candidateHtml) {
  return stripNavigation(baseHtml) === stripNavigation(candidateHtml);
}
