/**
 * On-page crawl: everything we can learn from the rendered DOM,
 * the response chain, and the site's crawlability files.
 */

const UA_SECTION = /^user-agent:\s*(.+)$/i;
const RULE = /^(allow|disallow|sitemap):\s*(.*)$/i;

/** Minimal robots.txt parser, just enough to answer "may we index this path?" */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    const ua = line.match(UA_SECTION);
    if (ua) {
      // Consecutive User-agent lines share one rule block.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(ua[1].trim().toLowerCase());
      continue;
    }

    const rule = line.match(RULE);
    if (!rule) continue;
    const [, kind, value] = rule;
    if (kind.toLowerCase() === 'sitemap') {
      if (value.trim()) sitemaps.push(value.trim());
    } else if (current) {
      current.rules.push({ allow: kind.toLowerCase() === 'allow', path: value.trim() });
    }
  }
  return { groups, sitemaps };
}

/**
 * Robots path patterns are prefix matches with two wildcards: `*` for any run
 * of characters and a trailing `$` to anchor the end. Compiling to a regex
 * matters: treating a wildcard pattern as its literal prefix would reduce a rule
 * like slash-star-slash-search down to slash, and block an entire site.
 */
function patternToRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** Longest matching pattern wins, Allow breaks ties, per Google's robots spec. */
export function isAllowed(robots, path, agent = '*') {
  const group =
    robots.groups.find((g) => g.agents.includes(agent.toLowerCase())) ??
    robots.groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let best = null;
  for (const rule of group.rules) {
    if (rule.path === '') continue; // an empty Disallow means "allow everything"
    let regex;
    try {
      regex = patternToRegex(rule.path);
    } catch {
      continue; // a malformed pattern blocks nothing
    }
    if (!regex.test(path)) continue;
    const better =
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow);
    if (better) best = rule;
  }
  return best ? best.allow : true;
}

async function fetchText(request, url) {
  try {
    const res = await request.get(url, { timeout: 15000, maxRedirects: 5 });
    return { ok: res.ok(), status: res.status(), url: res.url(), body: res.ok() ? await res.text() : '' };
  } catch {
    return { ok: false, status: 0, url, body: '' };
  }
}

export async function crawl(context, url, { timeout = 45000 } = {}) {
  const page = await context.newPage();
  const redirects = [];
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });

  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'load', timeout });
  const loadMs = Date.now() - started;
  if (!response) throw new Error(`No response from ${url}`);

  // Walk the redirect chain back to the request we actually made.
  for (let req = response.request().redirectedFrom(); req; req = req.redirectedFrom()) {
    const r = await req.response();
    redirects.unshift({ url: req.url(), status: r?.status() ?? 0 });
  }

  // Give late-firing scripts a moment to inject meta tags and JSON-LD.
  await page.waitForTimeout(1200);

  const finalUrl = page.url();
  const dom = await page.evaluate(() => {
    const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name)?.trim() || null;
    const meta = (name) =>
      document.querySelector(`meta[name="${name}" i]`)?.content?.trim() ||
      document.querySelector(`meta[property="${name}" i]`)?.content?.trim() ||
      null;

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
      level: Number(h.tagName[1]),
      text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 160),
    }));

    const images = [...document.querySelectorAll('img')].map((img) => ({
      src: (img.currentSrc || img.getAttribute('src') || '').slice(0, 300),
      alt: img.getAttribute('alt'),
      hasDimensions: Boolean(
        (img.getAttribute('width') && img.getAttribute('height')) ||
          (img.style.aspectRatio && img.style.aspectRatio !== 'auto')
      ),
      lazy: img.getAttribute('loading') === 'lazy',
    }));

    const origin = location.origin;
    const links = [...document.querySelectorAll('a[href]')]
      .map((a) => {
        let href = null;
        try {
          href = new URL(a.getAttribute('href'), location.href).href;
        } catch {
          /* unparseable href */
        }
        const rel = a.getAttribute('rel') || '';
        return {
          href,
          text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 120),
          internal: Boolean(href && href.startsWith(origin)),
          targetBlank: a.getAttribute('target') === '_blank',
          rel,
          nofollow: rel.includes('nofollow'),
        };
      })
      .filter((l) => l.href && /^https?:/.test(l.href));

    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try {
        const parsed = JSON.parse(s.textContent);
        const nodes = [].concat(parsed['@graph'] ?? parsed);
        const types = nodes.map((n) => n?.['@type']).flat().filter(Boolean);
        return { valid: true, types };
      } catch {
        return { valid: false, types: [] };
      }
    });

    // Strip page chrome that isn't prose before counting words.
    const body = document.body?.cloneNode(true);
    body?.querySelectorAll('script,style,noscript,nav,footer,header,svg').forEach((n) => n.remove());
    const text = (body?.innerText || '').replace(/\s+/g, ' ').trim();

    return {
      title: document.title?.trim() || null,
      metaDescription: meta('description'),
      metaRobots: meta('robots'),
      canonical: attr('link[rel="canonical" i]', 'href'),
      lang: document.documentElement.getAttribute('lang'),
      charset: document.characterSet || null,
      viewport: meta('viewport'),
      favicon: attr('link[rel~="icon" i]', 'href'),
      og: {
        title: meta('og:title'),
        description: meta('og:description'),
        image: meta('og:image'),
        type: meta('og:type'),
        url: meta('og:url'),
      },
      twitterCard: meta('twitter:card'),
      headings,
      images,
      links,
      jsonLd,
      wordCount: text ? text.split(/\s+/).length : 0,
      textSample: text.slice(0, 400),
      htmlBytes: document.documentElement.outerHTML.length,
    };
  });

  const origin = new URL(finalUrl).origin;
  const request = context.request;

  const robotsRes = await fetchText(request, `${origin}/robots.txt`);
  const robots = robotsRes.ok ? parseRobots(robotsRes.body) : null;

  // Prefer a sitemap the site declares; fall back to the conventional path.
  const candidates = [...(robots?.sitemaps ?? []), `${origin}/sitemap.xml`];
  let sitemap = { ok: false, status: 0, url: candidates[0], urlCount: 0 };
  for (const candidate of candidates.slice(0, 3)) {
    const res = await fetchText(request, candidate);
    if (res.ok && /<(urlset|sitemapindex)/i.test(res.body)) {
      sitemap = {
        ok: true,
        status: res.status,
        url: res.url,
        urlCount: (res.body.match(/<loc>/gi) || []).length,
      };
      break;
    }
    sitemap = { ok: false, status: res.status, url: candidate, urlCount: 0 };
  }

  // Does the site force HTTPS? Only meaningful once we're already on https.
  let httpsRedirect = null;
  if (finalUrl.startsWith('https://')) {
    const insecure = await fetchText(request, finalUrl.replace(/^https:/, 'http:'));
    httpsRedirect = insecure.ok && insecure.url.startsWith('https://');
  }

  await page.close();

  return {
    requestedUrl: url,
    finalUrl,
    status: response.status(),
    headers: response.headers(),
    redirects,
    loadMs,
    consoleErrors,
    robots: robots
      ? {
          found: true,
          // Google matches robots patterns against path + query, not path alone.
          allowed: isAllowed(robots, new URL(finalUrl).pathname + new URL(finalUrl).search),
          sitemaps: robots.sitemaps,
        }
      : { found: false, allowed: true, sitemaps: [] },
    sitemap,
    httpsRedirect,
    ...dom,
  };
}
