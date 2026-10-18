/* Step 2: Study a verse. Sticky stepper, verse header (English + Greek), tabs (only the active tab renders), Words tab. */
import { C11 } from './core.js';

const el = C11.el;
const IL_KEY = 'c11-interlinear';
const TR_LABEL = { bsb: 'BSB', kjv: 'KJV' };

function readIL() { try { return localStorage.getItem(IL_KEY) === '1'; } catch (e) { return false; } }
function writeIL(v) { try { localStorage.setItem(IL_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }

/* ---------- tokens ---------- */
function tokensFor(n) {
  const v = C11.data.passageByVerse[n];
  if (!v) return [];
  const kjv = C11.state.translation === 'kjv';
  const all = (v.tokens || []).map((t) => ({ t, tr: false }));
  if (kjv) (v.tr_only_tokens || []).forEach((t) => all.push({ t, tr: true }));
  all.sort((a, b) => ((a.t.n || 0) - (b.t.n || 0)) || ((a.tr ? 1 : 0) - (b.tr ? 1 : 0)));
  return all;
}
const parsing = (t) => t.grammar_expanded || t.grammar || '';

/* ---------- tooltip (one shared element) ---------- */
let tip = null;
let tipFor = null;
function ensureTip() {
  if (tip) return tip;
  tip = el('div', { class: 'tip', attrs: { role: 'tooltip', id: 'c11-tip' }, hidden: true });
  document.body.appendChild(tip);
  return tip;
}
function showTip(btn, t, tr) {
  const node = ensureTip();
  const parts = [t.lemma, t.gloss, parsing(t)].filter(Boolean);
  node.textContent = (tr ? 'TR only · ' : '') + parts.join(' · ');
  node.hidden = false;
  tipFor = btn;
  btn.setAttribute('aria-describedby', 'c11-tip');
  const r = btn.getBoundingClientRect();
  const w = node.offsetWidth, h = node.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  node.style.left = left + 'px';
  node.style.top = top + 'px';
}
function hideTip() {
  if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; }
  if (tip) tip.hidden = true;
}
function tipEvents(btn, t, tr) {
  btn.addEventListener('mouseenter', () => showTip(btn, t, tr));
  btn.addEventListener('mouseleave', hideTip);
  btn.addEventListener('focus', () => showTip(btn, t, tr));
  btn.addEventListener('blur', hideTip);
}
function openToken(t) { if (t.strong) C11.openWord(t.strong, t.id); }

/* ---------- Greek block ---------- */
function greekFlow(n) {
  const wrap = el('p', { class: 'greek-flow greek', attrs: { lang: 'grc' } });
  tokensFor(n).forEach(({ t, tr }, i) => {
    if (i) wrap.appendChild(document.createTextNode(' '));
    const b = el('button', {
      class: 'gword' + (tr ? ' tr-only' : ''), text: t.greek,
      attrs: { type: 'button', lang: 'grc', 'data-strong': t.strong || null }, on: { click: () => openToken(t) }
    });
    tipEvents(b, t, tr);
    wrap.appendChild(b);
  });
  return wrap;
}
function greekBoxes(n) {
  const wrap = el('div', { class: 'ilx' });
  tokensFor(n).forEach(({ t, tr }) => {
    const b = el('button', { class: 'ibox' + (tr ? ' tr-only' : ''), attrs: { type: 'button' }, on: { click: () => openToken(t) } },
      tr ? el('span', { class: 'ibox-flag', text: 'TR only' }) : null,
      el('span', { class: 'ibox-greek greek', text: t.greek, attrs: { lang: 'grc' } }),
      el('span', { class: 'ibox-translit', text: t.translit || null }),
      el('span', { class: 'ibox-gloss', text: t.gloss || null }),
      el('span', { class: 'ibox-code', text: t.grammar || null }));
    wrap.appendChild(b);
  });
  return wrap;
}

/* ---------- Words tab ---------- */
let wordCounts = null;
function wcount(strong) { return wordCounts && strong && wordCounts[strong] ? wordCounts[strong] : null; }

async function renderWords(panel, verse) {
  wordCounts = wordCounts || (await C11.load('word_counts')) || {};
  const items = tokensFor(verse);
  if (!items.length) { panel.appendChild(el('p', { class: 'empty', text: 'No words for verse ' + verse + '.' })); return; }
  const tbody = el('tbody');
  items.forEach(({ t, tr }) => {
    const wc = wcount(t.strong);
    const countText = wc ? (tr ? wc.tr_only + ' (TR)' : String(wc.sbl)) : '–';
    const btn = el('button', { class: 'row-btn greek', text: t.greek, attrs: { type: 'button', lang: 'grc' }, on: { click: () => openToken(t) } });
    const tr_ = el('tr', { class: tr ? 'tr-only' : '', on: { click: (e) => { if (e.target !== btn) openToken(t); } } },
      el('td', { class: 'c-greek' }, btn, tr ? el('span', { class: 'tag tag-context', text: 'TR only' }) : null),
      el('td', { class: 'c-translit', text: t.translit || null }),
      el('td', { class: 'c-gloss', text: t.gloss || null }),
      el('td', { class: 'c-parse', text: parsing(t) || null }),
      el('td', { class: 'c-count', text: countText }));
    tbody.appendChild(tr_);
  });
  panel.appendChild(el('div', { class: 'words-wrap' },
    el('table', { class: 'words-table' },
      el('thead', {}, el('tr', {},
        el('th', { text: 'Greek', attrs: { scope: 'col' } }), el('th', { text: 'Transliteration', attrs: { scope: 'col' } }),
        el('th', { text: 'Gloss', attrs: { scope: 'col' } }), el('th', { text: 'Parsing', attrs: { scope: 'col' } }),
        el('th', { text: 'NT count', attrs: { scope: 'col' } }))),
      tbody)));
  panel.appendChild(el('p', { class: 'meta words-hint', text: 'Select a row to open its lexicon entry.' }));
}
C11.registerTab('words', { label: 'Words', order: 1, render: renderWords });

/* ---------- view ---------- */
function mount(container, params) {
  const ctx = { verse: params.verse, tab: params.tab, seq: 0, interlinear: readIL() };
  const idx = (n) => (C11.data.index.verses[String(n)] || { counts: {} });

  /* stepper */
  const prevBtn = el('a', { class: 'icon-btn', attrs: { 'aria-label': 'Previous verse' } }, C11.icon('prev'));
  const nextBtn = el('a', { class: 'icon-btn', attrs: { 'aria-label': 'Next verse' } }, C11.icon('next'));
  const strip = el('div', { class: 'vchips', attrs: { role: 'group', 'aria-label': 'Verses' } });
  const chipEls = {};
  C11.VERSES.forEach((n) => {
    const a = el('a', { class: 'vchip', text: String(n) });
    chipEls[n] = a;
    strip.appendChild(a);
  });
  const stepper = el('div', { class: 'stepper' }, el('div', { class: 'wrap stepper-in' }, prevBtn, strip, nextBtn));

  /* verse header */
  const titleEl = el('h1', { class: 'view-title verse-title' });
  const enEl = el('p', { class: 'verse-en', attrs: { lang: 'en' } });
  const metaEl = el('p', { class: 'meta' });
  const greekHost = el('div', { class: 'greek-host' });
  const ilBtn = el('button', { class: 'switch', attrs: { type: 'button', 'aria-pressed': String(ctx.interlinear) },
    on: { click: () => { ctx.interlinear = !ctx.interlinear; writeIL(ctx.interlinear); ilBtn.setAttribute('aria-pressed', String(ctx.interlinear)); drawGreek(); } } },
  el('span', { class: 'switch-track' }, el('span', { class: 'switch-thumb' })), el('span', { text: 'Interlinear' }));
  const trNote = el('p', { class: 'meta tr-note', hidden: true, text: 'Dashed words: TR only.' });
  const greekBlock = el('section', { class: 'greek-block', attrs: { 'aria-label': 'Greek text' } },
    el('div', { class: 'greek-bar' }, el('h2', { class: 'label', text: 'Greek (SBLGNT)' }), ilBtn), greekHost,
    el('p', { class: 'meta greek-hint', text: 'Select a Greek word to see its lexicon entry.' }), trNote);
  const head = el('header', { class: 'verse-head' }, titleEl, enEl, metaEl);

  /* tabs */
  const tablist = el('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Verse sections' } });
  const panel = el('div', { class: 'tabpanel', attrs: { role: 'tabpanel', id: 'verse-panel', tabindex: '-1' } });
  const tabBtns = {};
  const bottom = el('nav', { class: 'verse-nav', attrs: { 'aria-label': 'Verse navigation' } });

  const body = el('div', { class: 'wrap study-body' },
    el('div', { class: 'study-col' }, head, greekBlock, tablist, panel, bottom));
  container.append(stepper, body);

  function tabDefs() { return C11.getTabs(); }
  function activeTabId() {
    const defs = tabDefs();
    if (defs.some((d) => d.id === ctx.tab)) return ctx.tab;
    return defs.length ? defs[0].id : ctx.tab;
  }

  function drawGreek() {
    hideTip();
    greekHost.replaceChildren(ctx.interlinear ? greekBoxes(ctx.verse) : greekFlow(ctx.verse));
    trNote.hidden = C11.state.translation !== 'kjv' || !(C11.data.passageByVerse[ctx.verse].tr_only_tokens || []).length;
  }

  function drawHeader() {
    const n = ctx.verse;
    titleEl.textContent = 'Verse ' + n;
    enEl.textContent = C11.verseText(n);
    metaEl.textContent = '1 Corinthians 11:' + n + ' · ' + TR_LABEL[C11.state.translation];
    const href = (m) => '#/verse/' + m + '/' + activeTabId();
    Object.keys(chipEls).forEach((k) => {
      const a = chipEls[k];
      a.setAttribute('href', href(k));
      if (+k === n) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      a.setAttribute('aria-label', 'Verse ' + k);
    });
    const setNav = (a, m) => {
      if (m >= 3 && m <= 16) { a.setAttribute('href', href(m)); a.removeAttribute('aria-disabled'); a.removeAttribute('tabindex'); }
      else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.setAttribute('tabindex', '-1'); }
    };
    setNav(prevBtn, n - 1);
    setNav(nextBtn, n + 1);
    const cur = chipEls[n];
    strip.scrollLeft = Math.max(0, cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2);
    bottom.replaceChildren(
      n > 3 ? el('a', { class: 'btn', attrs: { href: href(n - 1) } }, C11.icon('prev', 16), 'Verse ' + (n - 1)) : el('span'),
      n < 16 ? el('a', { class: 'btn', attrs: { href: href(n + 1) } }, 'Verse ' + (n + 1), C11.icon('next', 16)) : el('span'));
  }

  function drawTabs() {
    const active = activeTabId();
    tablist.replaceChildren();
    Object.keys(tabBtns).forEach((k) => delete tabBtns[k]);
    tabDefs().forEach((d) => {
      const c = idx(ctx.verse).counts[d.id];
      const b = el('button', {
        class: '', attrs: {
          type: 'button', role: 'tab', id: 'tab-' + d.id, 'aria-selected': String(d.id === active),
          'aria-controls': 'verse-panel', tabindex: d.id === active ? '0' : '-1'
        },
        on: { click: () => selectTab(d.id) }
      }, el('span', { text: d.label }), c === undefined ? null : el('span', { class: 'count' + (c ? '' : ' is-zero'), text: String(c) }));
      tabBtns[d.id] = b;
      tablist.appendChild(b);
    });
    panel.setAttribute('aria-labelledby', 'tab-' + active);
  }

  function syncTabs() {
    const active = activeTabId();
    Object.keys(tabBtns).forEach((k) => {
      tabBtns[k].setAttribute('aria-selected', String(k === active));
      tabBtns[k].setAttribute('tabindex', k === active ? '0' : '-1');
    });
    panel.setAttribute('aria-labelledby', 'tab-' + active);
  }

  function selectTab(id) {
    if (id === ctx.tab) return;
    C11.navigate('#/verse/' + ctx.verse + '/' + id, { replace: true });
  }

  tablist.addEventListener('keydown', (e) => {
    const ids = tabDefs().map((d) => d.id);
    const cur = ids.indexOf(document.activeElement && document.activeElement.id.replace('tab-', ''));
    if (cur < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = (cur + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    selectTab(ids[next]);
    const b = tabBtns[ids[next]];
    if (b) b.focus();
  });

  async function drawPanel() {
    const seq = ++ctx.seq;
    panel.replaceChildren();
    const id = activeTabId();
    const def = tabDefs().find((d) => d.id === id);
    if (!def) { panel.appendChild(el('p', { class: 'empty', text: 'This section is unavailable.' })); return; }
    const holder = el('div', { class: 'tab-content' });
    panel.appendChild(holder);
    try { await def.render(holder, ctx.verse); } catch (err) {
      console.error(err);
      if (seq === ctx.seq) holder.appendChild(el('p', { class: 'empty', text: 'This section could not be displayed.' }));
    }
  }

  function keepTabsInView() {
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stepper-h'));
    if (tablist.getBoundingClientRect().top < (top || 112)) {
      window.scrollTo(0, window.scrollY + tablist.getBoundingClientRect().top - (top || 112) - 8);
    }
  }

  function fullDraw() {
    drawHeader(); drawGreek(); drawTabs(); drawPanel();
  }
  fullDraw();

  const offTr = C11.on('translation', () => { drawHeader(); drawGreek(); drawPanel(); });
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
    if (C11.route.name !== 'verse') return;
    const t = e.target;
    if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable || (t.closest && t.closest('[role=menu],[role=dialog],[role=tablist]')))) return;
    const m = ctx.verse + (e.key === 'ArrowRight' ? 1 : -1);
    if (m >= 3 && m <= 16) C11.navigate('#/verse/' + m + '/' + activeTabId());
  };
  document.addEventListener('keydown', onKey);

  ctx.apply = (p, prev) => {
    const verseChanged = p.verse !== ctx.verse;
    ctx.verse = p.verse;
    ctx.tab = p.tab;
    if (verseChanged) {
      fullDraw();
      window.scrollTo(0, 0);
    } else {
      drawHeader(); syncTabs();
      drawPanel().then(keepTabsInView);
    }
  };
  container.__study = ctx;
  return () => { offTr(); document.removeEventListener('keydown', onKey); hideTip(); };
}

C11.registerView('verse', {
  render(container, params) { return mount(container, params); },
  update(container, params, prev) {
    const ctx = container.__study;
    if (!ctx || !ctx.apply) return false;
    ctx.apply(params, prev);
    return true;
  }
});
