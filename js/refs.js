/* refs.js (UX-h2): reference chips that expand verse text inline. No innerHTML; all text via C11.el. */
import { C11 } from './core.js';

const el = C11.el;
const CAP = 30;

function parseOne(s) {
  const m = /^([^.]+)\.(\d+)\.(\d+)$/.exec(s || '');
  return m ? { book: m[1], c: +m[2], v: +m[3] } : null;
}
function parseRange(s) {
  const m = /^([^.]+)\.(\d+)\.(\d+)-(?:(\d+)\.)?(\d+)$/.exec(s || '');
  if (!m) return null;
  return { book: m[1], c: +m[2], v: +m[3], c2: m[4] !== undefined ? +m[4] : +m[2], v2: +m[5] };
}
export function isChapterRef(ref) {
  return /^[^.]+\.\d+$/.test(ref || '');
}

/* ref (+ optional end) -> verse keys "Book.C.V" (cap 30). Cross-chapter spans use the book's texts file. */
function expandRef(ref, end) {
  let s = parseRange(ref);
  if (!s) {
    const one = parseOne(ref);
    if (!one) return [];
    s = { book: one.book, c: one.c, v: one.v, c2: one.c, v2: one.v };
  }
  if (end) {
    const e = parseOne(end);
    if (!e || e.book !== s.book) return [];
    s.c2 = e.c; s.v2 = e.v;
  }
  const out = [];
  if (s.c2 === s.c) {
    for (let i = s.v; i <= s.v2 && out.length < CAP; i++) out.push(`${s.book}.${s.c}.${i}`);
    return out.length ? out : [`${s.book}.${s.c}.${s.v}`];
  }
  // cross-chapter span: the two endpoint verses only (texts are loaded per verse via C11.textFor)
  return [`${s.book}.${s.c}.${s.v}`, `${s.book}.${s.c2}.${s.v2}`];
}

function passageVerse(key) {
  const m = /^1Co\.11\.(\d+)$/.exec(key);
  return m ? +m[1] : null;
}

const ABBR = { Gen: 'Gen', Exo: 'Exod', Lev: 'Lev', Num: 'Num', Deu: 'Deut', Jos: 'Josh', Jdg: 'Judg', Rut: 'Ruth', '1Sa': '1 Sam', '2Sa': '2 Sam', '1Ki': '1 Kgs', '2Ki': '2 Kgs', '1Ch': '1 Chr', '2Ch': '2 Chr', Ezr: 'Ezra', Neh: 'Neh', Est: 'Esth', Job: 'Job', Psa: 'Ps', Pro: 'Prov', Ecc: 'Eccl', Sng: 'Song', Isa: 'Isa', Jer: 'Jer', Lam: 'Lam', Ezk: 'Ezek', Dan: 'Dan', Hos: 'Hos', Jol: 'Joel', Amo: 'Amos', Oba: 'Obad', Jon: 'Jonah', Mic: 'Mic', Nam: 'Nah', Hab: 'Hab', Zep: 'Zeph', Hag: 'Hag', Zec: 'Zech', Mal: 'Mal', Mat: 'Matt', Mrk: 'Mark', Luk: 'Luke', Jhn: 'John', Act: 'Acts', Rom: 'Rom', '1Co': '1 Cor', '2Co': '2 Cor', Gal: 'Gal', Eph: 'Eph', Php: 'Phil', Col: 'Col', '1Th': '1 Thess', '2Th': '2 Thess', '1Ti': '1 Tim', '2Ti': '2 Tim', Tit: 'Titus', Phm: 'Phlm', Heb: 'Heb', Jas: 'Jas', '1Pe': '1 Pet', '2Pe': '2 Pet', '1Jn': '1 John', '2Jn': '2 John', '3Jn': '3 John', Jud: 'Jude', Rev: 'Rev' };
function shortRef(ref, end) {
  const full = C11.fmtRef(ref, end);
  const code = String(ref).split('.')[0];
  const name = (C11.data.books || {})[code];
  if (ABBR[code] && name && typeof full === 'string' && full.startsWith(name)) return ABBR[code] + full.slice(name.length);
  return full;
}

function normRef(r) {
  if (typeof r === 'string') return { ref: r, ref_end: null, raw: null };
  return { ref: r.ref, ref_end: r.ref_end || null, raw: r.raw || null };
}

async function verseString(key, tr) {
  let s = null;
  try { const t = await C11.textFor(key); s = t ? t[tr] : null; } catch (e) { s = null; }
  if (s === null || s === undefined) {
    const n = passageVerse(key);
    if (n && n >= 2 && n <= 17) { try { s = C11.verseText(n); } catch (e) { s = null; } }
  }
  return s === null || s === undefined ? null : s;
}

/* Fill `box` with the inline text for a ref. */
async function fill(box, r) {
  const tr = C11.state.translation;
  const keys = expandRef(r.ref, r.ref_end);
  const rec = keys.length === 1 && !r.ref_end && C11.originalFor ? await C11.originalFor(keys[0]).catch(() => null) : null;
  const strings = await Promise.all(keys.map((k) => verseString(k, tr)));

  const multi = keys.length > 1;
  const label = C11.fmtRef(r.ref, r.ref_end);
  const kids = [el('div', { class: 'ref-text-label meta' }, label, ' · ', tr.toUpperCase())];
  keys.forEach((k, i) => {
    const vn = k.split('.')[2];
    kids.push(el('p', { class: 'ref-text-verse' },
      multi ? el('span', { class: 'ref-vn' }, vn) : null,
      multi ? ' ' : null,
      strings[i] === null ? el('span', { class: 'ref-notext' }, 'No text for this verse in the saved data.') : strings[i]));
  });
  if (rec && Array.isArray(rec.tokens) && rec.tokens.length) {
    const heb = rec.lang === 'hebrew';
    kids.push(el('div', {
      class: 'ref-words' + (heb ? ' hebrew' : ' greek'),
      dir: heb ? 'rtl' : null,
      lang: heb ? 'he' : 'grc',
      attrs: { 'aria-label': heb ? 'Hebrew text: select a word for its lexicon entry' : 'Greek text' }
    }, rec.tokens.map((t) => (t.strong ? el('button', {
      class: 'ref-word',
      attrs: { type: 'button', title: t.gloss || null },
      on: { click: () => C11.openWord(t.strong, t.n != null ? String(t.n) : undefined) }
    }, t.word || '') : el('span', { class: 'ref-word is-plain' }, t.word || '')))));
  }
  // links into the study view for refs inside 1 Cor 11:3-16
  const studied = keys.map(passageVerse).filter((n) => n && n >= 3 && n <= 16);
  if (studied.length) {
    const first = studied[0];
    const lastN = studied[studied.length - 1];
    kids.push(el('div', { class: 'ref-study' }, el('a', {
      attrs: { href: `#/verse/${first}` }
    }, first === lastN ? `Study verse ${first}` : `Study verse ${first}–${lastN}`)));
  }
  box.replaceChildren(...kids);
}

function textBlock(r) {
  const box = el('div', { class: 'ref-text', attrs: { role: 'group', 'aria-label': C11.fmtRef(r.ref, r.ref_end) } });
  box.appendChild(el('span', { class: 'meta' }, 'Loading…'));
  const ready = fill(box, r).catch((e) => { console.error(e); box.replaceChildren(el('p', { class: 'empty' }, 'Text unavailable.')); });
  const off = C11.on('translation', () => {
    if (!box.isConnected) { off(); return; }
    fill(box, r).catch(console.error);
  });
  box.__ready = ready;
  return box;
}

export function refText(ref, end) {
  const r = normRef(typeof ref === 'object' && ref ? ref : { ref, ref_end: end });
  const box = textBlock(r);
  return box.__ready.then(() => box);
}

export function refChips(refs, opts = {}) {
  const list = (refs || []).filter((x) => x && (typeof x === 'string' || x.ref)).map(normRef);
  const row = el('div', { class: 'chips' });
  const out = el('div', { class: 'ref-group' }, row);
  const area = el('div', { class: 'ref-texts' });
  const btns = [];
  const blocks = new Map();
  let open = new Set();
  let allBtn = null;

  const sync = () => {
    const keep = [];
    [...open].sort((a, b) => a - b).forEach((i) => {
      if (!blocks.has(i)) blocks.set(i, textBlock(list[i]));
      keep.push(blocks.get(i));
    });
    area.replaceChildren(...keep);
    btns.forEach((b, i) => { if (b) b.setAttribute('aria-expanded', open.has(i) ? 'true' : 'false'); });
    if (allBtn) allBtn.textContent = open.size >= btns.filter(Boolean).length && open.size ? 'Collapse all texts' : 'Expand all texts';
  };

  list.forEach((r, i) => {
    const fullLabel = C11.fmtRef(r.ref, r.ref_end);
    const label = isChapterRef(r.ref) ? shortRef(r.ref, r.ref_end) + ' (chapter)' : shortRef(r.ref, r.ref_end);
    if (isChapterRef(r.ref)) {
      btns.push(null);
      row.appendChild(el('span', { class: 'chip chip-static' }, label));
      return;
    }
    const b = el('button', {
      class: 'chip ref-chip',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-label': fullLabel, title: fullLabel },
      on: {
        click: () => {
          if (open.has(i)) open.delete(i); else open = new Set([i]);
          sync();
        }
      }
    }, label);
    btns.push(b);
    row.appendChild(b);
  });

  if (opts.expandAll && btns.filter(Boolean).length > 1) {
    allBtn = el('button', {
      class: 'btn-link ref-all',
      attrs: { type: 'button' },
      on: {
        click: () => {
          const idx = btns.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
          open = open.size >= idx.length ? new Set() : new Set(idx);
          sync();
        }
      }
    }, 'Expand all texts');
    if (opts.externalExpand) out.__expandBtn = allBtn; else out.insertBefore(allBtn, row);
  }
  out.appendChild(area);
  return out;
}

C11.components.refChips = refChips;
C11.components.refText = refText;
