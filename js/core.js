/* Core API: data loading, state, DOM helpers, router. Contract: scratch/ux/UI_CONTRACT.md section 2.
 * Content rule: data strings are only ever inserted as text nodes (C11.el children / props.text). */

const cache = Object.create(null);
const listeners = { translation: [], route: [], theme: [] };
const views = Object.create(null);
const tabs = Object.create(null);

const TR_KEY = 'c11-translation';
const THEME_KEY = 'c11-theme';
const VERSES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const TAB_IDS = ['words', 'scripture', 'commentary', 'structure'];
const SIMPLE = ['structure', 'compare', 'commentators', 'topics', 'sources'];

function readStore(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function writeStore(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

export const C11 = {};

/* ---------- data ---------- */
C11.load = function (name) {
  if (!(name in cache)) {
    cache[name] = fetch('data/' + name + '.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cache[name];
};

C11.data = { books: {}, meta: {}, passage: [], passageByVerse: {}, index: { verses: {}, structure_groups: [], authors: [], eras: [] } };

C11.ready = Promise.all([C11.load('books'), C11.load('meta'), C11.load('passage'), C11.load('verse_index')]).then((r) => {
  const d = C11.data;
  d.books = r[0] && typeof r[0] === 'object' ? r[0] : {};
  d.meta = r[1] && typeof r[1] === 'object' ? r[1] : {};
  d.passage = Array.isArray(r[2]) ? r[2] : [];
  d.passage.forEach((v) => { d.passageByVerse[v.verse] = v; });
  if (r[3] && typeof r[3] === 'object') d.index = r[3];
});

C11.VERSES = VERSES;
C11.TABS = TAB_IDS;

/* ---------- state, events ---------- */
C11.state = { translation: readStore(TR_KEY) === 'kjv' ? 'kjv' : 'bsb' };

C11.on = function (evt, fn) {
  const list = listeners[evt] || (listeners[evt] = []);
  list.push(fn);
  return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
};
C11.emit = function (evt, payload) {
  (listeners[evt] || []).slice().forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(err); }
  });
};

C11.setTranslation = function (t) {
  if ((t !== 'bsb' && t !== 'kjv') || t === C11.state.translation) return;
  C11.state.translation = t;
  writeStore(TR_KEY, t);
  C11.emit('translation', t);
};

C11.theme = function () {
  const a = document.documentElement.getAttribute('data-theme');
  if (a === 'light' || a === 'dark') return a;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
C11.setTheme = function (t) {
  if (t !== 'light' && t !== 'dark') return;
  document.documentElement.setAttribute('data-theme', t);
  writeStore(THEME_KEY, t);
  C11.emit('theme', t);
};

/* ---------- DOM helpers ---------- */
function appendKids(node, kids) {
  kids.forEach((k) => {
    if (k === null || k === undefined || k === false || k === true) return;
    if (Array.isArray(k)) appendKids(node, k);
    else if (k instanceof Node) node.appendChild(k);
    else node.appendChild(document.createTextNode(String(k)));
  });
}

C11.el = function (tag, props, ...children) {
  const node = document.createElement(tag);
  const p = props || {};
  if (p.class) node.className = p.class;
  if (p.text !== null && p.text !== undefined) node.textContent = String(p.text);
  if (p.hidden) node.hidden = true;
  if (p.dir) node.setAttribute('dir', p.dir);
  if (p.lang) node.setAttribute('lang', p.lang);
  const attrs = p.attrs || {};
  Object.keys(attrs).forEach((k) => {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    node.setAttribute(k, v === true ? '' : String(v));
  });
  const on = p.on || {};
  Object.keys(on).forEach((ev) => node.addEventListener(ev, on[ev]));
  appendKids(node, children);
  return node;
};

/* Inline SVG icon built with createElementNS. */
const ICONS = {
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'M6 9l6 6 6-6',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'
};
C11.icon = function (name, size) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size || 20));
  s.setAttribute('height', String(size || 20));
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || '');
  s.appendChild(p);
  return s;
};

C11.tidy = function (str) {
  return typeof str === 'string' ? str.replace(/\s+([,.;:)])/g, '$1') : str;
};

C11.slug = function (str) {
  return String(str === null || str === undefined ? '' : str)
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

/* ---------- references ---------- */
const REF_RE = /^([^.]+)\.(\d+)(?:\.(\d+))?(?:-(?:(\d+)\.)?(\d+))?$/;

C11.fmtRef = function (ref, refEnd) {
  if (typeof ref !== 'string') return ref;
  const books = C11.data.books || {};
  if (refEnd && typeof refEnd === 'string') {
    const a = /^([^.]+)\.(\d+)\.(\d+)$/.exec(ref);
    const b = /^([^.]+)\.(\d+)\.(\d+)$/.exec(refEnd);
    if (a && b && a[1] === b[1] && books[a[1]]) {
      const tail = a[2] === b[2] ? b[3] : b[2] + ':' + b[3];
      return books[a[1]] + ' ' + a[2] + ':' + a[3] + '–' + tail;
    }
    return C11.fmtRef(ref) + '–' + C11.fmtRef(refEnd);
  }
  const m = REF_RE.exec(ref);
  if (!m) return ref;
  const name = books[m[1]];
  if (!name) return ref;
  const c = m[2], v = m[3], c2 = m[4], v2 = m[5];
  let out;
  if (v === undefined) out = v2 !== undefined ? c + '–' + v2 : c;
  else if (v2 === undefined) out = c + ':' + v;
  else if (c2 === undefined) out = c + ':' + v + '–' + v2;
  else out = c + ':' + v + '–' + c2 + ':' + v2;
  return name + ' ' + out;
};

C11.verseText = function (v) {
  const row = C11.data.passageByVerse[v];
  const s = row ? row[C11.state.translation] : null;
  return s === null || s === undefined ? '' : s;
};

/* ---------- text loaders (file layout is private to core.js) ---------- */
const REF1 = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/;

/* single verse ref 'Exo.28.36' -> {bsb, kjv} | null */
C11.textFor = async function (ref) {
  const m = REF1.exec(ref || '');
  if (!m) return null;
  const file = await C11.load('texts/' + m[1]);
  const rec = file && file[ref];
  return rec || null;
};

/* single verse ref -> {lang, tokens:[{n, word, translit, gloss, strong, grammar, grammar_expanded, type}]} | null */
const TOKEN_SHARD = 20000; // same number as build_site.TOKEN_SHARD
C11.originalFor = async function (ref) {
  const m = REF1.exec(ref || '');
  if (!m) return null;
  const [file, grammar] = await Promise.all([C11.load('original/' + m[1] + '_' + m[2]), C11.load('original_grammar')]);
  const rec = file && file[ref];
  if (!rec) return null;
  const g = Array.isArray(grammar) ? grammar : [];
  const ids = Array.isArray(rec) ? rec[1] : rec.tokens;
  const ns = Array.isArray(rec) ? null : rec.n;
  const shardNos = Array.from(new Set(ids.map((id) => Math.floor(id / TOKEN_SHARD))));
  const shards = {};
  await Promise.all(shardNos.map(async (k) => { shards[k] = (await C11.load('original_tokens/' + k)) || []; }));
  return {
    lang: Array.isArray(rec) ? rec[0] : rec.lang,
    tokens: ids.map((id, i) => {
      const t = (shards[Math.floor(id / TOKEN_SHARD)] || [])[id % TOKEN_SHARD] || [null, null, null, null, 0];
      const gr = g[t[4]] || [null, null, null];
      return {
        n: ns ? ns[i] : i + 1, word: t[0], translit: t[1], gloss: t[2], strong: t[3],
        grammar: gr[0], grammar_expanded: gr[1], type: gr[2]
      };
    })
  };
};

/* ---------- registries ---------- */
C11.components = {};

C11.registerView = function (name, def) {
  if (def && typeof def.render === 'function') views[name] = def;
};
C11.registerTab = function (id, def) {
  if (def && typeof def.render === 'function') tabs[id] = Object.assign({ id, order: 99, label: id }, def);
};
C11.getTabs = function () {
  return Object.keys(tabs).map((k) => tabs[k]).sort((a, b) => a.order - b.order);
};

/* ---------- routing ---------- */
function parseHash(raw) {
  let h = (raw || '').replace(/^#/, '');
  try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
  let m;
  /* legacy forms */
  if (h === '' || h === 'passage' || h === '/') return { redirect: '#/overview' };
  if ((m = /^v(\d+)(?:-(\d+))?$/.exec(h))) return { redirect: '#/verse/' + m[1] };
  if ((m = /^w=([GH]\d+)$/i.exec(h))) return { redirect: '#/word/' + m[1].toUpperCase() };
  if (SIMPLE.indexOf(h) >= 0) return { redirect: '#/' + h };
  if (h.charAt(0) !== '/') return { redirect: '#/overview' };
  const seg = h.slice(1).split('/').filter((s, i, a) => s !== '' || i < a.length - 1);
  while (seg.length && seg[seg.length - 1] === '') seg.pop();
  const name = seg[0];
  const route = (n, params) => ({ name: n, params, hash: '#/' + seg.join('/') });
  if (name === 'overview' && seg.length === 1) return route('overview', {});
  if (name === 'verse') {
    const n = parseInt(seg[1], 10);
    if (!/^\d+$/.test(seg[1] || '') || VERSES.indexOf(n) < 0) return { redirect: '#/verse/3' };
    const tab = seg[2];
    if (seg.length > 3 || (tab !== undefined && TAB_IDS.indexOf(tab) < 0)) return { redirect: '#/verse/' + n + '/scripture' };
    return { name: 'verse', params: { verse: n, tab: tab || 'scripture' }, hash: '#/verse/' + n + '/' + (tab || 'scripture'), implicitTab: !tab };
  }
  if (name === 'structure' && seg.length <= 2) return route('structure', { id: seg[1] || null });
  if (name === 'compare' && seg.length === 3) return route('compare', { a: seg[1], b: seg[2] });
  if (name === 'commentators' && seg.length <= 2) return route('commentators', { slug: seg[1] || null });
  if (name === 'topics' && seg.length <= 2) return route('topics', { id: seg[1] || null });
  if (name === 'sources' && seg.length === 1) return route('sources', {});
  if (name === 'word' && (seg.length === 2 || seg.length === 3) && seg[1]) {
    const st = history.state && typeof history.state.wd === 'number' ? history.state.wd : 0;
    return { name: 'word', params: { key: seg[1], token: seg[2] || null }, hash: '#/' + seg.join('/'), wd: st };
  }
  return { redirect: '#/overview' };
}

const R = { base: null, cleanup: null, seq: 0, started: false, container: null, wd: 0 };
C11.route = { name: null, params: {}, hash: '' };
C11.baseRoute = null;

C11.navigate = function (hash, opts) {
  const h = String(hash).charAt(0) === '#' ? String(hash) : '#' + hash;
  if (h === location.hash && !(opts && opts.replace)) return;
  const wd = opts && typeof opts.wd === 'number' ? opts.wd : 0;
  if (opts && opts.replace) history.replaceState(wd ? { wd } : null, '', h);
  else history.pushState(wd ? { wd } : null, '', h);
  onRoute();
};

C11.openWord = function (key, tokenId) {
  if (!key) return;
  const cur = C11.route;
  const wd = cur && cur.name === 'word' ? ((history.state && history.state.wd) || 0) + 1 : 1;
  C11.navigate('#/word/' + encodeURIComponent(key) + (tokenId ? '/' + encodeURIComponent(tokenId) : ''), { wd });
};

/* Close the word overlay: back through in-app word entries, else replace with the underlying route. */
C11.closeWord = function () {
  if (C11.route.name !== 'word') return;
  const wd = (history.state && history.state.wd) || 0;
  if (wd > 0) history.go(-wd);
  else C11.navigate((R.base && R.base.hash) || '#/overview', { replace: true });
};

function sameRoute(a, b) { return a && b && a.hash === b.hash; }

async function onRoute() {
  const r = parseHash(location.hash);
  if (r.redirect) { C11.navigate(r.redirect, { replace: true }); return; }
  const seq = ++R.seq;
  await C11.ready;
  if (seq !== R.seq) return;
  if (r.name === 'word') {
    if (!R.base) {
      R.base = parseHash('#/overview');
      C11.baseRoute = R.base;
      await renderView(R.base, null, seq);
    }
    C11.route = r;
    C11.emit('route', r);
    return;
  }
  const prev = R.base;
  const prevRoute = C11.route;
  C11.route = r;
  R.base = r;
  C11.baseRoute = r;
  if (!(prevRoute.name === 'word' && sameRoute(prev, r) && R.cleanup !== undefined && R.rendered)) {
    await renderView(r, prev, seq);
  }
  if (seq !== R.seq) return;
  C11.emit('route', r);
}

async function renderView(r, prev, seq) {
  const container = R.container;
  const def = views[r.name];
  /* in-view update (study tab / verse change) */
  if (prev && prev.name === r.name && def && typeof def.update === 'function' && R.rendered) {
    const handled = def.update(container, r.params, prev.params);
    if (handled) return;
  }
  if (typeof R.cleanup === 'function') { try { R.cleanup(); } catch (e) { console.error(e); } }
  R.cleanup = null;
  R.rendered = false;
  container.replaceChildren();
  container.setAttribute('data-view', r.name);
  window.scrollTo(0, 0);
  let result = null;
  if (!def) {
    container.appendChild(C11.el('div', { class: 'wrap view-missing' },
      C11.el('h1', { class: 'view-title', text: 'Section unavailable' }),
      C11.el('p', { class: 'empty', text: 'This section could not be loaded.' })));
  } else {
    try { result = await def.render(container, r.params); } catch (err) {
      console.error(err);
      container.appendChild(C11.el('p', { class: 'empty wrap', text: 'This section could not be displayed.' }));
    }
  }
  if (seq !== R.seq) { if (typeof result === 'function') { try { result(); } catch (e) { /* ignore */ } } return; }
  R.cleanup = typeof result === 'function' ? result : null;
  R.rendered = true;
  const h1 = container.querySelector('h1');
  document.title = (h1 && h1.textContent ? h1.textContent + ' · ' : '') + '1 Corinthians 11:3–16';
}

C11.start = async function () {
  if (R.started) return;
  R.started = true;
  R.container = document.getElementById('main');
  try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
  await C11.ready;
  window.addEventListener('popstate', onRoute);
  await onRoute();
};

window.C11 = C11;
