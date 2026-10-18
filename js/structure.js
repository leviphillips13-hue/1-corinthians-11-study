// Structure: verse-bar map, proposal list, mirrored-ladder / outline diagrams, compare, Study "Structure" tab.
// All content strings are verbatim source text or neutral UI labels (THE ABSOLUTE RULE).
import { C11 } from './core.js';
import { buildDiagram, span, containsVerse } from './pairing.js';

const el = (...a) => C11.el(...a);
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_PARTNER = 'st-kuyperian-commentary-2024';
const DEFAULT_FIRST = 'st-miller-2009';

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, String(attrs[k])));
  return n;
}

/* ---------- data ---------- */
let groupsP = null;
function loadGroups() {
  if (!groupsP) {
    groupsP = Promise.all([C11.load('structure'), C11.ready]).then(([rows]) => {
      const byRow = new Map((rows || []).map((r) => [r.id, r]));
      const list = [];
      for (const g of (C11.data.index && C11.data.index.structure_groups) || []) {
        const parts = (g.parts || []).map((id) => byRow.get(id)).filter(Boolean);
        if (!parts.length) continue;
        const first = parts[0];
        const elements = parts.flatMap((p) => p.elements || []);
        const diagram = buildDiagram(elements, { kind: first.kind });
        const hasRanges = diagram.rows.some((r) => r.range);
        const g2 = {
          id: g.id, parts, first, elements, diagram, hasRanges,
          citationOnly: parts.every((p) => p.citation_only),
          year: first.year == null ? null : first.year,
        };
        g2.name = (first.proposer || g.id) + (first.year != null ? ' (' + first.year + ')' : '');
        list.push(g2);
      }
      list.sort((a, b) => (a.year == null ? 1e9 : a.year) - (b.year == null ? 1e9 : b.year) || (a.id < b.id ? -1 : 1));
      return { list, byId: new Map(list.map((g) => [g.id, g])) };
    });
  }
  return groupsP;
}

/* ---------- small helpers ---------- */
function kindLabel(g) { return g.first.kind === 'chiasm' ? 'Chiasm' : 'Outline'; }
function originLabel(g) {
  const sh = g.first.secondhand;
  if (sh && typeof sh === 'object') return 'Reported by ' + (sh.reported_by || '');
  return 'Firsthand';
}
function rightsTag(status) {
  if (status === 'copyrighted_excerpt') return el('span', { class: 'tag tag-excerpt', text: 'Excerpt ©' });
  if (status === 'public_domain') return el('span', { class: 'tag tag-pd', text: 'Public domain' });
  return status ? el('span', { class: 'tag', text: String(status) }) : null;
}
function fmtVerses(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).replace(/([0-9ab])\s*-\s*(\d)/g, '$1–$2');
  return (s.indexOf('–') >= 0 ? 'vv. ' : 'v. ') + s;
}
function studyTarget(range) {
  if (!range || range.end < 3) return null; // verse 2 is context only in the Study view
  return Math.max(range.start, 3);
}
function halfRows(range) {
  const sp = span(range);
  let r1 = Math.round((sp.from - 2) * 2) + 1;
  let r2 = Math.round((sp.to - 2) * 2) + 1;
  r1 = Math.max(1, Math.min(30, r1));
  r2 = Math.max(r1 + 1, Math.min(31, r2));
  return [r1, r2];
}
// rows drawn in the bar map / aligned in compare
function barRowIndices(d) {
  const idx = d.rows.map((r, i) => (r.range ? i : -1)).filter((i) => i >= 0);
  if (d.kind === 'ladder') return idx;
  const levels = [...new Set(idx.map((i) => d.rows[i].indent))].sort((a, b) => a - b);
  for (const lv of levels) {
    const at = idx.filter((i) => d.rows[i].indent === lv);
    if (at.length >= 2) return at;
  }
  return levels.length ? idx.filter((i) => d.rows[i].indent === levels[0]) : [];
}
function isUrl(s) { return typeof s === 'string' && /^https?:\/\/\S+$/.test(s); }
function link(href, text, cls) {
  return el('a', { class: cls || 'btn-link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' }, text });
}
function plainLabel(l) { return String(l).replace(/[\s:.)]+$/u, ''); }

let observers = [];
function observe(target, fn) {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => fn());
  ro.observe(target);
  observers.push(ro);
  return ro;
}
function disconnectAll() { observers.forEach((o) => o.disconnect()); observers = []; }

/* ---------- element row (shared by ladder, compare, tab) ---------- */
function labelChip(row, cls) {
  return el('span', { class: cls || 'lrow-label' },
    row.isCentre ? el('span', { class: 'star', attrs: { 'aria-hidden': 'true' }, text: '★' }) : null,
    row.label);
}
function pairNote(d, row) {
  if (!d || row.pairIndex === null) return null;
  const p = d.pairs[row.pairIndex];
  const other = d.rows[row.side === 'open' ? p.close : p.open];
  const vs = other.verses ? ', ' + (/[-–]/.test(other.verses) ? 'verses ' : 'verse ') + other.verses : '';
  return el('span', { class: 'st-sr', text: ' pairs with ' + plainLabel(other.label) + vs });
}
function elementBox(row, i, d, opts) {
  const target = studyTarget(row.range);
  const attrs = { 'data-row': i };
  if (row.pairIndex !== null) attrs['data-pair'] = row.pairIndex;
  if (target) { attrs.href = '#/verse/' + target + '/commentary'; attrs.title = 'Open verse ' + target + ' commentary'; }
  const pre = /^\s|\n/.test(row.text);
  return el(target ? 'a' : 'div', { class: 'lrow h-' + row.hue + (row.isCentre ? ' is-centre' : ''), attrs },
    labelChip(row),
    el('span', { class: 'lrow-verses', text: fmtVerses(row.verses) }),
    el('span', { class: 'lrow-text' + (pre ? ' is-pre' : ''), text: C11.tidy(row.text) }),
    row.isCentre ? el('span', { class: 'st-sr', text: ' centre of the chiasm' }) : null,
    pairNote(d, row));
}

/* ---------- ladder / outline ---------- */
function drawBrackets(ladder, d) {
  const svg = ladder.querySelector('.ladder-brackets');
  if (!svg) return;
  const box = ladder.getBoundingClientRect();
  if (!box.width) return;
  const lane = parseFloat(getComputedStyle(ladder).getPropertyValue('--lane')) || 10;
  svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
  svg.replaceChildren();
  const rows = ladder.querySelectorAll('.lrow');
  d.pairs.forEach((p, k) => {
    const a = rows[p.open], b = rows[p.close];
    if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left, x2 = rb.right - box.left;
    const y1 = ra.top + ra.height / 2 - box.top, y2 = rb.top + rb.height / 2 - box.top;
    const x = box.width - 5 - p.depth * lane;
    const g = svgEl('g', { class: 'h-' + p.hue, 'data-pair': k, 'data-depth': p.depth });
    g.appendChild(svgEl('path', {
      class: 'bracket', d: 'M' + x1 + ' ' + y1 + 'H' + x + 'V' + y2 + 'H' + x2,
      'data-x': x, 'data-y1': y1, 'data-y2': y2,
    }));
    g.appendChild(svgEl('circle', { cx: x1, cy: y1, r: 3 }));
    g.appendChild(svgEl('circle', { cx: x2, cy: y2, r: 3 }));
    svg.appendChild(g);
  });
}

function renderLadder(g, roList) {
  const d = g.diagram;
  const maxDepth = Math.max(...d.pairs.map((p) => p.depth));
  const wrap = el('div', { class: 'ladder', attrs: { 'data-group': g.id } });
  wrap.style.setProperty('--lanes', String(maxDepth + 1));
  const ol = el('ol', { class: 'ladder-rows' });
  d.rows.forEach((row, i) => {
    const li = el('li', { class: 'lrow-item' }, elementBox(row, i, d));
    li.style.setProperty('--ind', String(row.indent));
    ol.appendChild(li);
  });
  const svg = svgEl('svg', { class: 'ladder-brackets', 'aria-hidden': 'true', focusable: 'false' });
  wrap.append(ol, svg);
  const redraw = () => drawBrackets(wrap, d);
  const ro = observe(wrap, redraw);
  if (roList && ro) roList.push(ro);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  requestAnimationFrame(redraw);
  return wrap;
}

function renderOutline(g) {
  const d = g.diagram;
  const ol = el('ol', { class: 'outline-rows' });
  d.rows.forEach((row, i) => {
    const target = studyTarget(row.range);
    const pre = /^\s|\n/.test(row.text);
    const attrs = { 'data-row': i };
    if (target) { attrs.href = '#/verse/' + target + '/commentary'; attrs.title = 'Open verse ' + target + ' commentary'; }
    const body = el(target ? 'a' : 'div', { class: target ? 'orow-link' : 'orow-body', attrs },
      el('span', { class: 'orow-label', text: row.label }),
      el('span', { class: 'orow-verses', text: fmtVerses(row.verses) }),
      el('span', { class: 'orow-text' + (pre ? ' is-pre' : ''), text: C11.tidy(row.text) }));
    const li = el('li', { class: 'orow' });
    for (let k = 0; k < row.indent; k++) li.appendChild(el('span', { class: 'oguide', attrs: { 'aria-hidden': 'true' } }));
    li.appendChild(body);
    ol.appendChild(li);
  });
  return el('div', { class: 'outline-wrap', attrs: { 'data-group': g.id } }, ol);
}

/* ---------- source notes ---------- */
const HIDDEN_KEYS = new Set(['source_file', 'fetched_at']);
function evidenceNode(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return isUrl(v) ? el('p', {}, link(v, 'Source ↗')) : el('p', { text: v });
  if (Array.isArray(v)) return el('ul', {}, v.map((x) => el('li', {}, evidenceNode(x))));
  if (typeof v === 'object') {
    const kids = [];
    const keys = Object.keys(v).filter((k) => !HIDDEN_KEYS.has(k));
    if (typeof v.quote === 'string') kids.push(el('blockquote', { text: v.quote }));
    const rest = keys.filter((k) => k !== 'quote' && k !== 'source_url');
    if (rest.length) kids.push(el('dl', {}, rest.flatMap((k) => [el('dt', { text: k }), el('dd', {}, evidenceNode(v[k]))])));
    if (typeof v.source_url === 'string') kids.push(el('p', {}, link(v.source_url, 'Source ↗')));
    return el('div', {}, kids);
  }
  return el('p', { text: String(v) });
}
function sourceNotes(g) {
  const blocks = [];
  const seen = new Set();
  g.parts.forEach((p) => {
    if (p.attribution_quote && !seen.has('q' + JSON.stringify(p.attribution_quote))) {
      seen.add('q' + JSON.stringify(p.attribution_quote));
      blocks.push(el('div', { class: 'sp-note' }, el('p', { class: 'sp-note-label', text: 'Source note' }),
        typeof p.attribution_quote === 'string' ? el('blockquote', { text: p.attribution_quote }) : evidenceNode(p.attribution_quote)));
    }
    if (p.edition_evidence !== undefined && p.edition_evidence !== null) {
      const key = 'e' + JSON.stringify(p.edition_evidence);
      if (!seen.has(key)) {
        seen.add(key);
        blocks.push(el('div', { class: 'sp-note' }, el('p', { class: 'sp-note-label', text: 'Edition evidence' }),
          evidenceNode(p.edition_evidence)));
      }
    }
  });
  if (!blocks.length) return null;
  return el('details', { class: 'acc' },
    el('summary', {}, el('span', { class: 'acc-title', text: 'Source notes' })),
    el('div', { class: 'acc-body sp-notes-body' }, blocks));
}

function compareHash(id) {
  const other = DEFAULT_PARTNER !== id ? DEFAULT_PARTNER : DEFAULT_FIRST;
  return '#/compare/' + id + '/' + other;
}

function diagramPanel(g, roList) {
  const sec = el('section', { class: 'sp-diagram', attrs: { 'aria-labelledby': 'sp-title' } });
  const tags = el('div', { class: 'sp-tags' },
    el('span', { class: 'tag tag-label', text: kindLabel(g) }),
    el('span', { class: 'tag tag-context', text: originLabel(g) }),
    rightsTag(g.first.copyright_status),
    g.parts.length > 1 ? el('span', { class: 'tag tag-context', text: 'Parts 1–' + g.parts.length }) : null,
    g.citationOnly ? el('span', { class: 'tag tag-label', text: 'Citation only' }) : null);
  const h2 = el('h2', { class: 'section-title', attrs: { id: 'sp-title', tabindex: '-1' }, text: g.name });
  sec.appendChild(el('div', { class: 'sp-diagram-head' },
    el('div', {}, h2, g.first.work ? el('p', { class: 'sp-work', text: g.first.work }) : null, tags),
    el('div', { class: 'sp-actions' },
      el('a', { class: 'btn', attrs: { href: compareHash(g.id) }, text: 'Compare' }))));
  if (g.citationOnly || !g.diagram.rows.length) {
    sec.appendChild(el('p', { class: 'empty', text: 'Citation only. No diagram elements are reproduced.' }));
  } else if (g.diagram.kind === 'ladder') {
    sec.appendChild(renderLadder(g, roList));
  } else {
    sec.appendChild(renderOutline(g));
  }
  const foot = el('div', { class: 'sp-foot' });
  const sh = g.first.secondhand;
  if (sh && typeof sh === 'object') {
    foot.appendChild(el('p', { class: 'meta', text: 'Reported by ' + (sh.reported_by || '') + (sh.work ? ', ' + sh.work : '') }));
  }
  const notes = sourceNotes(g);
  if (notes) foot.appendChild(notes);
  if (g.first.source_url) foot.appendChild(el('p', { class: 'meta' }, link(g.first.source_url, 'Source ↗')));
  sec.appendChild(foot);
  return sec;
}

/* ---------- verse-bar map ---------- */
function fitLabels(root) {
  root.querySelectorAll('.vmap-seg').forEach((seg) => {
    const lab = seg.querySelector('.vmap-seg-label');
    if (!lab) return;
    lab.classList.remove('is-clipped');
    const star = seg.querySelector('.star');
    if (seg.scrollWidth > seg.clientWidth || lab.offsetWidth + (star ? star.offsetWidth + 3 : 0) + 8 > seg.clientWidth) lab.classList.add('is-clipped');
  });
}

function verseBarMap(container, opts) {
  const compact = !!(opts && opts.compact);
  const root = el('div', { class: 'vmap' + (compact ? ' is-compact' : '') });
  if (container) container.appendChild(root);
  const placeholder = el('p', { class: 'st-note', text: 'Loading…' });
  root.appendChild(placeholder);
  loadGroups().then(({ list }) => {
    root.replaceChildren();
    const inner = el('div', { class: 'vmap-inner' });
    const nums = el('div', { class: 'vmap-nums' });
    for (let v = 2; v <= 16; v++) nums.appendChild(el('span', { text: String(v) }));
    inner.appendChild(el('div', { class: 'vmap-head' }, el('div', { class: 'vmap-name', text: 'Verse' }), nums));
    list.forEach((g) => {
      const track = el('div', { class: 'vmap-track' });
      const d = g.diagram;
      if (g.citationOnly || !d.rows.length) {
        track.appendChild(el('span', { class: 'vmap-note', text: 'Citation only' }));
      } else if (!g.hasRanges) {
        track.appendChild(el('span', { class: 'vmap-note', text: 'No verse ranges in source' }));
      } else {
        barRowIndices(d).forEach((i, n) => {
          const row = d.rows[i];
          const [c1, c2] = halfRows(row.range);
          const hue = d.kind === 'ladder' ? row.hue : (n % 2 === 0 ? 'tone-a' : 'tone-b');
          const seg = el('span', {
            class: 'vmap-seg h-' + hue + (row.isCentre ? ' is-centre' : ''),
            attrs: { title: row.label + (row.verses ? ' · ' + fmtVerses(row.verses) : '') },
          },
          row.isCentre ? el('span', { class: 'star', attrs: { 'aria-hidden': 'true' }, text: '★' }) : null,
          el('span', { class: 'vmap-seg-label', text: row.label }));
          seg.style.gridColumn = c1 + ' / ' + c2;
          track.appendChild(seg);
        });
      }
      inner.appendChild(el('a', {
        class: 'vmap-row',
        attrs: { href: '#/structure/' + g.id, 'data-id': g.id, 'aria-label': g.name + ', ' + kindLabel(g) + '. Open diagram' },
      }, el('div', { class: 'vmap-name' }, el('span', { text: g.name }), compact ? null : el('small', { text: kindLabel(g) })), track));
    });
    const scroll = el('div', { class: 'vmap-scroll' }, inner);
    root.appendChild(scroll);
    if (!compact) {
      root.appendChild(el('p', { class: 'vmap-legend', text: 'Matching colours mark paired labels. ★ marks the centre element. Select a bar to open its diagram.' }));
    }
    const fit = () => fitLabels(root);
    observe(scroll, fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    requestAnimationFrame(fit);
    root.setCurrent = (id) => {
      root.querySelectorAll('.vmap-row').forEach((r) => {
        if (r.getAttribute('data-id') === id) r.setAttribute('aria-current', 'true');
        else r.removeAttribute('aria-current');
      });
    };
    if (opts && opts.selected) root.setCurrent(opts.selected);
    if (root._pendingCurrent !== undefined) root.setCurrent(root._pendingCurrent);
  });
  root.setCurrent = (id) => { root._pendingCurrent = id; };
  return root;
}

/* ---------- Structure view ---------- */
let viewState = null;

C11.registerView('structure', {
  async render(container, params) {
    const { list, byId } = await loadGroups();
    const root = el('div', { class: 'wrap structure-view' });
    const cards = el('ul', { class: 'sp-cards' });
    const slot = el('div', { class: 'sp-slot', attrs: { 'aria-live': 'polite' } });
    const mapHolder = el('div');
    root.append(
      el('h1', { class: 'view-title', text: 'Structure' }),
      el('section', { attrs: { 'aria-labelledby': 'st-map-h' } },
        el('h2', { class: 'section-title', attrs: { id: 'st-map-h' }, text: 'Verse map' }), mapHolder),
      el('section', { attrs: { 'aria-labelledby': 'st-list-h' } },
        el('h2', { class: 'section-title', attrs: { id: 'st-list-h' }, text: 'Proposals' }), cards),
      slot);
    container.appendChild(root);
    const map = verseBarMap(mapHolder, {});
    list.forEach((g) => {
      cards.appendChild(el('li', {},
        el('a', { class: 'sp-card', attrs: { href: '#/structure/' + g.id, 'data-id': g.id } },
          el('span', { class: 'sp-card-name', text: g.name }),
          el('span', { class: 'sp-card-meta' },
            el('span', { text: kindLabel(g) }), el('span', { class: 'sep', attrs: { 'aria-hidden': 'true' }, text: '·' }),
            el('span', { text: originLabel(g) })),
          el('span', { class: 'sp-card-meta' }, rightsTag(g.first.copyright_status),
            g.citationOnly ? el('span', { class: 'tag tag-label', text: 'Citation only' }) : null))));
    });
    let ladderROs = [];
    const state = {
      container,
      select(id, o) {
        ladderROs.forEach((r) => { r.disconnect(); observers = observers.filter((x) => x !== r); });
        ladderROs = [];
        slot.replaceChildren();
        cards.classList.toggle('is-strip', !!(id && byId.get(id)));
        slot.classList.toggle('has-diagram', !!(id && byId.get(id)));
        cards.querySelectorAll('.sp-card').forEach((a) => {
          if (a.getAttribute('data-id') === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
        map.setCurrent(id);
        const g = id ? byId.get(id) : null;
        if (!id) {
          slot.appendChild(el('p', { class: 'empty', text: 'Choose a proposal to see its diagram.' }));
          return;
        }
        if (!g) {
          slot.appendChild(el('p', { class: 'empty', text: 'No proposal with this id.' }));
          return;
        }
        const sel = cards.querySelector('.sp-card[aria-current="true"]');
        if (sel) requestAnimationFrame(() => { cards.scrollLeft = Math.max(0, sel.offsetLeft - cards.offsetLeft - 16); });
        const panel = diagramPanel(g, ladderROs);
        slot.appendChild(panel);
        if (o && o.scroll) {
          requestAnimationFrame(() => {
            panel.scrollIntoView({ block: 'start' });
            const h = panel.querySelector('h2');
            if (h && o.focus) h.focus({ preventScroll: true });
          });
        }
      },
    };
    viewState = state;
    state.select(params.id, { scroll: !!params.id });
    return () => { disconnectAll(); if (viewState === state) viewState = null; };
  },
  update(container, params) {
    if (!viewState || viewState.container !== container) return false;
    viewState.select(params.id, { scroll: true, focus: true });
    return true;
  },
});

/* ---------- Compare ---------- */
function cmpOption(g) { return g.name + ' · ' + kindLabel(g); }

function compareGrid(ga, gb) {
  const grid = el('div', { class: 'cmp-grid' });
  for (let v = 2; v <= 16; v++) {
    const r1 = (v - 2) * 2 + 1;
    ['a', 'b'].forEach((s) => {
      const n = el('div', { class: 'cmp-v cmp-v-' + s, text: String(v) });
      n.style.setProperty('--r1', String(r1)); n.style.setProperty('--r2', String(r1 + 2));
      grid.appendChild(n);
    });
  }
  const extras = {};
  [['a', ga], ['b', gb]].forEach(([s, g]) => {
    const d = g.diagram;
    grid.appendChild(el('div', { class: 'cmp-head cmp-head-' + s },
      el('h2', { text: g.name }),
      el('p', { class: 'meta', text: kindLabel(g) + ' · ' + originLabel(g) })));
    const placed = new Set(g.citationOnly ? [] : barRowIndices(d));
    const items = [...placed].map((i) => ({ i, rr: halfRows(d.rows[i].range) }))
      .sort((x, y) => x.rr[0] - y.rr[0] || y.rr[1] - x.rr[1]);
    const cells = [];
    items.forEach((it) => {
      const last = cells[cells.length - 1];
      if (last && it.rr[0] < last.r2) { last.items.push(it); last.r2 = Math.max(last.r2, it.rr[1]); }
      else cells.push({ r1: it.rr[0], r2: it.rr[1], items: [it] });
    });
    cells.forEach((c) => {
      const cell = el('div', { class: 'cmp-cell cmp-cell-' + s }, c.items.map((it) => elementBox(d.rows[it.i], it.i, null)));
      cell.style.setProperty('--r1', String(c.r1)); cell.style.setProperty('--r2', String(c.r2));
      grid.appendChild(cell);
    });
    extras[s] = d.rows.map((r, i) => ({ r, i })).filter((x) => !placed.has(x.i));
  });
  const out = el('div', {}, grid);
  if (extras.a.length || extras.b.length) {
    const col = (g, s) => el('div', {},
      el('h3', { text: g.name + ': remaining elements, in source order' }),
      extras[s].length ? el('ol', {}, extras[s].map((x) => el('li', {}, elementBox(x.r, x.i, null)))) : null);
    out.appendChild(el('div', { class: 'cmp-extra' }, col(ga, 'a'), col(gb, 'b')));
  }
  return out;
}

let cmpState = null;
C11.registerView('compare', {
  async render(container, params) {
    const { list, byId } = await loadGroups();
    const root = el('div', { class: 'wrap compare-view' });
    const body = el('div');
    const mkSel = (id, label) => {
      const sel = el('select', { attrs: { id } }, list.map((g) => el('option', { attrs: { value: g.id }, text: cmpOption(g) })));
      sel.addEventListener('change', () => {
        const a = root.querySelector('#cmp-a').value, b = root.querySelector('#cmp-b').value;
        C11.navigate('#/compare/' + a + '/' + b);
      });
      return el('div', { class: 'cmp-picker' }, el('label', { attrs: { for: id }, text: label }), sel);
    };
    root.append(
      el('h1', { class: 'view-title', text: 'Compare' }),
      el('div', { class: 'cmp-pickers' }, mkSel('cmp-a', 'First proposal'), mkSel('cmp-b', 'Second proposal')),
      body);
    container.appendChild(root);
    const state = {
      container,
      fill(p) {
        const first = list.find((g) => g.id === DEFAULT_FIRST) || list[0];
        const second = list.find((g) => g.id === DEFAULT_PARTNER) || list[1] || list[0];
        const ga = byId.get(p.a) || first;
        const gb = byId.get(p.b) || second;
        root.querySelector('#cmp-a').value = ga.id;
        root.querySelector('#cmp-b').value = gb.id;
        body.replaceChildren(compareGrid(ga, gb));
      },
    };
    cmpState = state;
    state.fill(params);
    return () => { if (cmpState === state) cmpState = null; };
  },
  update(container, params) {
    if (!cmpState || cmpState.container !== container) return false;
    cmpState.fill(params);
    return true;
  },
});

/* ---------- mini ladder + Study tab ---------- */
function buildMini(g, verse) {
  const d = g.diagram;
  const v = Number(verse);
  const ol = el('ol', { class: 'mini', attrs: { tabindex: '0', role: 'list', 'aria-label': 'Diagram of ' + g.name } });
  let firstHere = null;
  d.rows.forEach((row) => {
    const here = containsVerse(row.range, v);
    const li = el('li', { class: 'mrow h-' + row.hue + (here ? ' is-here' : '') + (row.isCentre ? ' is-centre' : ''), attrs: here ? { 'aria-current': 'true' } : {} },
      el('span', { class: 'mrow-in' }, labelChip(row, 'mrow-label'), el('span', { class: 'mrow-verses', text: fmtVerses(row.verses) })));
    li.style.setProperty('--ind', String(row.indent));
    if (here && !firstHere) firstHere = li;
    ol.appendChild(li);
  });
  requestAnimationFrame(() => { if (firstHere && ol.scrollHeight > ol.clientHeight) ol.scrollTop = Math.max(0, firstHere.offsetTop - ol.offsetTop - 24); });
  return ol;
}

function miniLadder(groupId, verse) {
  const holder = el('div', { class: 'mini-holder' });
  loadGroups().then(({ byId }) => {
    const g = byId.get(groupId);
    if (g && g.diagram.rows.length) holder.appendChild(buildMini(g, verse));
  });
  return holder;
}

function tabCard(g, v) {
  const card = el('section', { class: 'card st-vcard' });
  const left = el('div', { class: 'st-vleft' });
  const right = el('div', { class: 'st-vright' });
  left.appendChild(el('h3', {}, g.name, el('span', { class: 'tag tag-label', text: kindLabel(g) })));
  card.append(left, right);
  if (g.citationOnly || !g.diagram.rows.length) {
    left.appendChild(el('p', { class: 'st-note' }, 'Citation only · ', g.first.source_url ? link(g.first.source_url, 'Source ↗') : null));
    return card;
  }
  const d = g.diagram;
  if (!g.hasRanges) {
    left.appendChild(el('p', { class: 'st-note', text: 'This source gives no verse ranges.' }));
  } else {
    const hits = d.rows.map((row, i) => ({ row, i })).filter((x) => containsVerse(x.row.range, v))
      .sort((a, b) => b.row.indent - a.row.indent);
    if (hits.length) {
      left.appendChild(el('p', { class: 'sp-note-label', text: 'Where verse ' + v + ' falls' }));
      left.appendChild(el('ul', { class: 'st-hits' }, hits.map((h) => el('li', {}, elementBox(h.row, h.i, d)))));
    }
  }
  right.appendChild(buildMini(g, g.hasRanges ? v : -1));
  left.appendChild(el('a', { class: 'btn btn-link st-open', attrs: { href: '#/structure/' + g.id }, text: 'Open full diagram' }));
  return card;
}

C11.registerTab('structure', {
  label: 'Structure',
  order: 4,
  render(container, verse) {
    const v = Number(verse);
    const wrap = el('div', { class: 'st-tab' });
    container.appendChild(wrap);
    wrap.appendChild(el('p', { class: 'st-note', text: 'Loading…' }));
    loadGroups().then(({ byId }) => {
      wrap.replaceChildren();
      const ids = (C11.data.index.verses[String(v)] || {}).structure || [];
      if (!ids.length) { wrap.appendChild(el('p', { class: 'empty', text: 'No structure proposals for verse ' + v + '.' })); return; }
      ids.forEach((id) => { const g = byId.get(id); if (g) wrap.appendChild(tabCard(g, v)); });
    });
  },
});

C11.components.verseBarMap = verseBarMap;
C11.components.miniLadder = miniLadder;
