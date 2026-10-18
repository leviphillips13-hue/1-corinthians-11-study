/* topics.js (UX-h2): Topics library + shared topic / TSK accordions (also used by the Scripture tab). */
import { C11 } from './core.js';
import { refChips } from './refs.js';

const el = C11.el;
const OPEN_CAP = 80;

/* ---------- shared helpers ---------- */
export function highlight(text, q) {
  const s = text === null || text === undefined ? '' : String(text);
  if (!q) return [s];
  const low = s.toLowerCase();
  const ql = q.toLowerCase();
  const out = [];
  let i = 0;
  for (;;) {
    const j = low.indexOf(ql, i);
    if (j < 0) break;
    if (j > i) out.push(s.slice(i, j));
    out.push(el('mark', {}, s.slice(j, j + q.length)));
    i = j + q.length;
  }
  if (i < s.length) out.push(s.slice(i));
  return out.length ? out : [s];
}

let rulesP = null;
export function loadRules() {
  if (!rulesP) {
    rulesP = C11.load('rules').then((r) => {
      const m = {};
      (Array.isArray(r) ? r : []).forEach((x) => { m[x.id] = x.text; });
      return m;
    });
  }
  return rulesP;
}

export function ruleId(t) {
  const m = /^\s*(R\d+)/.exec(typeof t.why_included === 'string' ? t.why_included : '');
  return m ? m[1] : null;
}

function linkedLabel(vs) {
  if (!Array.isArray(vs) || !vs.length) return null;
  return C11.fmtRef('1Co.11.' + vs[0]) + vs.slice(1).map((v) => ', ' + v).join('');
}

export function refCount(t) {
  return (t.lines || []).reduce((n, l) => n + (Array.isArray(l.refs) ? l.refs.length : 0), 0);
}

export function lineMatches(l, q) {
  return !!q && String(l.label || l.text || '').toLowerCase().includes(q.toLowerCase());
}
export function topicLineMatch(t, q) {
  return !!q && (t.lines || []).some((l) => lineMatches(l, q));
}

function lineRow(l, q) {
  const label = l.label !== undefined && l.label !== null && l.label !== '' ? l.label : (l.text || '');
  const refs = Array.isArray(l.refs) ? l.refs : [];
  const d = Math.max(0, +l.depth || 0);
  const row = el('div', { class: 'tl' + (lineMatches(l, q) ? ' is-match' : '') + (refs.length ? '' : ' tl-head') + (d ? ' has-depth' : '') },
    label ? el('span', { class: 'tl-label' }, highlight(label, q)) : null,
    refs.length ? refChips(refs)
      : (l.refs_raw ? el('span', { class: 'meta tl-raw' }, l.refs_raw) : null));
  if (d) row.style.marginLeft = `calc(${d - 1} * var(--sp-4))`;
  return row;
}

function whyBlock(t) {
  const id = ruleId(t);
  const cited = linkedLabel(t.linked_verses);
  const body = el('div', { class: 'why-body' });
  const det = el('details', { class: 'why' },
    el('summary', {},
      el('span', { class: 'why-title' }, 'Why listed'),
      el('span', { class: 'meta why-short' }, [id, cited ? 'cited ' + cited : null].filter(Boolean).join(' · '))),
    body);
  let built = false;
  det.addEventListener('toggle', async () => {
    if (!det.open || built) return;
    built = true;
    const rules = await loadRules();
    body.replaceChildren(
      t.why_included ? el('p', { class: 'why-line' }, t.why_included) : null,
      id && rules[id] ? el('p', { class: 'why-rule meta' }, rules[id]) : null);
  });
  return det;
}

/* nested accordion for one Nave's / Torrey's topic */
export function topicAccordion(t, opts = {}) {
  const q = opts.q || '';
  const body = el('div', { class: 'acc-body tp-body' });
  const n = refCount(t);
  const det = el('details', { class: 'acc acc-nested tp', attrs: { id: opts.noId ? null : 'topic-' + t.id, 'data-topic': t.id } },
    el('summary', {},
      el('span', { class: 'acc-title' }, highlight(t.subject, q)),
      el('span', { class: 'count' + (n ? '' : ' is-zero'), attrs: { title: 'References in this topic' } }, String(n))),
    body);
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const lines = t.lines || [];
    body.replaceChildren(
      lines.length ? el('div', { class: 'tp-lines' }, lines.map((l) => lineRow(l, q))) : el('p', { class: 'empty' }, 'No lines in this topic.'),
      whyBlock(t));
  };
  det.addEventListener('toggle', () => { if (det.open) build(); });
  if (opts.open || (q && topicLineMatch(t, q) && opts.allowOpen !== false)) { build(); det.open = true; }
  det.__build = build;
  return det;
}

/* one TSK keyword group */
export function tskRow(r, q) {
  const chips = refChips(r.refs || [], { expandAll: true, externalExpand: true });
  return el('div', { class: 'tsk-row' },
    el('div', { class: 'tsk-head' }, el('div', { class: 'tsk-key' }, highlight(r.keyword, q)), chips.__expandBtn),
    chips);
}

/* ---------- library view ---------- */
async function renderTopics(container, params) {
  const wrap = el('div', { class: 'wrap lib-topics' });
  container.replaceChildren(wrap);
  wrap.appendChild(el('h1', { class: 'view-title' }, 'Topics'));
  wrap.appendChild(el('p', { class: 'meta' }, 'Search topic names and topic line labels. Select a topic to open it.'));
  const x = (await C11.load('xref')) || {};
  const naves = x.naves || [];
  const torrey = x.torrey || [];
  const tsk = x.tsk || [];
  const state = { mode: 'all', q: '' };
  const input = el('input', { class: 'lib-search', attrs: { id: 'topic-search', type: 'search', autocomplete: 'off', placeholder: 'e.g. hair' } });
  const modes = [['all', 'All'], ['naves', "Nave's"], ['torrey', "Torrey's"], ['tsk', 'TSK by verse']];
  const modeBtns = modes.map(([id, label]) => el('button', {
    class: 'chip', attrs: { type: 'button', 'aria-pressed': id === state.mode ? 'true' : 'false', 'data-mode': id },
    on: { click: () => { state.mode = id; draw(); } }
  }, label));
  const status = el('p', { class: 'meta lib-count', attrs: { 'aria-live': 'polite' } });
  const results = el('div', { class: 'lib-results' });
  wrap.appendChild(el('div', { class: 'lib-controls' },
    el('div', { class: 'lib-field' }, el('label', { attrs: { for: 'topic-search' } }, 'Search topics'), input),
    el('div', { class: 'chips', attrs: { role: 'group', 'aria-label': 'Topic source' } }, modeBtns)));
  wrap.appendChild(status);
  wrap.appendChild(results);

  const matchTopic = (t, q) => !q || String(t.subject).toLowerCase().includes(q.toLowerCase()) || topicLineMatch(t, q);

  function topicSection(title, list, q, budget) {
    const shown = list.filter((t) => matchTopic(t, q));
    const sec = el('section', { class: 'lib-sec' },
      el('h2', { class: 'section-title' }, title, ' ', el('span', { class: 'count' + (shown.length ? '' : ' is-zero') }, String(shown.length))),
      shown.length ? shown.map((t) => {
        const allow = budget.n < OPEN_CAP && topicLineMatch(t, q);
        if (allow) budget.n++;
        return topicAccordion(t, { q, allowOpen: allow });
      }) : el('p', { class: 'empty' }, q ? 'No matching topics.' : 'No topics.'));
    return { sec, n: shown.length };
  }

  function tskSection(q) {
    const sec = el('section', { class: 'lib-sec' }, el('h2', { class: 'section-title' }, 'Treasury of Scripture Knowledge, by verse'));
    let total = 0;
    for (let v = 3; v <= 16; v++) {
      const rows = tsk.filter((r) => r.verse === v);
      const hit = rows.some((r) => !q || String(r.keyword).toLowerCase().includes(q.toLowerCase()));
      if (!hit) continue;
      total += rows.length;
      const body = el('div', { class: 'acc-body' });
      const det = el('details', { class: 'acc acc-nested', attrs: { 'data-verse': v } },
        el('summary', {}, el('span', { class: 'acc-title' }, `Verse ${v}`), el('span', { class: 'count' }, String(rows.length))), body);
      let built = false;
      const build = () => { if (built) return; built = true; body.replaceChildren(...rows.map((r) => tskRow(r, q))); };
      det.addEventListener('toggle', () => { if (det.open) build(); });
      if (q) { build(); det.open = true; }
      sec.appendChild(det);
    }
    if (!total) sec.appendChild(el('p', { class: 'empty' }, 'No matching keyword groups.'));
    return { sec, n: total };
  }

  function draw() {
    const q = state.q.trim();
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode ? 'true' : 'false'));
    const budget = { n: 0 };
    const parts = [];
    let msg;
    if (state.mode === 'tsk') {
      const s = tskSection(q); parts.push(s.sec);
      msg = `${s.n} keyword group${s.n === 1 ? '' : 's'}`;
    } else {
      let n = 0;
      if (state.mode === 'all' || state.mode === 'naves') { const s = topicSection("Nave's Topical Bible", naves, q, budget); parts.push(s.sec); n += s.n; }
      if (state.mode === 'all' || state.mode === 'torrey') { const s = topicSection("Torrey's Topical Textbook", torrey, q, budget); parts.push(s.sec); n += s.n; }
      const total = (state.mode === 'naves' ? naves.length : state.mode === 'torrey' ? torrey.length : naves.length + torrey.length);
      msg = q ? `${n} of ${total} topics match “${q}”` : `${n} topics`;
      if (budget.n >= OPEN_CAP) msg += `; the first ${OPEN_CAP} with matching lines are open`;
    }
    status.textContent = msg;
    results.replaceChildren(...parts);
  }

  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = input.value; draw(); }, 120); });

  draw();

  const id = params && params.id;
  if (id) {
    let target = results.querySelector('[data-topic="' + CSS.escape(id) + '"]');
    if (!target) { state.mode = 'all'; state.q = ''; input.value = ''; draw(); target = results.querySelector('[data-topic="' + CSS.escape(id) + '"]'); }
    if (target) {
      target.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    } else {
      status.textContent = 'Topic not found.';
    }
  }
}

C11.registerView('topics', { render: renderTopics });
