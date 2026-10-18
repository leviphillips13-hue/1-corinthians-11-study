/* Lexicon HTML sanitizer: builds DOM nodes from the saved lexicon markup (no innerHTML, no browser markup parsing).
   Allowed: <b>, <i>, <br>, and <ref='X'>text</ref> (becomes a button that shows that verse text below the entry).
   Any other tag is dropped and its text kept. */
import { C11 } from './core.js';

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', sect: '§', para: '¶', dagger: '†', Dagger: '‡',
  deg: '°', times: '×', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è',
  aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß',
  ccedil: 'ç', ntilde: 'ñ', oacute: 'ó', iacute: 'í', uacute: 'ú'
};

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, body) => {
    if (body.charAt(0) === '#') {
      const code = body.charAt(1).toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!isFinite(code) || code < 0 || code > 0x10FFFF) return m;
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}

/* html -> DocumentFragment. onRef(attr, refs, button) is called when a ref button is clicked. */
export function sanitizeLexHtml(html, asRefs, onRef) {
  const frag = document.createDocumentFragment();
  const stk = [{ kind: 'root', el: frag }];
  const top = () => stk[stk.length - 1];
  const addText = (s) => {
    if (!s) return;
    const t = top();
    if (t.kind === 'ref') t.buf += s;
    else t.el.appendChild(document.createTextNode(s));
  };
  const closeRef = (f) => {
    stk.pop();
    const refs = asRefs && Array.isArray(asRefs[f.attr]) ? asRefs[f.attr] : [];
    const btn = C11.el('button', {
      class: 'lex-ref', text: f.buf, attrs: { type: 'button', title: f.attr, 'aria-expanded': 'false' },
      on: { click: () => { if (onRef) onRef(f.attr, refs, btn); } }
    });
    top().el.appendChild(btn);
  };
  const TAG_RE = /<ref\s*=\s*(?:'([^']*)'|"([^"]*)")\s*>|<\/ref\s*>|<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^>]*>/gi;
  const src = String(html);
  let last = 0;
  let m;
  while ((m = TAG_RE.exec(src)) !== null) {
    addText(decodeEntities(src.slice(last, m.index)));
    last = TAG_RE.lastIndex;
    if (m[1] !== undefined || m[2] !== undefined) {
      if (top().kind !== 'ref') stk.push({ kind: 'ref', attr: m[1] !== undefined ? m[1] : m[2], buf: '' });
    } else if (m[4] === undefined) {
      if (top().kind === 'ref') closeRef(top());
    } else {
      const closing = m[3] === '/';
      const name = m[4].toLowerCase();
      if (top().kind === 'ref') continue;
      if (name === 'b' || name === 'i') {
        if (closing) {
          for (let j = stk.length - 1; j > 0; j--) {
            if (stk[j].kind === name) { stk.length = j; break; }
          }
        } else {
          const e = document.createElement(name);
          top().el.appendChild(e);
          stk.push({ kind: name, el: e });
        }
      } else if (name === 'br' && !closing) {
        top().el.appendChild(document.createElement('br'));
      }
    }
  }
  addText(decodeEntities(src.slice(last)));
  while (top().kind === 'ref') closeRef(top());
  return frag;
}

/* Sanitized block plus an output area where clicked ref buttons show the verse text(s). */
export function lexBlock(html, asRefs, opts) {
  const o = opts || {};
  const out = C11.el('div', { class: 'lex-ref-out', hidden: true });
  let openBtn = null;
  async function show(attr, refs, btn) {
    if (openBtn === btn && !out.hidden) {
      out.hidden = true; btn.setAttribute('aria-expanded', 'false'); openBtn = null; return;
    }
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    openBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    out.hidden = false;
    out.replaceChildren(C11.el('p', { class: 'meta', text: 'Loading…' }));
    const list = refs.length ? refs : [];
    const blocks = [];
    for (const ref of list) {
      let node = null;
      if (C11.components.refText) { try { node = await C11.components.refText(ref); } catch (e) { node = null; } }
      if (!node) {
        const t = await C11.textFor(ref);
        const txt = t ? t[C11.state.translation] : null;
        node = C11.el('div', { class: 'occ-text' },
          C11.el('div', { class: 'meta', text: C11.fmtRef(ref) }),
          C11.el('p', { text: txt === null || txt === undefined ? 'No text saved for this reference.' : txt }));
      }
      blocks.push(node);
    }
    if (openBtn !== btn) return;
    out.replaceChildren(
      C11.el('div', { class: 'lex-ref-head' },
        C11.el('span', { class: 'meta', text: attr }),
        C11.el('button', { class: 'btn-link', text: 'Hide', attrs: { type: 'button' }, on: { click: () => { out.hidden = true; btn.setAttribute('aria-expanded', 'false'); openBtn = null; btn.focus(); } } })),
      blocks.length ? blocks : C11.el('p', { class: 'meta', text: 'No text saved for this reference.' }));
  }
  const body = C11.el('div', { class: 'lex-html' + (o.clamp ? ' is-clamped' : '') }, sanitizeLexHtml(html, asRefs, show));
  return C11.el('div', { class: 'lex-block' }, body, out);
}
