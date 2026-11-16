import json
s=open('/home/claude/coach/coach2.src.js').read()
db=open('/home/claude/coach/cards.json').read(); gl=json.dumps(json.load(open('/home/claude/coach/glossary.json')),separators=(',',':'))
built=s.replace('/*CARDS_JSON*/{}',db).replace('/*GLOSSARY_JSON*/{}',gl)
import re as _re
VERSION=_re.search(r"const VERSION = '([\d.]+)'", open('/home/claude/coach/coach2.src.js').read()).group(1)
open('/home/claude/coach/VERSION','w').write(VERSION)
RAW='https://raw.githubusercontent.com/ins0dus/riftbound-coach/main/rb-coach.user.js'
hdr=f'''// ==UserScript==
// @name         Riftbound Live Coach
// @namespace    rb-coach
// @version      {VERSION}
// @description  Read-only coach for play.riftatlas.com: trigger reminders, step-by-step plays, sideboard advice, Ask box. Never clicks.
// @match        https://play.riftatlas.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      api.anthropic.com
// @updateURL    {RAW}
// @downloadURL  {RAW}
// @run-at       document-idle
// ==/UserScript==
'''
open('/home/claude/coach/rb-coach.user.js','w').write(hdr+built)
open('/home/claude/coach/coach2.built.js','w').write(built)
