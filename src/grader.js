import { launchBrowser } from './browser.js';
import { crawl } from './crawl.js';
import { runChecks } from './checks.js';
import { runLighthouse } from './lighthouse.js';

/** How much each pillar moves the overall grade. */
export const WEIGHTS = {
  onPage: 30,
  performance: 25,
  seo: 20,
  accessibility: 15,
  'best-practices': 10,
};

const GRADES = [
  [97, 'A+'],
  [93, 'A'],
  [90, 'A-'],
  [87, 'B+'],
  [83, 'B'],
  [80, 'B-'],
  [77, 'C+'],
  [73, 'C'],
  [70, 'C-'],
  [65, 'D+'],
  [60, 'D'],
  [0, 'F'],
];

export const toGrade = (score) => GRADES.find(([min]) => score >= min)[1];

export function normalizeUrl(input) {
  const trimmed = String(input).trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme); // throws on junk, which the caller reports
  return url.href;
}

/** Blend the on-page checks with the four Lighthouse categories. */
export function composite(onPageScore, lighthouseScores) {
  const parts = [
    { key: 'onPage', label: 'On-page SEO', score: onPageScore, weight: WEIGHTS.onPage },
    { key: 'performance', label: 'Performance', score: lighthouseScores.performance, weight: WEIGHTS.performance },
    { key: 'seo', label: 'Lighthouse SEO', score: lighthouseScores.seo, weight: WEIGHTS.seo },
    { key: 'accessibility', label: 'Accessibility', score: lighthouseScores.accessibility, weight: WEIGHTS.accessibility },
    { key: 'best-practices', label: 'Best practices', score: lighthouseScores['best-practices'], weight: WEIGHTS['best-practices'] },
  ].filter((p) => typeof p.score === 'number');

  const weight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0) / weight);
  return { score, grade: toGrade(score), parts };
}

export async function grade(rawUrl, { formFactor = 'mobile', headless = true, onProgress = () => {} } = {}) {
  const url = normalizeUrl(rawUrl);
  const startedAt = Date.now();

  onProgress('Launching Chromium');
  const { browser, port } = await launchBrowser({ headless });

  try {
    const context = await browser.newContext({
      viewport: formFactor === 'desktop' ? { width: 1350, height: 940 } : { width: 412, height: 823 },
      userAgent:
        formFactor === 'desktop'
          ? undefined
          : 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ignoreHTTPSErrors: true,
    });

    onProgress('Crawling the page with Playwright');
    const page = await crawl(context, url);

    onProgress('Running Lighthouse');
    const lighthouse = await runLighthouse(page.finalUrl, port, { formFactor });

    await context.close();

    onProgress('Scoring');
    const onPage = runChecks(page);
    const overall = composite(onPage.score, lighthouse.scores);

    return {
      url,
      finalUrl: page.finalUrl,
      formFactor,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      overall,
      onPage,
      lighthouse,
      page,
    };
  } finally {
    await browser.close();
  }
}
