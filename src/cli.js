#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { grade } from './grader.js';
import { renderHtml, renderText } from './report.js';

const USAGE = `
seo-grader - mini SEO website grader (Playwright + Lighthouse)

  Usage: npm run grade -- <url> [options]

  Options:
    --desktop            Grade as desktop (default: mobile)
    --out <file>         HTML report path (default: reports/<host>-<time>.html)
    --json <file>        Also write the raw result as JSON
    --no-html            Skip the HTML report, print the summary only
    --open               Open the HTML report when it is done
    --headed             Show the browser while it runs
    --min-score <n>      Exit with code 1 if the overall score is below n
    -h, --help           Show this help
`;

function parseArgs(argv) {
  const opts = { formFactor: 'mobile', html: true, open: false, headless: true, minScore: null, out: null, json: null };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--desktop': opts.formFactor = 'desktop'; break;
      case '--mobile': opts.formFactor = 'mobile'; break;
      case '--no-html': opts.html = false; break;
      case '--open': opts.open = true; break;
      case '--headed': opts.headless = false; break;
      case '--out': opts.out = argv[++i]; break;
      case '--json': opts.json = argv[++i]; break;
      case '--min-score': opts.minScore = Number(argv[++i]); break;
      case '-h':
      case '--help': opts.help = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        rest.push(arg);
    }
  }
  opts.url = rest[0];
  return opts;
}

function defaultOutPath(finalUrl) {
  const host = new URL(finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join('reports', `${host}-${stamp}.html`);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.help || !opts.url) {
    console.log(USAGE);
    process.exit(opts.url ? 0 : 2);
  }

  const start = Date.now();
  const result = await grade(opts.url, {
    formFactor: opts.formFactor,
    headless: opts.headless,
    onProgress: (msg) => process.stderr.write(`  ${msg}...\n`),
  });

  process.stdout.write(renderText(result));

  if (opts.json) {
    await fs.mkdir(path.dirname(path.resolve(opts.json)), { recursive: true });
    await fs.writeFile(opts.json, JSON.stringify(result, null, 2));
    console.log(`  JSON:   ${opts.json}`);
  }

  if (opts.html) {
    const out = opts.out ?? defaultOutPath(result.finalUrl);
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, renderHtml(result));
    console.log(`  Report: ${out}`);
    if (opts.open) spawn('open', [out], { stdio: 'ignore', detached: true }).unref();
  }

  console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);

  if (opts.minScore !== null && result.overall.score < opts.minScore) {
    console.error(`Score ${result.overall.score} is below the --min-score of ${opts.minScore}`);
    process.exit(1);
  }
}

main().catch((err) => {
  // Playwright errors carry a multi-line call log; the first line is the cause.
  console.error(`\nFailed: ${String(err.message).split('\n')[0]}\n`);
  process.exit(1);
});
