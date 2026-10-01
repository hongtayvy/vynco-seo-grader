/**
 * On-page SEO rules. Each rule turns crawl data into a pass / warn / fail
 * with a weight, a human-readable detail, and the fix to apply.
 */

const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

const STATUS_VALUE = { [PASS]: 1, [WARN]: 0.5, [FAIL]: 0 };

const check = (id, group, label, weight, fn) => ({ id, group, label, weight, fn });

const RULES = [
  check('title', 'Metadata', 'Title tag', 10, (d) => {
    if (!d.title) return [FAIL, 'No title tag', 'Add a unique <title> of 15-60 characters.'];
    const n = d.title.length;
    if (n < 15) return [WARN, `Only ${n} characters: "${d.title}"`, 'Expand the title to 15-60 characters.'];
    if (n > 60) return [WARN, `${n} characters, Google truncates around 60`, 'Trim the title to 60 characters or fewer.'];
    return [PASS, `${n} characters: "${d.title}"`];
  }),

  check('description', 'Metadata', 'Meta description', 8, (d) => {
    if (!d.metaDescription) return [FAIL, 'No meta description', 'Add a 70-160 character meta description summarising the page.'];
    const n = d.metaDescription.length;
    if (n < 70) return [WARN, `Only ${n} characters`, 'Expand to 70-160 characters so the snippet fills out.'];
    if (n > 160) return [WARN, `${n} characters, will be truncated`, 'Trim to 160 characters or fewer.'];
    return [PASS, `${n} characters`];
  }),

  check('h1', 'Content', 'Single H1', 8, (d) => {
    const h1s = d.headings.filter((h) => h.level === 1);
    if (h1s.length === 0) return [FAIL, 'No H1 on the page', 'Add exactly one H1 describing the page topic.'];
    if (h1s.length > 1) return [WARN, `${h1s.length} H1 tags found`, 'Keep one H1 and demote the rest to H2.'];
    return [PASS, `"${h1s[0].text}"`];
  }),

  check('heading-order', 'Content', 'Heading hierarchy', 4, (d) => {
    if (d.headings.length === 0) return [FAIL, 'No headings at all', 'Structure the content with H1-H3 headings.'];
    const skips = [];
    let prev = d.headings[0].level;
    for (const h of d.headings.slice(1)) {
      if (h.level > prev + 1) skips.push(`H${prev} to H${h.level}`);
      prev = h.level;
    }
    if (skips.length) return [WARN, `${skips.length} skipped level(s): ${skips.slice(0, 3).join(', ')}`, 'Do not skip heading levels.'];
    return [PASS, `${d.headings.length} headings, no skipped levels`];
  }),

  check('word-count', 'Content', 'Content depth', 6, (d) => {
    if (d.wordCount < 100) return [FAIL, `${d.wordCount} words of body copy`, 'Thin pages rarely rank. Aim for 300+ words of useful content.'];
    if (d.wordCount < 300) return [WARN, `${d.wordCount} words of body copy`, 'Aim for 300+ words on pages you want to rank.'];
    return [PASS, `${d.wordCount} words`];
  }),

  check('canonical', 'Crawlability', 'Canonical URL', 6, (d) => {
    if (!d.canonical) return [WARN, 'No canonical link', 'Add <link rel="canonical"> pointing at the preferred URL.'];
    if (!/^https?:\/\//i.test(d.canonical)) return [WARN, `Relative canonical: ${d.canonical}`, 'Use an absolute canonical URL.'];
    const strip = (u) => u.replace(/\/$/, '').split('#')[0];
    if (strip(d.canonical) !== strip(d.finalUrl)) return [WARN, `Points elsewhere: ${d.canonical}`, 'Confirm this page should be de-duplicated into that URL.'];
    return [PASS, d.canonical];
  }),

  check('indexable', 'Crawlability', 'Indexable by search engines', 10, (d) => {
    const robotsMeta = (d.metaRobots || '').toLowerCase();
    const header = (d.headers['x-robots-tag'] || '').toLowerCase();
    if (robotsMeta.includes('noindex') || header.includes('noindex')) {
      return [FAIL, 'Page is marked noindex', 'Remove the noindex directive if you want this page in search.'];
    }
    if (!d.robots.allowed) return [FAIL, 'robots.txt disallows this path', 'Loosen the Disallow rule covering this URL.'];
    return [PASS, robotsMeta ? `robots: ${robotsMeta}` : 'No blocking directives'];
  }),

  check('robots-txt', 'Crawlability', 'robots.txt', 3, (d) =>
    d.robots.found
      ? [PASS, `Found, ${d.robots.sitemaps.length} sitemap reference(s)`]
      : [WARN, 'No robots.txt', 'Add a robots.txt that points to your sitemap.']),

  check('sitemap', 'Crawlability', 'XML sitemap', 5, (d) =>
    d.sitemap.ok
      ? [PASS, `${d.sitemap.urlCount} URLs at ${d.sitemap.url}`]
      : [FAIL, `No sitemap found at ${d.sitemap.url}`, 'Publish an XML sitemap and reference it from robots.txt.']),

  check('lang', 'Metadata', 'Declared language', 3, (d) =>
    d.lang ? [PASS, `lang="${d.lang}"`] : [WARN, 'No lang attribute on <html>', 'Add lang="en" (or the right locale) to <html>.']),

  check('viewport', 'Metadata', 'Mobile viewport', 6, (d) =>
    d.viewport
      ? [PASS, d.viewport]
      : [FAIL, 'No viewport meta tag', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.']),

  check('charset', 'Metadata', 'Character encoding', 3, (d) => {
    if (!d.charset) return [FAIL, 'No character encoding declared', 'Add <meta charset="utf-8"> as the first tag in <head>.'];
    if (!/^utf-?8$/i.test(d.charset)) return [WARN, `Encoded as ${d.charset}`, 'Serve the page as UTF-8.'];
    return [PASS, d.charset];
  }),

  check('favicon', 'Metadata', 'Favicon', 2, (d) => {
    // `data:,` is the common placeholder sites use to suppress the favicon request.
    const real = d.favicon && d.favicon !== 'data:,' && !/^data:,?$/.test(d.favicon);
    return real
      ? [PASS, d.favicon]
      : [WARN, d.favicon ? `Placeholder favicon (${d.favicon})` : 'No favicon link', 'Add a real favicon so the brand shows in tabs and results.'];
  }),

  check('og', 'Social', 'Open Graph tags', 5, (d) => {
    const missing = ['title', 'description', 'image'].filter((k) => !d.og[k]);
    if (missing.length === 3) return [FAIL, 'No Open Graph tags', 'Add og:title, og:description and og:image for link previews.'];
    if (missing.length) return [WARN, `Missing og:${missing.join(', og:')}`, `Add the missing Open Graph tags.`];
    return [PASS, 'og:title, og:description and og:image all present'];
  }),

  check('twitter', 'Social', 'Twitter card', 2, (d) =>
    d.twitterCard
      ? [PASS, `twitter:card = ${d.twitterCard}`]
      : [WARN, 'No twitter:card', 'Add <meta name="twitter:card" content="summary_large_image">.']),

  check('structured-data', 'Social', 'Structured data', 5, (d) => {
    if (d.jsonLd.length === 0) return [WARN, 'No JSON-LD found', 'Add schema.org JSON-LD so you qualify for rich results.'];
    const broken = d.jsonLd.filter((b) => !b.valid).length;
    if (broken) return [FAIL, `${broken} of ${d.jsonLd.length} JSON-LD blocks fail to parse`, 'Fix the malformed JSON-LD.'];
    const types = [...new Set(d.jsonLd.flatMap((b) => b.types))];
    return [PASS, types.length ? types.join(', ') : `${d.jsonLd.length} valid block(s)`];
  }),

  check('img-alt', 'Media', 'Image alt text', 7, (d) => {
    const imgs = d.images;
    if (imgs.length === 0) return [PASS, 'No images on the page'];
    const missing = imgs.filter((i) => i.alt === null);
    if (missing.length === 0) return [PASS, `All ${imgs.length} images have alt text`];
    const ratio = missing.length / imgs.length;
    const detail = `${missing.length} of ${imgs.length} images missing alt`;
    const fix = 'Add descriptive alt text, or alt="" for purely decorative images.';
    return [ratio > 0.25 ? FAIL : WARN, detail, fix];
  }),

  check('img-dimensions', 'Media', 'Image dimensions set', 4, (d) => {
    const imgs = d.images;
    if (imgs.length === 0) return [PASS, 'No images on the page'];
    const missing = imgs.filter((i) => !i.hasDimensions);
    if (missing.length === 0) return [PASS, `All ${imgs.length} images reserve layout space`];
    const ratio = missing.length / imgs.length;
    return [
      ratio > 0.5 ? FAIL : WARN,
      `${missing.length} of ${imgs.length} images lack width/height`,
      'Set width and height (or aspect-ratio) to stop layout shift.',
    ];
  }),

  check('link-text', 'Links', 'Descriptive link text', 4, (d) => {
    const vague = /^(click here|here|read more|more|learn more|this|link|>|»)$/i;
    const bad = d.links.filter((l) => l.text && vague.test(l.text));
    const empty = d.links.filter((l) => !l.text);
    const total = bad.length + empty.length;
    if (!d.links.length) return [WARN, 'No links on the page', 'Link to related pages so crawlers can follow them.'];
    if (total === 0) return [PASS, `${d.links.length} links, all with descriptive text`];
    // Only escalate to a failure once there is a real pattern, not one stray link.
    const widespread = total / d.links.length > 0.2 && total >= 3;
    return [
      widespread ? FAIL : WARN,
      `${total} of ${d.links.length} link(s) use vague or empty text`,
      'Use anchor text that describes the destination.',
    ];
  }),

  check('internal-links', 'Links', 'Internal linking', 4, (d) => {
    const internal = d.links.filter((l) => l.internal).length;
    if (internal === 0) return [FAIL, 'No internal links', 'Link to other pages on the site to spread authority.'];
    if (internal < 3) return [WARN, `Only ${internal} internal links`, 'Add more internal links to related pages.'];
    return [PASS, `${internal} internal, ${d.links.length - internal} external`];
  }),

  check('unsafe-blank', 'Security', 'Safe external links', 3, (d) => {
    const unsafe = d.links.filter(
      (l) => l.targetBlank && !l.internal && !/noopener|noreferrer/.test(l.rel)
    );
    if (unsafe.length === 0) return [PASS, 'All target="_blank" links are safe'];
    return [WARN, `${unsafe.length} link(s) open a new tab without rel="noopener"`, 'Add rel="noopener noreferrer" to target="_blank" links.'];
  }),

  check('https', 'Security', 'HTTPS', 8, (d) => {
    if (!d.finalUrl.startsWith('https://')) return [FAIL, 'Served over plain HTTP', 'Install a TLS certificate and redirect HTTP to HTTPS.'];
    if (d.httpsRedirect === false) return [WARN, 'HTTPS works but HTTP does not redirect to it', 'Add a 301 from http:// to https://.'];
    return [PASS, 'HTTPS with HTTP redirecting to it'];
  }),

  check('hsts', 'Security', 'HSTS header', 2, (d) =>
    d.headers['strict-transport-security']
      ? [PASS, d.headers['strict-transport-security']]
      : [WARN, 'No Strict-Transport-Security header', 'Send HSTS so browsers refuse to downgrade to HTTP.']),

  check('redirects', 'Crawlability', 'Redirect chain', 3, (d) => {
    if (d.redirects.length === 0) return [PASS, 'Resolved directly, no redirects'];
    if (d.redirects.length > 2) return [FAIL, `${d.redirects.length} redirects before the final URL`, 'Collapse the chain into one hop.'];
    return [WARN, `${d.redirects.length} redirect(s) to reach the page`, 'Link straight to the final URL where you can.'];
  }),

  check('console', 'Security', 'No console errors', 2, (d) => {
    if (d.consoleErrors.length === 0) return [PASS, 'Clean console'];
    return [
      d.consoleErrors.length > 5 ? FAIL : WARN,
      `${d.consoleErrors.length} console error(s): ${d.consoleErrors[0].slice(0, 90)}`,
      'Fix the JavaScript errors, they can block rendering and indexing.',
    ];
  }),
];

export function runChecks(data) {
  const results = RULES.map((rule) => {
    const [status, detail, fix] = rule.fn(data);
    return { id: rule.id, group: rule.group, label: rule.label, weight: rule.weight, status, detail, fix: fix ?? null };
  });

  const earned = results.reduce((sum, r) => sum + r.weight * STATUS_VALUE[r.status], 0);
  const total = results.reduce((sum, r) => sum + r.weight, 0);

  return { results, score: Math.round((earned / total) * 100) };
}

export { PASS, WARN, FAIL };
