/* views.js - WB-h3. Registers views and commentary renderers on window.C11.
 * All data strings are inserted with textContent (via C11.el). No markup strings are built.
 * Only neutral labels are written by this file; every other string comes from site/data.
 */
(function () {
  "use strict";

  var C = window.C11;
  if (!C) { return; }
  var el = C.el;

  var ERA_ORDER = [
    "Early church (to 451)",
    "Early medieval (451–1000)",
    "Medieval (1000–1500)",
    "Reformation (1500–1650)",
    "Post-Reformation (1650–1800)",
    "19th century (1800–1900)",
    "Modern (1900– )"
  ];
  var VERSE_MIN = 3;
  var VERSE_MAX = 16;
  var MAX_RANGE = 200;

  /* ---------- small helpers ---------- */

  function isHttp(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  function sourceLink(url, label) {
    if (!isHttp(url)) { return null; }
    return el("a", {
      class: "ext",
      attrs: { href: url, target: "_blank", rel: "noopener" }
    }, label || "Source");
  }

  function lbl(text) {
    return el("span", { class: "lbl" }, text);
  }

  function badgeFor(status) {
    return typeof status === "string" && status ? C.badge(status) : null;
  }

  function clampIndent(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* "4" -> [4]; "3-5" / "3–5" / "11:3-5" -> [3,4,5]; anything else -> null */
  function parseVerses(s) {
    if (typeof s === "number") { s = String(s); }
    if (typeof s !== "string") { return null; }
    var m = /^\s*(?:\d+:)?(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(s);
    if (!m) { return null; }
    var start = parseInt(m[1], 10);
    var end = m[2] ? parseInt(m[2], 10) : start;
    if (end < start || end - start > MAX_RANGE) { return null; }
    var out = [];
    for (var v = start; v <= end; v++) { out.push(v); }
    return out;
  }

  function paragraphs(quote) {
    if (typeof quote !== "string") {
      return el("p", { class: "muted" }, "No text");
    }
    return el("div", { class: "cc-quote" }, quote.split(/\n\s*\n/).map(function (part) {
      return el("p", { class: "cc-p" }, part);
    }));
  }

  function bibLine(parts, citationOnly) {
    var kids = parts.filter(Boolean).map(function (n) {
      return el("span", { class: "bib-part" }, n);
    });
    if (citationOnly) {
      kids.push(el("span", { class: "bib-part" }, lbl("Citation only")));
    }
    return el("p", { class: "biblio" }, kids);
  }

  function textPart(v) {
    return (typeof v === "string" && v.length) ? el("span", { class: "bib-text" }, v) : null;
  }

  function eraRank(era) {
    if (typeof era !== "string") { return ERA_ORDER.length + 1; }
    var i = ERA_ORDER.indexOf(era);
    return i >= 0 ? i : ERA_ORDER.length;
  }

  /* ---------- commentary card ---------- */

  function biblioCommentary(row) {
    return bibLine([
      textPart(row.author),
      textPart(row.author_dates),
      textPart(row.work),
      textPart(row.locator),
      textPart(row.edition),
      sourceLink(row.source_url, "Source"),
      badgeFor(row.copyright_status)
    ], true);
  }

  function positionBlock(pl) {
    var box = el("div", { class: "pos-quote", attrs: { hidden: "" } },
      typeof pl.label_quote === "string" ? pl.label_quote : "");
    var btnAttrs = { type: "button", "aria-expanded": "false" };
    if (typeof pl.label_quote === "string") { btnAttrs.title = pl.label_quote; }
    var btn = el("button", {
      class: "chip pos-chip",
      attrs: btnAttrs,
      on: {
        click: function () {
          var opening = box.hidden;
          box.hidden = !opening;
          btn.setAttribute("aria-expanded", opening ? "true" : "false");
        }
      }
    }, typeof pl.label === "string" ? pl.label : "");
    return el("div", { class: "cc-pos" }, [
      lbl("Position"),
      btn,
      box,
      sourceLink(pl.label_source_url, "Label source")
    ]);
  }

  function refChip(c) {
    if (!c || typeof c !== "object") { return null; }
    if (typeof c.ref !== "string" || !c.ref) {
      return el("span", { class: "ref-plain" }, typeof c.raw === "string" ? c.raw : "");
    }
    return C.refButton(c.ref, typeof c.raw === "string" ? c.raw : undefined, { end: c.ref_end });
  }

  /* Groups chips under their cited_by value (shown verbatim) in first-appearance order. */
  function citedGroups(refs) {
    var keys = [];
    var groups = {};
    refs.forEach(function (c) {
      var k = c && typeof c.cited_by === "string" && c.cited_by ? c.cited_by : "";
      if (!groups.hasOwnProperty(k)) { groups[k] = []; keys.push(k); }
      groups[k].push(refChip(c));
    });
    return keys.map(function (k) {
      var chips = groups[k];
      return el("div", { class: "cc-cited-group" }, (k
        ? [el("span", { class: "cc-citedby" }, k)] : []).concat(chips));
    });
  }

  function renderCommentaryCard(row) {
    if (row.citation_only) { return biblioCommentary(row); }

    var head = el("header", { class: "cc-head" }, [
      el("p", { class: "cc-author" }, [
        el("span", { class: "cc-name" }, textOrEmpty(row.author)),
        textPart(row.author_dates)
      ]),
      el("p", { class: "cc-work" }, textOrEmpty(row.work)),
      typeof row.locator === "string" && row.locator
        ? el("p", { class: "cc-locator" }, row.locator) : null,
      typeof row.edition === "string" && row.edition
        ? el("p", { class: "cc-edition" }, [lbl("Edition"), el("span", {}, row.edition)]) : null
    ]);

    var meta = el("div", { class: "cc-meta" }, [
      badgeFor(row.copyright_status),
      typeof row.era === "string" ? el("span", { class: "cc-era" }, row.era) : null,
      row.trimmed === true ? el("span", { class: "mark" }, "Trimmed") : null
    ]);

    var refs = Array.isArray(row.scripture_refs_cited) ? row.scripture_refs_cited : [];
    var refsBlock = refs.length
      ? el("div", { class: "cc-refs" }, [lbl("Cited")].concat(citedGroups(refs)))
      : null;

    var basis = typeof row.verse_basis === "string" && row.verse_basis
      ? el("p", { class: "cc-basis" }, [lbl("Verse"), el("span", {}, row.verse_basis)])
      : null;

    return el("article", { class: "cc" }, [
      head,
      meta,
      paragraphs(row.quote),
      row.position_label && typeof row.position_label === "object"
        ? positionBlock(row.position_label) : null,
      refsBlock,
      basis,
      el("p", { class: "cc-foot" }, sourceLink(row.source_url, "Source"))
    ]);
  }

  function textOrEmpty(v) {
    return typeof v === "string" ? v : "";
  }

  /* ---------- commentary list (filters + era groups) ---------- */

  function renderCommentaryList(rows, opts) {
    opts = opts || {};
    rows = Array.isArray(rows) ? rows : [];
    var root = el("div", { class: "cl" });
    if (!rows.length) {
      root.appendChild(C.empty());
      return root;
    }

    var eraKeys = [];
    var positions = [];
    rows.forEach(function (r) {
      var k = typeof r.era === "string" ? r.era : "";
      if (eraKeys.indexOf(k) < 0) { eraKeys.push(k); }
      if (r.position_label && typeof r.position_label.label === "string" &&
          positions.indexOf(r.position_label.label) < 0) {
        positions.push(r.position_label.label);
      }
    });
    eraKeys.sort(function (a, b) {
      var d = eraRank(a) - eraRank(b);
      return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
    });

    var state = { era: null, pos: null, verse: null };
    var results = el("div", { class: "cl-results" });

    function eraOf(r) {
      return typeof r.era === "string" ? r.era : "";
    }

    function matches(r) {
      if (state.era !== null && eraOf(r) !== state.era) { return false; }
      if (state.pos !== null &&
          !(r.position_label && r.position_label.label === state.pos)) { return false; }
      if (state.verse !== null &&
          !(Array.isArray(r.verses) && r.verses.indexOf(state.verse) >= 0)) { return false; }
      return true;
    }

    function renderResults() {
      results.textContent = "";
      var filtered = rows.filter(matches);
      if (!filtered.length) {
        results.appendChild(C.empty());
        return;
      }
      eraKeys.forEach(function (k) {
        var group = filtered.filter(function (r) { return eraOf(r) === k; });
        if (!group.length) { return; }
        var section = el("section", { class: "cl-group" });
        if (k) { section.appendChild(el("h3", { class: "cl-era" }, k)); }
        group.forEach(function (r) { section.appendChild(renderCommentaryCard(r)); });
        results.appendChild(section);
      });
    }

    function chipRow(labelText, items, key) {
      var buttons = [];
      items.forEach(function (it) {
        var b = el("button", {
          class: "chip",
          attrs: { type: "button", "aria-pressed": state[key] === it.value ? "true" : "false" },
          on: {
            click: function () {
              state[key] = it.value;
              buttons.forEach(function (x) {
                x.b.setAttribute("aria-pressed", x.v === state[key] ? "true" : "false");
              });
              renderResults();
            }
          }
        }, it.text);
        buttons.push({ b: b, v: it.value });
      });
      return el("div", { class: "cl-row", attrs: { role: "group", "aria-label": labelText } }, [
        el("span", { class: "cl-label" }, labelText),
        el("div", { class: "cl-chips" }, buttons.map(function (x) { return x.b; }))
      ]);
    }

    var eraItems = [{ value: null, text: "All" }].concat(eraKeys.filter(Boolean).map(function (k) {
      return { value: k, text: k };
    }));
    var filterKids = [chipRow("Era", eraItems, "era")];

    if (positions.length) {
      var posItems = [{ value: null, text: "All" }].concat(positions.map(function (p) {
        return { value: p, text: p };
      }));
      filterKids.push(chipRow("Position", posItems, "pos"));
    }

    if (opts.verseFilter === true) {
      var verseItems = [{ value: null, text: "All" }];
      for (var v = VERSE_MIN; v <= VERSE_MAX; v++) {
        verseItems.push({ value: v, text: "Verse " + v });
      }
      filterKids.push(chipRow("Verse", verseItems, "verse"));
    }

    root.appendChild(el("div", { class: "cl-filters" }, filterKids));
    root.appendChild(results);
    renderResults();
    return root;
  }

  /* ---------- structure view ---------- */

  function renderLadderRow(e) {
    var verses = parseVerses(e.verses);
    var inner = [
      el("span", { class: "ld-label" }, textOrEmpty(e.label)),
      typeof e.verses === "string" && e.verses
        ? el("span", { class: "vchip" }, e.verses) : null,
      el("span", { class: "ld-text" }, textOrEmpty(e.text))
    ];
    var body = verses
      ? el("button", {
          class: "ld-btn",
          attrs: { type: "button" },
          on: { click: function () { C.highlightVerses(verses); } }
        }, inner)
      : el("div", { class: "ld-btn ld-static" }, inner);
    var li = el("li", { class: "ld-row" }, [body]);
    li.style.setProperty("--indent", String(clampIndent(e.indent)));
    return li;
  }

  function renderProposal(p) {
    if (p.citation_only) {
      return bibLine([
        textPart(p.proposer),
        textPart(p.work),
        p.year != null ? textPart(String(p.year)) : null,
        sourceLink(p.source_url, "Source"),
        badgeFor(p.copyright_status)
      ], true);
    }
    var sh = p.secondhand && typeof p.secondhand === "object" ? p.secondhand : null;
    var kids = [
      el("header", { class: "sp-head" }, [
        el("p", { class: "sp-proposer" }, [
          sh ? lbl("Proposed by") : null,
          el("span", { class: "sp-name" }, textOrEmpty(p.proposer))
        ]),
        el("p", { class: "sp-work" }, textOrEmpty(p.work)),
        el("p", { class: "sp-meta" }, [
          p.year != null ? el("span", {}, String(p.year)) : null,
          typeof p.kind === "string" ? el("span", { class: "sp-kind" }, p.kind) : null
        ])
      ])
    ];
    if (sh) {
      kids.push(el("p", { class: "sp-rep" }, [
        lbl("Reported by"),
        el("span", {}, textOrEmpty(sh.reported_by)), (sh.reported_by && sh.work) ? ", " : null,
        textPart(sh.work)
      ]));
    }
    var els = Array.isArray(p.elements) ? p.elements : [];
    if (els.length) {
      kids.push(el("ol", { class: "ladder" }, els.map(renderLadderRow)));
    }
    kids.push(el("p", { class: "sp-foot" }, [
      badgeFor(p.copyright_status),
      sourceLink(p.source_url, "Source")
    ]));
    return el("article", { class: "sp" }, kids);
  }

  function renderStructure(container) {
    container.appendChild(el("h2", { class: "view-title" }, "Structure"));
    return C.load("structure").then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) {
        container.appendChild(C.empty());
        return;
      }
      rows.forEach(function (p) { container.appendChild(renderProposal(p)); });
    });
  }

  /* ---------- topics view ---------- */

  function ruleOf(t) {
    var m = /^R\d+/.exec(typeof t.why_included === "string" ? t.why_included : "");
    return m ? m[0] : null;
  }

  function renderTopicLine(l) {
    var see = l.see != null && l.see !== "";
    var content = typeof l.text === "string" ? l.text : textOrEmpty(l.label);
    var kids = [el("p", { class: "tl-text" }, content)];
    var refs = Array.isArray(l.refs)
      ? l.refs.filter(function (s) { return typeof s === "string" && s; }) : [];
    if (!see && refs.length) {
      kids.push(el("div", { class: "tl-refs" }, refs.map(function (r) {
        return C.refButton(r);
      })));
    } else if (!see && !refs.length && typeof l.refs_raw === "string" && l.refs_raw) {
      kids.push(el("p", { class: "tl-raw" }, l.refs_raw));
    }
    var row = el("div", { class: "tl" }, kids);
    row.style.setProperty("--depth", String(clampIndent(l.depth)));
    return row;
  }

  function renderTopic(t, indexName) {
    var lv = Array.isArray(t.linked_verses) ? t.linked_verses : [];
    var linked = el("div", { class: "tp-linked" }, [
      lbl("Linked verses"),
      lv.length
        ? lv.map(function (n) {
            return el("a", { class: "chip", attrs: { href: "#v" + n } }, "Verse " + n);
          })
        : el("span", { class: "chip-static" }, "Whole passage")
    ]);
    var lines = Array.isArray(t.lines) ? t.lines : [];
    return el("section", { class: "topic" }, [
      el("p", { class: "tp-index" }, indexName),
      el("h3", { class: "tp-subject" }, textOrEmpty(t.subject)),
      typeof t.why_included === "string" && t.why_included
        ? el("p", { class: "tp-why" }, [lbl("Rule"), el("span", {}, t.why_included)]) : null,
      linked,
      el("div", { class: "tp-lines" }, lines.map(renderTopicLine))
    ]);
  }

  function renderTopics(container) {
    container.appendChild(el("h2", { class: "view-title" }, "Topics"));
    return C.load("xref").then(function (x) {
      x = x || {};
      var all = [];
      (Array.isArray(x.naves) ? x.naves : []).forEach(function (t) {
        all.push({ index: "naves", name: "Nave's Topical Bible", t: t });
      });
      (Array.isArray(x.torrey) ? x.torrey : []).forEach(function (t) {
        all.push({ index: "torrey", name: "Torrey's Topical Textbook", t: t });
      });
      if (!all.length) {
        container.appendChild(C.empty());
        return;
      }

      var ruleIds = [];
      all.forEach(function (it) {
        var r = ruleOf(it.t);
        if (r && ruleIds.indexOf(r) < 0) { ruleIds.push(r); }
      });
      ruleIds.sort(function (a, b) {
        return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
      });

      var state = { index: null, rule: null };
      var list = el("div", { class: "tp-list" });

      function renderList() {
        list.textContent = "";
        var filtered = all.filter(function (it) {
          if (state.index !== null && it.index !== state.index) { return false; }
          if (state.rule !== null && ruleOf(it.t) !== state.rule) { return false; }
          return true;
        });
        if (!filtered.length) {
          list.appendChild(C.empty());
          return;
        }
        filtered.forEach(function (it) { list.appendChild(renderTopic(it.t, it.name)); });
      }

      function chipRow(labelText, items, key) {
        var buttons = [];
        items.forEach(function (it) {
          var b = el("button", {
            class: "chip",
            attrs: { type: "button", "aria-pressed": state[key] === it.value ? "true" : "false" },
            on: {
              click: function () {
                state[key] = it.value;
                buttons.forEach(function (x) {
                  x.b.setAttribute("aria-pressed", x.v === state[key] ? "true" : "false");
                });
                renderList();
              }
            }
          }, it.text);
          buttons.push({ b: b, v: it.value });
        });
        return el("div", { class: "cl-row", attrs: { role: "group", "aria-label": labelText } }, [
          el("span", { class: "cl-label" }, labelText),
          el("div", { class: "cl-chips" }, buttons.map(function (x) { return x.b; }))
        ]);
      }

      var indexRow = chipRow("Index", [
        { value: null, text: "All" },
        { value: "naves", text: "Nave's Topical Bible" },
        { value: "torrey", text: "Torrey's Topical Textbook" }
      ], "index");
      var ruleRow = chipRow("Rule", [{ value: null, text: "All" }].concat(ruleIds.map(function (r) {
        return { value: r, text: r };
      })), "rule");

      container.appendChild(el("div", { class: "cl-filters" }, [indexRow, ruleRow]));
      container.appendChild(list);
      renderList();
    });
  }

  /* ---------- sources view ---------- */

  function bibKey(name, work, edition) {
    return [name, work, edition].join("\u0001");
  }

  function buildBibliography(commentary, structure) {
    var items = [];
    var seen = {};
    function add(name, work, edition, node) {
      var k = bibKey(name, work, edition);
      if (seen[k]) { return; }
      seen[k] = true;
      items.push({ name: name, work: work, edition: edition, node: node });
    }
    commentary.forEach(function (r) {
      add(textOrEmpty(r.author), textOrEmpty(r.work), textOrEmpty(r.edition), r);
    });
    structure.forEach(function (s) {
      add(textOrEmpty(s.proposer), textOrEmpty(s.work),
        s.year != null ? String(s.year) : "", s);
    });
    function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    items.sort(function (a, b) {
      return cmp(a.name, b.name) || cmp(a.work, b.work) || cmp(a.edition, b.edition);
    });
    return items.map(function (it) {
      var n = it.node;
      var sh = n.secondhand && typeof n.secondhand === "object" ? n.secondhand : null;
      var parts = [
        textPart(it.name),
        textPart(it.work),
        textPart(it.edition),
        sh ? lbl("Reported by") : null,
        sh ? textPart(sh.reported_by) : null,
        badgeFor(n.copyright_status),
        sourceLink(n.source_url, "Source")
      ];
      return bibLine(parts, n.citation_only === true);
    });
  }

  function renderSources(container) {
    return Promise.all([
      C.load("method"),
      C.load("rules"),
      C.load("commentary"),
      C.load("structure"),
      C.load("credits")
    ]).then(function (res) {
      var method = res[0] || {};
      var rules = Array.isArray(res[1]) ? res[1] : [];
      var commentary = Array.isArray(res[2]) ? res[2] : [];
      var structure = Array.isArray(res[3]) ? res[3] : [];
      var credits = Array.isArray(res[4]) ? res[4] : [];

      container.appendChild(el("h2", { class: "view-title" },
        typeof method.title === "string" ? method.title : "Sources & Method"));
      (Array.isArray(method.paragraphs) ? method.paragraphs : []).forEach(function (p) {
        container.appendChild(el("p", { class: "method-p" }, textOrEmpty(p)));
      });

      container.appendChild(el("h3", { class: "view-sub" }, "Inclusion rules"));
      if (rules.length) {
        container.appendChild(el("ul", { class: "rules" }, rules.map(function (r) {
          return el("li", { class: "rule" }, [
            el("span", { class: "rule-id" }, textOrEmpty(r.id)),
            el("span", {}, textOrEmpty(r.text))
          ]);
        })));
      } else {
        container.appendChild(C.empty());
      }

      container.appendChild(el("h3", { class: "view-sub" }, "Bibliography"));
      var bib = buildBibliography(commentary, structure);
      if (bib.length) {
        container.appendChild(el("div", { class: "bib-list" }, bib));
      } else {
        container.appendChild(C.empty());
      }

      container.appendChild(el("h3", { class: "view-sub" }, "Licences"));
      if (credits.length) {
        container.appendChild(el("ul", { class: "licences" }, credits.map(function (c) {
          return el("li", { class: "lic" }, [
            el("span", { class: "lic-label" }, textOrEmpty(c.label)),
            el("span", { class: "lic-licence" }, textOrEmpty(c.licence)),
            sourceLink(c.url, "Source")
          ]);
        })));
      } else {
        container.appendChild(C.empty());
      }
    });
  }

  /* ---------- commentators view ---------- */

  function renderCommentators(container) {
    container.appendChild(el("h2", { class: "view-title" }, "Commentators"));
    return C.load("commentary").then(function (rows) {
      container.appendChild(renderCommentaryList(rows || [], { verseFilter: true }));
    });
  }

  /* ---------- exports and registration ---------- */

  C.renderCommentaryCard = renderCommentaryCard;
  C.renderCommentaryList = renderCommentaryList;

  C.registerView("structure", { label: "Structure", render: renderStructure });
  C.registerView("topics", { label: "Topics", render: renderTopics });
  C.registerView("commentators", { label: "Commentators", render: renderCommentators });
  C.registerView("sources", { label: "Sources & Method", render: renderSources });
})();
