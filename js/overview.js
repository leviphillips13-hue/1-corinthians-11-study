/* Step 1: Overview. One row per verse with labelled counts; links to the verse study view. */
import { C11 } from './core.js';

const el = C11.el;
const HOWTO_KEY = 'c11-howto-hidden';
const TR_NAME = { bsb: 'Berean Standard Bible', kjv: 'King James Version' };

function getHidden() { try { return localStorage.getItem(HOWTO_KEY) === '1'; } catch (e) { return false; } }
function setHidden(v) { try { localStorage.setItem(HOWTO_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }

const STEPS = [
  { n: 1, title: 'Overview', text: 'Select a verse to study it.' },
  { n: 2, title: 'Study a verse', text: 'Change verse with the chips or ← →. Tabs open each source.' },
  { n: 3, title: 'Structure', text: 'Choose a proposal to see its diagram.' }
];

function howTo(host) {
  host.replaceChildren();
  if (getHidden()) {
    host.appendChild(el('button', {
      class: 'btn-link howto-show', text: 'Show how to use this page', attrs: { type: 'button' },
      on: { click: () => { setHidden(false); howTo(host); } }
    }));
    return;
  }
  host.appendChild(el('section', { class: 'card howto', attrs: { 'aria-labelledby': 'howto-title' } },
    el('div', { class: 'howto-head' },
      el('h2', { class: 'howto-title', text: 'How to use this page', attrs: { id: 'howto-title' } }),
      el('button', {
        class: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Hide this guide' },
        on: { click: () => { setHidden(true); howTo(host); const b = host.querySelector('.howto-show'); if (b) b.focus(); } }
      }, C11.icon('close', 18))),
    el('ol', { class: 'howto-steps' }, STEPS.map((s) => el('li', { class: 'howto-step' },
      el('span', { class: 'step-num', text: String(s.n), attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'howto-text' }, el('strong', { text: s.title }), ' ', el('span', { text: s.text })))))));
}

function countPill(label, n) {
  return el('span', { class: 'vcount' + (n ? '' : ' is-zero') }, label + ' ', el('b', { text: String(n) }));
}

function render(container) {
  const d = C11.data;
  const wrap = el('div', { class: 'read overview' });
  const meta = el('p', { class: 'meta', text: TR_NAME[C11.state.translation] });
  const howHost = el('div', { class: 'howto-host' });
  howTo(howHost);

  const list = el('ol', { class: 'passage', attrs: { 'aria-label': 'Passage verses' } });
  const texts = [];
  d.passage.forEach((v) => {
    const n = v.verse;
    const inScope = v.in_scope !== false && C11.VERSES.indexOf(n) >= 0;
    const idx = d.index.verses[String(n)];
    const text = el('p', { class: 'vtext', text: C11.verseText(n), attrs: { lang: 'en' } });
    texts.push([n, text]);
    const body = el('div', { class: 'vbody' }, text);
    if (inScope && idx) {
      body.appendChild(el('div', { class: 'vcounts' },
        countPill('Scripture', idx.counts.scripture), countPill('Commentary', idx.counts.commentary), countPill('Structure', idx.counts.structure)));
    }
    const num = el('span', { class: 'vnum', text: String(n) });
    let row;
    if (inScope) {
      row = el('a', { class: 'verse-row', attrs: { href: '#/verse/' + n + '/scripture', 'aria-label': 'Study verse ' + n } }, num, body, el('span', { class: 'vchev' }, C11.icon('next', 18)));
      /* aria-label would hide the text; use description instead */
      row.removeAttribute('aria-label');
    } else {
      row = el('div', { class: 'verse-row is-context' }, num, body, el('span', { class: 'vchev' }, el('span', { class: 'tag tag-context', text: 'context' })));
    }
    list.appendChild(el('li', {}, row));
  });

  const glance = el('div', { class: 'glance' });
  if (C11.components.verseBarMap) {
    try { C11.components.verseBarMap(glance, { compact: true }); } catch (e) { console.error(e); }
  }
  wrap.append(
    el('h1', { class: 'view-title', text: '1 Corinthians 11:3–16' }), meta, howHost, list,
    el('h2', { class: 'section-title', text: 'Structure at a glance' }), glance,
    el('p', { class: 'glance-link' }, el('a', { class: 'btn', text: 'Open Structure →', attrs: { href: '#/structure' } })));
  container.appendChild(wrap);

  const off = C11.on('translation', (t) => {
    meta.textContent = TR_NAME[t];
    texts.forEach(([n, node]) => { node.textContent = C11.verseText(n); });
  });
  return off;
}

C11.registerView('overview', { render });
