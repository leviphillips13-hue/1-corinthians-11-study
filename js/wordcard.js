/* Word card overlay (#/word/<key>[/<tokenId>]): right drawer on wide screens, bottom sheet on phones.
   Registers nothing; opened with C11.openWord(key, tokenId?). All source text goes in as text nodes. */
import { C11 } from './core.js';
import { lexBlock } from './lexhtml.js';

const el = C11.el;
const INERT = ['site-header', 'main', 'bottom-nav', 'fixtures-banner'];
let card = null; // { root, scrim, body, key, tokenId, returnTo, seq }

function padCode(c) { const m = /^([GH])(\d+)$/i.exec(c); return m ? m[1].toUpperCase() + ('0000' + m[2]).slice(-4) : c; }
function unpadCode(c) { const m = /^([GH])0*(\d+)$/i.exec(c); return m ? m[1].toUpperCase() + m[2] : c; }
function candidates(key) { return [key, unpadCode(key), padCode(key)].filter((v, i, a) => a.indexOf(v) === i); }

function findToken(id, key) {
  const rows = C11.data.passage;
  for (const v of rows) {
    for (const t of (v.tokens || []).concat(v.tr_only_tokens || [])) {
      if (id ? t.id === id : (t.strong === key || t.dstrong === key)) return t;
    }
  }
  return null;
}

async function loadEntry(hebrew, key) {
  const keys = (await C11.load(hebrew ? 'lexicon_hebrew_keys' : 'lexicon_keys')) || [];
  const hit = candidates(key).find((k) => keys.indexOf(k) >= 0);
  if (!hit) return null;
  const data = await C11.load((hebrew ? 'lexicon_hebrew/' : 'lexicon/') + hit);
  if (!data) return null;
  return data[hit] && typeof data[hit] === 'object' && !('lemma' in data) ? data[hit] : data;
}

/* Hebrew occurrences are compact arrays [ref, times] or [ref, times, bsb, kjv]; text of 2-element ones comes from C11.textFor. */
function normOcc(o) {
  return Array.isArray(o) ? { ref: o[0], times: o[1], bsb: o[2], kjv: o[3] } : o;
}

function num(v) { return v === null || v === undefined || v === '' ? null : Number(v); }

/* ---------- pieces ---------- */
function dl(rows) {
  const kids = [];
  rows.forEach((r) => {
    if (r[1] === null || r[1] === undefined || r[1] === '') return;
    kids.push(el('dt', { text: r[0] }), el('dd', { text: String(r[1]) }));
  });
  return kids.length ? el('dl', { class: 'wc-dl' }, kids) : null;
}

function acc(title, body, open, countText) {
  const d = el('details', { class: 'acc wc-acc' },
    el('summary', {}, el('span', { class: 'acc-title', text: title }), countText ? el('span', { class: 'count', text: countText }) : null),
    el('div', { class: 'acc-body' }, body));
  if (open) d.open = true;
  return d;
}

function clampedEntry(html, asRefs) {
  const block = lexBlock(html, asRefs, { clamp: true });
  const text = block.querySelector('.lex-html');
  const btn = el('button', { class: 'btn-link wc-more', text: 'Show full entry', attrs: { type: 'button', 'aria-expanded': 'false' }, hidden: true });
  btn.addEventListener('click', () => {
    const open = text.classList.toggle('is-clamped') === false;
    btn.textContent = open ? 'Show less' : 'Show full entry';
    btn.setAttribute('aria-expanded', String(open));
  });
  requestAnimationFrame(() => requestAnimationFrame(() => { if (text.scrollHeight > text.clientHeight + 2) btn.hidden = false; else text.classList.remove('is-clamped'); }));
  return el('div', {}, block, btn);
}

function strongsBlock(s) {
  if (!s) return null;
  return dl([['Definition', s.strongs_def], ['Derivation', s.derivation], ['KJV', s.kjv_def]]);
}

async function occurrenceText(occ) {
  const tr = C11.state.translation;
  if (C11.components.refText) {
    try { const n = await C11.components.refText(occ.ref); if (n) return n; } catch (e) { /* fall back */ }
  }
  let txt = occ[tr];
  if (txt === null || txt === undefined) {
    const t = await C11.textFor(occ.ref);
    txt = t ? t[tr] : null;
  }
  return el('p', { class: 'occ-text', text: txt === null || txt === undefined ? 'No text saved for this reference.' : txt });
}

function occurrenceRow(occ, hebrew) {
  const out = el('div', { class: 'occ-out', hidden: true });
  const btn = el('button', { class: 'btn-link occ-ref', text: C11.fmtRef(occ.ref), attrs: { type: 'button', 'aria-expanded': 'false' } });
  let loaded = false;
  btn.addEventListener('click', async () => {
    const open = out.hidden;
    out.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && !loaded) {
      loaded = true;
      out.replaceChildren(el('p', { class: 'meta', text: 'Loading…' }));
      out.replaceChildren(await occurrenceText(occ));
    }
  });
  return el('li', { class: 'occ' },
    el('div', { class: 'occ-line' }, btn,
      !hebrew && occ.form ? el('span', { class: 'occ-form greek', text: occ.form, attrs: { lang: 'grc' } }) : null,
      occ.times > 1 ? el('span', { class: 'meta', text: '×' + occ.times }) : null),
    out);
}

function occurrencesByBook(occs, hebrew) {
  const order = [];
  const groups = {};
  occs.forEach((o) => {
    const b = String(o.ref).split('.')[0];
    if (!groups[b]) { groups[b] = []; order.push(b); }
    groups[b].push(o);
  });
  const wrap = el('div', { class: 'occ-books' });
  order.forEach((b) => {
    const list = groups[b];
    const total = list.reduce((s, o) => s + (o.times || 1), 0);
    const body = el('div', { class: 'acc-body' });
    const d = el('details', { class: 'acc acc-nested' },
      el('summary', {}, el('span', { class: 'acc-title', text: (C11.data.books[b] || b) }), el('span', { class: 'count', text: String(total) })),
      body);
    let built = false;
    d.addEventListener('toggle', () => {
      if (d.open && !built) { built = true; body.appendChild(el('ul', { class: 'occ-list' }, list.map((o) => occurrenceRow(o, hebrew)))); }
    });
    wrap.appendChild(d);
  });
  return wrap;
}

/* ---------- card content ---------- */
async function fill(c) {
  const seq = ++c.seq;
  const live = () => card === c && c.seq === seq;
  const key = c.key;
  const hebrew = /^H/i.test(key);
  const tok = findToken(c.tokenId, key);
  const entry = await loadEntry(hebrew, key);
  const wcAll = hebrew ? null : (await C11.load('word_counts')) || {};
  if (!live()) return;
  const wc = wcAll ? (candidates(key).map((k) => wcAll[k]).find(Boolean) || null) : null;
  const lemma = (entry && entry.lemma) || (tok && (tok.lemma || tok.greek)) || key;
  const translit = (entry && entry.translit) || (tok && tok.translit) || null;
  const gloss = (entry && entry.gloss) || (tok && tok.gloss) || null;
  const nodes = [];

  c.title.textContent = lemma;
  c.title.setAttribute('lang', hebrew ? 'he' : 'grc');
  if (hebrew) c.title.setAttribute('dir', 'rtl'); else c.title.removeAttribute('dir');
  c.title.className = 'wc-lemma ' + (hebrew ? 'hebrew' : 'greek');

  nodes.push(el('div', { class: 'wc-sub' },
    translit ? el('span', { class: 'wc-translit', text: translit }) : null,
    gloss ? el('span', { class: 'wc-gloss', text: gloss }) : null,
    el('span', { class: 'tag tag-label', text: "Strong's " + key })));

  if (tok && c.tokenId) {
    nodes.push(el('div', { class: 'wc-form' },
      el('div', { class: 'meta', text: '1 Corinthians 11:' + tok.verse + ' · form in this verse' }),
      el('div', { class: 'wc-form-main' }, el('span', { class: 'greek wc-form-word', text: tok.greek, attrs: { lang: 'grc' } }),
        tok.grammar ? el('span', { class: 'tag', text: tok.grammar }) : null),
      tok.grammar_expanded ? el('div', { class: 'wc-parse', text: tok.grammar_expanded }) : null));
  }

  const sblN = entry ? num(entry.count_sbl) : null;
  const trN = entry ? num(entry.count_tr_only) : null;
  const sbl = sblN !== null ? sblN : (wc ? wc.sbl : null);
  const tro = trN !== null ? trN : (wc ? wc.tr_only : null);
  const countLabel = hebrew
    ? 'Occurrences — Hebrew (WLC)' + (entry && num(entry.count) !== null ? ' ' + entry.count : '')
    : 'Occurrences — SBLGNT ' + (sbl === null ? '–' : sbl) + ' · TR-only ' + (tro === null ? '–' : tro);

  if (!entry) {
    nodes.push(el('p', { class: 'empty', text: 'No lexicon entry is saved for this word.' }));
  } else if (hebrew) {
    if (entry.tbesh_html) {
      nodes.push(acc('STEPBible TBESH', clampedEntry(entry.tbesh_html, entry.as_refs), true));
    }
    if (Array.isArray(entry.tbesh_subentries) && entry.tbesh_subentries.length) {
      const subs = entry.tbesh_subentries.map((s) => {
        const d = el('details', { class: 'acc acc-nested' },
          el('summary', {}, el('span', { class: 'acc-title' }, el('span', { class: 'tag', text: s.key }), ' ', s.gloss || '')),
          el('div', { class: 'acc-body' }, s.definition_html ? lexBlock(s.definition_html, entry.as_refs) : el('p', { class: 'empty', text: 'No text.' })));
        return d;
      });
      nodes.push(acc('TBESH sub-entries', el('div', {}, subs), false, String(subs.length)));
    }
  } else if (entry.abbott_smith_html) {
    nodes.push(acc(entry.abbott_smith_is_AS === false ? 'STEPBible TBESG' : 'Abbott-Smith (1922)', clampedEntry(entry.abbott_smith_html, entry.as_refs), true));
  }
  if (entry && entry.strongs_1890) {
    const b = strongsBlock(entry.strongs_1890);
    if (b) nodes.push(acc("Strong's (1890)", b, false));
  }

  const isFunction = !!(tok && tok.function_word);
  const occs = entry && Array.isArray(entry.occurrences) ? entry.occurrences.map(normOcc) : [];
  if (!isFunction && occs.length) {
    nodes.push(acc(countLabel, occurrencesByBook(occs, hebrew), false));
  } else if (!hebrew && (sbl !== null || tro !== null)) {
    nodes.push(el('p', { class: 'wc-counts' }, countLabel));
  } else if (hebrew && entry && num(entry.count) !== null) {
    nodes.push(el('p', { class: 'wc-counts' }, countLabel));
  }
  c.body.replaceChildren(...nodes);
}

/* ---------- open / close ---------- */
function setInert(on) {
  INERT.forEach((id) => {
    const n = document.getElementById(id);
    if (!n) return;
    if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
  });
  document.documentElement.classList.toggle('wc-open', on);
}

function build() {
  const title = el('h2', { class: 'wc-lemma greek', attrs: { id: 'wc-title', tabindex: '-1' } });
  const closeBtn = el('button', { class: 'icon-btn wc-close', attrs: { type: 'button', 'aria-label': 'Close word card' }, on: { click: () => C11.closeWord() } }, C11.icon('close'));
  const body = el('div', { class: 'wc-body' });
  const handle = el('div', { class: 'wc-handle', attrs: { 'aria-hidden': 'true' } }, el('span'));
  const head = el('div', { class: 'wc-head' }, handle, el('div', { class: 'wc-head-row' }, title, closeBtn));
  const root = el('aside', { class: 'wc', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wc-title' } }, head, body);
  const scrim = el('div', { class: 'wc-scrim', on: { click: () => C11.closeWord() } });

  /* swipe down to close (phone sheet) */
  let y0 = null;
  let dy = 0;
  head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; dy = 0; root.style.transition = 'none'; }, { passive: true });
  head.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    root.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });
  const end = () => {
    if (y0 === null) return;
    root.style.transition = '';
    root.style.transform = '';
    const close = dy > 90;
    y0 = null; dy = 0;
    if (close) C11.closeWord();
  };
  head.addEventListener('touchend', end);
  head.addEventListener('touchcancel', end);
  return { root, scrim, body, title, closeBtn, key: null, tokenId: null, returnTo: null, seq: 0 };
}

function open(params) {
  const key = params.key;
  if (card && card.key === key && card.tokenId === params.token) return;
  if (card) {
    card.key = key; card.tokenId = params.token;
    fill(card);
    card.root.scrollTop = 0; card.body.scrollTop = 0;
    return;
  }
  card = build();
  card.key = key;
  card.tokenId = params.token;
  card.returnTo = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  card.title.textContent = key;
  const host = document.getElementById('overlay-root');
  host.append(card.scrim, card.root);
  setInert(true);
  requestAnimationFrame(() => { if (card) { card.root.classList.add('is-open'); card.scrim.classList.add('is-open'); } });
  card.closeBtn.focus({ preventScroll: true });
  fill(card);
}

function close() {
  if (!card) return;
  const c = card;
  card = null;
  setInert(false);
  c.root.classList.remove('is-open');
  c.scrim.classList.remove('is-open');
  const done = () => { c.root.remove(); c.scrim.remove(); };
  setTimeout(done, 180);
  const back = c.returnTo;
  if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
  else {
    const m = document.getElementById('main');
    if (m) m.focus({ preventScroll: true });
  }
}

C11.on('route', (r) => { if (r.name === 'word') open(r.params); else close(); });
C11.on('translation', () => { if (card) fill(card); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && card && !e.defaultPrevented) { e.preventDefault(); C11.closeWord(); }
});
