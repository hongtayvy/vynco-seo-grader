import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../src/crawl.js';

const MDN_STYLE = `
User-agent: *
Disallow: /*/search
Disallow: /api/
Disallow: /*/files/
Sitemap: https://developer.mozilla.org/sitemap.xml
`;

test('a wildcard rule does not swallow the whole site', () => {
  const r = parseRobots(MDN_STYLE);
  assert.equal(isAllowed(r, '/en-US/docs/Web/HTML'), true);
  assert.equal(isAllowed(r, '/en-US/search'), false);
  assert.equal(isAllowed(r, '/api/v1/whoami'), false);
});

test('sitemaps are collected', () => {
  assert.deepEqual(parseRobots(MDN_STYLE).sitemaps, ['https://developer.mozilla.org/sitemap.xml']);
});

test('Allow overrides a longer-matching Disallow only when more specific', () => {
  const r = parseRobots(`
User-agent: *
Disallow: /admin/
Allow: /admin/public/
`);
  assert.equal(isAllowed(r, '/admin/secret'), false);
  assert.equal(isAllowed(r, '/admin/public/page'), true);
});

test('an empty Disallow allows everything', () => {
  const r = parseRobots('User-agent: *\nDisallow:');
  assert.equal(isAllowed(r, '/anything'), true);
});

test('a trailing $ anchors the pattern', () => {
  const r = parseRobots('User-agent: *\nDisallow: /page$');
  assert.equal(isAllowed(r, '/page'), false);
  assert.equal(isAllowed(r, '/page/sub'), true);
});

test('a named agent block wins over the wildcard block', () => {
  const r = parseRobots(`
User-agent: *
Disallow: /

User-agent: googlebot
Disallow: /private/
`);
  assert.equal(isAllowed(r, '/home', 'googlebot'), true);
  assert.equal(isAllowed(r, '/private/x', 'googlebot'), false);
  assert.equal(isAllowed(r, '/home'), false);
});

test('consecutive user-agent lines share one rule block', () => {
  const r = parseRobots(`
User-agent: bingbot
User-agent: googlebot
Disallow: /nope/
`);
  assert.equal(isAllowed(r, '/nope/x', 'bingbot'), false);
  assert.equal(isAllowed(r, '/nope/x', 'googlebot'), false);
});

test('comments and query strings are handled', () => {
  const r = parseRobots('User-agent: *  # everyone\nDisallow: /*?sessionid=');
  assert.equal(isAllowed(r, '/cart?sessionid=42'), false);
  assert.equal(isAllowed(r, '/cart'), true);
});
