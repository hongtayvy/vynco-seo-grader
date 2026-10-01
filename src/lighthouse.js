import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** Audits worth surfacing in the report, in the order we want them read. */
const VITALS = [
  ['largest-contentful-paint', 'Largest Contentful Paint'],
  ['first-contentful-paint', 'First Contentful Paint'],
  ['total-blocking-time', 'Total Blocking Time'],
  ['cumulative-layout-shift', 'Cumulative Layout Shift'],
  ['speed-index', 'Speed Index'],
];

/**
 * Drive Lighthouse over the CDP port of the already-running browser.
 * Passing no `page` makes Lighthouse open and own its own tab, which keeps
 * its throttling and emulation away from the Playwright crawl.
 */
export async function runLighthouse(url, port, { formFactor = 'mobile' } = {}) {
  const flags = {
    port,
    logLevel: 'error',
    output: 'json',
    onlyCategories: CATEGORIES,
    // Lighthouse clears storage itself; skipping the disk cache keeps runs comparable.
    disableStorageReset: false,
  };

  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  const run = await lighthouse(url, flags, config);
  if (!run?.lhr) throw new Error('Lighthouse returned no result');

  const { lhr } = run;

  const scores = {};
  for (const key of CATEGORIES) {
    const raw = lhr.categories[key]?.score;
    scores[key] = raw === null || raw === undefined ? null : Math.round(raw * 100);
  }

  const metrics = VITALS.map(([id, label]) => {
    const audit = lhr.audits[id];
    return {
      id,
      label,
      display: audit?.displayValue ?? 'n/a',
      numericValue: audit?.numericValue ?? null,
      score: audit?.score ?? null,
    };
  });

  // Every failed or partial audit, biggest weight first, so the report can
  // show "fix these next" rather than a wall of green.
  const opportunities = [];
  for (const key of CATEGORIES) {
    for (const ref of lhr.categories[key]?.auditRefs ?? []) {
      const audit = lhr.audits[ref.id];
      if (!audit || audit.score === null || audit.score >= 0.9) continue;
      if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'informative') continue;
      opportunities.push({
        category: key,
        id: audit.id,
        title: audit.title,
        // Lighthouse descriptions embed markdown links mid-sentence, so unwrap
        // them to their text rather than deleting the words outright.
        description: (audit.description || '')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\s+/g, ' ')
          .replace(/\s*\.\s*\./g, '.')
          .trim(),
        score: audit.score,
        display: audit.displayValue || '',
        savingsMs: audit.details?.overallSavingsMs ?? null,
        weight: ref.weight ?? 0,
      });
    }
  }
  opportunities.sort((a, b) => b.weight - a.weight || a.score - b.score);

  return {
    formFactor,
    lighthouseVersion: lhr.lighthouseVersion,
    finalUrl: lhr.finalDisplayedUrl,
    fetchTime: lhr.fetchTime,
    scores,
    metrics,
    opportunities,
    runWarnings: lhr.runWarnings ?? [],
  };
}
