/* sources.js (UX-h2): Sources & Method (#/sources). Text comes verbatim from data files. */
import { C11 } from './core.js';
import { displayAuthor, rowsFor } from './commentary.js';

const el = C11.el;
const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
const ext = (url, label) => (isHttp(url)
  ? el('a', { class: 'ext', attrs: { href: url, target: '_blank', rel: 'noopener' } }, label || 'Source ↗') : null);
const XSRC = { tsk: 'Treasury of Scripture Knowledge', torrey: "Torrey's Topical Textbook", naves: "Nave's Topical Bible" };

function bibItem(parts, url, citation) {
  return el('li', { class: 'bib-item' },
    parts.filter(Boolean).map((p, i) => el('span', { class: i === 0 ? 'bib-main' : 'bib-part' }, p)),
    citation ? el('span', { class: 'tag' }, 'Citation only') : null,
    ext(url));
}

function bibGroup(title, items) {
  return el('details', { class: 'acc bib-acc' },
    el('summary', {}, el('span', { class: 'acc-title' }, title), el('span', { class: 'count' }, String(items.length))),
    el('div', { class: 'acc-body' }, el('ul', { class: 'bib-list' }, items)));
}

async function render(container) {
  await C11.ready;
  const wrap = el('div', { class: 'wrap lib-sources' });
  container.replaceChildren(wrap);
  const [method, rules, credits, commentary, structure, xref] = await Promise.all(
    ['method', 'rules', 'credits', 'commentary', 'structure', 'xref'].map((n) => C11.load(n)));
  await rowsFor([]); // sets the Ellicott display rule from the saved rows
  wrap.appendChild(el('h1', { class: 'view-title' }, 'Sources & Method'));
  ((method && method.paragraphs) || []).forEach((p) => wrap.appendChild(el('p', { class: 'method-p' }, p)));

  wrap.appendChild(el('h2', { class: 'section-title' }, 'Inclusion rules'));
  wrap.appendChild(el('ul', { class: 'rules' }, (rules || []).map((r) =>
    el('li', { attrs: { 'data-rule': r.id } }, el('span', { class: 'rule-text' }, r.text)))));

  wrap.appendChild(el('h2', { class: 'section-title' }, 'Credits and licences'));
  wrap.appendChild(el('ul', { class: 'credits' }, (credits || []).map((c) =>
    el('li', {}, el('span', { class: 'cr-label' }, c.label), el('span', { class: 'meta' }, c.licence), ext(c.url, 'Link ↗')))));

  const srcs = (xref && xref.sources) || {};
  const srcKeys = Object.keys(srcs);
  if (srcKeys.length) {
    wrap.appendChild(el('h2', { class: 'section-title' }, 'Cross-reference sources'));
    wrap.appendChild(el('ul', { class: 'credits' }, srcKeys.map((k) => el('li', {},
      el('span', { class: 'cr-label' }, XSRC[k] || k),
      (Array.isArray(srcs[k]) ? srcs[k] : [srcs[k]]).map((u) => ext(u, u))))));
  }

  wrap.appendChild(el('h2', { class: 'section-title' }, 'Bibliography'));
  const eras = C11.data.index.eras || [];
  const seen = new Set();
  const groups = new Map();
  (commentary || []).forEach((r) => {
    const k = [r.author, r.work, r.edition, r.source_url].join('\u0001');
    if (seen.has(k)) return;
    seen.add(k);
    const e = r.era || '';
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(r);
  });
  const order = eras.concat([...groups.keys()].filter((e) => !eras.includes(e)));
  order.forEach((e) => {
    const g = groups.get(e);
    if (!g || !g.length) return;
    g.sort((a, b) => ((a.death_year ?? 9999) - (b.death_year ?? 9999)) || (a.author < b.author ? -1 : a.author > b.author ? 1 : 0) || (a.work < b.work ? -1 : 1));
    wrap.appendChild(bibGroup(e, g.map((r) => bibItem([displayAuthor(r.author), r.work, r.edition], r.source_url, r.citation_only))));
  });
  const sk = new Set();
  const st = [];
  (structure || []).forEach((s) => {
    const k = [s.proposer, s.work, s.year, s.source_url].join('\u0001');
    if (!sk.has(k)) { sk.add(k); st.push(s); }
  });
  if (st.length) wrap.appendChild(bibGroup('Structure proposals', st.map((s) =>
    bibItem([s.proposer, s.work, s.year != null ? String(s.year) : null], s.source_url, s.citation_only))));
}

C11.registerView('sources', { render });
