/* Anonymous visit stats with Umami, which we run ourselves (monitor-km.generasimerdeka.com).
   A classic script, not a module, so it also works on privasi.html and syarat.html.

   RULE: nothing that identifies a player may ever reach the stats. No names, usernames, user or group IDs,
   room codes, emails, login tokens or family codes. Every payload (page view, error, load speed) goes through
   kmStatsBeforeSend below, which rewrites the address to a fixed list of screens ("allow-list").
   Adding a new hash route to the game? Add it to ROUTES here too, or it is counted as "/". */
(function () {
  'use strict';
  var HOST = 'km.generasimerdeka.com';
  // Only the real live game reports. localhost tests and the old github.io address stay out of the stats.
  if (location.hostname !== HOST) return;

  var COLLECTOR = 'https://monitor-km.generasimerdeka.com';
  var WEBSITE_ID = '60beafb5-5349-4705-aaf8-eeb5e98acaf7';

  // Real pages that may keep their own path. Everything else is "/".
  var PAGES = { '/privasi.html': 1, '/syarat.html': 1 };
  // Hash routes of the game (see route() in js/main.js).
  var ROUTES = /^#\/(beranda|profil|grup|kunjungi|lomba|dukung|admin|tamu)(?:\/([^/?#]*))?/;

  function cleanPath() {
    var m = (location.hash || '').match(ROUTES);
    if (m) {
      var kind = m[1], arg = m[2];
      if (kind === 'beranda') return arg === 'ikuti' || arg === 'jelajah' ? '/beranda/' + arg : '/beranda';
      if (kind === 'dukung' || kind === 'admin' || kind === 'tamu') return '/' + kind;
      return arg ? '/' + kind + '/detail' : '/' + kind; // an ID or room code becomes "detail"
    }
    return PAGES[location.pathname] ? location.pathname : '/';
  }

  // Keep only the origin of an outside referrer. Our own pages (also path-only ones) become empty.
  function cleanReferrer(ref) {
    if (!ref) return '';
    try {
      var u = new URL(ref);
      return u.hostname === HOST ? '' : u.origin;
    } catch (e) { return ''; }
  }

  // Error text is scrubbed by Umami (emails, tokens, URL queries); this also removes what is specific to us.
  function redact(s) {
    if (typeof s !== 'string') return s;
    return s
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
      .replace(/\bKM-[A-Z0-9-]+/gi, '[kode]')
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .replace(/#\/\S*/g, '#/[rute]')
      .replace(/\b(access_token|refresh_token|provider_token|code|token|state|password|secret|api_?key)(\s*[:=]\s*)[^\s&),;]+/gi, '$1$2[x]')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[x]');
  }

  // A hash change outside the social pages reloads the game (js/main.js), so the reloaded page would count
  // the same screen a second time. Drop a repeat of the same screen within a few seconds.
  function isRepeat(path) {
    try {
      var now = Date.now(), last = (sessionStorage.getItem('km-stats-last') || '').split('|');
      sessionStorage.setItem('km-stats-last', path + '|' + now);
      return last[0] === path && now - Number(last[1]) < 3000;
    } catch (e) { return false; }
  }

  window.kmStatsBeforeSend = function (type, payload) {
    if (!payload) return payload;
    var path = cleanPath();
    payload.url = path;
    if (type === 'error') {
      payload.name = redact(payload.name);
      payload.message = redact(payload.message);
      payload.stack = redact(payload.stack);
      delete payload.tags;
      return payload;
    }
    payload.referrer = cleanReferrer(payload.referrer);
    payload.title = 'Kebun Makna';
    delete payload.id;
    if (type === 'event' && !payload.name && isRepeat(path)) return null; // a page view, not a named event
    return payload;
  };

  var s = document.createElement('script');
  s.defer = true;
  s.src = COLLECTOR + '/kebun.js';
  s.setAttribute('data-website-id', WEBSITE_ID);
  s.setAttribute('data-domains', HOST);
  s.setAttribute('data-exclude-search', 'true');
  s.setAttribute('data-exclude-hash', 'true');
  s.setAttribute('data-before-send', 'kmStatsBeforeSend');
  s.setAttribute('data-errors', 'true');
  s.setAttribute('data-performance', 'true');
  document.head.appendChild(s);

  // The game routes with location.hash, but Umami only watches pushState, so report hash changes ourselves.
  window.addEventListener('hashchange', function () {
    if (window.umami && typeof window.umami.track === 'function') window.umami.track();
  });
})();
