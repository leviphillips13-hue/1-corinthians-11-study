/* commentators.js (UX-h2): Commentators library (#/commentators, #/commentators/<slug>). */
import { C11 } from './core.js';
import { commentaryCard, furtherReading, rowsFor, displayAuthor } from './commentary.js';

const el = C11.el;
const VERSES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

function heatCounts(author) {
  const mine = new Set(author.rows || []);
  const vs = C11.data.index.verses || {};
  return VERSES.map((v) => ((vs[String(v)] || {}).commentary || []).filter((id) => mine.has(id)).length);
}

function heatRow(author) {
  const counts = heatCounts(author);
  return el('span', { class: 'heat', attrs: { role: 'group', 'aria-label': 'Verses commented on' } },
    counts.map((n, i) => {
      const lvl = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
      return el('span', {
        class: 'heat-cell lvl-' + lvl,
        attrs: { role: 'img', 'aria-label': `Verse ${VERSES[i]}: ${n} excerpt${n === 1 ? '' : 's'}`, title: `Verse ${VERSES[i]}: ${n}` }
      });
    }));
}

function heatHeader() {
  return el('span', { class: 'heat heat-head', attrs: { 'aria-hidden': 'true' } },
    VERSES.map((v) => el('span', { class: 'heat-num' }, String(v))));
}

function renderIndex(container) {
  const idx = C11.data.index;
  const wrap = el('div', { class: 'wrap lib-commentators' });
  wrap.appendChild(el('h1', { class: 'view-title' }, 'Commentators'));
  wrap.appendChild(el('p', { class: 'meta' }, 'Grouped by era. Each cell is a verse from 3 to 16; a filled cell means the author has at least one excerpt on that verse.'));
  const eras = idx.eras || [];
  eras.forEach((era) => {
    const list = (idx.authors || []).filter((a) => a.era === era);
    if (!list.length) return;
    wrap.appendChild(el('section', { class: 'cm-era' },
      el('div', { class: 'cm-era-head' },
        el('h2', { class: 'section-title' }, era, ' ', el('span', { class: 'count' }, String(list.length))),
        heatHeader()),
      el('ul', { class: 'cm-list' }, list.map((a) => {
        const works = (a.works || []).join('; ');
        return el('li', {},
          el('a', { class: 'cm-row', attrs: { href: '#/commentators/' + a.slug } },
            el('span', { class: 'cm-name' },
              el('span', { class: 'cm-author' }, displayAuthor(a.author)),
              a.author_dates ? el('span', { class: 'cm-dates' }, a.author_dates) : null),
            el('span', { class: 'cm-works meta', attrs: { title: works } }, works),
            el('span', { class: 'cm-n' }, `${a.rows.length}`, el('span', { class: 'cm-n-l' }, a.rows.length === 1 ? ' excerpt' : ' excerpts')),
            heatRow(a)));
      }))));
  });
  container.replaceChildren(wrap);
}

async function renderAuthor(container, slug) {
  const idx = C11.data.index;
  const a = (idx.authors || []).find((x) => x.slug === slug);
  const wrap = el('div', { class: 'wrap lib-author' });
  container.replaceChildren(wrap);
  const back = el('a', { class: 'back-link', attrs: { href: '#/commentators' } }, '← All commentators');
  if (!a) {
    wrap.append(back, el('h1', { class: 'view-title' }, 'Commentators'), el('p', { class: 'empty' }, 'No commentator with this address.'));
    return;
  }
  const [rows, fr] = await Promise.all([rowsFor(a.rows), rowsFor(a.citation_only)]);
  const first = (r) => Math.min(...((r.verses && r.verses.length) ? r.verses : [999]));
  rows.sort((p, q) => first(p) - first(q) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  wrap.append(
    back,
    el('h1', { class: 'view-title' }, displayAuthor(a.author)),
    el('p', { class: 'meta' }, [a.author_dates, a.era, (a.works || []).join('; ')].filter(Boolean).join(' · ')),
    el('h2', { class: 'section-title' }, 'Excerpts ', el('span', { class: 'count' + (rows.length ? '' : ' is-zero') }, String(rows.length))),
    rows.length ? el('div', { class: 'cm-cards' }, rows.map((r) => commentaryCard(r, { showVerses: true })))
      : el('p', { class: 'empty' }, 'No excerpts by this author.'),
    fr.length ? furtherReading(fr) : null);
}

C11.registerView('commentators', {
  async render(container, params) {
    await C11.ready;
    await rowsFor([]);
    if (params && params.slug) return renderAuthor(container, params.slug);
    renderIndex(container);
  }
});
