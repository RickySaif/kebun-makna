// js/stats.js: anonymous stats must never carry anything that identifies a player.
// Runs the script in a vm with a fake browser. No network, no browser needed.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/stats.js', import.meta.url), 'utf8');
let failed = 0;
const test = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); } };

function load(loc) {
  const injected = [];
  const listeners = {};
  const store = new Map();
  const sandbox = {
    URL, Date, Number, console,
    location: { hostname: 'km.generasimerdeka.com', pathname: '/', hash: '', search: '', ...loc },
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    document: {
      createElement: () => { const attrs = {}; return { attrs, setAttribute: (k, v) => { attrs[k] = v; } }; },
      head: { appendChild: el => injected.push(el) },
    },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (ev, fn) => { listeners[ev] = fn; };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, injected, listeners, store };
}

// What Umami would hand to kmStatsBeforeSend for a page view at the given address.
function pageview(loc, extra = {}) {
  const { sandbox } = load(loc);
  const full = 'https://km.generasimerdeka.com' + (loc.pathname || '/') + (loc.search || '');
  return sandbox.kmStatsBeforeSend('event', {
    website: 'x', hostname: 'km.generasimerdeka.com', screen: '390x844', language: 'id',
    title: 'Halo Amtar', url: full, referrer: '', ...extra,
  });
}

const UUID = '3f2b8c1e-9d4a-4e6b-8a57-0c1d2e3f4a5b';

test('route paths are cleaned to the allow-list', () => {
  const cases = [
    [{ hash: '#/beranda' }, '/beranda'],
    [{ hash: '#/beranda/ikuti' }, '/beranda/ikuti'],
    [{ hash: '#/beranda/jelajah' }, '/beranda/jelajah'],
    [{ hash: '#/beranda/someone-else' }, '/beranda'],
    [{ hash: '#/profil' }, '/profil'],
    [{ hash: '#/profil/' + UUID }, '/profil/detail'],
    [{ hash: '#/grup' }, '/grup'],
    [{ hash: '#/grup/' + UUID }, '/grup/detail'],
    [{ hash: '#/kunjungi/' + UUID }, '/kunjungi/detail'],
    [{ hash: '#/lomba' }, '/lomba'],
    [{ hash: '#/lomba/1234' }, '/lomba/detail'],
    [{ hash: '#/dukung' }, '/dukung'],
    [{ hash: '#/dukung?code=abc' }, '/dukung'],
    [{ hash: '#/admin' }, '/admin'],
    [{ hash: '#/tamu' }, '/tamu'],
  ];
  for (const [loc, want] of cases) assert.equal(pageview(loc).url, want, JSON.stringify(loc));
});

test('tokens, codes and unknown hashes become the bare page path', () => {
  assert.equal(pageview({ hash: '#access_token=eyJabc.def.ghi&refresh_token=zzz&type=recovery' }).url, '/');
  assert.equal(pageview({ search: '?code=abcd1234', pathname: '/' }).url, '/');
  assert.equal(pageview({ hash: '#/' + 'x'.repeat(40) }).url, '/');
  assert.equal(pageview({ hash: '#KM-AB12-CD34' }).url, '/');
  assert.equal(pageview({ pathname: '/privasi.html', search: '?code=1' }).url, '/privasi.html');
  assert.equal(pageview({ pathname: '/syarat.html' }).url, '/syarat.html');
  assert.equal(pageview({ pathname: '/index.html' }).url, '/');
  assert.equal(pageview({ pathname: '/cek-audio.html' }).url, '/');
});

test('no identifying text in the cleaned page view payload', () => {
  const p = pageview({ hash: '#/grup/' + UUID, search: '?code=abc' });
  const text = JSON.stringify(p);
  assert.ok(!text.includes(UUID) && !/code=|access_token|Amtar/.test(text), text);
  assert.equal(p.title, 'Kebun Makna');
});

test('referrer keeps only the origin of an outside site, and is empty for our own pages', () => {
  assert.equal(pageview({}, { referrer: 'https://www.google.com/search?q=kebun+makna+amtar' }).referrer, 'https://www.google.com');
  assert.equal(pageview({}, { referrer: 'https://km.generasimerdeka.com/#/grup/' + UUID }).referrer, '');
  assert.equal(pageview({}, { referrer: '/privasi.html' }).referrer, '');
  assert.equal(pageview({}, { referrer: '' }).referrer, '');
});

test('performance payloads are cleaned the same way', () => {
  const { sandbox } = load({ hash: '#/lomba/1234' });
  const p = sandbox.kmStatsBeforeSend('performance', { url: 'https://km.generasimerdeka.com/#/lomba/1234', title: 'Lomba Budi', lcp: 1200, referrer: '' });
  assert.equal(p.url, '/lomba/detail');
  assert.equal(p.title, 'Kebun Makna');
  assert.equal(p.lcp, 1200);
});

test('error payloads: path cleaned, text redacted', () => {
  const { sandbox } = load({ hash: '#/grup/' + UUID });
  const p = sandbox.kmStatsBeforeSend('error', {
    url: '/', name: 'Error',
    message: `duplicate key for ${UUID} user budi@example.com code KM-AB12-CD34 at #/grup/${UUID}?x=1 token=abc`,
    stack: `Error\n    at https://km.generasimerdeka.com/js/main.js:12:3 (jwt eyJabc.def.ghi, access_token=zzzz)`,
    tags: { user: 'budi' },
  });
  const text = JSON.stringify(p);
  assert.equal(p.url, '/grup/detail');
  assert.ok(!text.includes(UUID), text);
  assert.ok(!/budi|KM-AB12|eyJabc|zzzz|access_token=z/i.test(text), text);
  assert.ok(!('tags' in p));
  assert.ok(p.stack.includes('js/main.js:12:3'), 'file and line stay');
});

test('the same screen twice within seconds is counted once (hash change then reload)', () => {
  const { sandbox } = load({ hash: '#/profil' });
  const mk = () => ({ url: '/', title: 't', referrer: '' });
  assert.ok(sandbox.kmStatsBeforeSend('event', mk()));
  assert.equal(sandbox.kmStatsBeforeSend('event', mk()), null);
  sandbox.location.hash = '#/grup';
  assert.ok(sandbox.kmStatsBeforeSend('event', mk()));
  // named events and performance are never dropped by the repeat rule
  assert.ok(sandbox.kmStatsBeforeSend('event', { ...mk(), name: 'x' }));
  assert.ok(sandbox.kmStatsBeforeSend('performance', mk()));
});

test('injects the collector script with the privacy attributes on the live host only', () => {
  const live = load({});
  assert.equal(live.injected.length, 1);
  const a = live.injected[0].attrs;
  assert.equal(live.injected[0].src, 'https://monitor-km.generasimerdeka.com/kebun.js');
  assert.equal(a['data-domains'], 'km.generasimerdeka.com');
  assert.equal(a['data-exclude-search'], 'true');
  assert.equal(a['data-exclude-hash'], 'true');
  assert.equal(a['data-before-send'], 'kmStatsBeforeSend');
  assert.equal(a['data-errors'], 'true');
  assert.equal(a['data-performance'], 'true');
  assert.match(a['data-website-id'], /^[0-9a-f-]{36}$/);
  assert.equal(typeof live.listeners.hashchange, 'function');
});

test('nothing is injected or hooked on localhost, the old address, or a lookalike host', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'rickysaif.github.io', 'km.generasimerdeka.com.evil.test']) {
    const r = load({ hostname });
    assert.equal(r.injected.length, 0, hostname);
    assert.equal(r.listeners.hashchange, undefined, hostname);
    assert.equal(r.sandbox.kmStatsBeforeSend, undefined, hostname);
  }
});

test('hashchange reports a page view only when Umami is loaded', () => {
  const r = load({});
  let tracked = 0;
  r.listeners.hashchange(); // no window.umami yet: must not throw
  r.sandbox.umami = { track: () => { tracked++; } };
  r.listeners.hashchange();
  assert.equal(tracked, 1);
});

console.log(failed ? `${failed} failed` : 'all stats tests pass');
process.exit(failed ? 1 : 0);
