"""Build the userscript. Run: python3 src/build.py  (from the repo root or anywhere)."""
import json, re, pathlib
SRC = pathlib.Path(__file__).resolve().parent; ROOT = SRC.parent; D = SRC / 'data'
s = (SRC / 'coach.src.js').read_text()
gl = json.dumps(json.load(open(D / 'glossary.json')), separators=(',', ':'))
built = (s.replace('/*CARDS_JSON*/{}', (D / 'cards.json').read_text())
          .replace('/*GLOSSARY_JSON*/{}', gl)
          .replace('/*RULES_JSON*/{}', (D / 'rules.json').read_text())
          .replace('/*LEGENDS_JSON*/{}', (D / 'legends.json').read_text()))
VERSION = re.search(r"const VERSION = '([\d.]+)'", s).group(1)
RAW = 'https://raw.githubusercontent.com/ins0dus/riftbound-coach/main/rb-coach.user.js'
hdr = f'''// ==UserScript==
// @name         Riftbound Live Coach
// @namespace    rb-coach
// @version      {VERSION}
// @description  Read-only coach for play.riftatlas.com: trigger reminders, step-by-step plays, judge lookups, sideboard advice, Ask box. Never clicks.
// @match        https://play.riftatlas.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      api.anthropic.com
// @connect      workers.dev
// @connect      rb-coach-feedback.nab-iso.workers.dev
// @updateURL    {RAW}
// @downloadURL  {RAW}
// @run-at       document-idle
// ==/UserScript==
'''
(ROOT / 'rb-coach.user.js').write_text(hdr + built)
(ROOT / 'tests' / 'coach2.built.js').write_text(built)
print('built', VERSION)
