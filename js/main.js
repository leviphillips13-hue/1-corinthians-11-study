/* Entry: static core import, per-module dynamic imports (a broken module must not break the others), shell UI, start. */
import { C11 } from './core.js';

const MODULES = ['overview', 'study', 'wordcard', 'refs', 'scripture', 'commentary', 'commentators', 'topics', 'sources', 'structure'];
const el = C11.el;

const STEPS = [
  { n: 1, name: 'overview', label: 'Overview', short: 'Overview', names: ['overview'] },
  { n: 2, name: 'verse', label: 'Study a verse', short: 'Verse', names: ['verse'] },
  { n: 3, name: 'structure', label: 'Structure', short: 'Structure', names: ['structure', 'compare'] }
];
const LIBRARY = [
  { name: 'commentators', label: 'Commentators', hash: '#/commentators' },
  { name: 'topics', label: 'Topics', hash: '#/topics' },
  { name: 'sources', label: 'Sources & Method', hash: '#/sources' }
];

let lastVerse = 3;
let stepLinks = [];
let libButtons = [];
let libLinks = [];
let themeButtons = [];
let trButtons = [];

function stepHref(s) {
  if (s.name === 'verse') return '#/verse/' + lastVerse;
  return '#/' + s.name;
}

function buildSteps(kind) {
  const nav = kind === 'top'
    ? el('nav', { class: 'steps', attrs: { 'aria-label': 'Steps' } })
    : null;
  const items = STEPS.map((s) => {
    const a = el('a', { class: 'step', attrs: { href: stepHref(s) } },
      el('span', { class: 'step-num', text: String(s.n), attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'step-label', text: kind === 'top' ? s.label : s.short }));
    stepLinks.push({ a, s });
    return a;
  });
  if (nav) { nav.append(...items); return nav; }
  return items;
}

function buildHeader() {
  const header = document.getElementById('site-header');
  const title = el('a', { class: 'site-title', attrs: { href: '#/overview' } },
    el('span', { class: 'title-full', text: '1 Corinthians 11:3–16' }),
    el('span', { class: 'title-short', text: '1 Cor 11:3–16', attrs: { 'aria-hidden': 'true' } }));

  const seg = el('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Translation' } });
  [['bsb', 'BSB'], ['kjv', 'KJV']].forEach(([k, label]) => {
    const b = el('button', { text: label, attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: () => C11.setTranslation(k) } });
    trButtons.push([k, b]);
    seg.appendChild(b);
  });

  const panelId = 'library-menu';
  const libBtn = el('button', { class: 'btn lib-btn', attrs: { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': panelId } },
    el('span', { text: 'Library' }), C11.icon('chevron', 16));
  const menuBtn = el('button', { class: 'icon-btn menu-btn', attrs: { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-label': 'Menu' } }, C11.icon('menu'));
  libButtons = [libBtn, menuBtn];

  const themeBtn = el('button', { class: 'icon-btn theme-btn', attrs: { type: 'button' }, on: { click: toggleTheme } });
  const themeRow = el('button', { class: 'menu-item menu-theme', attrs: { type: 'button', role: 'menuitem' }, on: { click: toggleTheme } });
  themeButtons = [themeBtn, themeRow];

  const panel = el('div', { class: 'menu-panel', attrs: { id: panelId, role: 'menu', 'aria-label': 'Library' }, hidden: true });
  panel.appendChild(el('div', { class: 'menu-heading', text: 'Library', attrs: { role: 'presentation' } }));
  LIBRARY.forEach((l) => {
    const a = el('a', { class: 'menu-item', text: l.label, attrs: { href: l.hash, role: 'menuitem' }, on: { click: () => closeMenu(false) } });
    libLinks.push({ a, l });
    panel.appendChild(a);
  });
  panel.appendChild(themeRow);

  const hdr = el('div', { class: 'hdr' },
    title,
    buildSteps('top'),
    el('div', { class: 'hdr-actions' }, libBtn, seg, themeBtn, menuBtn));
  header.append(hdr, panel);

  /* menu behaviour */
  let openBy = null;
  function items() { return Array.from(panel.querySelectorAll('[role=menuitem]')).filter((x) => x.offsetParent !== null); }
  function openMenu(btn) {
    openBy = btn;
    panel.hidden = false;
    libButtons.forEach((b) => b.setAttribute('aria-expanded', b === btn ? 'true' : 'false'));
    const first = items()[0];
    if (first) first.focus();
  }
  function closeMenu(restore) {
    if (panel.hidden) return;
    panel.hidden = true;
    libButtons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (restore && openBy) openBy.focus();
    openBy = null;
  }
  libButtons.forEach((b) => b.addEventListener('click', () => (panel.hidden ? openMenu(b) : closeMenu(true))));
  panel.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Tab') closeMenu(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); closeMenu(true); } }, true);
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    if (panel.contains(e.target) || libButtons.some((b) => b.contains(e.target))) return;
    closeMenu(false);
  });
  C11.on('route', () => closeMenu(false));
}

function toggleTheme() { C11.setTheme(C11.theme() === 'dark' ? 'light' : 'dark'); }

function syncTheme() {
  const dark = C11.theme() === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const [btn, row] = themeButtons;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.replaceChildren(C11.icon(dark ? 'sun' : 'moon'));
  row.replaceChildren(C11.icon(dark ? 'sun' : 'moon', 18), el('span', { text: label }));
}

function syncTranslation() {
  trButtons.forEach(([k, b]) => b.setAttribute('aria-pressed', k === C11.state.translation ? 'true' : 'false'));
}

function syncRoute() {
  const r = C11.baseRoute || C11.route;
  if (r && r.name === 'verse') lastVerse = r.params.verse;
  stepLinks.forEach(({ a, s }) => {
    const on = r && s.names.indexOf(r.name) >= 0;
    a.classList.toggle('is-active', !!on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    a.setAttribute('href', stepHref(s));
  });
  let libActive = false;
  libLinks.forEach(({ a, l }) => {
    const on = r && r.name === l.name;
    a.classList.toggle('is-active', !!on);
    if (on) { a.setAttribute('aria-current', 'page'); libActive = true; } else a.removeAttribute('aria-current');
  });
  libButtons.forEach((b) => b.classList.toggle('is-active', libActive));
}

function buildBottomNav() {
  const nav = document.getElementById('bottom-nav');
  nav.append(...buildSteps('bottom'));
}

buildHeader();
buildBottomNav();
syncTheme();
syncTranslation();
C11.on('theme', syncTheme);
C11.on('translation', syncTranslation);
C11.on('route', syncRoute);
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', syncTheme);
}
C11.ready.then(() => {
  if (C11.data.meta && C11.data.meta.fixtures === true) document.getElementById('fixtures-banner').hidden = false;
});

Promise.allSettled(MODULES.map((m) => import('./' + m + '.js').catch((err) => { console.error('module ' + m + ' failed', err); })))
  .then(() => C11.start())
  .then(syncRoute);
