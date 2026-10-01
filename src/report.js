/** Renders a grade result into a self-contained HTML report. */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Lighthouse's own thresholds, reused so the colours mean the same thing everywhere.
const band = (score) => (score >= 90 ? 'good' : score >= 50 ? 'okay' : 'poor');

const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Fail' };

function donut(score, grade) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  return `
  <svg class="donut ${band(score)}" viewBox="0 0 130 130" role="img" aria-label="Overall score ${score} out of 100, grade ${esc(grade)}">
    <circle cx="65" cy="65" r="${r}" class="donut-track" />
    <circle cx="65" cy="65" r="${r}" class="donut-value"
            stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}"
            transform="rotate(-90 65 65)" />
    <text x="65" y="60" class="donut-grade">${esc(grade)}</text>
    <text x="65" y="82" class="donut-score">${score}/100</text>
  </svg>`;
}

function pillars(parts) {
  return parts
    .map(
      (p) => `
      <div class="pillar">
        <div class="pillar-head">
          <span class="pillar-label">${esc(p.label)}</span>
          <span class="pillar-score ${band(p.score)}">${p.score}</span>
        </div>
        <div class="bar"><div class="bar-fill ${band(p.score)}" style="width:${p.score}%"></div></div>
        <div class="pillar-weight">${p.weight}% of grade</div>
      </div>`
    )
    .join('');
}

function vitals(metrics) {
  return metrics
    .map((m) => {
      const cls = m.score === null ? '' : band(m.score * 100);
      return `
      <div class="vital">
        <div class="vital-value ${cls}">${esc(m.display)}</div>
        <div class="vital-label">${esc(m.label)}</div>
      </div>`;
    })
    .join('');
}

function checkRows(results) {
  const groups = [...new Set(results.map((r) => r.group))];
  return groups
    .map((group) => {
      const rows = results
        .filter((r) => r.group === group)
        .sort((a, b) => {
          const order = { fail: 0, warn: 1, pass: 2 };
          return order[a.status] - order[b.status] || b.weight - a.weight;
        })
        .map(
          (r) => `
        <tr class="row-${r.status}">
          <td class="cell-status"><span class="badge ${r.status}">${STATUS_LABEL[r.status]}</span></td>
          <td class="cell-check">
            <div class="check-label">${esc(r.label)}</div>
            <div class="check-detail">${esc(r.detail)}</div>
            ${r.fix && r.status !== 'pass' ? `<div class="check-fix"><strong>Fix:</strong> ${esc(r.fix)}</div>` : ''}
          </td>
        </tr>`
        )
        .join('');
      return `<h3 class="group-title">${esc(group)}</h3><table class="checks">${rows}</table>`;
    })
    .join('');
}

function opportunities(items) {
  if (!items.length) return `<p class="empty">Nothing failing. Lighthouse is happy with this page.</p>`;
  return `<ul class="opps">${items
    .slice(0, 15)
    .map(
      (o) => `
    <li>
      <div class="opp-head">
        <span class="tag tag-${esc(o.category)}">${esc(o.category)}</span>
        <span class="opp-title">${esc(o.title)}</span>
        ${o.display ? `<span class="opp-value">${esc(o.display)}</span>` : ''}
      </div>
      <p class="opp-desc">${esc(o.description)}</p>
    </li>`
    )
    .join('')}</ul>`;
}

export function renderHtml(result) {
  const { overall, onPage, lighthouse, page } = result;
  const failing = onPage.results.filter((r) => r.status !== 'pass').length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Grade ${esc(overall.grade)} — ${esc(new URL(result.finalUrl).hostname)}</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --ink: #14171f; --muted: #5c6472;
    --line: #e3e6ec; --good: #0b8a54; --okay: #b56b00; --poor: #c2352b;
    --good-bg: #e6f5ee; --okay-bg: #fdf1de; --poor-bg: #fdeceb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1116; --card: #171a21; --ink: #e9ecf1; --muted: #9aa3b2;
      --line: #262b35; --good: #3ddc97; --okay: #ffb84d; --poor: #ff6b60;
      --good-bg: #10291f; --okay-bg: #2c2113; --poor-bg: #2d1715;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  }
  .wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 16px; margin: 0 0 16px; letter-spacing: -0.01em; }
  .group-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 22px 0 8px; }
  .group-title:first-child { margin-top: 0; }
  a { color: inherit; }
  .sub { color: var(--muted); font-size: 13px; margin: 0; word-break: break-all; }

  .hero { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
  .hero-text { flex: 1 1 260px; min-width: 0; }
  .headline { font-size: 15px; color: var(--muted); margin: 12px 0 0; }
  .donut { width: 130px; height: 130px; flex: none; }
  .donut-track { fill: none; stroke: var(--line); stroke-width: 11; }
  .donut-value { fill: none; stroke-width: 11; stroke-linecap: round; }
  .donut.good .donut-value { stroke: var(--good); }
  .donut.okay .donut-value { stroke: var(--okay); }
  .donut.poor .donut-value { stroke: var(--poor); }
  .donut-grade { text-anchor: middle; font-size: 34px; font-weight: 700; fill: var(--ink); }
  .donut-score { text-anchor: middle; font-size: 13px; fill: var(--muted); }

  .pillars { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 18px; }
  .pillar-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .pillar-label { font-size: 13px; color: var(--muted); }
  .pillar-score { font-size: 19px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin: 7px 0 5px; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .pillar-weight { font-size: 11px; color: var(--muted); }

  .vitals { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; }
  .vital { text-align: center; }
  .vital-value { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .vital-label { font-size: 12px; color: var(--muted); margin-top: 2px; }

  .good { color: var(--good); } .bar-fill.good { background: var(--good); }
  .okay { color: var(--okay); } .bar-fill.okay { background: var(--okay); }
  .poor { color: var(--poor); } .bar-fill.poor { background: var(--poor); }

  table.checks { width: 100%; border-collapse: collapse; }
  .checks td { padding: 10px 0; border-top: 1px solid var(--line); vertical-align: top; }
  .checks tr:first-child td { border-top: none; }
  .cell-status { width: 68px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 650; padding: 3px 8px; border-radius: 20px; }
  .badge.pass { color: var(--good); background: var(--good-bg); }
  .badge.warn { color: var(--okay); background: var(--okay-bg); }
  .badge.fail { color: var(--poor); background: var(--poor-bg); }
  .check-label { font-weight: 600; }
  .check-detail { color: var(--muted); font-size: 13px; word-break: break-word; }
  .check-fix { font-size: 13px; margin-top: 3px; }

  .opps { list-style: none; padding: 0; margin: 0; }
  .opps li { padding: 12px 0; border-top: 1px solid var(--line); }
  .opps li:first-child { border-top: none; }
  .opp-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .opp-title { font-weight: 600; }
  .opp-value { color: var(--poor); font-size: 13px; font-variant-numeric: tabular-nums; }
  .opp-desc { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px;
         border-radius: 4px; background: var(--line); color: var(--muted); }
  .empty { color: var(--muted); margin: 0; }
  footer { color: var(--muted); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">

  <div class="card hero">
    ${donut(overall.score, overall.grade)}
    <div class="hero-text">
      <h1>SEO grade for ${esc(new URL(result.finalUrl).hostname)}</h1>
      <p class="sub"><a href="${esc(result.finalUrl)}">${esc(result.finalUrl)}</a></p>
      <p class="headline">
        ${failing === 0
          ? 'All on-page checks passed.'
          : `${failing} of ${onPage.results.length} on-page checks need attention.`}
        Tested as <strong>${esc(result.formFactor)}</strong>.
      </p>
    </div>
  </div>

  <div class="card">
    <h2>Score breakdown</h2>
    <div class="pillars">${pillars(overall.parts)}</div>
  </div>

  <div class="card">
    <h2>Core Web Vitals</h2>
    <div class="vitals">${vitals(lighthouse.metrics)}</div>
  </div>

  <div class="card">
    <h2>On-page checks</h2>
    ${checkRows(onPage.results)}
  </div>

  <div class="card">
    <h2>Lighthouse opportunities</h2>
    ${opportunities(lighthouse.opportunities)}
  </div>

  <footer>
    Graded ${esc(new Date(result.generatedAt).toLocaleString())} in ${(result.durationMs / 1000).toFixed(1)}s ·
    Playwright crawl + Lighthouse ${esc(lighthouse.lighthouseVersion)} ·
    ${page.wordCount} words, ${page.images.length} images, ${page.links.length} links
  </footer>

</div>
</body>
</html>`;
}

/** Terminal summary. */
export function renderText(result) {
  const { overall, onPage, lighthouse } = result;
  const tty = process.stdout.isTTY && !process.env.NO_COLOR;
  const c = (code) => (tty ? `[${code}m` : '');
  const C = { reset: c(0), bold: c(1), dim: c(2), green: c(32), yellow: c(33), red: c(31) };
  const color = (score) => (score >= 90 ? C.green : score >= 50 ? C.yellow : C.red);
  const mark = { pass: `${C.green}PASS${C.reset}`, warn: `${C.yellow}WARN${C.reset}`, fail: `${C.red}FAIL${C.reset}` };

  const lines = [];
  lines.push('');
  lines.push(`${C.bold}${result.finalUrl}${C.reset} ${C.dim}(${result.formFactor})${C.reset}`);
  lines.push(`${color(overall.score)}${C.bold}  ${overall.grade}  ${overall.score}/100${C.reset}`);
  lines.push('');

  for (const p of overall.parts) {
    const bar = '#'.repeat(Math.round(p.score / 5)).padEnd(20, '.');
    lines.push(`  ${p.label.padEnd(16)} ${color(p.score)}${String(p.score).padStart(3)}${C.reset} ${C.dim}${bar}${C.reset}`);
  }

  lines.push('');
  lines.push(`  ${C.dim}${lighthouse.metrics.map((m) => `${m.label.split(' ').map((w) => w[0]).join('')} ${m.display}`).join('   ')}${C.reset}`);
  lines.push('');

  const problems = onPage.results.filter((r) => r.status !== 'pass');
  if (problems.length === 0) {
    lines.push(`  ${C.green}All ${onPage.results.length} on-page checks passed.${C.reset}`);
  } else {
    lines.push(`${C.bold}  Needs attention${C.reset}`);
    for (const r of problems) {
      lines.push(`  ${mark[r.status]}  ${r.label}: ${r.detail}`);
      if (r.fix) lines.push(`        ${C.dim}${r.fix}${C.reset}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
