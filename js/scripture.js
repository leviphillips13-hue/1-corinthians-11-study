/* scripture.js (UX-h2): Study "Scripture" tab. */
import { C11 } from './core.js';
import { refChips } from './refs.js';
import { topicAccordion, tskRow } from './topics.js';
import { displayAuthor, rowsFor } from './commentary.js';

const el = C11.el;

function acc(title, n, bodyKids, cls) {
  return el('details', { class: 'acc sc-acc' + (cls ? ' ' + cls : '') },
    el('summary', {}, el('span', { class: 'acc-title' }, title), el('span', { class: 'count' + (n ? '' : ' is-zero') }, String(n))),
    el('div', { class: 'acc-body' }, bodyKids));
}

/* index "cited" key for a cited record: ref, or ref + '-' + tail of ref_end */
function citedKey(c) {
  if (!c.ref_end) return c.ref;
  const a = /^([^.]+)\.(\d+)\.(\d+)$/.exec(c.ref);
  const b = /^([^.]+)\.(\d+)\.(\d+)$/.exec(c.ref_end);
  if (a && b && a[2] === b[2]) return c.ref + '-' + b[3];
  if (b) return c.ref + '-' + b[2] + '.' + b[3];
  return c.ref + '-' + c.ref_end;
}

/* generic rendering of an author-supplied record: strings verbatim, ref/refs as chips */
function generic(val, key) {
  if (val === null || val === undefined || typeof val === 'number' || typeof val === 'boolean') return [];
  if (typeof val === 'string') {
    if (key === 'ref' || key === 'refs') return [refChips([val])];
    if (key === 'ref_end') return [];
    return [el('p', { class: 'user-text' }, val)];
  }
  if (Array.isArray(val)) {
    if (key === 'refs' && val.every((x) => typeof x === 'string')) return [refChips(val)];
    return val.flatMap((x) => generic(x, key));
  }
  return Object.keys(val).flatMap((k) => generic(val[k], k));
}

let xrefP = null;

async function renderTab(container, verse) {
  container.replaceChildren(el('p', { class: 'meta' }, 'Loading…'));
  await C11.ready;
  await rowsFor([]);
  if (!xrefP) xrefP = C11.load('xref');
  const x = (await xrefP) || {};
  const info = (C11.data.index.verses || {})[String(verse)] || {};
  const byId = (list) => { const m = new Map((list || []).map((r) => [r.id, r])); return (ids) => (ids || []).map((i) => m.get(i)).filter(Boolean); };
  const tsk = byId(x.tsk)(info.tsk);
  const naves = byId(x.naves)(info.naves);
  const torrey = byId(x.torrey)(info.torrey);
  const user = (info.user || []).map((i) => (x.user || [])[i]).filter((u) => u !== undefined);

  // cited: distinct refs from the index, authors from xref.cited[verse]
  const citedRecs = (x.cited || {})[String(verse)] || [];
  const authorsBy = new Map();
  const recBy = new Map();
  citedRecs.forEach((c) => {
    const k = citedKey(c);
    if (!recBy.has(k)) recBy.set(k, c);
    if (!authorsBy.has(k)) authorsBy.set(k, []);
    if (c.author && !authorsBy.get(k).includes(c.author)) authorsBy.get(k).push(c.author);
  });
  const citedRows = (info.cited || []).map((k) => {
    const rec = recBy.get(k);
    const authors = authorsBy.get(k) || [];
    const item = rec ? { ref: rec.ref, ref_end: rec.ref_end || null, raw: rec.raw || null } : { ref: k };
    return el('div', { class: 'cite-row' },
      refChips([item]),
      authors.length ? el('div', { class: 'meta cite-by' }, 'cited by: ',
        authors.flatMap((a, i) => [i ? ', ' : null,
          el('a', { attrs: { href: '#/commentators/' + C11.slug(a) } }, displayAuthor(a))])) : null);
  });

  const empty = (t) => el('p', { class: 'empty' }, t);
  const secs = [
    acc('Treasury of Scripture Knowledge', tsk.length,
      tsk.length ? tsk.map((r) => tskRow(r)) : empty(`No Treasury of Scripture Knowledge entries for verse ${verse}.`)),
    acc("Topics — Nave's", naves.length,
      naves.length ? naves.map((t) => topicAccordion(t, { noId: true })) : empty(`No Nave's topics linked to verse ${verse}.`)),
    acc("Topics — Torrey's", torrey.length,
      torrey.length ? torrey.map((t) => topicAccordion(t, { noId: true })) : empty(`No Torrey's topics linked to verse ${verse}.`)),
    acc('Cited by commentators on this verse', citedRows.length,
      citedRows.length ? citedRows : empty(`No scripture references cited by commentators on verse ${verse}.`)),
    acc('Added by the study author', user.length,
      user.length ? user.map((u) => el('div', { class: 'user-entry' }, generic(u))) : empty('No entries added by the study author for this verse.'))
  ];
  container.replaceChildren(
    el('p', { class: 'meta sc-hint' }, 'Open a group, then select a reference to read its text in place.'),
    el('div', { class: 'sc-list' }, secs));
}

C11.registerTab('scripture', { label: 'Scripture', order: 2, render: renderTab });
