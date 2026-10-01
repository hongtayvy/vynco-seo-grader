# vynco-seo-grader

A mini SEO website grader. Playwright crawls the rendered page and checks 25 on-page
rules; Google Lighthouse scores performance, accessibility, best practices and SEO.
The two are blended into one letter grade.

Both tools drive the **same** Chromium instance: Playwright launches it with a
remote-debugging port and Lighthouse connects to that port over CDP and opens its
own tab. One browser, one page load budget, no `chrome-launcher` needed.

## Setup

Requires **Node 22.19 or newer** (Lighthouse 13's floor).

```bash
npm install
npx playwright install chromium
```

## Grade a page from the terminal

```bash
npm run grade -- https://example.com
```

Writes `reports/<host>-<timestamp>.html` and prints a summary:

```
https://developer.mozilla.org/en-US/docs/Web/HTML (mobile)
  A  96/100

  On-page SEO       93 ###################.
  Performance       98 ####################
  Lighthouse SEO   100 ####################
  Accessibility     95 ###################.
  Best practices    96 ###################.

  LCP 2.3 s   FCP 1.5 s   TBT 20 ms   CLS 0   SI 1.5 s
```

### Options

| Flag | Effect |
| --- | --- |
| `--desktop` | Grade with desktop emulation and throttling (default is mobile) |
| `--out <file>` | Where to write the HTML report |
| `--json <file>` | Also dump the full result, including raw crawl data, as JSON |
| `--no-html` | Terminal summary only |
| `--open` | Open the report when it finishes |
| `--headed` | Watch the browser work |
| `--min-score <n>` | Exit `1` if the score is below `n`, for use in CI |

```bash
npm run grade -- https://example.com --desktop --open
npm run grade -- https://example.com --min-score 85 --no-html   # CI gate
```

## Grade a page from the browser

```bash
npm run serve
```

Then open <http://localhost:4321>, paste a URL, pick mobile or desktop. It grades one
page at a time so Lighthouse's throttling stays meaningful.

## How the grade is composed

| Pillar | Weight | Source |
| --- | --- | --- |
| On-page SEO | 30% | The Playwright checks below |
| Performance | 25% | Lighthouse |
| Lighthouse SEO | 20% | Lighthouse |
| Accessibility | 15% | Lighthouse |
| Best practices | 10% | Lighthouse |

Each on-page check is weighted and scored pass (1.0) / warn (0.5) / fail (0.0).
Letter grades follow the usual `A+ >= 97` … `F < 60` scale.

## What the Playwright pass checks

**Metadata** — title length, meta description length, `lang`, viewport, character
encoding, favicon (a `data:,` placeholder does not count).

**Content** — exactly one H1, no skipped heading levels, word count of the body copy
with nav/header/footer stripped out.

**Crawlability** — canonical URL present, absolute, and pointing at this page;
`noindex` in either the meta tag or the `X-Robots-Tag` header; whether robots.txt
actually permits this path; a real XML sitemap, preferring the one robots.txt
declares; redirect chain length.

**Social** — Open Graph title/description/image, `twitter:card`, and JSON-LD blocks
that parse (reporting the schema.org types found).

**Media** — images missing `alt`, and images without `width`/`height` or
`aspect-ratio` that will cause layout shift.

**Links** — vague anchor text ("click here", "read more"), internal vs external
link counts, and `target="_blank"` links missing `rel="noopener"`.

**Security** — HTTPS, whether HTTP actually redirects to it, HSTS, console errors.

The robots.txt parser implements Google's matching rules: `*` and `$` wildcards,
longest-pattern-wins with `Allow` breaking ties, per-user-agent groups, and matching
against path *and* query string.

```bash
npm test
```

## Layout

```
src/browser.js     Launches one Chromium with a CDP port both tools share
src/crawl.js       Playwright pass: DOM, headers, redirects, robots.txt, sitemap
src/checks.js      The 25 on-page rules, each with a weight and a suggested fix
src/lighthouse.js  Lighthouse run over the CDP port, plus opportunity extraction
src/grader.js      Orchestration and the weighted composite score
src/report.js      HTML report and terminal summary
src/cli.js         Command line entry point
src/server.js      Small local web UI
```

## Notes

- A run takes roughly 11-20 seconds depending on the site.
- Lighthouse applies simulated throttling, so numbers move if the machine is busy.
  Grade on an otherwise idle machine when you want to compare runs.
- The grader loads a single URL. It does not spider the site.

## License

MIT. See [LICENSE](LICENSE).
