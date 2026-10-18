/* WB-h2: C11 core API, router, passage view, overlays, sanitizer.
 * Content rule: every data string is inserted with textContent / text nodes.
 * UI text is limited to neutral labels (see scratch/wb/SPEC.md, UI TEXT RULE). */
(function () {
  'use strict';

  const C11 = (window.C11 = window.C11 || {});

  /* ---------- data loading ---------- */
  const cache = Object.create(null);
  C11.load = function (name) {
    if (!(name in cache)) {
      cache[name] = fetch('data/' + name + '.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return cache[name];
  };

  C11.ready = Promise.all([C11.load('books'), C11.load('meta'), C11.load('passage')]).then(function (r) {
    C11.books = r[0] && typeof r[0] === 'object' ? r[0] : {};
    C11.meta = r[1] && typeof r[1] === 'object' ? r[1] : {};
    C11.passage = Array.isArray(r[2]) ? r[2] : [];
    C11.passageByN = {};
    C11.passage.forEach(function (v) { C11.passageByN[v.verse] = v; });
  });

  /* ---------- state (translation persisted) ---------- */
  const TR_KEY = 'c11-tr';
  const trListeners = [];
  let trValue = 'bsb';
  try {
    const saved = localStorage.getItem(TR_KEY);
    if (saved === 'bsb' || saved === 'kjv') trValue = saved;
  } catch (e) { /* storage unavailable */ }

  C11.state = {};
  Object.defineProperty(C11.state, 'translation', {
    enumerable: true,
    get: function () { return trValue; },
    set: function (v) {
      if ((v !== 'bsb' && v !== 'kjv') || v === trValue) return;
      trValue = v;
      try { localStorage.setItem(TR_KEY, v); } catch (e) { /* ignore */ }
      syncTrButtons();
      trListeners.slice().forEach(function (fn) {
        try { fn(v); } catch (err) { console.error(err); }
      });
    }
  });
  C11.onTranslation = function (fn) {
    if (typeof fn === 'function') trListeners.push(fn);
  };

  /* ---------- DOM helpers ---------- */
  function appendKids(node, kids) {
    kids.forEach(function (k) {
      if (k === null || k === undefined || typeof k === 'boolean') return;
      if (Array.isArray(k)) return appendKids(node, k);
      if (k instanceof Node) node.appendChild(k);
      else node.appendChild(document.createTextNode(String(k)));
    });
  }

  C11.el = function (tag, props) {
    const node = document.createElement(tag);
    const p = props || {};
    if (p.class) node.className = p.class;
    if (p.text !== null && p.text !== undefined) node.textContent = String(p.text);
    const attrs = p.attrs || {};
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      node.setAttribute(k, v === true ? '' : String(v));
    });
    const on = p.on || {};
    Object.keys(on).forEach(function (ev) { node.addEventListener(ev, on[ev]); });
    const ds = p.dataset || {};
    Object.keys(ds).forEach(function (k) {
      if (ds[k] !== null && ds[k] !== undefined) node.dataset[k] = String(ds[k]);
    });
    appendKids(node, Array.prototype.slice.call(arguments, 2));
    return node;
  };

  C11.empty = function (text) {
    return C11.el('p', { class: 'empty', text: text === undefined ? 'No entries yet' : text });
  };

  C11.badge = function (status) {
    if (status === 'public_domain') return C11.el('span', { class: 'badge pd', text: 'Public domain' });
    if (status === 'copyrighted_excerpt') return C11.el('span', { class: 'badge cr', text: 'Copyrighted excerpt' });
    return null;
  };

  /* ---------- references ---------- */
  const BOOK_RE = /^([^.]+)\.(\d+)(?:\.(\d+))?(?:-(?:(\d+)\.)?(\d+))?$/;

  C11.fmtRef = function (ref) {
    const m = typeof ref === 'string' ? ref.match(BOOK_RE) : null;
    if (!m) return ref;
    const name = C11.books && C11.books[m[1]];
    if (!name) return ref;
    const c = m[2], v = m[3], c2 = m[4], v2 = m[5];
    let out;
    if (v === undefined) out = v2 !== undefined ? c + '–' + v2 : c;
    else if (v2 === undefined) out = c + ':' + v;
    else if (c2 === undefined) out = c + ':' + v + '–' + v2;
    else out = c + ':' + v + '–' + c2 + ':' + v2;
    return name + ' ' + out;
  };

  C11.refButton = function (ref, label, opts) {
    const o = opts || {};
    const refs = o.refs !== undefined ? o.refs : [ref];
    const btn = C11.el('button', {
      class: 'ref',
      text: label === null || label === undefined ? C11.fmtRef(ref) : String(label),
      attrs: { type: 'button', title: o.title || null },
      on: { click: function () { C11.openRefPopover(btn, refs, o.end); } }
    });
    return btn;
  };

  function parseOne(s) {
    let m = /^([^.]+)\.(\d+)\.(\d+)$/.exec(s);
    if (m) return { book: m[1], c: +m[2], v: +m[3] };
    return null;
  }

  function parseRangeStr(s) {
    const m = /^([^.]+)\.(\d+)\.(\d+)-(?:(\d+)\.)?(\d+)$/.exec(s);
    if (!m) return null;
    return { book: m[1], c: +m[2], v: +m[3], c2: m[4] !== undefined ? +m[4] : +m[2], v2: +m[5] };
  }

  /* Verse texts are stored per book: data/texts/<BookCode>.json, shape {"Book.C.V": {bsb,kjv}}. */
  async function loadTextsFor(keys) {
    const books = [];
    keys.forEach(function (k) {
      const b = k.split('.')[0];
      if (books.indexOf(b) < 0) books.push(b);
    });
    const parts = await Promise.all(books.map(function (b) { return C11.load('texts/' + b); }));
    const merged = {};
    parts.forEach(function (p) { if (p) Object.keys(p).forEach(function (k) { merged[k] = p[k]; }); });
    return merged;
  }

  /* Expand a ref (single, V-V2, C.V-C2.V2) plus optional end into verse keys. Cap 30. */
  async function expandRef(ref, end) {
    let s = null;
    const range = parseRangeStr(ref);
    if (range) s = range;
    else {
      const one = parseOne(ref);
      if (!one) return [];
      s = { book: one.book, c: one.c, v: one.v, c2: one.c, v2: one.v };
    }
    if (end) {
      const e = parseOne(end);
      if (!e || e.book !== s.book) return [];
      s.c2 = e.c;
      s.v2 = e.v;
    }
    const CAP = 30;
    const out = [];
    if (s.c2 === s.c) {
      for (let i = s.v; i <= s.v2 && out.length < CAP; i++) out.push(s.book + '.' + s.c + '.' + i);
      if (!out.length) out.push(s.book + '.' + s.c + '.' + s.v);
      return out;
    }
    /* Cross-chapter: the endpoints plus verses that have a row in this book's texts file. */
    const bookTexts = (await C11.load('texts/' + s.book)) || {};
    const seen = {};
    const cands = [];
    const add = function (c, v) {
      const k = s.book + '.' + c + '.' + v;
      if (!seen[k]) { seen[k] = true; cands.push({ c: c, v: v, k: k }); }
    };
    add(s.c, s.v);
    add(s.c2, s.v2);
    Object.keys(bookTexts).forEach(function (k) {
      const p = parseOne(k);
      if (!p || p.book !== s.book) return;
      const after = p.c > s.c || (p.c === s.c && p.v >= s.v);
      const before = p.c < s.c2 || (p.c === s.c2 && p.v <= s.v2);
      if (after && before) add(p.c, p.v);
    });
    cands.sort(function (a, b) { return (a.c - b.c) || (a.v - b.v); });
    return cands.slice(0, CAP).map(function (x) { return x.k; });
  }

  function verseText(key, texts, tr) {
    const t = texts && texts[key];
    let s = t ? t[tr] : null;
    if (s === null || s === undefined) {
      const pv = key.indexOf('1Co.11.') === 0 ? verseFromPassage(key) : null;
      s = pv ? pv[tr] : null;
    }
    return s === null || s === undefined ? 'No text' : s;
  }

  /* Lexicon files: data/lexicon_keys.json lists keys; entries live in data/lexicon/<key>.json. */
  async function loadLexEntry(keysFile, prefix, codes) {
    const keys = (await C11.load(keysFile)) || [];
    const set = {};
    keys.forEach(function (k) { set[k] = true; });
    let key = null;
    for (let i = 0; i < codes.length && !key; i++) {
      const c = codes[i];
      if (!c) continue;
      [c, padCode(c), unpadCode(c)].some(function (cand) {
        if (set[cand]) { key = cand; return true; }
        return false;
      });
    }
    if (!key) return { key: null, entry: null };
    const data = await C11.load(prefix + '/' + key);
    let entry = data && data[key] && typeof data[key] === 'object' && !('lemma' in data) ? data[key] : data;
    return { key: key, entry: entry || null };
  }

  function verseFromPassage(key) {
    const m = /^1Co\.11\.(\d+)$/.exec(key);
    return m && C11.passageByN ? C11.passageByN[+m[1]] || null : null;
  }

  /* ---------- overlays (stack: popover above drawer) ---------- */
  const stack = [];
  const popRoot = document.getElementById('popover-root');
  const drawerRoot = document.getElementById('drawer-root');

  function closeEntry(entry, restoreFocus) {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    if (restoreFocus && entry.returnTo && entry.returnTo.isConnected && typeof entry.returnTo.focus === 'function') {
      entry.returnTo.focus({ preventScroll: true });
    }
  }

  function removeKind(kind) {
    stack.filter(function (e) { return e.kind === kind; }).forEach(function (e) { closeEntry(e, false); });
  }

  function focusTarget() {
    const a = document.activeElement;
    return a && a !== document.body ? a : null;
  }

  C11.closeOverlays = function () {
    let last = null;
    while (stack.length) {
      last = stack.pop();
      if (last.el && last.el.parentNode) last.el.parentNode.removeChild(last.el);
    }
    if (last && last.returnTo && last.returnTo.isConnected && last.returnTo.focus) {
      last.returnTo.focus({ preventScroll: true });
    }
  };

  function placePopover(el, anchor) {
    if (!anchor || !anchor.isConnected) return;
    if (window.matchMedia('(max-width: 767.98px)').matches) return;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8));
    el.style.left = left + 'px';
    el.style.top = (r.bottom + window.scrollY + 6) + 'px';
  }

  /* ---------- reference popover ---------- */
  C11.openRefPopover = function (anchor, refs, end) {
    const list = (Array.isArray(refs) ? refs : refs ? [refs] : []).filter(function (s) { return typeof s === 'string'; });
    removeKind('popover');
    const title = list.length ? (end ? C11.fmtRef(list[0]) + ' – ' + C11.fmtRef(end) : C11.fmtRef(list[0])) : '';
    const body = C11.el('div', { class: 'pop-body' });
    const closeBtn = C11.el('button', { class: 'close-btn', text: 'Close', attrs: { type: 'button' } });
    const el = C11.el('div', {
      class: 'popover',
      attrs: { role: 'dialog', 'aria-label': title || 'Cross-references' },
      dataset: { kind: 'popover' }
    }, C11.el('div', { class: 'pop-head' }, C11.el('h2', { text: title }), closeBtn), body);
    const entry = { kind: 'popover', el: el, returnTo: anchor || null };
    closeBtn.addEventListener('click', function () { closeEntry(entry, true); });
    stack.push(entry);
    popRoot.appendChild(el);
    placePopover(el, anchor);
    closeBtn.focus({ preventScroll: true });
    fillPopover(entry, body, list, end).then(function () {
      if (stack.indexOf(entry) >= 0) placePopover(el, anchor);
    });
  };

  async function fillPopover(entry, body, refs, end) {
    if (!refs.length) { body.appendChild(C11.empty()); return; }
    const single = refs.length === 1;
    const ot = single ? await C11.load('original_texts') : null;
    if (stack.indexOf(entry) < 0) return;
    const expanded = [];
    for (let i = 0; i < refs.length; i++) expanded.push(await expandRef(refs[i], single ? end : null));
    const texts = await loadTextsFor([].concat.apply([], expanded));
    if (stack.indexOf(entry) < 0) return;
    const tr = C11.state.translation;
    const nodes = [];
    refs.forEach(function (ref, ri) {
      const keys = expanded[ri];
      const multi = refs.length > 1 || keys.length > 1;
      if (!keys.length) {
        nodes.push(C11.el('div', { class: 'pop-item' },
          multi ? C11.el('div', { class: 'pop-ref', text: C11.fmtRef(ref) }) : null,
          C11.el('p', { class: 'pop-text', text: 'No text' })));
        return;
      }
      keys.forEach(function (k) {
        nodes.push(C11.el('div', { class: 'pop-item' },
          multi ? C11.el('div', { class: 'pop-ref', text: C11.fmtRef(k) }) : null,
          C11.el('p', { class: 'pop-text', text: verseText(k, texts, tr) })));
      });
    });
    if (single && ot) {
      const rec = ot[refs[0]];
      if (rec && Array.isArray(rec.tokens) && rec.tokens.length) {
        const hebrew = rec.lang === 'hebrew';
        nodes.push(C11.el('div', { class: 'pop-words', attrs: { dir: hebrew ? 'rtl' : null, lang: hebrew ? 'he' : null } }, rec.tokens.map(function (t) {
          return C11.el('button', {
            class: 'word word-chip',
            attrs: { type: 'button', lang: hebrew ? 'he' : 'grc', dir: hebrew ? 'rtl' : null },
            on: { click: function () {
              C11.openWordDrawer({ strong: t.strong, lang: hebrew ? 'hebrew' : 'greek', token: t });
            } }
          },
            C11.el('span', { class: 'w-gr', text: t.word || t.greek || null }),
            C11.el('span', { class: 'w-tl', text: t.translit || null }),
            C11.el('span', { class: 'w-gl', text: t.gloss || null }));
        })));
      }
    }
    body.replaceChildren(...nodes);
  }

  /* ---------- lexicon helpers ---------- */
  function padCode(c) {
    const m = /^([GH])(\d+)$/i.exec(c);
    return m ? m[1].toUpperCase() + ('0000' + m[2]).slice(-4) : c;
  }
  function unpadCode(c) {
    const m = /^([GH])0*(\d+)$/i.exec(c);
    return m ? m[1].toUpperCase() + m[2] : c;
  }
  function findEntry(map, codes) {
    if (!map) return null;
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (!c) continue;
      const cands = [c, padCode(c), unpadCode(c)];
      for (let j = 0; j < cands.length; j++) {
        const k = cands[j];
        if (Object.prototype.hasOwnProperty.call(map, k)) return { key: k, entry: map[k] };
      }
    }
    return null;
  }
  function tokLemma(t) {
    return t ? (t.lemma || t.word || t.greek || null) : null;
  }
  function dlist(rows) {
    const kids = [];
    rows.forEach(function (r) {
      if (r[1] === null || r[1] === undefined || r[1] === '') return;
      kids.push(C11.el('dt', { text: r[0] }), C11.el('dd', { text: String(r[1]), attrs: { lang: r[2] || null } }));
    });
    return kids.length ? C11.el('dl', {}, kids) : null;
  }
  function section(label, node) {
    return C11.el('section', {}, C11.el('h3', { text: label }), node);
  }

  /* ---------- sanitizer: lexicon html -> DOM nodes (no markup parsing by the browser) ---------- */
  const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    hellip: '…', middot: '·', sect: '§', para: '¶', dagger: '†', Dagger: '‡',
    deg: '°', times: '×', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è',
    aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß',
    ccedil: 'ç', ntilde: 'ñ', oacute: 'ó', iacute: 'í', uacute: 'ú'
  };

  function decodeEntities(s) {
    return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, function (m, body) {
      if (body.charAt(0) === '#') {
        const code = body.charAt(1).toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10FFFF) return m;
        try { return String.fromCodePoint(code); } catch (e) { return m; }
      }
      return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
    });
  }

  function sanitizeLexHtml(html, asRefs) {
    const frag = document.createDocumentFragment();
    const stk = [{ kind: 'root', el: frag }];
    const top = function () { return stk[stk.length - 1]; };
    const addText = function (s) {
      if (!s) return;
      const t = top();
      if (t.kind === 'ref') t.buf += s;
      else t.el.appendChild(document.createTextNode(s));
    };
    const closeRef = function (f) {
      stk.pop();
      const btn = C11.refButton(f.attr, f.buf, {
        refs: (asRefs && Array.isArray(asRefs[f.attr])) ? asRefs[f.attr] : [],
        title: f.attr
      });
      top().el.appendChild(btn);
    };
    const TAG_RE = /<ref\s*=\s*(?:'([^']*)'|"([^"]*)")\s*>|<\/ref\s*>|<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^>]*>/gi;
    const src = String(html);
    let last = 0;
    let m;
    while ((m = TAG_RE.exec(src)) !== null) {
      addText(decodeEntities(src.slice(last, m.index)));
      last = TAG_RE.lastIndex;
      if (m[1] !== undefined || m[2] !== undefined) {
        /* <ref='X'> opening; nested refs are not split into buttons */
        if (top().kind !== 'ref') stk.push({ kind: 'ref', attr: m[1] !== undefined ? m[1] : m[2], buf: '' });
      } else if (m[4] === undefined) {
        /* </ref> closing */
        if (top().kind === 'ref') closeRef(top());
      } else {
        const closing = m[3] === '/';
        const name = m[4].toLowerCase();
        if (top().kind === 'ref') continue; /* formatting inside a ref is dropped, its text is kept */
        if (name === 'b' || name === 'i') {
          if (closing) {
            for (let j = stk.length - 1; j > 0; j--) {
              if (stk[j].kind === name) { stk.length = j; break; }
            }
          } else {
            const e = document.createElement(name);
            top().el.appendChild(e);
            stk.push({ kind: name, el: e });
          }
        } else if (name === 'br' && !closing) {
          top().el.appendChild(document.createElement('br'));
        }
        /* any other tag is removed; its text is kept */
      }
    }
    addText(decodeEntities(src.slice(last)));
    while (top().kind === 'ref') closeRef(top());
    return frag;
  }

  function lexBlock(html, asRefs) {
    return C11.el('div', { class: 'lex-html' }, sanitizeLexHtml(html, asRefs));
  }

  /* ---------- word drawer ---------- */
  let drawerEntry = null;
  let drawerSeq = 0;

  C11.openWordDrawer = function (opts) {
    const o = opts || {};
    const tok = o.token || null;
    const hebrew = o.lang === 'hebrew';
    const code = o.dstrong || o.strong || (tok && (tok.dstrong || tok.strong)) || '';
    const lemmaFallback = tokLemma(tok) || code || null;
    removeKind('drawer');
    const titleEl = C11.el('h2', {
      text: lemmaFallback,
      attrs: { lang: hebrew ? 'he' : 'grc', dir: hebrew ? 'rtl' : null }
    });
    const closeBtn = C11.el('button', { class: 'close-btn', text: 'Close', attrs: { type: 'button' } });
    const bodyEl = C11.el('div', { class: 'drawer-body' });
    const el = C11.el('aside', {
      class: 'drawer',
      attrs: { role: 'dialog', 'aria-label': lemmaFallback || null },
      dataset: { kind: 'drawer' }
    }, C11.el('div', { class: 'drawer-head' }, titleEl, closeBtn), bodyEl);
    const entry = { kind: 'drawer', el: el, returnTo: focusTarget(), opts: o, titleEl: titleEl, bodyEl: bodyEl, seq: 0 };
    closeBtn.addEventListener('click', function () { closeEntry(entry, true); });
    stack.push(entry);
    drawerRoot.appendChild(el);
    drawerEntry = entry;
    closeBtn.focus({ preventScroll: true });
    renderDrawer(entry);
  };

  async function renderDrawer(entry) {
    const seq = ++drawerSeq;
    entry.seq = seq;
    const live = function () { return entry.seq === seq && stack.indexOf(entry) >= 0; };
    const o = entry.opts;
    const tok = o.token || null;
    const hebrew = o.lang === 'hebrew';
    const tr = C11.state.translation;
    const code = o.dstrong || o.strong || (tok && (tok.dstrong || tok.strong)) || '';
    const strongCode = o.strong || (tok && tok.strong) || null;

    if (hebrew) {
      const found = await loadLexEntry('lexicon_hebrew_keys', 'lexicon_hebrew', [o.dstrong, o.strong]);
      if (!live()) return;
      const e = found.entry;
      const sections = [];
      setHead(entry, (e && e.lemma) || tokLemma(tok) || code, true);
      const info = dlist([
        ['Transliteration', (e && e.translit) || (tok && tok.translit)],
        ['Gloss', (e && e.gloss) || (tok && tok.gloss)],
        ["Strong's", code]
      ]);
      if (info) sections.push(info);
      if (!e) sections.push(C11.empty());
      if (e && e.tbesh_html) sections.push(section('STEPBible TBESH', lexBlock(e.tbesh_html, e.as_refs)));
      if (e && e.strongs_1890) sections.push(section("Strong's (1890)", dlist([
        ['Definition', e.strongs_1890.strongs_def],
        ['Derivation', e.strongs_1890.derivation],
        ['KJV', e.strongs_1890.kjv_def]
      ])));
      if (e && e.count !== null && e.count !== undefined) {
        sections.push(section('Counts', C11.el('p', { text: 'Hebrew (WLC) ' + e.count })));
      }
      if (e && Array.isArray(e.occurrences) && e.occurrences.length) {
        const rows = e.occurrences.map(function (occ) {
          const txt = occ[tr];
          return C11.el('div', { class: 'occ' },
            C11.el('div', {}, C11.refButton(occ.ref), occ.times > 1 ? C11.el('span', { class: 'times', text: ' ×' + occ.times }) : null),
            txt !== null && txt !== undefined ? C11.el('p', { class: 'occ-text', text: txt }) : null);
        });
        sections.push(section('Occurrences', C11.el('div', {}, rows)));
      }
      entry.bodyEl.replaceChildren(...sections);
      return;
    }

    /* Greek */
    const found = await loadLexEntry('lexicon_keys', 'lexicon', [o.dstrong, o.strong]);
    const wc = await C11.load('word_counts');
    if (!live()) return;
    const e = found.entry;
    const wcFound = findEntry(wc, [o.strong, o.dstrong, tok && tok.strong]);
    const w = wcFound ? wcFound.entry : null;
    setHead(entry, (e && e.lemma) || tokLemma(tok) || code, false);
    const sections = [];
    const info = dlist([
      ['Transliteration', (e && e.translit) || (tok && tok.translit)],
      ['Gloss', (e && e.gloss) || (tok && tok.gloss)],
      ["Strong's", code]
    ]);
    if (info) sections.push(info);
    if (!e) sections.push(C11.empty());
    if (e && e.abbott_smith_html) {
      sections.push(section(e.abbott_smith_is_AS ? 'Abbott-Smith (1922)' : 'STEPBible TBESG',
        lexBlock(e.abbott_smith_html, e.as_refs)));
    }
    if (e && e.strongs_1890) sections.push(section("Strong's (1890)", dlist([
      ['Definition', e.strongs_1890.strongs_def],
      ['Derivation', e.strongs_1890.derivation],
      ['KJV', e.strongs_1890.kjv_def]
    ])));
    const sbl = e && e.count_sbl !== undefined && e.count_sbl !== null ? e.count_sbl : (w ? w.sbl : null);
    const trc = e && e.count_tr_only !== undefined && e.count_tr_only !== null ? e.count_tr_only : (w ? w.tr_only : null);
    if ((sbl !== null && sbl !== undefined) || (trc !== null && trc !== undefined)) {
      sections.push(section('Counts', C11.el('p', {
        text: 'SBLGNT ' + (sbl === null || sbl === undefined ? '–' : sbl) + ' · TR only ' + (trc === null || trc === undefined ? '–' : trc)
      })));
    }
    const isFunction = !!(tok && tok.function_word);
    if (!isFunction && e && Array.isArray(e.occurrences) && e.occurrences.length) {
      const occs = e.occurrences;
      const texts = await Promise.all(occs.map(function (occ) {
        if (occ[tr] !== null && occ[tr] !== undefined) return Promise.resolve(occ[tr]);
        return loadTextsFor([occ.ref]).then(function (t) {
          const rec = t[occ.ref];
          return rec && rec[tr] !== null && rec[tr] !== undefined ? rec[tr] : 'No text';
        });
      }));
      if (!live()) return;
      const rows = occs.map(function (occ, i) {
        return C11.el('div', { class: 'occ' },
          C11.el('div', {}, C11.refButton(occ.ref), occ.times > 1 ? C11.el('span', { class: 'times', text: ' ×' + occ.times }) : null),
          C11.el('span', { class: 'occ-form', attrs: { lang: 'grc' }, text: occ.form || null }),
          C11.el('p', { class: 'occ-text', text: texts[i] }));
      });
      sections.push(section('Occurrences', C11.el('div', {}, rows)));
    }
    entry.bodyEl.replaceChildren(...sections);
  }

  function setHead(entry, lemma, hebrew) {
    entry.titleEl.textContent = lemma || '';
    entry.titleEl.setAttribute('lang', hebrew ? 'he' : 'grc');
    if (hebrew) entry.titleEl.setAttribute('dir', 'rtl');
    else entry.titleEl.removeAttribute('dir');
    if (lemma) entry.el.setAttribute('aria-label', lemma);
  }

  /* ---------- word tooltip and same-lemma highlight ---------- */
  let tipEl = null;
  let curWord = null;

  function createTip() {
    tipEl = C11.el('div', { class: 'tip', attrs: { role: 'tooltip', id: 'c11-tip', hidden: true } });
    document.body.appendChild(tipEl);
  }

  function enterWord(w) {
    if (curWord === w) return;
    if (curWord) leaveWord();
    curWord = w;
    const t = w.c11Token;
    if (!t) return;
    tipEl.replaceChildren();
    const dl = dlist([
      ['Lemma', tokLemma(t)],
      ['Transliteration', t.translit],
      ['Gloss', t.gloss],
      ["Strong's", t.dstrong || t.strong],
      ['Grammar', t.grammar_expanded || t.grammar]
    ]);
    if (dl) tipEl.appendChild(dl);
    tipEl.hidden = false;
    w.setAttribute('aria-describedby', 'c11-tip');
    const r = w.getBoundingClientRect();
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - tw - 8));
    let top = r.bottom + 6;
    if (top + th > window.innerHeight) top = Math.max(8, r.top - th - 6);
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
    if (t.strong) {
      const same = document.querySelectorAll('#view-passage .word[data-strong="' + CSS.escape(t.strong) + '"]');
      same.forEach(function (x) { if (x !== w) x.classList.add('same-lemma'); });
    }
  }

  function leaveWord() {
    if (curWord) curWord.removeAttribute('aria-describedby');
    curWord = null;
    if (tipEl) { tipEl.hidden = true; tipEl.replaceChildren(); }
    document.querySelectorAll('#view-passage .same-lemma').forEach(function (x) { x.classList.remove('same-lemma'); });
  }

  /* ---------- passage view ---------- */
  function textFor(v) {
    const s = v ? v[C11.state.translation] : null;
    return s === null || s === undefined ? 'No text' : s;
  }

  function mergeTokens(v) {
    const all = (v.tokens || []).map(function (t) { return { t: t, tr: false }; })
      .concat((v.tr_only_tokens || []).map(function (t) { return { t: t, tr: true }; }));
    all.sort(function (a, b) { return ((a.t.n || 0) - (b.t.n || 0)) || ((a.tr ? 1 : 0) - (b.tr ? 1 : 0)); });
    return all;
  }

  function wordButton(t, trOnly) {
    const btn = C11.el('button', {
      class: 'word' + (trOnly ? ' tr-only' : ''),
      attrs: { type: 'button', lang: 'grc', hidden: trOnly && C11.state.translation !== 'kjv' ? true : null },
      dataset: { strong: t.strong || null },
      on: { click: function () {
        C11.openWordDrawer({ strong: t.strong, dstrong: t.dstrong, lang: 'greek', token: t });
      } }
    },
      trOnly ? C11.el('span', { class: 'w-tr', text: 'TR only' }) : null,
      C11.el('span', { class: 'w-gr', text: t.greek || null }),
      C11.el('span', { class: 'w-tl', text: t.translit || null }),
      C11.el('span', { class: 'w-gl', text: t.gloss || null }),
      C11.el('span', { class: 'w-gm', text: t.grammar || null }));
    btn.c11Token = t;
    return btn;
  }

  /* Panel builders: each returns a Promise<Element> */
  function coversN(ref, n) {
    const m = /^1Co\.(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$/.exec(ref);
    if (!m) return false;
    const start = (+m[1]) * 1000 + (+m[2]);
    if (m[4] === undefined) return start === 11000 + n;
    const endC = m[3] !== undefined ? +m[3] : +m[1];
    const end = endC * 1000 + (+m[4]);
    const x = 11000 + n;
    return x >= start && x <= end;
  }

  function isSeeLine(ln) {
    const txt = ln.label || ln.refs_raw || '';
    return /^See\b/.test(txt);
  }

  function visibleLines(lines, n) {
    const shown = [];
    return lines.filter(function (ln, i) {
      const refs = ln.refs || [];
      let ok = refs.some(function (r) { return coversN(r, n); });
      if (!ok && refs.length === 0 && isSeeLine(ln) && i > 0 && shown[i - 1] && (ln.depth || 0) >= (lines[i - 1].depth || 0)) {
        ok = true;
      }
      shown[i] = ok;
      return ok;
    });
  }

  function renderLines(lines) {
    return lines.map(function (ln) {
      const refs = ln.refs || [];
      const row = C11.el('div', { class: 'topic-line' },
        ln.label ? C11.el('span', { text: ln.label }) : null,
        refs.length ? C11.el('span', { class: 'chips', attrs: { title: ln.refs_raw || null } }, refs.map(function (r) { return C11.refButton(r); })) : (ln.refs_raw ? C11.el('span', { text: ln.refs_raw }) : null));
      row.style.paddingLeft = ((ln.depth || 0) * 1.25) + 'rem';
      return row;
    });
  }

  function group(label, nodes) {
    const kids = nodes.length ? nodes : [C11.empty()];
    return C11.el('section', { class: 'group' }, C11.el('h4', { text: label }), kids);
  }

  async function buildXref(n) {
    const xr = (await C11.load('xref')) || {};
    const tsk = (xr.tsk || []).filter(function (r) { return r.verse === n; }).map(function (r) {
      return C11.el('div', { class: 'xr-row' },
        C11.el('strong', { text: r.keyword || null }),
        ' ',
        C11.el('span', { class: 'chips' }, (r.refs || []).map(function (ref) {
          return C11.refButton(ref, undefined, { title: r.refs_raw || null });
        })));
    });
    const topicNodes = function (topics) {
      return topics.filter(function (t) { return (t.linked_verses || []).indexOf(n) >= 0; }).map(function (t) {
        return C11.el('div', { class: 'topic' },
          C11.el('p', { class: 'topic-subject', text: t.subject || null }),
          t.why_included ? C11.el('p', { class: 'muted' }, C11.el('span', { class: 'rule-label', text: 'Rule' }), t.why_included) : null,
          renderLines(visibleLines(t.lines || [], n)));
      });
    };
    const user = (xr.user || []).filter(function (u) {
      const vs = [u.verse, u.verses, u.linked_verses];
      return vs.some(function (x) { return x === n || (Array.isArray(x) && x.indexOf(n) >= 0); });
    }).map(function (u) { return C11.el('div', { class: 'topic' }, genericNodes(u)); });
    const cited = ((xr.cited || {})[String(n)] || []).map(function (c) {
      const meta = [c.author, c.work, c.cited_by].filter(function (x) { return x !== null && x !== undefined && x !== ''; }).join(' · ');
      return C11.el('div', { class: 'cite-row' },
        C11.refButton(c.ref, c.raw, { end: c.ref_end || null }),
        meta ? C11.el('span', { class: 'muted cite-meta', text: meta }) : null);
    });
    return C11.el('div', {},
      group('Treasury of Scripture Knowledge', tsk),
      group("Nave's Topical Bible", topicNodes(xr.naves || [])),
      group("Torrey's Topical Textbook", topicNodes(xr.torrey || [])),
      group('Added by the study author', user),
      group('Cited by commentators', cited));
  }

  /* Generic rendering of an author-supplied record: strings verbatim, ref/refs as ref buttons. */
  function genericNodes(val, key) {
    if (val === null || val === undefined || typeof val === 'number' || typeof val === 'boolean') return [];
    if (typeof val === 'string') {
      if (key === 'ref' || key === 'refs') return [C11.refButton(val)];
      if (key === 'ref_end') return [];
      return [C11.el('p', { class: 'raw-text', text: val })];
    }
    if (Array.isArray(val)) {
      let out = [];
      val.forEach(function (x) { out = out.concat(genericNodes(x, key)); });
      return out;
    }
    let out = [];
    Object.keys(val).forEach(function (k) { out = out.concat(genericNodes(val[k], k)); });
    return out;
  }

  async function buildCommentary(n) {
    const rows = ((await C11.load('commentary')) || []).filter(function (r) {
      return Array.isArray(r.verses) && r.verses.indexOf(n) >= 0;
    });
    if (!rows.length || typeof C11.renderCommentaryList !== 'function') return C11.empty();
    return C11.renderCommentaryList(rows);
  }

  async function buildWords(v) {
    const tr = C11.state.translation;
    const items = mergeTokens(v).filter(function (x) { return !x.tr || tr === 'kjv'; });
    if (!items.length) return C11.empty();
    return C11.el('div', {}, items.map(function (x) {
      const t = x.t;
      return C11.el('div', { class: 'word-entry' },
        wordButton(t, x.tr),
        dlist([
          ['Lemma', t.lemma || null],
          ['Gloss', t.gloss || null],
          ["Strong's", t.dstrong || t.strong || null]
        ]));
    }));
  }

  const PANELS = [
    ['xref', 'Cross-references', buildXref],
    ['comm', 'Commentary', buildCommentary],
    ['words', 'Words', function (n) { return buildWords(C11.passageByN[n]); }]
  ];

  function buildVerse(v) {
    const n = v.verse;
    const ctx = !v.in_scope;
    const en = C11.el('p', { class: 'en', attrs: { lang: 'en' }, text: textFor(v) });
    const tokens = mergeTokens(v);
    const card = C11.el('article', {
      class: 'verse' + (ctx ? ' context' : ''),
      attrs: { id: 'v' + n },
      dataset: { verse: n }
    },
      C11.el('h2', { class: 'verse-head' },
        C11.el('a', { text: 'Verse ' + n, attrs: { href: '#v' + n } }),
        ctx ? C11.el('span', { class: 'tag', text: 'Context' }) : null),
      en,
      C11.el('div', { class: 'interlinear' }, tokens.map(function (x) { return wordButton(x.t, x.tr); })));
    if (ctx) return card;

    const state = { active: null, cache: {}, seq: 0 };
    const tabBtns = PANELS.map(function (p) {
      return C11.el('button', {
        class: 'ptab',
        text: p[1],
        attrs: { type: 'button', role: 'tab', id: 'tab-' + n + '-' + p[0], 'aria-selected': 'false', tabindex: '-1' },
        dataset: { key: p[0] },
        on: { click: function () { activate(p[0]); } }
      });
    });
    const panel = C11.el('div', { class: 'panel', attrs: { role: 'tabpanel', id: 'panel-' + n } });
    const tablist = C11.el('div', { class: 'ptabs', attrs: { role: 'tablist' }, on: { keydown: function (e) {
      const idx = tabBtns.indexOf(document.activeElement);
      if (idx < 0) return;
      let next = null;
      if (e.key === 'ArrowRight') next = (idx + 1) % tabBtns.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + tabBtns.length) % tabBtns.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabBtns.length - 1;
      if (next === null) return;
      e.preventDefault();
      tabBtns[next].focus();
      activate(tabBtns[next].dataset.key);
    } } }, tabBtns);

    function activate(key) {
      state.active = key;
      tabBtns.forEach(function (b) {
        const on = b.dataset.key === key;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', 'tab-' + n + '-' + key);
      const seq = ++state.seq;
      const builder = PANELS.filter(function (p) { return p[0] === key; })[0][2];
      const p = state.cache[key] ? Promise.resolve(state.cache[key]) : Promise.resolve(builder(n)).then(function (el) {
        state.cache[key] = el;
        return el;
      });
      p.then(function (el) {
        if (state.seq === seq) panel.replaceChildren(el);
      });
    }

    card.appendChild(tablist);
    card.appendChild(panel);
    card.panelReset = function (key) {
      delete state.cache[key];
      if (state.active === key) activate(key);
    };
    activate('xref');
    return card;
  }

  async function renderPassage(sec) {
    await C11.ready;
    if (!C11.passage.length) { sec.appendChild(C11.empty()); return; }
    C11.passage.forEach(function (v) { sec.appendChild(buildVerse(v)); });
    sec.addEventListener('mouseover', function (e) {
      const w = e.target.closest ? e.target.closest('.word') : null;
      if (w && sec.contains(w)) enterWord(w);
    });
    sec.addEventListener('mouseout', function (e) {
      const w = e.target.closest ? e.target.closest('.word') : null;
      if (w && w === curWord && !w.contains(e.relatedTarget)) leaveWord();
    });
    sec.addEventListener('focusin', function (e) {
      const w = e.target.closest ? e.target.closest('.word') : null;
      if (w && sec.contains(w)) enterWord(w);
    });
    sec.addEventListener('focusout', function (e) {
      if (curWord && !curWord.contains(e.relatedTarget)) leaveWord();
    });
  }

  C11.onTranslation(function (tr) {
    document.querySelectorAll('#view-passage .verse').forEach(function (card) {
      const v = C11.passageByN[+card.dataset.verse];
      const en = card.querySelector('.en');
      if (en && v) en.textContent = textFor(v);
      card.querySelectorAll('.interlinear .word.tr-only').forEach(function (b) { b.hidden = tr !== 'kjv'; });
      if (card.panelReset) card.panelReset('words');
    });
    if (drawerEntry && stack.indexOf(drawerEntry) >= 0) renderDrawer(drawerEntry);
  });

  /* ---------- views and routing ---------- */
  const views = Object.create(null);

  C11.registerView = function (name, def) {
    if (!def || typeof def.render !== 'function') return;
    views[name] = { def: def, rendered: false, promise: null };
  };

  views.passage = { def: { label: 'Passage', render: renderPassage }, rendered: false, promise: null };

  function showView(name) {
    if (!views[name]) name = 'passage';
    document.querySelectorAll('main > section').forEach(function (s) {
      s.hidden = s.id !== 'view-' + name;
    });
    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const v = views[name];
    const sec = document.getElementById('view-' + name);
    if (!v.rendered) {
      v.rendered = true;
      v.promise = Promise.resolve().then(function () { return v.def.render(sec); }).catch(function (err) {
        console.error(err);
      });
    }
    return v.promise;
  }

  /* Internal: highlight verses in the passage view (called by route()). */
  function highlightNow(vs) {
    return showView('passage').then(function () {
      document.querySelectorAll('#view-passage .verse.hl').forEach(function (c) { c.classList.remove('hl'); });
      let first = null;
      (vs || []).forEach(function (n) {
        const c = document.getElementById('v' + Number(n));
        if (c && c.classList.contains('verse')) {
          c.classList.add('hl');
          if (!first) first = c;
        }
      });
      if (first) first.scrollIntoView({ block: 'start' });
    });
  }

  /* Public: sets the hash; route() performs the highlight. Same hash -> no hashchange, so highlight directly. */
  C11.highlightVerses = function (vs) {
    const list = (vs || []).map(Number).filter(function (n) { return isFinite(n); });
    if (!list.length) return showView('passage');
    const a = Math.min.apply(null, list), b = Math.max.apply(null, list);
    const h = a === b ? '#v' + a : '#v' + a + '-' + b;
    if (location.hash === h) return highlightNow(list);
    location.hash = h;
    return Promise.resolve();
  };

  function findPassageToken(code) {
    for (let i = 0; i < C11.passage.length; i++) {
      const toks = (C11.passage[i].tokens || []).concat(C11.passage[i].tr_only_tokens || []);
      for (let j = 0; j < toks.length; j++) {
        if (toks[j].strong === code || toks[j].dstrong === code) return toks[j];
      }
    }
    return null;
  }

  async function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    let m;
    if ((m = /^v(\d+)(?:-(\d+))?$/.exec(h))) {
      const a = +m[1], b = m[2] !== undefined ? +m[2] : a;
      const list = [];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) list.push(i);
      await highlightNow(list);
      return;
    }
    if ((m = /^w=([GH]\d+)$/i.exec(h))) {
      const code = m[1].toUpperCase();
      await showView('passage');
      await C11.ready;
      const tok = findPassageToken(code);
      C11.openWordDrawer({
        strong: code,
        dstrong: code,
        lang: code.charAt(0) === 'H' ? 'hebrew' : 'greek',
        token: tok
      });
      return;
    }
    await showView(h === '' || !views[h] ? 'passage' : h);
  }

  /* ---------- theme ---------- */
  const THEMES = ['system', 'light', 'dark'];
  const themeBtn = document.getElementById('theme-toggle');

  function currentTheme() {
    try {
      const t = localStorage.getItem('c11-theme');
      return THEMES.indexOf(t) >= 0 ? t : 'system';
    } catch (e) { return 'system'; }
  }

  function applyTheme(t) {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    themeBtn.textContent = t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'Theme';
  }

  function setupTheme() {
    applyTheme(currentTheme());
    themeBtn.addEventListener('click', function () {
      const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
      try { localStorage.setItem('c11-theme', next); } catch (e) { /* ignore */ }
      applyTheme(next);
    });
  }

  /* ---------- translation buttons ---------- */
  function syncTrButtons() {
    document.querySelectorAll('[data-tr]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.tr === trValue ? 'true' : 'false');
    });
  }

  function setupTrButtons() {
    document.querySelectorAll('[data-tr]').forEach(function (b) {
      b.addEventListener('click', function () { C11.state.translation = b.dataset.tr; });
    });
    syncTrButtons();
  }

  /* ---------- global overlay behaviour ---------- */
  function setupOverlays() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !stack.length) return;
      e.preventDefault();
      closeEntry(stack[stack.length - 1], true);
    });
    document.addEventListener('pointerdown', function (e) {
      stack.filter(function (x) { return x.kind === 'popover'; }).forEach(function (p) {
        if (!p.el.contains(e.target)) closeEntry(p, false);
      });
    });
  }

  /* ---------- init ---------- */
  function syncHeaderHeight() {
    const h = document.querySelector('.site-header');
    if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  }

  function init() {
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    setupTheme();
    setupTrButtons();
    createTip();
    setupOverlays();
    C11.ready.then(function () {
      if (C11.meta.fixtures === true) {
        const b = document.getElementById('fixtures-banner');
        if (b) b.hidden = false;
      }
    });
    window.addEventListener('hashchange', route);
    route();
  }

  /* Deferred scripts run before DOMContentLoaded, so views.js has registered by then. */
  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
