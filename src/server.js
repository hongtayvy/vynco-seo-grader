import http from 'node:http';
import { grade, normalizeUrl } from './grader.js';
import { renderHtml } from './report.js';

const PORT = Number(process.env.PORT || 4321);

// Lighthouse throttling is only meaningful on an unloaded machine, so grade
// one URL at a time and make everyone else wait their turn.
let running = null;

const page = (body) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VYNCO SEO Grader</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#14171f; --muted:#5c6472; --line:#e3e6ec; --accent:#2d5bff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1116; --card:#171a21; --ink:#e9ecf1; --muted:#9aa3b2; --line:#262b35; --accent:#7a95ff; }
  }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
         font:15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; padding:24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:32px; width:100%; max-width:520px; }
  h1 { font-size:22px; margin:0 0 6px; letter-spacing:-0.02em; }
  p.sub { color:var(--muted); margin:0 0 22px; font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin-bottom:6px; }
  input[type=url] { width:100%; padding:11px 13px; font-size:15px; border-radius:9px;
                    border:1px solid var(--line); background:var(--bg); color:var(--ink); }
  input[type=url]:focus { outline:2px solid var(--accent); outline-offset:1px; border-color:transparent; }
  .row { display:flex; gap:16px; align-items:center; margin:16px 0 22px; font-size:14px; }
  button { width:100%; padding:12px; font-size:15px; font-weight:600; border:0; border-radius:9px;
           background:var(--accent); color:#fff; cursor:pointer; }
  button:disabled { opacity:.6; cursor:progress; }
  .note { color:var(--muted); font-size:12px; margin-top:14px; text-align:center; }
  .error { color:#c2352b; font-size:14px; margin-bottom:16px; }
</style></head>
<body><div class="card">${body}</div>
<script>
  const form = document.querySelector('form');
  form?.addEventListener('submit', () => {
    const b = form.querySelector('button');
    b.disabled = true;
    b.textContent = 'Grading, this takes ~20 seconds...';
  });
</script>
</body></html>`;

// Error text can contain the URL the visitor typed, so never inline it raw.
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const form = (error = '') => page(`
  <h1>VYNCO SEO Grader</h1>
  <p class="sub">Playwright crawls the page, Lighthouse scores it, and you get a letter grade.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="POST" action="/grade">
    <label for="url">Page URL</label>
    <input id="url" name="url" type="url" placeholder="https://example.com" required autofocus>
    <div class="row">
      <label><input type="radio" name="formFactor" value="mobile" checked> Mobile</label>
      <label><input type="radio" name="formFactor" value="desktop"> Desktop</label>
    </div>
    <button type="submit">Grade this page</button>
  </form>
  <p class="note">One page at a time, so the performance numbers stay honest.</p>
`);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const send = (res, status, html) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    return send(res, 200, form());
  }

  if (req.method === 'POST' && req.url === '/grade') {
    if (running) return send(res, 429, form('Another page is being graded right now. Try again in a moment.'));

    try {
      const params = new URLSearchParams(await readBody(req));
      const url = normalizeUrl(params.get('url') || '');
      const formFactor = params.get('formFactor') === 'desktop' ? 'desktop' : 'mobile';

      console.log(`grading ${url} (${formFactor})`);
      running = grade(url, { formFactor, onProgress: (m) => console.log(`  ${m}`) });
      const result = await running;
      console.log(`  ${result.overall.grade} ${result.overall.score}/100 in ${(result.durationMs / 1000).toFixed(1)}s`);

      return send(res, 200, renderHtml(result));
    } catch (err) {
      console.error(err);
      // Playwright errors carry a multi-line call log; the first line is the cause.
      const cause = String(err.message).split('\n')[0];
      return send(res, 400, form(`Could not grade that URL: ${cause}`));
    } finally {
      running = null;
    }
  }

  send(res, 404, form('Page not found.'));
});

server.listen(PORT, () => {
  console.log(`VYNCO SEO grader listening on http://localhost:${PORT}`);
});
