// Structure pairing: pure functions, no DOM. Rules per scratch/ux/UI_CONTRACT.md section 6.
// Everything here is mechanical from the source's own labels; nothing is invented.

const PRIMES = "′'’ʹ";
const RE_DIGIT_LETTER = /^([12])([A-Z])$/;
const RE_LETTER = new RegExp("^([A-Z])([" + PRIMES + "]|[12])?$");
const RE_CENTRE = /CENTRAL|CENTER|CENTRE|AXIS/i;

export function normLabel(label) {
  const raw = label == null ? "" : String(label);
  const s = raw.replace(/[\s:.)]+$/u, "").trim();
  const out = { letter: null, side: null, centre: false, raw };
  if (RE_CENTRE.test(s)) { out.centre = true; return out; }
  let m = RE_DIGIT_LETTER.exec(s);
  if (m) { out.letter = m[2]; out.side = Number(m[1]); return out; }
  m = RE_LETTER.exec(s);
  if (m) {
    out.letter = m[1];
    const t = m[2];
    if (t === "1") out.side = 1;
    else if (t === "2") out.side = 2;
    else if (t) out.side = 2; // prime mark
    return out;
  }
  return out;
}

// "4-7", "3–6", "8a", "5b-16", "12b", "2", null -> {start,end,startPart,endPart} | null
export function parseVerses(str) {
  if (str == null) return null;
  const m = /^\s*(\d+)\s*([ab])?\s*(?:[-‐-―]\s*(\d+)\s*([ab])?)?\s*$/.exec(String(str));
  if (!m) return null;
  const start = Number(m[1]);
  if (m[3] === undefined) {
    return { start, end: start, startPart: m[2] || null, endPart: m[2] || null };
  }
  return { start, end: Number(m[3]), startPart: m[2] || null, endPart: m[4] || null };
}

// Position in verse units; verse v occupies [v, v+1). Half-verse parts are half cells.
export function span(range) {
  if (!range) return null;
  const from = range.start + (range.startPart === "b" ? 0.5 : 0);
  const to = range.end + (range.endPart === "a" ? 0.5 : 1);
  return { from, to: Math.max(to, from + 0.5) };
}

export function containsVerse(range, v) {
  return !!range && v >= range.start && v <= range.end;
}

export function hueFor(k) { return "pair-" + ((k % 7) + 1); }

// rows: elements of one structure group, parts already concatenated in order.
// opts: { kind } (defaults to 'chiasm' when omitted).
export function buildDiagram(rows, opts = {}) {
  const kind0 = opts.kind || "chiasm";
  const warnings = [];
  const out = (rows || []).map((r) => ({
    label: r.label == null ? "" : r.label,
    text: r.text == null ? "" : r.text,
    verses: r.verses == null ? null : r.verses,
    range: parseVerses(r.verses),
    indent: Number.isFinite(Number(r.indent)) ? Number(r.indent) : 0,
    pairIndex: null,
    side: null,
    isCentre: false,
    hue: "pair-none",
  }));
  const diagram = { kind: "outline", rows: out, pairs: [], warnings };
  if (kind0 === "outline" || out.length === 0) return diagram;

  const norms = out.map((r) => normLabel(r.label));
  const byLetter = new Map();
  norms.forEach((n, i) => {
    if (n.letter) {
      if (!byLetter.has(n.letter)) byLetter.set(n.letter, []);
      byLetter.get(n.letter).push(i);
    }
  });
  const maxIndent = Math.max(...out.map((r) => r.indent));
  const pairs = [];
  const centres = new Set();
  norms.forEach((n, i) => { if (n.centre) centres.add(i); });

  for (const [letter, idxs] of byLetter) {
    if (idxs.length === 2) {
      pairs.push({ letter, open: idxs[0], close: idxs[1] });
    } else if (idxs.length === 1) {
      if (out[idxs[0]].indent === maxIndent) centres.add(idxs[0]);
    } else {
      warnings.push(`Label "${letter}" appears ${idxs.length} times; no bracket drawn for it.`);
    }
  }
  if (pairs.length === 0) return diagram;

  pairs.sort((a, b) => a.open - b.open);
  pairs.forEach((p, k) => {
    p.hue = hueFor(k);
    p.depth = pairs.filter((q) => q !== p && q.open < p.open && q.close > p.close).length;
    out[p.open].pairIndex = k; out[p.close].pairIndex = k;
    out[p.open].hue = p.hue; out[p.close].hue = p.hue;
    out[p.open].side = "open"; out[p.close].side = "close";
  });
  for (let a = 0; a < pairs.length; a++) {
    for (let b = a + 1; b < pairs.length; b++) {
      const p = pairs[a], q = pairs[b];
      if (q.open < p.close && q.close > p.close) warnings.push(`Pairs ${p.letter} and ${q.letter} cross.`);
    }
  }
  for (const i of centres) {
    if (out[i].pairIndex !== null) continue;
    out[i].isCentre = true; out[i].hue = "pair-center"; out[i].side = "centre";
  }
  diagram.kind = "ladder";
  diagram.pairs = pairs.map(({ hue, open, close, depth, letter }) => ({ hue, open, close, depth, letter }));
  return diagram;
}
