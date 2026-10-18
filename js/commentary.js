/* commentary.js (UX-h2): Commentary tab, commentary cards, further reading list. */
import { C11 } from './core.js';
import { refChips } from './refs.js';

const el = C11.el;
const ELLICOTT_AUTHOR = 'Charles John Ellicott';
const ELLICOTT_DISPLAY = "Ellicott's Commentary for English Readers (ed. C. J. Ellicott)";

let ellicottEdited = false; // set when the saved Ellicott rows carry series_editor: then no rename
export function displayAuthor(name) {
  return name === ELLICOTT_AUTHOR && !ellicottEdited ? ELLICOTT_DISPLAY : (name || '');
}

/* last 4-digit year inside parentheses/brackets in `edition`, else the last 4-digit year anywhere (gap 13) */
export function editionYear(row) {
  const ed = typeof row.edition === 'string' ? row.edition : '';
  const years = (s) => (s.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) || []);
  const groups = ed.match(/[([][^)\]]*[)\]]/g) || [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const y = years(groups[i]);
    if (y.length) return y[y.length - 1];
  }
  const y = years(ed);
  if (y.length) return y[y.length - 1];
  return row.edition_year ? String(row.edition_year) : (row.year ? String(row.year) : null);
}

function verseSpan(verses) {
  const v = (verses || []).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const parts = [];
  let s = v[0], p = v[0];
  for (let i = 1; i <= v.length; i++) {
    if (v[i] === p + 1) { p = v[i]; continue; }
    parts.push(s === p ? String(s) : `${s}–${p}`);
    s = p = v[i];
  }
  return (v.length > 1 ? 'Verses ' : 'Verse ') + parts.join(', ');
}

function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
function sourceLink(url) {
  return isHttp(url)
    ? el('a', { class: 'ext', attrs: { href: url, target: '_blank', rel: 'noopener' } }, 'Source ↗')
    : null;
}

function tagsFor(row, opts) {
  const tags = [];
  if (opts.showVerses) { const t = verseSpan(row.verses); if (t) tags.push(el('span', { class: 'tag tag-context' }, t)); }
  if (row.copyright_status === 'public_domain') tags.push(el('span', { class: 'tag tag-pd' }, 'Public domain'));
  else if (row.copyright_status === 'copyrighted_excerpt') tags.push(el('span', { class: 'tag tag-excerpt' }, 'Excerpt ©'));
  if (row.trimmed === true) tags.push(el('span', { class: 'tag tag-trim' }, 'Trimmed'));
  return tags;
}

export function commentaryCard(row, opts = {}) {
  const year = editionYear(row);
  const quote = C11.tidy(typeof row.quote === 'string' ? row.quote : '');
  const paras = quote.split(/\n\s*\n/).filter((p) => p.trim() !== '');
  const long = quote.length > 300 || paras.length > 1;

  const qBox = el('div', { class: 'cc-quote' + (long ? ' is-clamped' : ''), lang: 'en' },
    paras.map((p) => el('p', {}, p)));
  const quoteId = 'q-' + String(row.id).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + Math.random().toString(36).slice(2, 7);
  qBox.id = quoteId;
  let toggle = null;
  if (long) {
    toggle = el('button', {
      class: 'btn cc-toggle',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': quoteId },
      on: {
        click: () => {
          const open = toggle.getAttribute('aria-expanded') !== 'true';
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          toggle.textContent = open ? 'Show less' : 'Read full excerpt';
          qBox.classList.toggle('is-clamped', !open);
        }
      }
    }, 'Read full excerpt');
  }

  // position label (publisher's self-description), label_quote in a disclosure
  let posTag = null, posBox = null;
  const pl = row.position_label;
  if (pl && typeof pl === 'object' && pl.label) {
    const hasQuote = (typeof pl.label_quote === 'string' && pl.label_quote) || pl.publisher;
    posBox = hasQuote ? el('div', { class: 'cc-pos', hidden: true },
      typeof pl.label_quote === 'string' && pl.label_quote ? el('blockquote', {}, pl.label_quote) : null,
      pl.publisher ? el('p', { class: 'meta' }, 'Publisher: ' + pl.publisher) : null,
      isHttp(pl.label_source_url) ? el('a', { class: 'ext', attrs: { href: pl.label_source_url, target: '_blank', rel: 'noopener' } }, 'Label source ↗') : null) : null;
    posTag = el('button', {
      class: 'tag tag-label cc-pos-btn',
      attrs: { type: 'button', 'aria-expanded': 'false' },
      on: {
        click: () => {
          if (!posBox) return;
          const open = posBox.hidden;
          posBox.hidden = !open;
          posTag.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      }
    }, `Publisher's self-description: ${pl.label}`);
  }

  let attrBtn = null, attrBox = null;
  const at = row.attribution_source;
  if (at && typeof at === 'object' && (at.quote || at.source_url)) {
    attrBox = el('div', { class: 'cc-pos', hidden: true },
      at.quote ? el('blockquote', {}, at.quote) : null,
      isHttp(at.source_url) ? el('a', { class: 'ext', attrs: { href: at.source_url, target: '_blank', rel: 'noopener' } }, 'Attribution source ↗') : null);
    attrBtn = el('button', {
      class: 'btn-link cc-attr-btn', attrs: { type: 'button', 'aria-expanded': 'false' },
      on: { click: () => { const o = attrBox.hidden; attrBox.hidden = !o; attrBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); } }
    }, 'Attribution');
  }

  const cited = Array.isArray(row.scripture_refs_cited) ? row.scripture_refs_cited : [];
  const withRef = cited.filter((c) => c && c.ref);
  const plain = cited.filter((c) => c && !c.ref && c.raw);

  const card = el('article', { class: 'card cc', attrs: { 'data-id': row.id } },
    el('header', { class: 'cc-head' },
      el('div', { class: 'cc-top' },
        el('h3', { class: 'cc-author' }, displayAuthor(row.author),
          row.author_dates ? el('span', { class: 'cc-dates' }, ` (${row.author_dates})`) : null)),
      el('p', { class: 'meta cc-meta' },
        [row.work, row.locator].filter(Boolean).join(', '),
        year ? el('span', { class: 'cc-year' }, ` · ${year}`) : null,
        row.series_editor ? el('span', { class: 'cc-ed' }, ` · ed. ${row.series_editor}`) : null,
        attrBtn ? ' · ' : null, attrBtn),
      el('div', { class: 'cc-tags' }, tagsFor(row, opts), posTag)),
    posBox, attrBox,
    qBox,
    toggle ? el('div', { class: 'cc-actions' }, toggle) : null,
    el('footer', { class: 'cc-foot' },
      withRef.length || plain.length ? el('div', { class: 'cc-cites' },
        (() => {
          const g = withRef.length ? refChips(withRef, { expandAll: true, externalExpand: true }) : null;
          return [el('div', { class: 'cc-cites-head' }, el('span', { class: 'meta cc-cites-label' }, 'Cited in this excerpt'), g && g.__expandBtn), g];
        })(),
        plain.map((c) => el('span', { class: 'chip chip-static' }, c.raw))) : null,
      el('div', { class: 'cc-src' }, sourceLink(row.source_url))));

  // drop the clamp control when the quote already fits in four lines
  if (long) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (card.isConnected && qBox.classList.contains('is-clamped') && qBox.scrollHeight <= qBox.clientHeight + 2) {
        qBox.classList.remove('is-clamped');
        toggle.parentNode.remove();
      }
    }));
  }
  return card;
}

export function furtherReading(rows) {
  const list = rows || [];
  return el('section', { class: 'fr', attrs: { 'aria-label': 'Further reading' } },
    el('h3', { class: 'section-title' }, 'Further reading ', el('span', { class: 'count' + (list.length ? '' : ' is-zero') }, String(list.length))),
    list.length
      ? el('ul', { class: 'fr-list' }, list.map((r) => el('li', { class: 'fr-item', attrs: { 'data-id': r.id } },
        el('span', { class: 'fr-author' }, displayAuthor(r.author)),
        r.work ? el('span', { class: 'fr-work' }, r.work) : null,
        r.edition ? el('span', { class: 'fr-ed' }, r.edition) : null,
        sourceLink(r.source_url))))
      : el('p', { class: 'empty' }, 'No further reading listed.'));
}

/* ---------- Commentary tab ---------- */
let rowsById = null;
async function getRows() {
  if (rowsById) return rowsById;
  const all = (await C11.load('commentary')) || [];
  rowsById = new Map(all.map((r) => [r.id, r]));
  ellicottEdited = all.some((r) => r.author === ELLICOTT_AUTHOR && r.series_editor);
  return rowsById;
}
export async function rowsFor(ids) {
  const m = await getRows();
  return (ids || []).map((id) => m.get(id)).filter(Boolean);
}

function renderTab(container, verse) {
  const info = C11.data.index.verses[String(verse)] || {};
  container.replaceChildren(el('p', { class: 'meta' }, 'Loading…'));
  Promise.all([rowsFor(info.commentary), rowsFor(info.further_reading)]).then(([rows, fr]) => {
    const eras = [];
    rows.forEach((r) => { if (!eras.includes(r.era)) eras.push(r.era); });
    const authors = [];
    rows.forEach((r) => { if (!authors.includes(r.author)) authors.push(r.author); });
    const state = { era: null, author: null };
    const list = el('div', { class: 'cl-list', attrs: { 'aria-live': 'polite' } });
    const eraBtns = [];

    const draw = () => {
      const f = rows.filter((r) => (state.era === null || r.era === state.era) && (state.author === null || r.author === state.author));
      const kids = [];
      if (!f.length) {
        const bits = [];
        if (state.era) bits.push('from ' + state.era);
        if (state.author) bits.push('by ' + displayAuthor(state.author));
        kids.push(el('p', { class: 'empty' }, `No excerpts ${bits.join(' ') || ''} for verse ${verse}.`.replace('  ', ' ')));
      } else {
        eras.forEach((e) => {
          const g = f.filter((r) => r.era === e);
          if (!g.length) return;
          kids.push(el('section', { class: 'era-group' },
            el('h3', { class: 'era-heading' }, e, ' ', el('span', { class: 'count' }, String(g.length))),
            g.map((r) => commentaryCard(r))));
        });
      }
      list.replaceChildren(...kids);
      eraBtns.forEach((b) => b.el.setAttribute('aria-pressed', b.era === state.era ? 'true' : 'false'));
    };

    const mkEra = (era, text, n) => {
      const b = el('button', { class: 'chip', attrs: { type: 'button', 'aria-pressed': 'false' },
        on: { click: () => { state.era = era; draw(); } } }, text, ' ', el('span', { class: 'count' }, String(n)));
      eraBtns.push({ el: b, era });
      return b;
    };
    const sel = el('select', { attrs: { id: 'cl-author-' + verse }, on: { change: (e) => { state.author = e.target.value === '' ? null : e.target.value; draw(); } } },
      el('option', { attrs: { value: '' } }, 'All authors'),
      authors.map((a) => el('option', { attrs: { value: a } }, displayAuthor(a))));

    const bar = rows.length ? el('div', { class: 'cl-bar' },
      el('div', { class: 'chips', attrs: { role: 'group', 'aria-label': 'Filter by era' } },
        mkEra(null, 'All', rows.length),
        eras.map((e) => mkEra(e, e, rows.filter((r) => r.era === e).length))),
      el('div', { class: 'cl-author-pick' },
        el('label', { attrs: { for: 'cl-author-' + verse } }, 'Author'), sel)) : null;

    container.replaceChildren(
      bar,
      rows.length ? list : el('p', { class: 'empty' }, `No excerpts for verse ${verse}.`),
      furtherReading(fr));
    if (rows.length) draw();
  }).catch((e) => { console.error(e); container.replaceChildren(el('p', { class: 'empty' }, 'Commentary unavailable.')); });
}

C11.registerTab('commentary', { label: 'Commentary', order: 3, render: renderTab });
C11.components.commentaryCard = commentaryCard;
C11.components.furtherReading = furtherReading;
