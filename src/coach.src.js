// Riftbound Live Coach v0.2 — read-only overlay for play.riftatlas.com
// Reads the page, reminds you of every trigger/ability, walks you through plays,
// suggests sideboarding, and answers questions. It never clicks or changes the game.
(function () {
  'use strict';
  const VERSION = '0.11.1';
  if (window.__rbCoach && window.__rbCoach.version === VERSION) { window.__rbCoach.toggle(); return; }
  if (window.__rbCoach && window.__rbCoach.stop) window.__rbCoach.stop();
  document.getElementById('rb-coach')?.remove();

  const CARDS = /*CARDS_JSON*/{};
  const GLOSSARY = /*GLOSSARY_JSON*/{};
  // Official Riftbound Core Rules, split into sections, with a small keyword search (judge mode)
  const RULES = /*RULES_JSON*/{};
  const LEGENDS = /*LEGENDS_JSON*/{}; // every legend: domains, champions, themes and in-domain synergy cards (derived from card text)
  const legendProfile = (name) => LEGENDS[(name || '').toLowerCase().replace(/,/g, '')] || null;
  function profileText(name, who) {
    const L = legendProfile(name); if (!L) return '';
    return `${who} LEGEND PROFILE — ${L.name} (${L.domains.join('/')}): ${L.text}\n  Champions: ${L.champions.map((c) => c[0] + ': ' + c[1]).join(' | ') || '—'}\n  Themes: ${L.themes.join(', ') || '—'}${L.synergy.length ? `\n  Cards that share those themes: ${L.synergy.map((x) => x[0]).join(', ')}` : ''}`;
  }
  const RSTOP = new Set('the a an of to and or in on is it its this that be as at by for with from your you their they them i me my if when can may are was not do does any each all one two then than into'.split(' '));
  const rtok = (x) => (x || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !RSTOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''));
  let RIDX = null;
  function rulesIndex() {
    if (RIDX) return RIDX;
    const docs = (RULES.chunks || []).map(([head, chap, text]) => { const tf = {}; rtok(head + ' ' + head + ' ' + text).forEach((w) => { tf[w] = (tf[w] || 0) + 1; }); return { head, chap, text, tf, len: text.length }; });
    const df = {}; docs.forEach((d) => Object.keys(d.tf).forEach((w) => { df[w] = (df[w] || 0) + 1; }));
    RIDX = { docs, df, N: docs.length }; return RIDX;
  }
  function searchRules(query, maxChars, extraTerms) {
    const ix = rulesIndex(); if (!ix.N) return [];
    const q = rtok(query).concat(rtok(extraTerms || ''));
    const scored = ix.docs.map((d) => { let sc = 0; q.forEach((w) => { if (d.tf[w]) sc += (1 + Math.log(d.tf[w])) * Math.log(1 + ix.N / ix.df[w]); }); if (q.some((w) => rtok(d.head).includes(w))) sc *= 1.5; return [sc / Math.sqrt(1 + d.len / 2000), d]; }).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]);
    const out = []; let n = 0;
    for (const [, d] of scored) { if (n + d.len > (maxChars || 9000)) continue; out.push(d); n += d.len; if (out.length >= 8) break; }
    return out;
  }
  const rulesBlock = (hits) => hits.map((d) => `[${d.chap} > ${d.head}]\n${d.text}`).join('\n\n');

  // ---------------- utilities ----------------
  const norm = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const B = (s) => `<b>${esc(s)}</b>`;
  const short = (n) => { n = n || ''; return n.length <= 18 ? n : n.split(',')[0]; };
  const cache = new Map();
  function card(name) {
    if (!name) return null;
    if (cache.has(name)) return cache.get(name);
    let c = CARDS[norm(name)];
    if (!c && /^gold$/i.test(name)) c = ['Gold', 'Token', null, 0, 0, null, 'Reaction: kill this, exhaust: add 1 Power of any domain.'];
    const o = c ? {
      name: c[0], type: c[1] || '', domain: c[2] || '', e: c[3] || 0, p: c[4] || 0, might: c[5] || 0, text: c[6] || '',
    } : null;
    if (o) {
      o.isUnit = /unit|champion/i.test(o.type) && !/legend/i.test(o.type);
      o.isGear = /gear|token/i.test(o.type) && !o.isUnit;
      o.isSpell = /spell/i.test(o.type);
      o.isLegend = /legend/i.test(o.type);
      o.isBF = /battlefield/i.test(o.type);
    }
    cache.set(name, o);
    return o;
  }
  const store = {
    get(k, d) { try { if (typeof GM_getValue === 'function') return GM_getValue(k, d); const v = localStorage.getItem('rbcoach:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (typeof GM_setValue === 'function') return GM_setValue(k, v); localStorage.setItem('rbcoach:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  // first sentence(s) of a card's text that match a trigger phrase
  function sentence(text, re) {
    const parts = (text || '').split(/(?<=[.)])\s+(?=[A-Z[])/);
    const i = parts.findIndex((s) => re.test(s));
    if (i < 0) return '';
    let s = parts[i];
    if (/(:|—|-)\s*$/.test(s) || /choose one/i.test(s)) s += ' ' + (parts[i + 1] || '');
    return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  }

  // ---------------- deck knowledge: Inverted Mask ----------------
  const MAIN = { 'Tideturner': 3, 'Scuttle Crab': 3, 'Reckless Innovator': 3, 'Akali, Silent': 1, 'Vex, Apathetic': 1, 'Riven, Deserter': 2, 'Neeko, Blending In': 2, 'Heartening Soul': 1, 'Guardian Angel': 3, 'Defiant Dance': 3, 'Discipline': 3, 'Hunker Down': 2, 'En Garde': 2, 'Ki Burst': 1, 'Life from Stone': 1, 'Defy': 3, 'Not So Fast': 2, 'Ride the Wind': 1, 'Gust': 1, 'Star-Crossed': 1 };
  const SIDE = { 'Back Off': 2, 'Charm': 2, 'Rune Prison': 1, 'Adaptatron': 1, 'Vex, Apathetic': 1, 'Gust': 1, 'Star-Crossed': 1, 'Royal Entourage': 1 };
  const MY_DECK = new Set([...Object.keys(MAIN), ...Object.keys(SIDE), 'Irelia, Fervent', 'Gold', 'Boots of Swiftness', 'Hall of Legends', 'Abandoned Hall', "Targon's Peak", 'Sunken Temple'].map(norm));
  const KEY_UNITS = ['Irelia, Fervent', 'Riven, Deserter', 'Neeko, Blending In', 'Heartening Soul', 'Akali, Silent', 'Vex, Apathetic'];
  const PUMPS = { 'Defiant Dance': 2, 'Discipline': 2, 'En Garde': 1 };
  // any spell in hand that gives a unit +N Might this turn (works for every deck, not just Inverted Mask)
  function pumpsInHand(st, inFight) {
    const out = {};
    [...new Set(st.hand)].forEach((n) => {
      if (PUMPS[n] != null) { out[n] = PUMPS[n]; return; }
      const c = card(n); if (!c || !c.isSpell) return;
      const m = c.text.match(/give (?:a|an|one|target)?\s*(?:friendly )?unit(?: you control)? \+(\d+) \[?might\]? this turn/i); if (!m) return;
      if (inFight && !/\b(REACTION|ACTION)\b/.test(c.text)) return; // only Reactions/Actions can be played in a showdown
      out[n] = +m[1];
    });
    return out;
  }
  const CHOOSERS = ['En Garde', 'Discipline', 'Defiant Dance']; // cheap ways to "choose a friendly unit" (Irelia legend)
  // value used to rank what to play
  const PLAY_VALUE = { 'Neeko, Blending In': 9, 'Heartening Soul': 9, 'Irelia, Fervent': 8.5, 'Riven, Deserter': 8, 'Akali, Silent': 6, 'Vex, Apathetic': 6, 'Royal Entourage': 5, 'Reckless Innovator': 5, 'Adaptatron': 4, 'Tideturner': 3, 'Scuttle Crab': 3, 'Guardian Angel': 3.5 };

  // ---------------- state reader ----------------
  let prevHandCount = {}, leftHand = {}, chainOwner = {};
  function readState() {
    const q = (s, r = document) => [...r.querySelectorAll(s)];
    const room = document.querySelector('[data-testid="game-state"]');
    if (!room) return null;
    const A = (k) => room.getAttribute(k);
    const viewer = A('data-viewer-player-id');
    const st = {
      room: A('data-room-code') || (document.querySelector('[data-room-code]') || {}).getAttribute?.('data-room-code') || 'room',
      phase: A('data-room-phase') || '', mode: A('data-room-mode') || '',
      turn: +A('data-turn-number') || 0, myTurn: A('data-active-player-id') === viewer, viewer,
      myScore: +A('data-viewer-score') || 0, oppScore: +A('data-opponent-score') || 0,
      step: (document.querySelector('[data-turn-step]') || null)?.getAttribute('data-turn-step') || '',
      hand: [], champion: [], legends: [], oppLegends: [], units: [], gear: [], hidden: [], runes: [],
      bf: {}, chain: [], log: [], floatE: 0, floatP: 0,
    };
    st.solo = /single|goldfish|solo/i.test(st.mode);
    // hand (dedupe by card id; skip card backs)
    const seenHand = new Set();
    q('[data-drop-zone="hand"][data-card-id]').forEach((el) => {
      const id = el.getAttribute('data-card-id'); if (seenHand.has(id)) return; seenHand.add(id);
      if (el.closest('[data-zone-owner="opponent"],[data-player-layer="opponent"],[data-visual-owner="opponent"],[role="dialog"]')) return; // revealed opponent cards
      const img = q('img', el).find((i) => i.alt && i.alt !== 'Hidden card'); if (img) st.hand.push(img.alt);
    });
    // log (newest first)
    q('[data-log-action-kind]').slice(0, 40).forEach((e) => {
      const row = e.closest('li') || e.parentElement || e;
      const text = (row.innerText || row.textContent || '').replace(/\s+/g, ' ').replace(/^\d{1,2}:\d\d\s*/, '').replace(/\s+\./g, '.').replace(/×\d+$/, '').trim();
      const tp = e.closest('[data-turn-player-id]')?.getAttribute('data-turn-player-id');
      st.log.push({ text, kind: e.getAttribute('data-log-action-kind'), mine: tp ? tp === viewer : null });
    });
    const rev = st.log.slice(0, 15).find((l) => /^Revealed their hand:/.test(l.text));
    if (rev) rev.text.replace(/^Revealed their hand:\s*/, '').split(/\s+,\s*/).map((n) => n.replace(/\.$/, '').trim()).forEach((n) => {
      if (MY_DECK.has(norm(n))) return; const i = st.hand.indexOf(n); if (i >= 0) st.hand.splice(i, 1);
    });
    // board cards (dedupe by card id)
    const seen = new Set();
    q('[data-board-card-visual]').forEach((el) => {
      const id = el.getAttribute('data-card-id') || '';
      if (id && seen.has(id)) return; seen.add(id);
      const zone = el.getAttribute('data-drop-zone') || el.closest('[data-drop-zone]')?.getAttribute('data-drop-zone') || '';
      if (zone === 'hand') return;
      const mine = el.getAttribute('data-visual-owner') === 'self';
      const name = (el.querySelector('img') || {}).alt || '';
      const ready = el.getAttribute('data-exhausted') !== 'true';
      const faceDown = el.getAttribute('data-face-down') === 'true' || name === 'Hidden card';
      const o = { id, name, zone, mine, ready, faceDown, c: card(name), sim: simData(el, id) };
      if (zone === 'runeArea') { if (mine) st.runes.push({ id, ready, domain: /calm/i.test(name) ? 'calm' : /chaos/i.test(name) ? 'chaos' : norm(name).replace('rune', '') }); return; }
      if (zone === 'legend') { (mine ? st.legends : st.oppLegends).push(o); return; }
      if (zone === 'champion') { if (mine && !faceDown) st.champion.push(name); return; }
      if (faceDown) { st.hidden.push(o); return; }
      if (o.c && o.c.isGear) st.gear.push(o); else st.units.push(o);
    });
    // battlefields
    q('[data-battlefield-marker^="battlefield"]').forEach((m) => {
      const id = m.getAttribute('data-battlefield-marker');
      const nm = (m.querySelector('img') || {}).alt || id;
      st.bf[id] = { id, name: /hidden battlefield/i.test(nm) ? (id === 'battlefieldA' ? 'Battlefield A' : 'Battlefield B') : nm, real: !/hidden battlefield/i.test(nm), mine: 0, theirs: 0 };
    });
    q('[data-battlefield-might-value]').forEach((v) => {
      const zone = v.closest('[data-battlefield-might-zone]')?.getAttribute('data-battlefield-might-zone');
      const side = v.closest('[data-might-side]')?.getAttribute('data-might-side') || '';
      if (zone && st.bf[zone]) st.bf[zone].simSeen = true; if (zone && st.bf[zone]) st.bf[zone][side === 'self' ? 'mine' : 'theirs'] = +(v.getAttribute('data-battlefield-might-value') || v.textContent.trim()) || 0;
    });
    Object.values(st.bf).forEach((b) => {
      b.myUnits = st.units.filter((u) => u.mine && u.zone === b.id);
      b.theirUnits = st.units.filter((u) => !u.mine && u.zone === b.id);
      b.controller = b.myUnits.length && !b.theirUnits.length ? 'me' : b.theirUnits.length && !b.myUnits.length ? 'them' : b.myUnits.length ? 'contested' : 'none';
      b.myHidden = st.hidden.some((h) => h.mine && h.zone === b.id);
    });
    const ctr = readCounters();
    st.units.forEach((u) => { const c = ctr[u.id]; if (!c) return; u.sim = u.sim || {}; if (c.white != null && u.sim.white == null) u.sim.white = c.white; if (c.red != null && u.sim.red == null) u.sim.red = c.red; });
    st.turnMods = trackTurnMods(st);
    computeMight(st);
    // chain
    // who owns a chain item? The page doesn't say, so: a card that just left YOUR hand is yours.
    const handCount = {}; st.hand.forEach((n) => { handCount[n] = (handCount[n] || 0) + 1; });
    for (const n in prevHandCount) if ((handCount[n] || 0) < prevHandCount[n]) leftHand[n] = Date.now();
    prevHandCount = handCount;
    const seenItem = new Set(), occ = {};
    q('[data-chain-drop] img').forEach((i) => {
      if (!i.alt || i.alt === 'Hidden card') return;
      const holder = i.closest('[data-card-id]') || i.parentElement;
      if (seenItem.has(holder)) return; seenItem.add(holder);
      const own = i.closest('[data-visual-owner]')?.getAttribute('data-visual-owner');
      if (st.chain.length && st.chain[st.chain.length - 1].name === i.alt) return; // the page draws some chain cards twice
      occ[i.alt] = (occ[i.alt] || 0) + 1;
      const key = i.alt + '#' + occ[i.alt];
      const mine = own ? own === 'self' : key in chainOwner ? chainOwner[key] : (chainOwner[key] = st.solo || Date.now() - (leftHand[i.alt] || 0) < 9000);
      st.chain.push({ name: i.alt, mine, c: card(i.alt), _h: holder, _p: holder.parentElement, _guessed: !own && !st.solo });
    });
    if (!st.chain.length) chainOwner = {};
    const fe = document.querySelector('[data-resources-summary-energy]'); if (fe) st.floatE = +fe.textContent.trim() || 0;
    const fp = document.querySelector('[data-resources-summary-power]'); if (fp) st.floatP = +fp.textContent.trim() || 0;
    st.approve = q('button').some((b) => /^approve/i.test((b.innerText || '').trim()));
    st.ready = st.runes.filter((r) => r.ready).length;
    st.myUnits = st.units.filter((u) => u.mine);
    st.theirUnits = st.units.filter((u) => !u.mine);
    st.gameOver = st.myScore >= 8 || st.oppScore >= 8;
    st.inverted = st.legends.some((l) => /irelia/i.test(l.name)) || st.champion.some((n) => /irelia/i.test(n));
    st.legendNames = st.legends.map((l) => l.name);
    st.readIssues = readChecks(st);
    return st;
  }

  // ---------------- mana ----------------
  function domainsOf(c) { const d = (c && c.domain || '').toLowerCase(); return /calm|chaos|fury|mind|body|order/.test(d) ? d.split(/\s+/) : null; }
  // Energy = tap ready runes. Power = recycle a rune of that domain (ready or exhausted).
  function plan(st, e, p, domains, extraUsed) {
    // Energy: tap ready runes. Power: recycle runes of that domain — ready OR exhausted,
    // including a rune you just tapped for Energy (one Calm rune can pay 1 Energy + 1 Calm Power).
    extraUsed = extraUsed || { ready: 0 };
    e = Math.max(0, e - st.floatE); p = Math.max(0, p - st.floatP);
    const match = (r) => !domains || domains.includes(r.domain);
    const dom = st.runes.filter(match);
    if (p > dom.length) return null;
    if (e > st.ready - (extraUsed.ready || 0)) return null;
    const dname = domains ? domains.map((d) => d[0].toUpperCase() + d.slice(1)).join('/') : 'any';
    const exD = dom.filter((r) => !r.ready).length;
    const bits = [];
    if (e) bits.push(`tap ${e} rune${e > 1 ? 's' : ''}`);
    if (p) bits.push(`recycle ${p} ${dname} rune${p > 1 ? 's' : ''}${exD >= p ? ' (an exhausted one is fine)' : ' (tap it first, then recycle it)'}`);
    return { e, p, readyCost: e, text: bits.join(' + ') || 'free' };
  }
  const planCard = (st, name, used) => { const c = card(name); return c ? plan(st, c.e, c.p, domainsOf(c), used) : null; };
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const factSeen = new Set();
  function factLog(st, src, line, why) {
    const k = st.turn + '|' + src + '|' + line; if (factSeen.has(k)) return; factSeen.add(k);
    try { learn.add({ type: 'factcheck', src, line, why, at: new Date().toISOString().slice(0, 16), version: VERSION, ...learn.snap(st) }); } catch (e) { /* learn not ready */ }
  }
  // ---------------- fact-checker ----------------
  // Every line of advice (quick rules and AI) is checked against the board, the card text and the timing rules
  // before it is shown. A line that fails is hidden (quick rules) or replaced by a warning (AI).
  const lc = (x) => String(x || '').toLowerCase();
  function mentions(text, name) {
    const t = lc(text).replace(/,/g, ''); if (t.includes(lc(name).replace(/,/g, ''))) return true;
    const sh = lc(short(name)); return sh.length >= 5 && sh !== lc(name) && new RegExp('\\b' + sh.replace(/[^a-z0-9 ]/g, '.') + '\\b').test(t);
  }
  const isFastSpeed = (c) => /\bREACTION\b/.test(c.text) || (/\bACTION\b/.test(c.text) && !/\bREACTION\b/.test(c.text));
  function inShowdown(st) { return Object.values(st.bf).some((b) => b.myUnits.length && b.theirUnits.length); }
  function counterProblem(cc, target) {
    const tc = target && target.c; if (!tc) return null;
    if (!/\bcounter\b/i.test(cc.text)) return null;
    if (/counter (a|target) spell|counter a spell/i.test(cc.text) && !tc.isSpell) return `${cc.name} only counters spells — ${tc.name} is a ${tc.type || 'card'}`;
    const lim = cc.text.match(/costs no more than \[(\d+)\](?: and no more than ((?:\[rune\]\s*)+))?/i);
    if (lim) { if ((tc.e || 0) > +lim[1]) return `${cc.name} can only counter spells costing ${lim[1]} Energy or less — ${tc.name} costs ${tc.e}`; const pr = lim[2] ? (lim[2].match(/\[rune\]/gi) || []).length : null; if (pr != null && (tc.p || 0) > pr) return `${cc.name} can only counter spells with ${pr} Power or less — ${tc.name} needs ${tc.p}`; }
    const hush = cc.text.match(/Power cost ((?:\[rune\]\s*)+) or more/i); if (hush && (tc.p || 0) < (hush[1].match(/\[rune\]/gi) || []).length) return `${cc.name} only counters spells with ${(hush[1].match(/\[rune\]/gi) || []).length}+ Power`;
    if (/Counter an enemy spell or ability that chooses a friendly/i.test(cc.text) && target.mine) return `${cc.name} only counters enemy spells`;
    return null;
  }
  function factCheck(st, text) {
    const t = String(text || ''); if (!st || !st.turn || !t) return null;
    const holdLine = /\b(keep|hold|save|skip|don't|do not|nothing|no way|watch)\b/i.test(t);
    const handNames = [...new Set([...st.hand, ...st.champion])];
    const named = handNames.filter((n) => mentions(t, n));
    // a card from my deck that isn't in hand or on board
    const known = new Set([...handNames, ...st.units.map((u) => u.name), ...st.gear.map((g) => g.name), ...st.legendNames, ...st.chain.map((c) => c.name)].map(norm));
    const deckOnly = [...MY_DECK].map((k) => (CARDS[k] || [])[0]).filter((n) => n && n.length > 3 && !known.has(norm(n)) && mentions(t, n) && card(n) && !card(n).isLegend && !card(n).isBF);
    // "Play X" where X is any real card that isn't in hand
    const pm = t.match(/\bplay ([A-Z][A-Za-z' ,-]{2,40})/);
    if (pm) { const words = pm[1].replace(/,/g, '').split(/\s+/); for (let k = Math.min(4, words.length); k >= 1; k--) { const cand = card(words.slice(0, k).join(' ')); if (cand && !cand.isLegend && !cand.isBF && !/^gold$/i.test(cand.name)) { if (!handNames.some((h) => norm(h) === norm(cand.name))) deckOnly.push(cand.name); break; } } }
    if (deckOnly.length && !/(draw|deck|top|search|sideboard|recycle|in hand later)/i.test(t)) return `${deckOnly[0]} isn't in your hand`;
    const fast = !st.myTurn || st.chain.length > 0 || inShowdown(st);
    const used = { ready: 0 };
    for (const n of named) {
      const c = card(n); if (!c) continue;
      if (holdLine) { if (!st.myTurn && !isFastSpeed(c) && !/\bkeep\b|\bsave\b/i.test(t)) return `${n} can't be played on the opponent's turn`; continue; }
      if (fast && !isFastSpeed(c)) return `${n} can't be played right now — ${c.isSpell ? 'it isn\'t a Reaction/Action' : 'units and gear are played on your turn with nothing on the chain'}`;
      const pl = planCard(st, n, used); if (!pl) return `can't pay for ${n} (${costTxt(c)}) with ${st.ready - used.ready} ready rune(s)`;
      used.ready += pl.readyCost;
      const enemy = st.chain.filter((x) => !x.mine); const tgt = enemy.find((x) => mentions(t, x.name)) || (/\bcounter\b/i.test(c.text) ? enemy[enemy.length - 1] : null);
      const cp = tgt ? counterProblem(c, tgt) : null; if (cp) return cp;
      const rock = Object.values(st.bf).find((b) => /rockfall path/i.test(b.name) && mentions(t, b.name));
      if (rock && c.isUnit && new RegExp('play[^.]*' + lc(short(n)).replace(/[^a-z0-9 ]/g, '.') + '[^.]*(to|→|at) rockfall', 'i').test(t)) return `units can't be played to Rockfall Path`;
    }
    // moves: "Move X → BF" / "Move X to BF"
    const mv = t.match(/\bmove ([^→]+?)\s*(?:→|to)\s*([A-Z][^(+,.]+)/i);
    if (mv && !holdLine) {
      const u = st.myUnits.find((x) => mentions(mv[1], x.name));
      if (u && !u.ready) return `${short(u.name)} is exhausted and can't move`;
      if (u && st.bf[u.zone] && lc(mv[2]).includes(lc(st.bf[u.zone].name))) return `${short(u.name)} is already at ${st.bf[u.zone].name}`;
    }
    return null;
  }

  const costTxt = (c) => `${c.e || 0} Energy${c.p ? ` + ${c.p} ${(domainsOf(c) || ['any']).map(cap).join('/')} Power` : ''}`;

  // cards played this turn that change Might of a whole side ("give enemy units -3 [might] this turn, to a minimum of 1")
  const TURN_MODS = { turn: -1, list: [], seen: new Set() };
  function trackTurnMods(st) {
    if (TURN_MODS.turn !== st.turn) { TURN_MODS.turn = st.turn; TURN_MODS.list = []; TURN_MODS.seen = new Set(); }
    const counts = {};
    (st.log || []).slice(0, 25).forEach((l) => {
      const m = l.text.match(/^Played (.+?)(?: from .*)?\.$/); if (!m) return;
      const c = card(m[1].replace(/ from (hand|trash|base|.*)$/, '')); if (!c) return;
      const mm = c.text.match(/give (enemy|your|friendly|all) units ([+-]\d+) \[?might\]? this turn(?:, to a minimum of (\d+) \[?might\]?)?/i); if (!mm) return;
      counts[c.name] = (counts[c.name] || 0) + 1; const key = c.name + '#' + counts[c.name]; if (TURN_MODS.seen.has(key)) return; TURN_MODS.seen.add(key);
      const byMe = l.mine === true ? true : l.mine === false ? false : !st.myTurn ? false : true;
      const who = mm[1].toLowerCase(); const mineSide = who === 'enemy' ? !byMe : who === 'all' ? null : byMe;
      const ids = st.units.filter((u) => mineSide === null || u.mine === mineSide).map((u) => u.id);
      TURN_MODS.list.push({ name: c.name, delta: +mm[2], min: mm[3] != null ? +mm[3] : null, ids });
    });
    return TURN_MODS.list;
  }
  // ---------------- Might engine ----------------
  // The sim stores per-card state in React props: temporaryMightBuff ("Buff N" label),
  // whiteCounter / redCounter (manual counters) and attachedToCardId (equipped gear).
  function simData(el, id) {
    const out = {};
    try {
      const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let f = fk ? el[fk] : null;
      for (let i = 0; f && i < 30; i++, f = f.return) {
        const pr = f.memoizedProps; if (!pr || typeof pr !== 'object') continue;
        for (const v of Object.values(pr)) {
          if (v && typeof v === 'object' && v.id === id && ('might' in v || 'temporaryMightBuff' in v || 'attachedToCardId' in v)) {
            out.buff = typeof v.temporaryMightBuff === 'number' ? Math.trunc(v.temporaryMightBuff) : 0;
            if (typeof v.whiteCounter === 'number') out.white = v.whiteCounter;
            if (typeof v.redCounter === 'number') out.red = v.redCounter;
            if (v.attachedToCardId) out.attachedTo = v.attachedToCardId;
            if (typeof v.might === 'number') out.printed = v.might;
            out.ok = true; return out;
          }
        }
      }
    } catch (e) { /* ignore */ }
    // DOM fallback: the "Buff N" label on the card
    const lab = (el.innerText || el.textContent || '').match(/Buff\s+(-?\d+)/); if (lab) { out.buff = +lab[1]; out.ok = true; }
    return out;
  }
  function readCounters() {
    const out = {};
    document.querySelectorAll('[data-card-counter-card-id]').forEach((e) => {
      const id = e.getAttribute('data-card-counter-card-id'); const kind = e.getAttribute('data-card-counter') || 'white';
      const disp = e.querySelector('[data-card-counter-display]') || e; const n = parseInt((disp.textContent || '').replace(/[^\d-]/g, ''), 10);
      if (id && Number.isFinite(n)) { out[id] = out[id] || {}; out[id][kind] = n; }
    });
    return out;
  }
  const kwNum = (text, kw) => { const m = (text || '').match(new RegExp('\\b' + kw + '(?:\\s+(\\d+))?\\b')); return m ? (+m[1] || 1) : 0; };
  const isChamp = (u) => /champion/i.test((u.c && u.c.type) || '');
  const isToken = (u) => /token/i.test((u.c && u.c.type) || '') || /recruit|sprite|sand soldier|mech|tentacle/i.test(u.name);
  const bfOwnerBefore = {}; // battlefield id -> 'me' | 'them' before the current fight (decides attacker/defender)
  function unitMight(st, u, zone, role, sources) {
      const parts = []; const add = (n, why, base) => { if (n) parts.push([n, why, !!base]); };
      const printed = (u.sim && typeof u.sim.printed === 'number') ? u.sim.printed : (u.c ? u.c.might : 0) || 0;
      const b = st.bf[zone]; const att = role === 'attacking', def = role === 'defending';
      const mates = b ? st.units.filter((x) => x.mine === u.mine && (x.zone === zone || x === u)) : [];
      const white = u.sim && typeof u.sim.white === 'number' ? u.sim.white : null;
      if (white != null) { // RiftAtlas Might counter on the card = its current total
        add(white, 'Might counter', true);
        if (att) add(kwNum((u.c && u.c.text) || '', 'ASSAULT'), 'Assault');
        if (def) add(kwNum((u.c && u.c.text) || '', 'SHIELD'), 'Shield');
        return { tot: Math.max(0, parts.reduce((a, p) => a + p[0], 0)), base: white, parts };
      }
      add(printed, 'printed', true);
      // equipped gear
      st.gear.forEach((g) => {
        const on = g.sim && g.sim.attachedTo ? g.sim.attachedTo === u.id : attached.get(g.name) === u.name && u.mine === g.mine;
        if (!on || !g.c) return;
        const m = g.c.text.match(/EQUIP[^.]*?\+(\d+)\s*\[?might/i); if (m) add(+m[1], g.name, true); else if (g.c.might) add(g.c.might, g.name, true); // gear with a Might stat (e.g. Blade of the Exile +3)
        const ga = kwNum(g.c.text.replace(/^EQUIP[^.]*\./i, ''), 'ASSAULT'); if (ga && att) add(ga, g.name + ' (Assault)');
      });
      // sim state
      if (u.sim && u.sim.buff) add(u.sim.buff, 'Buff (this turn)', true);
      // own keywords and conditions
      const t = (u.c && u.c.text) || '';
      if (att) add(kwNum(t, 'ASSAULT'), 'Assault');
      if (def) add(kwNum(t, 'SHIELD'), 'Shield');
      let m;
      if (b && (m = t.match(/While you have another unit here, I have \+(\d+)/i)) && mates.length > 1) add(+m[1], 'another unit here');
      if (b && (m = t.match(/While there are 2 or more other friendly units and\/or gear at my battlefield, I have \+(\d+)/i))) { const n = mates.length - 1 + st.gear.filter((g) => g.zone === zone && g.mine === u.mine).length; if (n >= 2) add(+m[1], '2+ friends here'); }
      if (/I have \+1 \[?might\]? for each other exhausted unit you control/i.test(t)) add(st.units.filter((x) => x.mine === u.mine && x !== u && !x.ready).length, 'exhausted friends');
      if (/I have \+1 \[?might\]? for each token unit/i.test(t)) add(st.units.filter((x) => x.mine === u.mine && isToken(x)).length, 'tokens');
      // auras from other cards
      sources.forEach((sr) => {
        if (sr.x === u) return;
        const tx = sr.text; let mm;
        if (sr.kind === 'bf') {
          if (sr.zone !== zone) return;
          if ((mm = tx.match(/^Units here have \+(\d+)/i))) add(+mm[1], sr.name);
          if ((mm = tx.match(/Champion units here have \+(\d+)/i)) && isChamp(u)) add(+mm[1], sr.name);
          if ((mm = tx.match(/Units here with (\w+) have \+(\d+)/i)) && new RegExp('\\b' + mm[1] + '\\b').test(t)) add(+mm[2], sr.name);
          if (/While a unit here is defending alone, it has -2/i.test(tx) && def && mates.length === 1) add(-2, sr.name + ' (alone)');
          return;
        }
        if (sr.mine !== u.mine) return;
        if ((mm = tx.match(/Other friendly units have \+(\d+)\s*\[?might\]?\s*here/i)) && sr.zone === zone) add(+mm[1], short(sr.name));
        if ((mm = tx.match(/Friendly units here have ASSAULT(?:\s+(\d+))?/i)) && sr.zone === zone && att) add(+mm[1] || 1, short(sr.name));
        if ((mm = tx.match(/Your token units have \+(\d+)/i)) && isToken(u)) add(+mm[1], short(sr.name));
        if (sr.kind === 'gear' && (mm = tx.match(/^(?:.*?\.\s*)?Your units have \+(\d+)/i)) && !/EMPOWER/i.test(tx)) add(+mm[1], short(sr.name));
      });
      sources.forEach((sr) => { if (sr.kind !== 'legend' || sr.mine !== u.mine) return; let mm;
        if ((mm = sr.text.match(/While a friendly unit defends alone, it gets \+(\d+)/i)) && def && mates.length === 1) add(+mm[1], short(sr.name) + ' (defending alone)'); });
      // "this turn" Might changes from cards played this turn (e.g. Thousand-Tailed Watcher: enemy units -3, min 1)
      (st.turnMods || []).forEach((tm) => { if (!tm.ids.includes(u.id)) return; const cur = parts.reduce((a, p) => a + p[0], 0); let d = tm.delta; if (tm.min != null && d < 0) d = Math.max(d, Math.min(0, tm.min - cur)); add(d, tm.name + ' (this turn)'); });
      const tot = parts.reduce((a, p) => a + p[0], 0);
      return { tot: Math.max(0, tot), base: parts.filter((p) => p[2]).reduce((a, p) => a + p[0], 0), parts };
  }
  // Might a unit would have if it moved to another battlefield (as attacker there)
  const mightAt = (st, u, zone, role) => unitMight(st, u, zone, role, st._mightSources || []).tot;
  function computeMight(st) {
    const units = st.units;
    const byId = {}; [...units, ...st.gear].forEach((x) => { byId[x.id] = x; });
    Object.values(st.bf).forEach((b) => { if (b.controller === 'me' || b.controller === 'them') bfOwnerBefore[b.id] = b.controller; else if (b.controller === 'none') delete bfOwnerBefore[b.id]; });
    // static sources: every face-up unit, unattached gear and battlefield on the board
    const sources = [];
    units.forEach((u) => { if (u.c) sources.push({ kind: 'unit', x: u, mine: u.mine, zone: u.zone, text: u.c.text, name: u.name }); });
    st.gear.forEach((g) => { if (g.c && !(g.sim && g.sim.attachedTo)) sources.push({ kind: 'gear', x: g, mine: g.mine, zone: g.zone, text: g.c.text, name: g.name }); });
    Object.values(st.bf).forEach((b) => { const c = card(b.name); if (c) sources.push({ kind: 'bf', zone: b.id, text: c.text, name: b.name }); });
    [...st.legends.map((l) => [l, true]), ...st.oppLegends.map((l) => [l, false])].forEach(([l, mine]) => { const c = card(l.name); if (c) sources.push({ kind: 'legend', mine, text: c.text, name: l.name }); });
    st._mightSources = sources;
    units.forEach((u) => {
      const b = st.bf[u.zone];
      const contested = b && b.myUnits.length && b.theirUnits.length;
      const def = contested ? (bfOwnerBefore[b.id] ? (bfOwnerBefore[b.id] === 'me') === u.mine : u.mine !== st.myTurn) : false;
      u.role = contested ? (def ? 'defending' : 'attacking') : '';
      const r = unitMight(st, u, u.zone, u.role, sources);
      u.mightNow = r.tot; u.mightParts = r.parts; u.mightBase = r.base;
      if (u.sim && u.sim.red > 0) u.damage = u.sim.red;
    });
    Object.values(st.bf).forEach((b) => {
      b.calcMine = b.myUnits.reduce((a, u) => a + u.mightNow, 0);
      b.calcTheirs = b.theirUnits.reduce((a, u) => a + u.mightNow, 0);
      b.simMine = b.mine; b.simTheirs = b.theirs;
      // RiftAtlas's battlefield number is what the players actually set up (counters, buffs): it is the truth.
      // Our own total is only used to point out effects nobody has added yet.
      // RiftAtlas sometimes shows 0 vs 0 while a fight is being set up: then use our own totals
      if (b.myUnits.length && b.theirUnits.length && !b.simMine && !b.simTheirs) { b.simUnset = true; b.mine = b.calcMine; b.theirs = b.calcTheirs; }
      b.missingMine = b.myUnits.length ? b.calcMine - b.simMine : 0;
      b.missingTheirs = b.theirUnits.length ? b.calcTheirs - b.simTheirs : 0;
    });
  }
  // ---------------- board-reading self-check ----------------
  // Cross-checks what the coach read against RiftAtlas's own numbers. When something doesn't add up,
  // advice is marked "check the board" instead of being stated confidently.
  function readChecks(st) {
    const out = [];
    const unknown = [...st.units, ...st.gear].filter((x) => !x.faceDown && x.name && !x.c).map((x) => x.name);
    if (unknown.length) out.push(`can't read card text for ${[...new Set(unknown)].slice(0, 2).join(', ')}`);
    Object.values(st.bf).forEach((b) => {
      [['mine', b.myUnits, b.simMine], ['theirs', b.theirUnits, b.simTheirs]].forEach(([side, us, sim]) => {
        if (!us.length || !b.simSeen || b.simUnset || sim == null || !Number.isFinite(sim)) return;
        const base = us.reduce((a, u) => a + (u.mightBase != null ? u.mightBase : might(u)), 0);
        if (sim < base - 0 && Math.abs(sim - base) >= 2) out.push(`${side === 'mine' ? 'your' : 'their'} Might at ${b.name}: RiftAtlas shows ${sim}, cards add up to ${base}`);
      });
    });
    const guessed = st.chain.filter((c) => c._guessed).length; if (guessed) out.push('not sure who owns a card on the chain');
    if (st.turn && !st.runes.length && st.turn > 2) out.push('no runes found on your side');
    return out;
  }
  // ---------------- fight forecast ----------------
  // Predicts a fight with the rules: attack/defend damage triggers resolve first (using Might at resolution),
  // lethal damage kills in the cleanup, then combat damage (units that "don't deal combat damage" add nothing),
  // each side assigns lethal damage in full unit by unit, then survivors decide: one side left wins; both left = attackers recalled.
  function predictFight(st, b) {
    if (!b || !b.myUnits.length || !b.theirUnits.length) return null;
    const meDef = bfOwnerBefore[b.id] ? bfOwnerBefore[b.id] === 'me' : !st.myTurn;
    const bfText = ((card(b.name) || {}).text) || '';
    const shield = (bfText.match(/When you defend here, choose a unit\. It gains SHIELD (\d+)/i) || [])[1];
    const run = (shieldPick) => {
      const mk = (u, role) => ({ u, name: short(u.name), side: u.mine ? 'me' : 'them', role, m: mightAt(st, u, b.id, role) + (shieldPick === u ? +shield : 0), dmg: (u.sim && u.sim.red) || 0, text: (u.c && u.c.text) || '', dead: false });
      const A = (meDef ? b.theirUnits : b.myUnits).map((u) => mk(u, 'attacking'));
      const D = (meDef ? b.myUnits : b.theirUnits).map((u) => mk(u, 'defending'));
      const log = [];
      const trig = (list, foes, role) => list.forEach((x) => {
        const re = new RegExp('when i (?:' + (role === 'attacking' ? 'attack' : 'defend') + '|attack or defend)[^.]*deal damage equal to my might to (all enemy units|an enemy unit) here', 'i');
        const mm = x.text.match(re); if (!mm || x.dead) return;
        if (/all enemy/i.test(mm[1])) { foes.filter((f) => !f.dead).forEach((f) => { f.dmg += x.m; }); log.push(`${x.name}'s trigger deals ${x.m} to each enemy unit`); }
        else { const t = foes.filter((f) => !f.dead).sort((p1, p2) => (p1.m - p1.dmg) - (p2.m - p2.dmg)).find((f) => f.m - f.dmg <= x.m) || foes.filter((f) => !f.dead)[0]; if (t) { t.dmg += x.m; log.push(`${x.name}'s trigger deals ${x.m} to ${t.name}`); } }
      });
      trig(A, D, 'attacking'); trig(D, A, 'defending');
      const cleanup = () => [...A, ...D].forEach((x) => { if (!x.dead && x.dmg > 0 && x.dmg >= x.m) { x.dead = true; log.push(`${x.name} dies (${x.dmg} damage ≥ ${x.m} Might)`); } });
      cleanup();
      const dealers = (list) => list.filter((x) => !x.dead && !/I don't deal combat damage/i.test(x.text)).reduce((a, x) => a + Math.max(0, x.m), 0);
      const aliveA = A.filter((x) => !x.dead), aliveD = D.filter((x) => !x.dead);
      if (aliveA.length && aliveD.length) {
        const assign = (amount, targets) => { let left = amount; [...targets].sort((p1, p2) => (p1.m - p1.dmg) - (p2.m - p2.dmg)).forEach((t) => { const need = Math.max(1, t.m - t.dmg); if (left >= need) { t.dmg += need; left -= need; } else if (left > 0) { t.dmg += left; left = 0; } }); };
        const aSum = dealers(aliveA), dSum = dealers(aliveD);
        log.push(`combat: attackers deal ${aSum}, defenders deal ${dSum}`);
        assign(aSum, aliveD); assign(dSum, aliveA); cleanup();
      }
      const leftA = A.filter((x) => !x.dead), leftD = D.filter((x) => !x.dead);
      const atkMe = !meDef;
      let result;
      if (leftA.length && !leftD.length) result = atkMe ? `You win and conquer ${b.name}` : `They win and take ${b.name}`;
      else if (!leftA.length && leftD.length) result = atkMe ? `You lose — they keep ${b.name}` : `You win and keep ${b.name}`;
      else if (!leftA.length && !leftD.length) result = `Everyone dies — ${b.name} becomes uncontrolled`;
      else result = `Both sides survive — attackers are recalled to base, ${atkMe ? 'they keep it' : 'you keep it'}`;
      const meLeft = [...leftA, ...leftD].filter((x) => x.side === 'me').length, themLeft = [...leftA, ...leftD].filter((x) => x.side === 'them').length;
      return { result, log, deaths: [...A, ...D].filter((x) => x.dead).map((x) => (x.side === 'me' ? 'your ' : 'their ') + x.name), score: (meLeft - themLeft) * 10 + (/You win/.test(result) ? 100 : 0), shieldOn: shieldPick ? short(shieldPick.name) : null };
    };
    let best = run(null);
    if (shield) { const defs = meDef ? b.myUnits : b.theirUnits; const tries = defs.map((u) => run(u)); best = tries.sort((x, y) => meDef ? y.score - x.score : x.score - y.score)[0] || best; }
    return best;
  }
  const mightTxt = (u) => (u.mightParts && u.mightParts.length > 1) ? `${u.mightNow} (${u.mightParts.map(([n, w]) => (n > 0 ? '+' : '') + n + ' ' + w).join(', ').replace(/^\+/, '')})` : String(u.mightNow != null ? u.mightNow : (u.c && u.c.might) || 0);

  // ---------------- choosing units ----------------
  const might = (u) => (u && u.mightNow != null) ? u.mightNow : (u && u.c && u.c.might) || 0;
  const isKey = (u) => KEY_UNITS.includes(u.name);
  function bestUnit(list) { return [...list].sort((a, b) => (isKey(b) - isKey(a)) || (/irelia/i.test(b.name) - /irelia/i.test(a.name)) || might(b) - might(a))[0]; }
  // which friendly unit to exhaust to pay a cost
  function pickFodder(st, exclude) {
    exclude = exclude || [];
    const cands = st.myUnits.filter((u) => u.ready && !exclude.includes(u.id));
    if (!cands.length) return null;
    const score = (u) => {
      let s = 0; const why = [];
      if (u.name === 'Reckless Innovator') { s += 6; why.push('exhausting it makes a Gold'); }
      const b = st.bf[u.zone];
      if (u.zone === 'base') { s += 2; why.push('it is idle in base'); }
      if (b && b.theirUnits.length) { s -= 8; }
      if (b && b.controller === 'me' && b.myUnits.length === 1) { s += 1; why.push('exhausted units still hold the battlefield'); }
      if (isKey(u)) s -= 3;
      s -= might(u) * 0.3;
      return { u, s, why: why[0] || 'it is your least needed unit' };
    };
    return cands.map(score).sort((a, b) => b.s - a.s)[0];
  }
  // what a readied unit could do right now
  // battlefield rules that change scoring/movement
  const myTurnNo = (st) => Math.ceil(st.turn / 2); // nth turn of whoever is active
  function canScoreAt(st, b, nextTurnOfOpp) {
    if (!/forgotten monument/i.test(b.name)) return true;
    const n = nextTurnOfOpp ? Math.ceil((st.turn + (st.myTurn ? 1 : 0)) / 2) : myTurnNo(st);
    return n >= 3;
  }
  const noPlayHere = (b) => /rockfall path/i.test(b.name);
  function jobFor(st, u) {
    if (!u) return null;
    const empty = Object.values(st.bf).find((b) => b.controller === 'none' && canScoreAt(st, b));
    const weak = Object.values(st.bf).find((b) => b.controller === 'them' && b.theirs < might(u) && canScoreAt(st, b));
    if (u.zone === 'base' && empty) return `move it to ${empty.name} and conquer it (+1 point)`;
    if (u.zone === 'base' && weak) return `move it to ${weak.name} and attack (${might(u)} vs ${weak.theirs})`;
    if (st.bf[u.zone] && u.name === 'Reckless Innovator') return null;
    return null;
  }

  // ---------------- reminders / triggers ----------------
  let reminders = [];
  const doneKeys = new Set();
  function remind(key, lvl, title, steps, g) {
    if (doneKeys.has(key) || reminders.some((r) => r.key === key)) return;
    reminders.unshift({ key, lvl, title, steps: steps || [], g: g || null, t: Date.now() });
    if (reminders.length > 14) reminders.length = 14;
  }
  const turnKey = (st, s) => `${st.turn}:${s}`;
  function autoDone(test) { reminders = reminders.filter((r) => { if (r.g && test(r.g)) { doneKeys.add(r.key); return false; } return true; }); }

  function onEnter(st, u) {
    const c = u.c; if (!c) return;
    const justPlayed = st.log.slice(0, 8).some((l) => l.text.startsWith('Played ' + u.name) || l.text.startsWith('Played ' + c.name));
    if (!justPlayed && !/^gold$/i.test(u.name)) return; // moved/recalled/re-rendered, not played
    const k = turnKey(st, 'enter:' + u.id);
    if (!u.mine) {
      const vex = st.myUnits.find((m) => m.name === 'Vex, Apathetic' && st.bf[m.zone]);
      if (vex && c.isUnit) remind(k + ':vex', 'do', `Vex, Apathetic stuns ${u.name}`, [`Mark ${B(u.name)} as stunned: it deals no combat damage this turn.`, `It also can't move this turn.`], `Mark ${short(u.name)} STUNNED`);
      const t = sentence(c.text, /when you play me|when i'?m played/i);
      if (t) remind(k, 'info', `Opponent played ${u.name}`, [esc(t)]);
      return;
    }
    // Riven, The Exile: units you play to battlefields you control enter ready
    const b = st.bf[u.zone];
    if (c.isUnit && b && st.legendNames.includes('Riven, The Exile') && !u.ready && b.myUnits.length > 1)
      remind(k + ':exile', 'warn', `${short(u.name)} should be READY`, [`Riven, The Exile: units you play to a battlefield you control enter ready.`, `Ready ${B(u.name)} manually if the sim left it exhausted.`], `Ready ${short(u.name)} (Exile)`);
    switch (u.name) {
      case 'Scuttle Crab': remind(k, 'do', 'Scuttle Crab: draw 1', ['Draw 1 card now (press D).'], 'Draw 1 (Scuttle Crab)'); break;
      case 'Tideturner': {
        const other = st.myUnits.filter((m) => m.id !== u.id && m.zone !== u.zone);
        const pull = other.find((m) => !m.ready && st.bf[m.zone] && st.bf[m.zone].theirUnits.length);
        const steps = ['Optional: swap Tideturner with one of your units at another location.'];
        if (pull) steps.push(`Good swap: bring ${B(pull.name)} (exhausted, under attack) here and leave Tideturner at ${esc(st.bf[pull.zone].name)}.`);
        else steps.push('No swap needed right now — skip it.');
        remind(k, 'info', 'Tideturner entered', steps); break;
      }
      case 'Neeko, Blending In': {
        const holding = Object.values(st.bf).some((b2) => b2.controller === 'me');
        const unitsInHand = st.hand.filter((n) => (card(n) || {}).isUnit).length;
        const pick = holding && unitsInHand >= 2 ? 'Riven, The Exile' : holding ? 'Vex, Gloomist' : 'Yasuo, Unforgiven';
        const why = { 'Riven, The Exile': 'you hold a battlefield and have units in hand: they will enter ready there', 'Vex, Gloomist': 'you hold a battlefield: draw a card every time you hold', 'Yasuo, Unforgiven': 'nothing held yet: Yasuo moves a unit to/from base for 2' }[pick];
        remind(k, 'do', 'Neeko: pick a Legend', [`Pick ${B(pick)} — ${why}.`, 'The borrowed Legend enters READY: you can use it this turn.', 'If Neeko leaves the board, the borrowed Legend leaves too.'], `Neeko → pick ${short(pick)}`);
        break;
      }
      case 'Heartening Soul': {
        const ex = st.legends.find((l) => !l.ready && /irelia/i.test(l.name)) || st.legends.find((l) => !l.ready);
        remind(k, 'do', 'Heartening Soul triggers', [ex ? `Ready ${B(ex.name)}.` : 'Ready a legend (all are ready already — no value, skip).', 'From now on each of your legends has: exhaust → give a unit +3 Might this turn. Save it for combat.'], ex ? `Ready ${short(ex.name)} (Soul)` : null);
        break;
      }
      case 'Royal Entourage': {
        const ex = st.legends.find((l) => !l.ready);
        remind(k, 'do', 'Royal Entourage triggers', [ex ? `Ready ${B(ex.name)}.` : 'All legends are ready: you can skip (or exhaust an opponent legend if that ever matters).'], ex ? `Ready ${short(ex.name)}` : null);
        break;
      }
      case 'Guardian Angel': case 'Boots of Swiftness': {
        const tgt = bestUnit(st.myUnits.filter((m) => st.bf[m.zone])) || bestUnit(st.myUnits);
        const pl = plan(st, 0, 1, [u.name === 'Guardian Angel' ? 'calm' : 'chaos']);
        remind(k, 'do', `Equip ${u.name}`, [tgt ? `Attach it to ${B(tgt.name)}.` : 'Attach it to a unit when you have one.', `Cost: 1 ${u.name === 'Guardian Angel' ? 'Calm' : 'Chaos'} Power — ${pl ? pl.text : 'not affordable right now'}.`, 'Equipping "chooses" the unit, so Irelia\'s Legend can ready it if it is exhausted.'], tgt ? `Equip ${short(u.name)} → ${short(tgt.name)}` : null);
        break;
      }
      case 'Reckless Innovator': if (u.ready) remind(k, 'info', 'Innovator entered ready (Accelerate)', ['It can move or be used for Deserter this turn.']); break;
      default: {
        const t = sentence(c.text, /when you play me|when i'?m played/i);
        if (t) remind(k, 'do', `${short(u.name)}: on-play ability`, [esc(t)], `${short(u.name)}: on-play effect`);
      }
    }
  }

  function onExhaust(st, u) {
    const k = turnKey(st, 'ex:' + u.id + ':' + Date.now().toString().slice(0, -4));
    if (!u.mine) return;
    if (u.name === 'Reckless Innovator') {
      const pl = plan(st, 0, 1, ['chaos']);
      remind(k, 'do', 'Reckless Innovator exhausted — choose one', [
        `${B('Gold token')}: click TOKEN PANEL → Gold → put it in your base exhausted. (Later: kill it + exhaust → 1 Power of any domain.)`,
        `${B('or draw 1')}: pay 1 Chaos Power — ${pl ? pl.text : 'not affordable right now'}.`,
        'Default: take the Gold unless you are short on cards.',
      ], 'Make a Gold token');
    } else if (u.c && /when i become exhausted/i.test(u.c.text)) {
      remind(k, 'do', `${short(u.name)} exhausted`, [esc(sentence(u.c.text, /when i become exhausted/i))], `${short(u.name)}: exhaust trigger`);
    }
    if (u.c && u.c.isUnit) {
      st.myUnits.filter((d) => d.name === 'Riven, Deserter' && d.id !== u.id).forEach((d) => {
        remind(k + ':des' + d.id, 'do', 'Riven, Deserter +1 Might', [`${esc(short(u.name))} became exhausted → give ${B('Riven, Deserter')} +1 Might this turn (add a +1 counter).`], 'Deserter +1 Might');
      });
    }
  }

  function onReadied(st, u) {
    // a unit readied mid-turn while Deserter is out: assume the Deserter ability was used
    if (u.mine && st.myTurn && st.myUnits.some((d) => d.name === 'Riven, Deserter')) doneKeys.add(turnKey(st, 'deserter'));
  }
  function onMove(st, u, from, to) {
    if (!u.mine || !u.c) return;
    const k = turnKey(st, 'mv:' + u.id + to);
    if (u.name === 'Akali, Silent' && st.bf[to]) remind(k, 'do', 'Akali, Silent +2 Might', [`Akali moved to ${esc(st.bf[to].name)}: give her +2 Might this turn.`], 'Akali +2 Might');
    else { const t = sentence(u.c.text, /when i move/i); if (t) remind(k, 'do', `${short(u.name)} moved`, [esc(t)], `${short(u.name)}: move trigger`); }
    const b = st.bf[to];
    if (b && b.theirUnits.length) {
      const ga = attached.get(u.name);
      // one live fight line per battlefield: drop older ones with stale Might numbers
      reminders = reminders.filter((r) => !(r.g && r.g.startsWith('Fight at ' + b.name + ':')));
      remind(k + ':fight', 'warn', `Combat at ${b.name}`, [`You ${b.mine} vs them ${b.theirs} Might.`, ...(ga === 'Guardian Angel' ? [`${esc(u.name)} has Guardian Angel: if it would die, trash Guardian Angel instead, heal it, exhaust it and move it to base.`] : []), 'Check the Now tab for tricks.'], `Fight at ${b.name}: ${b.mine} vs ${b.theirs}`);
    }
  }

  function onLeave(st, u) {
    if (!u.c) return;
    const k = turnKey(st, 'lv:' + u.id);
    if (u.mine && u.name === 'Neeko, Blending In') {
      const borrowed = st.legends.filter((l) => !/irelia/i.test(l.name));
      remind(k, 'warn', 'Neeko left the board', [borrowed.length ? `Remove borrowed Legend ${B(borrowed.map((l) => l.name).join(', '))} if the sim didn't.` : 'Her borrowed Legend leaves with her.'], 'Neeko gone: remove borrowed Legend');
    }
    const dk = sentence(u.c.text, /deathknell|when i die/i);
    if (dk) remind(k + ':dk', u.mine ? 'do' : 'info', `${u.mine ? '' : 'Opponent '}${short(u.name)} left — if it DIED:`, [esc(dk)], u.mine ? `${short(u.name)} died? Deathknell` : null);
    if (u.mine) attached.forEach((unit, gear) => { if (unit === u.name) attached.delete(gear); });
  }

  function onConquer(st, bfName, mine) {
    const b = Object.values(st.bf).find((x) => x.name === bfName || x.id === bfName || norm(x.name) === norm(bfName)) || null;
    const name = b ? b.name : bfName;
    const k = turnKey(st, 'cq:' + name + mine);
    if (!mine) {
      const c = card(name); const t = c && sentence(c.text, /when you conquer/i);
      if (t) remind(k, 'info', `Opponent conquered ${name}`, [esc(t)]);
      return;
    }
    const steps = [], gl = [];
    const irelia = st.legends.find((l) => /irelia/i.test(l.name));
    if (irelia && !irelia.ready) {
      const guard = ['Defy', 'Defiant Dance', 'Not So Fast'].find((n) => st.hand.includes(n) && planCard(st, n));
      if (!st.ready) steps.push('Irelia, Blade Dancer could be readied for 1 Energy, but you have no ready rune — skip.');
      else if (guard && st.ready <= (planCard(st, guard) || {}).readyCost) gl.push(`Skip Irelia ready (save ${guard})`), steps.push(`Irelia, Blade Dancer: you MAY pay 1 Energy to ready her — but that rune is your ${B(guard)} on their turn. Skip unless you'll cast a "choose" spell this turn.`);
      else gl.push('Ready Irelia (1 Energy)'), steps.push(`Irelia, Blade Dancer: pay ${B('1 Energy')} (tap a rune) to ready her, so she can ready a unit again on their turn.`);
    }
    if (/targon/i.test(name)) gl.push('Targon: ready 2 runes at end'), steps.push(`Targon's Peak: at the END of this turn, ready up to 2 runes. (Reminder shows under "Before END TURN".)`), targonTurn = st.turn;
    if (/sunken temple/i.test(name) && b && b.myUnits.some((u) => might(u) >= 5)) gl.push('Temple: pay 1 → draw'), steps.push(`Sunken Temple: you have a Mighty unit here → pay 1 Energy to draw 1.`);
    if (/hall of legends/i.test(name)) { const ex = st.legends.find((l) => !l.ready); steps.push(ex ? `Hall of Legends: pay 1 Energy to ready ${B(ex.name)}.` : 'Hall of Legends: all legends ready, skip.'); }
    if (b) b.myUnits.forEach((u) => { const t = u.c && sentence(u.c.text, /when i conquer|hunt/i); if (t) steps.push(`${B(short(u.name))}: ${esc(t)}`); });
    const bc = card(name); if (bc && !/targon|sunken|hall of legends/i.test(name)) { const t = sentence(bc.text, /when you conquer here/i); if (t) steps.push(esc(t)); }
    if (steps.length) remind(k, 'do', `You conquered ${name}`, steps, gl.length ? gl.slice(0, 2).join(' · ') : 'Conquer trigger — check');
  }

  function onHold(st) {
    const k = turnKey(st, 'hold');
    const steps = [];
    const vex = st.legends.find((l) => l.name === 'Vex, Gloomist');
    if (vex && vex.ready) steps.push(`${B('Vex, Gloomist')}: exhaust her → draw 1.`);
    const holdG = vex && vex.ready ? 'Vex: exhaust → draw 1' : 'Hold trigger — check';
    Object.values(st.bf).filter((b) => b.controller === 'me').forEach((b) => {
      b.myUnits.forEach((u) => { const t = u.c && sentence(u.c.text, /when i hold|hunt/i); if (t) steps.push(`${B(short(u.name))}: ${esc(t)}`); });
      const bc = card(b.name); const t = bc && sentence(bc.text, /when you hold here/i); if (t) steps.push(`${esc(b.name)}: ${esc(t)}`);
    });
    if (steps.length) remind(k, 'do', 'You scored by holding', steps, holdG);
  }

  function onSpell(st, item) {
    const k = turnKey(st, 'sp:' + item.name + ':' + st.chain.length + ':' + Date.now().toString().slice(0, -4));
    const c = item.c;
    if (!item.mine) {
      const hall = Object.values(st.bf).find((b) => /abandoned hall/i.test(b.name) && b.theirUnits.length);
      if (hall) remind(k + ':hall', 'info', 'Abandoned Hall (opponent)', [`They may give a unit at Abandoned Hall +1 Might for casting ${esc(item.name)}.`]);
      return;
    }
    const steps = [], gl = [];
    const hall = Object.values(st.bf).find((b) => /abandoned hall/i.test(b.name) && b.myUnits.length);
    if (hall) { steps.push(`${B('Abandoned Hall')}: give ${B(bestUnit(hall.myUnits).name)} +1 Might this turn.`); gl.push(`+1 Might → ${short(bestUnit(hall.myUnits).name)} (Hall)`); }
    const chooses = c && (/friendly unit/i.test(c.text) || CHOOSERS.includes(c.name) || /give a unit \+/i.test(c.text)) && !/^(Gust|Star-Crossed|Charm)$/.test(c.name);
    const irelia = st.legends.find((l) => /irelia, blade/i.test(l.name));
    if (chooses && irelia && irelia.ready) {
      const ex = st.myUnits.filter((u) => !u.ready);
      const useful = ex.map((u) => ({ u, job: jobFor(st, u) })).find((x) => x.job);
      if (useful) gl.push(`Irelia: ready ${short(useful.u.name)}`), steps.push(`Irelia, Blade Dancer: if you chose ${B(useful.u.name)}, exhaust Irelia + recycle 1 rune (any) to ready it, then ${useful.job}.`);
      else steps.push('Irelia, Blade Dancer triggers: only ready the unit if it is exhausted AND will move/attack/block afterward. Otherwise decline.');
    }
    if (chooses && st.myUnits.some((u) => u.name === 'Irelia, Fervent')) steps.push(`If you chose ${B('Irelia, Fervent')}: she gets +1 Might this turn too.`);
    if (/draw 1/i.test(c ? c.text : '')) gl.push('Draw 1'), steps.push(`${esc(item.name)} draws a card — draw it when it resolves.`);
    if (steps.length) remind(k, 'do', `You cast ${item.name}`, steps, gl.length ? gl.slice(0, 2).join(' · ') : null);
  }

  function onMyTurnStart(st) {
    const k = turnKey(st, 'start');
    const steps = [];
    const hid = st.hidden.filter((h) => h.mine);
    if (hid.length) steps.push(`Your hidden card${hid.length > 1 ? 's are' : ' is'} live: play ${hid.length > 1 ? 'them' : 'it'} for free any time (even on their turn).`);
    const yasuo = st.legends.find((l) => l.name === 'Yasuo, Unforgiven' && l.ready);
    if (yasuo) steps.push(`${B('Yasuo, Unforgiven')}: 2 Energy + exhaust → move a unit to or from base.`);
    if (st.myUnits.some((u) => u.name === 'Heartening Soul')) steps.push('Your legends each have: exhaust → +3 Might to a unit. Keep them for combat.');
    const golds = st.gear.filter((g) => g.mine && /^gold$/i.test(g.name));
    if (golds.length) steps.push(`You have ${golds.length} Gold: each one = kill + exhaust → 1 Power of any domain (works on their turn too).`);
    if (st.myUnits.some((u) => u.name === 'Riven, Deserter')) steps.push(`Riven, Deserter's ability is available (once this turn). See Now tab.`);
    if (steps.length) remind(k, 'info', `Turn ${st.turn} — your tools this turn`, steps);
  }


  // ---------------- test recorder (purpose #2: is the deck competitive?) ----------------
  // Records every game automatically: version, opponent, play order, result, engine use, card use.
  const VERSIONS = ['Base', 'Hold-breaker', 'Hall of Legends', 'Boots', 'Entourage'];
  const CHANGED = { 'Base': '', 'Hold-breaker': 'Charm', 'Hall of Legends': 'Hall of Legends', 'Boots': 'Boots of Swiftness', 'Entourage': 'Royal Entourage' };
  const PLAN = { perVersion: 20, opponents: ['Kennen', "Kai'Sa"] };
  const rec = {
    cur: null,
    games() { return store.get('games', []); },
    save(g) { const all = this.games(); const i = all.findIndex((x) => x.id === g.id); if (i >= 0) all[i] = g; else all.push(g); store.set('games', all); },
    ownBattlefield() { const i = document.querySelector('[data-battlefield-surface-slot="own"] img'); return i ? i.alt : ''; },
    guessVersion(g) {
      const set = store.get('version', 'Auto');
      if (set !== 'Auto') return set;
      if (/hall of legends/i.test(g.ownBF)) return 'Hall of Legends';
      if (g.cards['Charm'] || g.cards['Back Off']) return 'Hold-breaker';
      if (g.cards['Boots of Swiftness']) return 'Boots';
      if (g.cards['Royal Entourage']) return 'Entourage';
      return 'Base';
    },
    tick(st) {
      if (!st.inverted && !this.cur) return; // only record games with this deck
      if (!this.cur) { const saved = store.get('curGame', null); if (saved && saved.room === st.room && !saved.done && !(st.turn <= 1 && saved.lastTurn > 2)) this.cur = saved; }
      const c = this.cur;
      const fresh = !c || c.room !== st.room || (st.turn <= 1 && c.lastTurn > 2) || (c.done && st.turn <= 1 && !st.gameOver); // rewinds lower the turn but are the same game
      if (fresh) {
        if (c && !c.done && !(c.lastTurn >= 1)) { const all = this.games().filter((x) => x.id !== c.id); store.set('games', all); } // never started (left at setup): drop it
        else if (c && !c.done) { // game ended without anyone reaching 8 on screen (concede / disconnect / left early)
          const my = c.lastMy || 0, op = c.lastOpp || 0;
          c.done = true; c.result = op >= 6 && op > my ? 'L' : my >= 6 && my > op ? 'W' : 'Unfinished'; c.score = `${my}-${op}`;
          c.ended = 'game ended before 8 on screen (concede?)'; c.notes = (c.notes ? c.notes + '; ' : '') + 'result inferred — check RiftAtlas history';
          this.save(c); }
        if (st.gameOver) return;
        this.cur = { id: st.room + ':' + Date.now(), room: st.room, date: new Date().toISOString().slice(0, 16), lastTurn: st.turn, done: false,
          self: st.solo, opp: '', order: '', hand0: null, mull: null, neeko: false, neekoLegend: '', cards: {}, irelia: 0, golds: 0, deserter: 0,
          conquers: 0, holds: 0, oppConquers: 0, oppHolds: 0, result: '', score: '', ended: '', ownBF: this.ownBattlefield(), coached: true, notes: '' };
      }
      const g = this.cur; if (!g) return;
      g.lastTurn = st.turn;
      if (!g.ownBF) g.ownBF = this.ownBattlefield();
      if (!g.opp && st.oppLegends[0] && !/hidden/i.test(st.oppLegends[0].name)) g.opp = st.oppLegends[0].name;
      if (!g.myLegend && st.legendNames[0] && !/hidden/i.test(st.legendNames[0])) g.myLegend = st.legendNames[0];
      if (!g.order && st.turn >= 1) g.order = (st.turn % 2 === 1) === st.myTurn ? 'First' : 'Second';
      if (st.turn === 0 && st.hand.length && !g.hand0) g.hand0 = [...st.hand];
      if (st.turn >= 1 && g.mull == null && g.mullLog != null) g.mull = g.mullLog;
      if (st.turn >= 1 && g.mull == null && g.hand0) { const h = [...st.hand]; g.mull = g.hand0 ? g.hand0.filter((n) => { const i = h.indexOf(n); if (i >= 0) { h.splice(i, 1); return false; } return true; }).length : ''; }
      // drawn = most copies ever seen in hand at once (rough but steady)
      const cnt = {}; st.hand.forEach((n) => { cnt[n] = (cnt[n] || 0) + 1; });
      Object.keys(cnt).forEach((n) => { const k = (g.cards[n] = g.cards[n] || { drawn: 0, played: 0 }); k.drawn = Math.max(k.drawn, cnt[n], k.played); });
      if (st.gameOver && !g.done) {
        // scores never go down: if the final read looks swapped (RiftAtlas flips sides on the end screen), swap back
        let my = st.myScore, opp = st.oppScore;
        if ((g.lastMy != null && my < g.lastMy) || (g.lastOpp != null && opp < g.lastOpp)) { const t = my; my = opp; opp = t; }
        g.done = true; g.result = my >= 8 && my > opp ? 'W' : 'L'; g.score = `${my}-${opp}`;
        const last = st.log.find((l) => /^Conquered|^Scored \d+ at turn start/.test(l.text));
        g.ended = last ? `${g.result === 'W' ? 'Me' : 'Opp'}: ${last.text}` : '';
        g.version = this.guessVersion(g);
        this.save(g);
      } else if (!g.done) { g.lastMy = st.myScore; g.lastOpp = st.oppScore; g.version = this.guessVersion(g); if (Math.random() < 0.2) this.save(g); }
      store.set('curGame', g);
    },
    played(name) { const g = this.cur; if (!g || g.done) return; const k = (g.cards[name] = g.cards[name] || { drawn: 0, played: 0 }); k.played++; k.drawn = Math.max(k.drawn, k.played); },
    ev(type, a, b) {
      const g = this.cur; if (!g || g.done) return;
      if (type === 'enter' && a.mine) { if (!/^gold$/i.test(a.name)) this.played(a.name); if (a.name === 'Neeko, Blending In') g.neeko = true; if (/^gold$/i.test(a.name)) g.golds++; }
      if (type === 'spell' && a.mine) this.played(a.name);
      if (type === 'readied' && a.mine) g.deserter++;
      if (type === 'log') {
        let m;
        if ((m = a.text.match(/^Added (.+?) to their legend area with Neeko/)) && a.mine !== false) g.neekoLegend = m[1];
        if (/^Exhausted Irelia, Blade Dancer/.test(a.text) && a.mine !== false) g.irelia++;
        if (/^Conquered/.test(a.text)) a.mine === false ? g.oppConquers++ : g.conquers++;
        if (/^Scored \d+ at turn start/.test(a.text)) a.mine === false ? g.oppHolds++ : g.holds++;
      }
    },
  };
  const wilson = (w, n) => { if (!n) return [0, 0]; const z = 1.96, p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; };
  const pct = (x) => Math.round(x * 100) + '%';
  function toCSV(games) {
    const head = ['Game', 'Version', 'Opponent', 'Play order', 'Result', 'Neeko resolved', 'Neeko Legend', 'Changed card drawn', 'Changed card played', 'Changed card contributed', 'Royal Entourage use', 'Opponent had seen engine', 'Opponent (Real/Self)', 'Mulligan', 'How game ended', 'Notes'];
    const q = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = games.filter((g) => g.done).map((g, i) => {
      const ch = CHANGED[g.version] || ''; const k = ch && g.cards[ch];
      const dead = Object.entries(g.cards).filter(([, v]) => v.drawn && !v.played).map(([n]) => n);
      return [i + 1, g.version, g.opp, g.order, g.result, g.neeko ? 'Y' : 'N', g.neekoLegend, ch === 'Hall of Legends' ? 'BF' : k ? 'Y' : (ch ? 'N' : ''), ch === 'Hall of Legends' ? 'BF' : k && k.played ? 'Y' : (ch ? 'N' : ''), '',
        g.cards['Royal Entourage'] && g.cards['Royal Entourage'].played ? 'ER: played' : '', '', g.self ? 'Self' : 'Real', g.mull, `${g.score} — ${g.ended}`,
        `${g.coached ? 'coached; ' : ''}Irelia readies ${g.irelia}, Gold ${g.golds}, mid-turn readies ${g.deserter}, conquers ${g.conquers}, holds ${g.holds}${dead.length ? '; unplayed: ' + dead.join(', ') : ''}${g.notes ? '; ' + g.notes : ''}`].map(q).join(',');
    });
    return [head.join(','), ...rows].join('\n');
  }
  function copyText(t) { try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t, 'text'); return true; } navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }

  // ---------------- change tracker ----------------
  let prev = null, prevTurn = -1, prevMyTurn = null, prevLog = [], prevChain = [];
  const attached = new Map(); // gear name -> unit name (from log)
  let targonTurn = -1;
  function track(st) {
    const cur = new Map();
    [...st.units, ...st.gear, ...st.hidden].forEach((u) => cur.set(u.id, u));
    if (!prev) { prev = cur; prevTurn = st.turn; prevMyTurn = st.myTurn; prevLog = st.log.map((l) => l.text); prevChain = st.chain.map((c) => c.name); return; }
    const events = [];
    cur.forEach((u, id) => {
      const p = prev.get(id);
      if (!p) events.push(['enter', u]);
      else {
        if (p.faceDown && !u.faceDown) events.push(['enter', u]);
        if (p.ready && !u.ready) events.push(['exhaust', u]);
        if (!p.ready && u.ready && p.zone === u.zone && st.turn === prevTurn) events.push(['readied', u]);
        if (p.zone !== u.zone) events.push(['move', u, p.zone, u.zone]);
      }
    });
    prev.forEach((p, id) => { if (!cur.has(id)) events.push(['leave', p]); });
    // new log rows (newest first): everything above the previous top row
    const texts = st.log.map((l) => l.text);
    let n = 0;
    if (prevLog.length) { const i = texts.findIndex((t, idx) => t === prevLog[0] && (texts[idx + 1] || '') === (prevLog[1] || '')); n = i < 0 ? Math.min(texts.length, 6) : i; } else n = texts.length;
    const newRows = st.log.slice(0, n).reverse();
    // new chain items
    const newChain = st.chain.filter((c, i) => prevChain[i] !== c.name);
    const big = events.length > 10 || newRows.length > 12; // rewind / reload: resync quietly
    if (!big) {
      if (st.turn !== prevTurn) { reminders = []; if (st.myTurn) onMyTurnStart(st); }
      events.forEach((ev) => { try { rec.ev(ev[0], ev[1]); } catch (e) { /* ignore */ } try { ({ enter: onEnter, exhaust: onExhaust, move: onMove, leave: onLeave, readied: onReadied })[ev[0]](st, ...ev.slice(1)); } catch (e) { console.warn('[coach]', e); } });
      try { learn.did(st, newRows); } catch (e) { /* ignore */ }
      newRows.forEach((r) => {
        let m; try { rec.ev('log', r); } catch (e) { /* ignore */ }
        if ((m = r.text.match(/^Conquered (.+?)(?: and scored.*)?\.$/))) { const nm = m[1]; autoDone((g) => g.startsWith('Fight at ' + nm)); onConquer(st, nm, r.mine !== false); }
        else if (/^Scored \d+ at turn start/i.test(r.text) && r.mine !== false) onHold(st);
        else if ((m = r.text.match(/^Equipped (.+?) to (.+?)\.?$/))) { attached.set(m[1].trim(), m[2].trim()); autoDone((g) => /^Equip /.test(g)); }
        else if (/^Drew \d+ card/.test(r.text) && r.mine !== false) autoDone((g) => /^Draw 1|· Draw 1$/.test(g));
        else if (/^Played Gold token/.test(r.text)) autoDone((g) => /Gold token/.test(g));
        else if (/to their legend area with Neeko/.test(r.text)) autoDone((g) => /^Neeko → pick/.test(g));
        else if ((m = r.text.match(/^Finalized mulligan \((\d+) recycled/))) { try { if (rec.cur && rec.cur.mull == null && r.mine !== false) rec.cur.mullLog = +m[1]; } catch (e) { /* ignore */ } }
      });
      if (!st.chain.length && prevChain.length) autoDone((g) => /\(Hall\)/.test(g) && !/Irelia:/.test(g));
      newChain.forEach((c) => { if (c.c && c.c.isSpell) { onSpell(st, c); try { rec.ev('spell', c); } catch (e) { /* ignore */ } } });
    }
    prev = cur; prevTurn = st.turn; prevMyTurn = st.myTurn; prevLog = texts; prevChain = st.chain.map((c) => c.name);
  }

  // ---------------- advice for "Now" ----------------
  function advise(st) {
    const out = [];
    const add = (lvl, title, steps, g, p) => out.push({ lvl, title, steps: steps || [], g: g || null, p: p || 0 });
    if (st.gameOver) { reminders = []; add('info', st.myScore >= 8 ? 'You won! 🎉' : 'Game over', ['Open the Sideboard tab before the next game.'], st.myScore >= 8 ? 'You won! 🎉 → Sideboard tab' : 'Game over → Sideboard tab', 10); return out; }
    if (!st.turn || /setup|mulligan|lobby|pre/i.test(st.phase + st.step)) {
      add('info', 'Before the game', ['Check the Sideboard tab.', 'Mulligan: keep cheap units (Tideturner, Scuttle Crab, Reckless Innovator) and Defy. Send back Neeko, Heartening Soul, Star-Crossed and Not So Fast if your hand has no 2–3 cost unit.'], 'Mulligan: keep 2–3 cost units + Defy', 40);
    }
    if (st.turn) Object.values(st.bf).forEach((b) => { const f = predictFight(st, b); if (!f) return;
      add(/You win/.test(f.result) ? 'info' : 'warn', `Fight forecast at ${b.name}`, [...f.log.map(esc), f.shieldOn ? `Assumes ${esc(b.name)}'s Shield goes on ${esc(f.shieldOn)} (best choice).` : '', `Result: ${esc(f.result)}${f.deaths.length ? ' · dies: ' + esc(f.deaths.join(', ')) : ''}.`].filter(Boolean), `⚔ ${f.result}`, 85); });
    if (st.turn) {
    // 5b) "deal damage equal to my Might" triggers: pump BEFORE the trigger resolves
    Object.values(st.bf).filter((b) => b.myUnits.length && b.theirUnits.length).forEach((b) => {
      const dmgU = b.myUnits.find((u) => u.c && /when i (attack|defend|attack or defend)[^.]*deal damage equal to my might/i.test(u.c.text));
      const PP = pumpsInHand(st, true); const pump = Object.keys(PP)[0];
      if (dmgU && pump && planCard(st, pump)) {
        const need = Math.max(...b.theirUnits.map((t) => might(t)));
        add('warn', `${short(dmgU.name)}'s damage trigger`, [`${B(dmgU.name)} deals damage equal to its Might when its attack/defend trigger RESOLVES.`, `Cast ${B(pump)} on ${B(dmgU.name)} while that trigger is still on the chain (before it resolves): ${might(dmgU)} + ${PP[pump]} = ${might(dmgU) + PP[pump]} damage${need ? ` vs their biggest unit at ${need} Might` : ''}.`, 'Casting it after the trigger resolves adds no damage.'], `Pump ${short(dmgU.name)} BEFORE its trigger resolves: ${pump}`, 92);
      }
    });
    }
    const bfs = Object.values(st.bf);
    const enemyChain = st.chain.filter((c) => !c.mine);
    // 1) answering the opponent
    if (enemyChain.length) {
      const top = enemyChain[enemyChain.length - 1];
      const c = top.c;
      if (c) {
        const steps = [esc(c.text.slice(0, 220))]; const anyAns = ['Defy', 'Not So Fast'].some((n) => st.hand.includes(n)); let g = !anyAns ? `${short(c.name)}: no counter in hand — approve` : !st.ready ? `${short(c.name)}: no ready runes — approve` : `${short(c.name)}: can't be countered — approve`;
        const defy = st.hand.includes('Defy') && planCard(st, 'Defy');
        const nsf = st.hand.includes('Not So Fast') && planCard(st, 'Not So Fast');
        if (c.isSpell && defy && c.e <= 4 && c.p <= 1) g = `DEFY ${short(c.name)}?`, steps.push(`If it hurts you: ${B('Defy')} — ${defy.text}.`);
        if (nsf && c.isSpell && /friendly|your|a unit|target|choose/i.test(c.text)) g = g.startsWith('DEFY') ? g : `Not So Fast ${short(c.name)}?`, steps.push(`If it targets your unit or gear: ${B('Not So Fast')} — ${nsf.text}.`);
        else if (nsf && !c.isSpell && /when you play me|when i'?m played/i.test(c.text) && /choose|kill|deal|stun|return/i.test(c.text)) steps.push(`Not So Fast can't stop the unit itself — wait: if its play ability then targets your unit, ${B('Not So Fast')} that ability.`);
        if (!c.isSpell) steps.push(`It's a ${esc(c.type)}: Defy can't counter it.`);
        add('warn', `Opponent: ${c.name} (${costTxt(c)})`, steps, g, 100);
      } else add('warn', `Opponent: ${top.name}`, ['Read it before approving.'], `Read ${short(top.name)} before approving`, 100);
    }
    // 2) fights
    bfs.filter((b) => b.myUnits.length && b.theirUnits.length && b.theirs > 0).forEach((b) => {
      const need = b.theirs - b.mine + 1;
      const steps = [`You ${b.mine} vs them ${b.theirs} Might.`];
      const myBest = bestUnit(b.myUnits); const theirBest = [...b.theirUnits].sort((x, y) => might(y) - might(x))[0];
      const used = { ready: 0 };
      if (need > 0) {
        let got = 0; const hall = /abandoned hall/i.test(b.name) ? 1 : 0;
        const opts = [], gopts = []; let ireliaBonus = /irelia, fervent/i.test(myBest.name) ? 1 : 0;
        const PP = pumpsInHand(st, true);
        const hasGear = st.hand.some((h) => card(h) && card(h).isGear) || st.gear.some((g) => g.mine);
        Object.keys(PP).forEach((n) => {
          const copies = st.hand.filter((h) => h === n).length;
          for (let i = 0; i < copies && got < need; i++) {
            const pl = planCard(st, n, used); if (!pl) break;
            used.ready += pl.readyCost;
            const showOff = /SHOW OFF a gear/i.test(card(n).text) && /If you showed off, ready up to (\d+) runes/i.exec(card(n).text);
            if (showOff && hasGear) { used.ready = Math.max(0, used.ready - +showOff[1]); const gname = st.hand.find((h) => card(h) && card(h).isGear) || (st.gear.find((g) => g.mine) || {}).name; opts.push(`${B(n)}: show off ${B(gname)} → ready ${showOff[1]} runes back`); }
            let swing = PP[n] + hall + (n === 'Defiant Dance' ? 2 : 0) + ireliaBonus; ireliaBonus = 0;
            if (n === 'En Garde' && b.myUnits.length === 1) swing += 1;
            got += swing;
            gopts.push(`${n} → ${short(myBest.name)}`);
            opts.push(n === 'Defiant Dance' ? `${B('Defiant Dance')}: +2 on ${B(myBest.name)}, −2 on ${B(theirBest.name)} (${pl.text}) → +${swing}` : `${B(n)} on ${B(myBest.name)} (${pl.text}) → +${swing}`);
          }
        });
        st.legends.filter((l) => l.ready && st.myUnits.some((u) => u.name === 'Heartening Soul')).forEach((l) => { if (got < need) { got += 3; gopts.push(`Tap ${short(l.name)}: +3`); opts.push(`Exhaust ${B(l.name)}: +3 on ${B(myBest.name)} (Heartening Soul)`); } });
        if (got >= need) { add('do', `${b.name}: you need +${need} — here's how`, [...steps, ...opts.map((o, i) => `${i + 1}. ${o}`), hall ? 'Each spell also gets the Abandoned Hall +1 (already counted).' : '', (/irelia, fervent/i.test(myBest.name)) ? 'Irelia, Fervent gets +1 the first time you choose her (counted).' : ''].filter(Boolean), `Win ${b.name}: ${gopts.slice(0, 2).join(' + ')}`, 90); return; }
        // reinforcements: ready units at base can walk in; a unit on the other battlefield needs Ride the Wind
        const rein = [];
        if (st.myTurn && got < need) {
          const gap = need - got; let add2 = 0;
          st.myUnits.filter((u) => u.ready && u.zone === 'base').sort((x, y) => mightAt(st, y, b.id, 'attacking') - mightAt(st, x, b.id, 'attacking')).forEach((u) => { const mv = mightAt(st, u, b.id, 'attacking'); if (add2 < gap) { add2 += mv; rein.push(`Move ${short(u.name)} in (+${mv})`); } });
          if (add2 < gap && st.hand.includes('Ride the Wind') && planCard(st, 'Ride the Wind', used)) {
            const far = st.myUnits.filter((u) => u.zone !== b.id && u.zone !== 'base').sort((x, y) => might(y) - might(x))[0];
            if (far) { const mv = mightAt(st, far, b.id, 'attacking'); add2 += mv; rein.push(`Ride the Wind ${short(far.name)} → here (+${mv})`); }
          }
          if (add2 >= gap) { add('do', `${b.name}: win it with reinforcements`, [...steps, ...opts, ...rein], `Win ${b.name}: ${rein[0]}`, 90); return; }
        }
        add('warn', `${b.name}: you're behind by ${need}`, [...steps, opts.length ? `Even with ${opts.length} trick(s) you only gain +${got}.` : 'No pump you can afford.', 'Do not commit more, or remove their unit (Gust ≤3 Might, Star-Crossed).'], `Losing ${b.name} by ${need} — don't add more`, 88);
      } else add('info', `${b.name}: you lead ${b.mine}–${b.theirs}`, ['Keep a trick ready in case they pump.']);
    });

    if (st.myTurn && !enemyChain.length) {
      // 3) Riven, Deserter ability
      const deserter = st.myUnits.find((u) => u.name === 'Riven, Deserter');
      if (deserter && !doneKeys.has(turnKey(st, 'deserter'))) {
        const innov = st.myUnits.find((u) => u.name === 'Reckless Innovator' && u.ready);
        if (innov) add('do', 'Free Gold: Riven, Deserter loop', [
          `1. Use ${B('Riven, Deserter')}'s ability ("Exhaust a friendly unit: Ready a unit").`,
          `2. Target: ${B('Reckless Innovator')}.`,
          `3. Pay the cost by exhausting ${B('Reckless Innovator')} itself.`,
          '4. Innovator trigger: TOKEN PANEL → Gold (exhausted, in base).',
          '5. Irelia, Blade Dancer will offer to ready Innovator — decline (Deserter readies it).',
          '6. Give Riven, Deserter +1 Might this turn.',
        ], 'Deserter loop → free Gold', 72);
        else {
          const needs = st.myUnits.filter((u) => !u.ready && jobFor(st, u));
          const target = bestUnit(needs);
          const fod = target && pickFodder(st, [target.id]);
          if (target && fod) add('do', `Riven, Deserter: ready ${short(target.name)}`, [
            `1. Use ${B('Riven, Deserter')}'s ability.`, `2. Target: ${B(target.name)}.`,
            `3. Pay by exhausting ${B(fod.u.name)} — ${fod.why}.`, `4. Then ${jobFor(st, target)}.`, '5. Riven, Deserter gets +1 Might this turn.'], `Deserter: exhaust ${short(fod.u.name)} → ready ${short(target.name)}`, 72);
        }
      }
      // 4) Irelia legend ready trick (only when the readied unit has a job)
      const irelia = st.legends.find((l) => /irelia, blade/i.test(l.name) && l.ready);
      if (irelia) {
        const cand = st.myUnits.filter((u) => !u.ready).map((u) => ({ u, job: jobFor(st, u) })).filter((x) => x.job)[0];
        const chooser = CHOOSERS.find((n) => st.hand.includes(n) && planCard(st, n));
        if (cand && chooser) {
          const pl = planCard(st, chooser); const extra = plan(st, 0, 1, null, { ready: pl.readyCost });
          if (extra) add('do', `Ready ${short(cand.u.name)} with Irelia's Legend`, [
            `Why: so you can ${cand.job}.`,
            `1. Cast ${B(chooser)} on ${B(cand.u.name)} (${pl.text}).`,
            `2. Irelia, Blade Dancer triggers → exhaust Irelia + ${extra.text} for 1 Power.`,
            `3. ${B(cand.u.name)} readies → ${cand.job}.`], `${chooser} on ${short(cand.u.name)} → Irelia readies it`, 74);
        }
      }
      // 5) what to play (best affordable, keep reaction mana if a real opponent)
      const reserve = (!st.solo && st.hand.some((n) => ['Defy', 'Defiant Dance'].includes(n))) ? 1 : 0;
      const options = [...new Set([...st.hand, ...st.champion])]
        .filter((n) => PLAY_VALUE[n] != null || (card(n) || {}).isUnit)
        .map((n) => ({ n, v: PLAY_VALUE[n] || 2, pl: planCard(st, n, { ready: reserve }) }))
        .filter((o) => o.pl && !(o.n === 'Neeko, Blending In' && st.myUnits.some((u) => u.name === o.n)) && !((card(o.n) || {}).isGear && !st.myUnits.length))
        .sort((a, b) => b.v - a.v || (card(b.n).e - card(a.n).e));
      if (options.length) {
        const o = options[0];
        const where = (card(o.n) || {}).isUnit ? (() => {
          const held = bfs.find((b) => b.controller === 'me' && !noPlayHere(b));
          if (held && st.legendNames.includes('Riven, The Exile')) return ` to ${held.name} (Riven, The Exile: it enters ready there)`;
          return held ? ` to your base, or to ${held.name} (you control it)` : ' to your base';
        })() : '';
        const steps = [`Play ${B(o.n)}${where} — ${o.pl.text}.`];
        if (o.n === 'Reckless Innovator') { const acc = plan(st, 4, 1, ['chaos'], { ready: reserve }); steps.push(acc ? 'Accelerate it (+1 Energy + 1 Chaos Power) only if you will move it or loop it this turn.' : 'Skip Accelerate.'); }
        if (options[1]) steps.push(`After that, if mana remains: ${esc(options[1].n)}.`);
        if (reserve) steps.push('Keeps 1 ready rune for Defy / Defiant Dance on their turn.');
        add('do', 'Best play', steps, `Play ${short(o.n)}${where.includes('enters ready') ? ' (to battlefield)' : ''}`, 60);
      }
      // 6) movement — decide WHERE each ready unit should go (each unit used once, best battlefield first)
      const pool = st.myUnits.filter((u) => u.zone === 'base' && u.ready && might(u) >= 0);
      const bfValue = (b, units) => { // how good it is to take/keep this battlefield, from its card text
        const t = ((card(b.name) || {}).text) || ''; let v = 0; const why = [];
        if (/when you conquer here/i.test(t)) { v += 2; why.push('bonus when you conquer it'); }
        if (/when you hold here/i.test(t)) { v += 1.5; why.push('bonus each time you hold it'); }
        if (/when you defend here|defending here|while a unit here is defending/i.test(t) && !/-\d/.test(t)) { v += 1.5; why.push('easier to defend'); }
        if (/can't move from here to base/i.test(t)) { v -= 1.5; why.push("units there can't retreat to base"); }
        if (/defending alone, it has -\d/i.test(t) && units.length === 1) { v -= 2; why.push('a lone defender there gets -2 Might'); }
        if (/can't be played here/i.test(t)) { v -= 0.5; }
        return { v, why };
      };
      const plans = [];
      bfs.forEach((b) => {
        if (b.controller === 'them') {
          const dPow = Math.max(b.theirs, b.theirUnits.reduce((a, t) => a + mightAt(st, t, b.id, 'defending'), 0));
          plans.push({ b, kind: 'attack', need: dPow, score: 20 + bfValue(b, []).v });
        } else if (b.controller === 'none') {
          const ok = canScoreAt(st, b);
          const bv = bfValue(b, [1]);
          plans.push({ b, kind: ok ? 'conquer' : 'monument', score: (ok ? 10 : 1) + bv.v, why: bv.why });
        }
      });
      plans.sort((x, y) => y.score - x.score);
      const free = [...pool];
      plans.forEach((pl) => {
        const b = pl.b; if (!free.length) return;
        if (pl.kind === 'attack') {
          const sorted = [...free].sort((x, y) => mightAt(st, y, b.id, 'attacking') - mightAt(st, x, b.id, 'attacking')); let tot = 0; const go = [];
          for (const u of sorted) { if (tot > pl.need) break; tot += mightAt(st, u, b.id, 'attacking'); go.push(u); }
          if (tot > pl.need) { go.forEach((u) => free.splice(free.indexOf(u), 1)); add('do', `Attack ${b.name}`, [`Move ${go.map((u) => B(u.name)).join(' + ')} there: about ${tot} vs ${pl.need} (counts buffs, gear, Assault and battlefield effects).`, 'Taking a battlefield they hold also stops their hold point next turn.', 'Keep a trick or Defy up in case they pump their units.'], `Attack ${b.name} (${tot} vs ${pl.need})`, 73); }
          return;
        }
        // empty battlefield: send the smallest unit that can hold it, keep bigger ones for fights
        const u = [...free].sort((x, y) => might(x) - might(y))[0];
        const others = plans.filter((o) => o !== pl && o.kind !== 'attack' && o.b.controller === 'none');
        if (pl.kind === 'conquer') {
          free.splice(free.indexOf(u), 1);
          const reason = [`Move ${B(u.name)} to ${esc(b.name)} — it's empty, +1 point. Moving exhausts it.`];
          if (others.length && !free.length) reason.push(`Pick ${esc(b.name)} over ${others.map((o) => esc(o.b.name)).join(' / ')}: ${pl.why && pl.why.length ? pl.why.join(', ') : 'same points, better battlefield effect'}${others[0].why && others[0].why.length ? ` (${esc(others[0].b.name)}: ${others[0].why.join(', ')})` : ''}. You only have one unit to send.`);
          add('do', `Conquer ${b.name}`, reason, `Move ${short(u.name)} → ${b.name} (+1)`, 70 + Math.min(2, pl.score / 10));
        } else if (!others.some((o) => o.kind === 'conquer')) {
          add('info', `${b.name}: no points yet`, [`Forgotten Monument: nobody scores here until their 3rd turn (this is your turn ${myTurnNo(st)}).`, `Moving ${B(u.name)} there now gives no point, but if it's still there at the start of your 3rd turn you score the hold.`], `${b.name}: no points until turn 3`, 30);
        }
      });
      // 7) hide a card
      const hideable = st.hand.filter((n) => /HIDDEN/i.test((card(n) || {}).text || ''));
      const spot = bfs.find((b) => b.controller === 'me' && !b.myHidden);
      if (hideable.length && spot && plan(st, 0, 1, null)) add('info', 'Option: hide a card', [`Hide ${B(hideable[0])} at ${esc(spot.name)}: recycle 1 rune (any). From next turn you can play it for free, even on their turn.`]);
      // 8) before END TURN
      const before = [], beforeG = [];
      if (targonTurn === st.turn) beforeG.push('Ready 2 runes (Targon)'), before.push("Targon's Peak: ready up to 2 runes now (end of turn).");
      const reacts = ['Defy', 'Defiant Dance', 'Not So Fast', 'Discipline', 'En Garde'].filter((n) => st.hand.includes(n));
      if (reacts.length && !st.solo) {
        const r = reacts.map((n) => ({ n, pl: planCard(st, n) })).filter((x) => x.pl)[0]; // most important affordable answer
        if (r) beforeG.push(`Keep ${r.pl.readyCost} rune${r.pl.readyCost > 1 ? 's' : ''} up for ${r.n}`), before.push(`Leave ${r.pl.readyCost} ready rune${r.pl.readyCost > 1 ? 's' : ''} for ${B(r.n)} (${r.pl.text}).`);
      }
      if (before.length) add('hold', 'Before END TURN', before, beforeG.join(' · ') || null, 50);
    } else if (!st.myTurn && !enemyChain.length && !st.gameOver && st.turn > 0) {
      const live = ['Defy', 'Defiant Dance', 'Not So Fast', 'Discipline', 'En Garde', 'Hunker Down', 'Gust', 'Star-Crossed'].filter((n) => st.hand.includes(n) && planCard(st, n));
      add('info', "Opponent's turn", [`Ready runes: ${st.ready}.`, live.length ? `You can answer with: ${live.map(B).join(', ')}.` : 'No affordable answers — just watch.'], live.length ? `Their turn — hold ${live.slice(0, 2).join(' / ')}` : 'Their turn — just watch', 30);
    }
    // where can they score next turn? (all their units ready at the start of their turn)
    if (!st.gameOver) {
      const theirBase = st.theirUnits.filter((u) => u.zone === 'base');
      const reach = theirBase.reduce((s, u) => s + might(u), 0);
      const threats = [], tg = [];
      bfs.forEach((b) => {
        if (b.controller === 'them' && canScoreAt(st, b, true)) {
          const breakers = ['Charm', 'Star-Crossed', 'Gust', 'Rune Prison', 'Back Off'].filter((n) => st.hand.includes(n) && planCard(st, n));
          const myReach = st.myUnits.filter((u) => u.ready && u.zone === 'base').reduce((t, u) => t + might(u), 0);
          threats.push(`they HOLD ${b.name} (${b.theirs} Might there) → +1 when their turn starts. Holding only needs them to still control it.`);
          threats.push(`To stop it this turn: remove or beat EVERY unit of theirs at ${b.name}. ${breakers.length ? 'You have: ' + breakers.map(B).join(', ') + '.' : 'No card in hand that removes/moves their units.'} Your ready base units bring ≈${myReach} Might.`);
          if (breakers.includes('Charm')) { const big = [...b.theirUnits].sort((x, y) => might(y) - might(x)); threats.push(b.theirUnits.length === 1 ? `${B('Charm')} ${B(big[0].name)} off ${esc(b.name)} (your turn only) — then it isn't theirs at the start of their turn.` : `${B('Charm')} moves only ONE unit — they have ${b.theirUnits.length} there (${big.map((u) => esc(short(u.name))).join(', ')}). Charm one and beat the rest, or Charm + Star-Crossed.`); }
          tg.push(breakers.length ? `Break their hold on ${b.name}: ${breakers[0]}${breakers[0] === 'Charm' && b.theirUnits.length === 1 ? ' ' + short(b.theirUnits[0].name) : ''}` : (myReach > b.theirs ? `Attack ${b.name} — they score from it otherwise` : `They will score ${b.name} — no way to stop it`));
        }
        else if (b.controller === 'none' && theirBase.length && canScoreAt(st, b, true)) tg.push(`Take ${b.name} first`), threats.push(`${b.name} is empty → any unit they move there conquers it (+1)`);
        else if (b.controller === 'me' && theirBase.length) {
          const bigs = [...theirBase].sort((x, y) => might(y) - might(x)).slice(0, 3);
          if (reach > b.mine) tg.push(`Defend ${b.name} (${b.mine} vs ≈${reach})`), threats.push(`${b.name}: you have ${b.mine} Might; their base can bring ≈${reach} (${bigs.map((u) => short(u.name)).join(', ')}) → they can conquer it`);
        }
      });
      const lvl = st.oppScore >= 6 ? 'warn' : 'info';
      if (threats.length && st.turn > 0 && st.myTurn) add(lvl, st.oppScore >= 6 ? `Opponent at ${st.oppScore}/8 — how they can score next turn` : 'Their next turn', threats.concat(st.oppScore >= 6 ? ['Plan: keep a blocker/counter for the battlefield they can take, or hold up Defy/Defiant Dance/Star-Crossed.'] : []), st.oppScore >= 6 ? `They can win next turn: ${tg[0]}` : tg[0], st.oppScore >= 6 ? 95 : 25);
    }
    return out;
  }

  // ---------------- sideboard ----------------
  function oppMemory(st) {
    const all = store.get('opp', {});
    const m = all[st.room] || { legend: '', seen: {} };
    let changed = false;
    st.oppLegends.forEach((l) => { if (l.name && !/hidden/i.test(l.name) && m.legend !== l.name && card(l.name) && card(l.name).isLegend) { m.legend = l.name; changed = true; } });
    [...st.theirUnits, ...st.gear.filter((g) => !g.mine), ...st.chain.filter((c) => !c.mine)].forEach((u) => { if (u.name && card(u.name)) { const k = card(u.name).name; if (!m.seen[k]) { m.seen[k] = 1; changed = true; } } });
    if (changed) { all[st.room] = m; const keys = Object.keys(all); if (keys.length > 20) delete all[keys[0]]; store.set('opp', all); }
    return m;
  }
  function sideboard(st) {
    const m = oppMemory(st);
    const seen = Object.keys(m.seen).map(card).filter(Boolean);
    const leg = m.legend ? card(m.legend) : null;
    const dom = ((leg && leg.domain) || '').toLowerCase();
    const prof = {
      spells: seen.filter((c) => c.isSpell).length,
      small: seen.filter((c) => c.isUnit && c.might <= 3).length,
      big: seen.filter((c) => c.isUnit && c.might >= 5).length,
      gear: seen.filter((c) => c.isGear).length,
      hidden: seen.filter((c) => /HIDDEN/.test(c.text)).length,
    };
    const ins = [], outs = [];
    const swap = (inn, out, why) => { if ((SIDE[inn] || 0) > ins.filter((x) => x.n === inn).length) { ins.push({ n: inn, why }); outs.push(out); } };
    const outPool = ['Life from Stone', 'Ki Burst', 'Hunker Down', 'Hunker Down', 'En Garde', 'En Garde', 'Ride the Wind', 'Scuttle Crab'];
    let oi = 0; const nextOut = () => outPool[oi++] || 'Scuttle Crab';
    if (prof.gear >= 2 || /gear|equip/i.test(leg ? leg.text : '')) swap('Adaptatron', nextOut(), 'they rely on gear: it kills one when it conquers');
    if (prof.big >= 2 || /body/.test(dom)) { swap('Star-Crossed', nextOut(), 'bounces their biggest unit'); swap('Rune Prison', nextOut(), 'stun a big attacker'); swap('Back Off', nextOut(), 'stun + draw, can be hidden'); }
    if (prof.small >= 4 || /fury|order/.test(dom)) { swap('Gust', nextOut(), 'cheap answer to ≤3 Might units'); swap('Vex, Apathetic', nextOut(), 'stuns every unit they play while she sits on a battlefield'); }
    if (prof.big + prof.small >= 4 && prof.spells <= 1 && seen.length >= 6) { swap('Charm', 'Defy', 'they barely cast spells: Defy is dead, Charm moves a blocker away'); }
    if (st.inverted && /order|body/.test(dom)) swap('Royal Entourage', nextOut(), 'extra legend ready for Irelia lines in a slower matchup');
    const notes = [];
    if (prof.spells >= 4 || /mind/.test(dom)) notes.push('Spell-heavy opponent: keep all 3 Defy and both Not So Fast.');
    if (prof.hidden >= 2) notes.push('They hide cards: keep Scuttle Crab (its Deathknell shows their facedown cards).');
    return { m, prof, ins, outs, notes, seenCount: seen.length };
  }

  // ---------------- Ask ----------------
  const DECK_GUIDE = `Deck: Inverted Mask (Irelia, Blade Dancer legend; Irelia, Fervent champion; Neeko picks Riven The Exile / Yasuo Unforgiven / Vex Gloomist; Calm+Chaos). Plan: take empty battlefields early with cheap units (Tideturner, Scuttle Crab, Reckless Innovator), protect them with reactions (Defy, Defiant Dance, Discipline, En Garde, Not So Fast), and use Irelia's legend (when you choose a friendly unit: exhaust Irelia + pay 1 Power of any domain to ready it) to re-use units. Riven, Deserter (once/turn: exhaust a friendly unit to ready a unit) loops with Reckless Innovator: target Innovator, pay by exhausting Innovator, take a Gold token, Innovator readies. Neeko adds a borrowed Legend (enters ready) while she lives. Heartening Soul readies a legend and gives legends "exhaust: +3 Might". Guardian Angel: equip [calm]; if the unit would die, kill Angel instead, heal/exhaust/recall the unit. The Hold-breaker version adds 2 Charm (move an enemy unit — use it on your turn to pull their unit off a battlefield they hold so they can't score the hold) and 1 Back Off.`;
  const PRIMER = `Riftbound 1v1 rules summary (from the Core Rules):
- First to 8 points wins. Score 1 when you CONQUER a battlefield (gain control of it on your turn) and 1 for each battlefield you HOLD (control) at the start of your turn. Each battlefield scores at most once per player per turn.
- FINAL POINT: a conquer that would be your 8th point only counts if you have scored EVERY battlefield this turn; otherwise you draw a card instead. Holds have no such limit.
- Runes: exhaust (tap) a ready rune for 1 Energy; recycle a rune (ready or exhausted, including one you just tapped) for 1 Power of its domain. [A] = Power of any domain. You channel 2 runes per turn.
- Units are played to your base or a battlefield you control and enter exhausted unless an effect says otherwise. Moving a unit exhausts it. Units in base can move to a battlefield; GANKING units can move battlefield to battlefield.
- Combat: when units of both players are at a battlefield, each side deals damage equal to its Might; units with damage >= Might die. If both sides still have units, attackers are recalled. The side left alone controls the battlefield. Damage heals after combat.
- Timing: Reaction cards any time (even in response); Action cards on your turn or in showdowns; others only on your turn in an open state. Activated abilities of units/gear: your main phase only unless they say Action/Reaction.
- Hidden: pay [A] to hide a card facedown at a battlefield you control; from your next turn it can be played for free as a reaction there. Not the same turn.
- Keywords: Deflect = opponents pay extra Power to target it; Tank = takes damage first; Shield +Might when defending; Assault +Might when attacking; Deathknell = when it dies; Legion = if you played another card this turn; Stun = deals no combat damage this turn.`;
  function localAnswer(st, qtext) {
    const t = qtext.toLowerCase();
    // card lookup
    const names = Object.values(CARDS).map((c) => c[0]).filter((n) => n.length > 3 && t.includes(n.toLowerCase().replace(/,/g, '')));
    const byNorm = Object.keys(CARDS).filter((k) => k.length > 4 && norm(t).includes(k));
    const hit = names[0] || (byNorm[0] && CARDS[byNorm[0]][0]);
    const parts = [];
    if (hit) { const c = card(hit); parts.push(`${B(c.name)} — ${esc(c.type)} · ${costTxt(c)}${c.isUnit ? ` · ${c.might} Might` : ''}<br>${esc(c.text)}`); }
    Object.keys(GLOSSARY).forEach((k) => { if (new RegExp('\\b' + k.toLowerCase() + '\\b').test(t)) parts.push(`${B(k)}: ${esc(GLOSSARY[k])}`); });
    if (/what (should|do) i|what now|next|play\??$/i.test(t) && st) { const a = advise(st)[0]; if (a) parts.push(`${B(a.title)}<br>${a.steps.join('<br>')}`); }
    if (/energy|power|recycle|rune/i.test(t)) parts.push('Energy = tap a ready rune. Power = recycle a rune of that domain (exhausted ones work). [A] = any domain.');
    const rh = searchRules(qtext, 3000);
    if (rh.length) parts.push(`<b>Core rules — ${esc(rh[0].head)}</b> <span style="opacity:.7">(rev ${esc(RULES.rev || '?')})</span><br>${esc(rh[0].text.slice(0, 1400))}${rh[0].text.length > 1400 ? '…' : ''}${rh[1] ? `<br><span style="opacity:.7">Also see: ${esc(rh[1].head)}</span>` : ''}`);
    return parts.length ? parts.join('<br><br>') : 'I can answer card, keyword and rules questions offline. For full answers, add a Claude API key in Settings (⚙).';
  }
  function affordList(st) {
    const lines = [];
    [...new Set([...st.hand, ...st.champion])].forEach((n) => {
      const c = card(n); if (!c) return;
      const pl = plan(st, c.e, c.p, domainsOf(c));
      lines.push(`- ${n}: costs ${costTxt(c)} → ${pl ? 'AFFORDABLE (' + pl.text + ')' : 'NOT affordable'}`);
      if (/ACCELERATE/.test(c.text)) { const d = domainsOf(c); const pa = plan(st, c.e + 1, c.p + 1, d); lines.push(`  - ${n} with Accelerate (enters ready): ${c.e + 1} Energy + ${c.p + 1} ${(d || ['any']).join('/')} Power → ${pa ? 'AFFORDABLE' : 'NOT affordable'}`); }
    });
    lines.push(`Ready runes: ${st.ready}. Units played without Accelerate enter EXHAUSTED and cannot move this turn${st.legendNames.includes('Riven, The Exile') ? ' (except: Riven, The Exile makes units played to a battlefield you control enter ready)' : ''}.`);
    return lines.join('\n');
  }
  function buildContext(st) {
    const names = new Set([...st.hand, ...st.champion, ...st.legends.map((l) => l.name), ...st.oppLegends.map((l) => l.name), ...st.units.map((u) => u.name), ...st.gear.map((g) => g.name), ...st.chain.map((c) => c.name), ...Object.values(st.bf).map((b) => b.name)]);
    const cards = [...names].map(card).filter(Boolean);
    const cardText = cards.map((c) => `- ${c.name} [${c.type}; ${costTxt(c)}${c.isUnit ? '; ' + c.might + ' Might' : ''}]: ${c.text}`).join('\n');
    const kw = Object.keys(GLOSSARY).filter((k) => cards.some((c) => new RegExp('\\b' + k + '\\b', 'i').test(c.text))).map((k) => `- ${k}: ${GLOSSARY[k]}`).join('\n');
    const where = (u) => (st.bf[u.zone] ? st.bf[u.zone].name : u.zone) + (u.ready ? '' : ' (exhausted)');
    const board = `Turn ${st.turn} (${st.myTurn ? 'MY turn' : "OPPONENT's turn"}; this is turn #${Math.ceil(st.turn / 2)} for the active player). Score: me ${st.myScore}, opponent ${st.oppScore}.
My runes: ${st.ready} ready of ${st.runes.length} (${st.runes.map((r) => r.domain + (r.ready ? '' : '*')).join(', ')}; * = exhausted). Floating: ${st.floatE} Energy, ${st.floatP} Power.
My hand: ${st.hand.join(', ') || 'empty'}. Champion zone: ${st.champion.join(', ') || 'empty'}.
My legends: ${st.legends.map((l) => l.name + (l.ready ? '' : ' (exhausted)')).join(', ')}. Opponent legend: ${st.oppLegends.map((l) => l.name).join(', ') || 'unknown'}.
My units (current Might with breakdown): ${st.myUnits.map((u) => u.name + ' @ ' + where(u) + ' = ' + mightTxt(u) + (u.role ? ' ' + u.role : '') + (u.ready ? '' : ' exhausted')).join('; ') || 'none'}.
Opponent units (current Might with breakdown): ${st.theirUnits.map((u) => u.name + ' @ ' + where(u) + ' = ' + mightTxt(u) + (u.role ? ' ' + u.role : '') + (u.ready ? '' : ' exhausted')).join('; ') || 'none'}.
Gear: ${st.gear.map((g) => (g.mine ? 'mine ' : 'theirs ') + g.name + ' @ ' + where(g)).join(', ') || 'none'}. Equipped: ${[...attached].map(([g, u]) => g + '→' + u).join(', ') || 'none'}.
Facedown hidden cards: mine ${st.hidden.filter((h) => h.mine).length}, theirs ${st.hidden.filter((h) => !h.mine).length}.
Battlefields (Might totals as shown in RiftAtlas — these are authoritative; per-unit values above are estimates): ${Object.values(st.bf).map((b) => `${b.name}: my Might ${b.mine} vs their Might ${b.theirs} (controller: ${b.controller})${b.missingMine || b.missingTheirs ? ` [effects not yet applied would make it ${b.calcMine} vs ${b.calcTheirs}]` : ''}`).join('; ')}.
Chain (bottom→top): ${st.chain.map((c) => (c.mine ? 'MINE ' : 'THEIRS ') + c.name).join(', ') || 'empty'}.
Recent log (newest first): ${st.log.slice(0, 15).map((l) => l.text).join(' | ')}
AFFORDABILITY RIGHT NOW (computed exactly by the coach — trust these, don't recompute):
${affordList(st)}
NEXT-TURN SCORING (computed by the coach): ${(() => { try { const t = advise(st).find((a) => /next turn|Their next turn/i.test(a.title)); return t ? t.steps.map((x) => x.replace(/<[^>]+>/g, '')).join(' ') : 'no obvious threat'; } catch (e) { return 'unknown'; } })()}`;
    const prof = [profileText(st.legendNames[0], 'MY'), profileText((st.oppLegends[0] || {}).name, 'OPPONENT')].filter(Boolean).join('\n');
    const fc = Object.values(st.bf).map((b) => { const f = predictFight(st, b); return f ? `${b.name}: ${f.result}. Steps: ${f.log.join('; ')}${f.shieldOn ? ` (Shield on ${f.shieldOn})` : ''}` : ''; }).filter(Boolean).join('\n');
    const fcNote = fc ? `\n\nFIGHT FORECAST (computed by rules: triggers, lethal cleanup, combat damage; check it, it is not RiftAtlas data):\n${fc}` : '';
    const readNote = st.readIssues && st.readIssues.length ? `\n\nBOARD-READ WARNINGS (the coach may have misread these — trust the RiftAtlas totals and say so if it matters): ${st.readIssues.join('; ')}` : '';
    return { cardText, kw, board: board + fcNote + readNote + (prof ? '\n\n' + prof + '\n(Profiles are derived from card text: use them to anticipate plans and synergies, not as fact about the exact decklist.)' : '') };
  }
  // token meter: real cost per call / per game, to price the subscription
  const PRICE = { 'claude-sonnet-5-5': [2, 10, 0.1, 2.5], 'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125], 'claude-opus-5-5': [4, 20, 0.2, 5] }; // $/MTok: in, out, cache read, cache write
  function logUsage(model, u) {
    if (!u) return; const pr = PRICE[model] || PRICE['claude-sonnet-5-5'];
    const cost = ((u.input_tokens || 0) * pr[0] + (u.output_tokens || 0) * pr[1] + (u.cache_read_input_tokens || 0) * pr[2] + (u.cache_creation_input_tokens || 0) * pr[3]) / 1e6;
    const m = store.get('usage', { calls: 0, cost: 0, inTok: 0, outTok: 0, games: {} });
    const g = (rec.cur && rec.cur.id) || 'nogame';
    m.calls++; m.cost += cost; m.inTok += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); m.outTok += u.output_tokens || 0;
    m.games[g] = m.games[g] || { calls: 0, cost: 0, model }; m.games[g].calls++; m.games[g].cost += cost;
    const ks = Object.keys(m.games); while (ks.length > 60) delete m.games[ks.shift()];
    store.set('usage', m);
  }
  function callClaude(system, user, maxTokens, cb) {
    const key = store.get('apiKey', '');
    if (!key) return cb(null, 'No API key — add one in ⚙');
    const body = { model: store.get('model', 'claude-sonnet-5-5'), max_tokens: Math.max(maxTokens, 1500), output_config: { effort: store.get('aiEffort', 'medium') }, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }] };
    const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const handle = (status, text) => { try { const j = JSON.parse(text); if (status >= 400) return cb(null, (j.error && j.error.message) || ('HTTP ' + status)); logUsage(body.model, j.usage); const txt = (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n').trim(); if (!txt) return cb(null, `No answer (stop: ${j.stop_reason || '?'}) — try AI depth 'fast' in ⚙`); cb(txt); } catch (e) { cb(null, 'Bad response: ' + e.message); } };
    if (typeof GM_xmlhttpRequest === 'function') GM_xmlhttpRequest({ method: 'POST', url: 'https://api.anthropic.com/v1/messages', headers, data: JSON.stringify(body), timeout: 45000, onload: (r) => handle(r.status, r.responseText), onerror: () => cb(null, 'Network error'), ontimeout: () => cb(null, 'Timed out') });
    else fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) }).then(async (r) => handle(r.status, await r.text())).catch((e) => cb(null, e.message));
  }
  function askClaude(st, qtext, cb) {
    if (!store.get('apiKey', '')) return cb(localAnswer(st, qtext), true);
    const { cardText, kw, board } = buildContext(st);
    const kwTerms = Object.keys(GLOSSARY).filter((k) => new RegExp('\\b' + k + '\\b', 'i').test(qtext + ' ' + cardText)).join(' ');
    const rules = rulesBlock(searchRules(qtext, 9000, kwTerms));
    const system = `You are a Riftbound TCG coach and a rules judge watching a live game. If the question is about rules, timing or an interaction, answer like a judge: give the ruling first in one line, then the reason, and cite the core rule numbers you used (e.g. "rule 346.2"). If it is about strategy, answer in a few short, concrete steps that name the exact cards and units. Card text beats rules text (Golden Rule). Use only the rules excerpts and card texts given; if they don't settle it, say what is uncertain. Never invent card text or rule numbers.\n\n${PRIMER}\n\n${st.inverted ? DECK_GUIDE : ''}`;
    callClaude(system, `BOARD FACTS:\n${facts}\n\nOFFICIAL CORE RULES — relevant excerpts (revision ${RULES.rev || '?'}):\n${rules || '(none matched)'}\n\nCARD TEXTS:\n${cardText}\n\nKEYWORDS:\n${kw}\n\nBOARD:\n${board}\n\nQUESTION: ${qtext}`, 900, (txt, err) =>
      cb(err ? `<span style="color:#ff8a8a">${esc(err)}</span>` : esc(txt).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), false));
  }

  // ---------------- learning loop ----------------
  // 1) Every AI answer is logged next to what the quick rules said and what you then did.
  // 2) 👎 on any line saves the board so the mistake can be fixed.
  // 3) Lessons that proved right are written into LESSONS (used by the AI prompt) and into the quick rules in updates.
  const LESSONS = [
    'A clearly winnable attack on a battlefield the opponent holds beats walking into an empty one: it scores now AND denies their hold point.',
    'One rune can pay 1 Energy and then be recycled for 1 Power of its domain.',
    'The opponent scores a hold for each battlefield they control when their turn starts; only removing/moving/beating all their units there stops it (Charm, Star-Crossed, Gust, combat).',
    "Not So Fast and Defy can't counter a unit being played; answer the unit's play ability instead if it targets you.",
    "Don't plan plays that need more Energy than your ready runes; Accelerate adds 1 Energy + 1 Power.",
    'Forgotten Monument: nobody scores there before their 3rd turn.',
  'Worked example (Thousand-Tailed Watcher): "give enemy units -3 [might] this turn, to a minimum of 1" lowers Might but deals no damage. Graves 4 +2 Shield (Fortified Position) -3 = 3; Master Yi 4 -3 = 1; Wuju legend +2 only when a unit defends ALONE. Graves\' defend trigger deals 3 to every attacker: Fizz (3) dies, Watcher (7) survives with 3. Combat: Graves deals no combat damage, Yi deals 1 (Watcher at 4 of 7: lives); Watcher deals 7, lethal needs 3 (Graves) + 1 (Yi) = 4, so both defenders die and the attacker takes the battlefield. Always apply "this turn" Might changes before judging a fight.',
  'Combat order (rules 466.2, 359.3.f.2, 323.4): when combat opens, attack/defend triggers go on the chain BEFORE any damage; players then get Focus and can respond. A trigger that deals damage equal to a unit\'s Might (e.g. Graves, Blasting Through) uses that Might when it RESOLVES — so a pump cast in response (Discipline etc.) resolves first and adds to the damage. If that damage is lethal (damage >= Might), the enemy dies in the cleanup before combat damage, and units that "don\'t deal combat damage" are never at risk from it. Worked example: Graves 9 Might defending alone vs Seraphic Wyvern 11: cast Discipline in response to Graves\' defend trigger -> Graves 11 -> 11 damage kills the Wyvern -> no combat damage -> Graves lives. Pumping AFTER the trigger resolved adds no damage, and the Wyvern then kills Graves in combat.',
  'For who wins a fight, use the battlefield Might totals shown in RiftAtlas: they include the counters and buffs players actually set. Per-unit values and printed Might are only estimates; never claim a lead the RiftAtlas totals do not show.',
  'When losing a fight, check reinforcements first: ready units in base can move in, and Ride the Wind can bring a big unit from the other battlefield. Only advise against committing more if even that cannot win.',
  ];
  const learn = {
    all() { return store.get('learn', []); },
    add(e) { const a = this.all(); a.push(e); while (a.length > 300) a.shift(); store.set('learn', a); },
    snap(st) { return { turn: st.turn, myTurn: st.myTurn, score: `${st.myScore}-${st.oppScore}`, ready: st.ready, hand: st.hand, mine: st.myUnits.map((u) => u.name + '@' + (st.bf[u.zone] ? st.bf[u.zone].name : u.zone) + (u.ready ? '' : '*')), theirs: st.theirUnits.map((u) => u.name + '@' + (st.bf[u.zone] ? st.bf[u.zone].name : u.zone) + (u.ready ? '' : '*')), chain: st.chain.map((c) => (c.mine ? '+' : '-') + c.name), opp: (st.oppLegends[0] || {}).name || '' }; },
    did(st, rows) { // attach what the player actually did right after the last AI answer (same turn)
      const a = this.all(); const e = a[a.length - 1]; if (!e || e.type !== 'ai' || e.turn !== st.turn || (e.did || []).length > 6) return;
      rows.filter((r) => r.mine !== false && /^(Played|Moved|Equipped|Exhausted)/.test(r.text)).forEach((r) => (e.did = e.did || []).push(r.text));
      store.set('learn', a);
    },
  };
  const wordsOf = (t) => new Set(String(t || '').toLowerCase().match(/[a-z']{4,}/g) || []);
  function agrees(a, b) { if (!a || !b) return null; const A = wordsOf(a), Bw = wordsOf(b); let n = 0; A.forEach((w) => { if (Bw.has(w)) n++; }); return n >= 2 || (/pass|nothing/.test(a.toLowerCase()) && /pass|nothing|just watch/.test(b.toLowerCase())); }

  // ---------------- AI mode: Claude reads the board at key moments ----------------
  const ai = { on: store.get('aiMode', false), busy: false, last: null, sig: '', calls: 0, game: '', err: '' };
  const AI_SYSTEM = () => `You are an expert Riftbound TCG coach watching a live 1v1 game for the player ("me"). Give the single best thing to do RIGHT NOW, then the concrete steps.
Rules for your answer:
- Use only the rules summary and the card texts provided. Never invent card text. If a ruling is uncertain, lower your confidence and say what is uncertain.
- Name exact cards, units, battlefields and which runes to tap/recycle. Only suggest plays marked AFFORDABLE in the affordability list.
- Your glance and your why must agree with each other.
- Scoring reminder: the opponent scores a HOLD for every battlefield they control when their turn starts. Your own battlefields do not block that. The only ways to stop a hold are to remove, move or defeat all their units there before your turn ends. If that is impossible, say so plainly and give the best line for the turn after.
- Consider: what the opponent can do on their next turn (they untap everything), the final-point rule, battlefield texts, and keeping mana for reactions.
- If it's the opponent's turn and nothing needs answering, say what to watch for.
- Reply with ONLY a JSON object, in this field order: {"steps": ["<short step>", "..."], "why": "<one short sentence>", "glance": "<max 8 words: the single action from your FIRST step, or 'Pass — nothing worth doing'>", "confidence": "high"|"medium"|"low"}
- Never hedge in the glance ("X only if needed; otherwise pass"). Pick one.
- 'My units' lists every unit I have, ready or exhausted; exhausted units still count as units.

${PRIMER}

LESSONS LEARNED IN EARLIER GAMES (trust these):
${LESSONS.map((l) => '- ' + l).join('\n')}

${DECK_GUIDE}`;
  function aiSignature(st) { return [st.turn, st.myTurn, st.myScore, st.oppScore, st.ready, st.hand.join(), st.units.map((u) => u.id + u.zone + u.ready).join(), st.chain.map((c) => c.name).join()].join('|'); }
  function aiMaybe(st, reason, force) {
    if (!ai.on && !force) return;
    if (!store.get('apiKey', '')) { ai.err = 'Add your Claude API key in ⚙ to use AI mode.'; return; }
    if (ai.busy) return;
    if (!force && !st.myTurn && !st.ready && !st.floatE && !st.gear.some((g) => g.mine && /^gold$/i.test(g.name)) && !st.hidden.some((h) => h.mine)) {
      ai.last = { glance: 'No ready runes — nothing you can do', why: 'Saved an AI call: with no runes, Gold or hidden cards you have no responses this turn.', steps: [], confidence: 'high', sig: aiSignature(st), reason, t: Date.now() }; return; }
    if (ai.game !== st.room) { ai.game = st.room; ai.calls = 0; }
    const cap = +store.get('aiCap', 40);
    if (!force && ai.calls >= cap) { ai.err = `AI limit for this game reached (${cap}). Change it in ⚙.`; return; }
    const sig = aiSignature(st);
    if (!force && sig === ai.sig) return;
    ai.busy = true; ai.sig = sig; ai.calls++; ai.err = '';
    const { cardText, kw, board } = buildContext(st);
    const hints = advise(st).filter((a) => a.g).slice(0, 4).map((a) => `- ${a.g}`).join('\n');
    const situ = [reason, st.chain.map((c) => c.name + ' ' + ((c.c && c.c.text) || '')).join(' '), Object.values(st.bf).some((b) => b.myUnits.length && b.theirUnits.length) ? 'combat showdown damage attacker defender' : ''].join(' ');
    const tipRules = rulesBlock(searchRules(situ, 4500, kw.split('\n').map((l) => l.replace(/^- ([^:]+):.*/, '$1')).join(' ')));
    callClaude(AI_SYSTEM(), `RELEVANT CORE RULES (rev ${RULES.rev || '?'}):\n${tipRules || '(none)'}\n\nCARD TEXTS:\n${cardText}\n\nKEYWORDS:\n${kw}\n\nBOARD:\n${board}\n\nWHY YOU ARE BEING ASKED: ${reason}\n\nThe simple rule-based coach suggests (may be wrong):\n${hints || '- nothing'}`, 450, (txt, err) => {
      ai.busy = false;
      if (err) { ai.err = err; lastHtml = ''; render(true); return; }
      let j = null; try { j = JSON.parse((txt.match(/\{[\s\S]*\}/) || [''])[0]); } catch (e) { /* not JSON */ }
      if (!j || !j.glance) { const f = (k) => { const m = txt.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)')); return m ? m[1].replace(/\\"/g, '"') : ''; };
        const gl = f('glance'); if (gl) j = { glance: gl, why: f('why'), steps: (txt.match(/"steps"\s*:\s*\[([\s\S]*?)(\]|$)/) || ['', ''])[1].split(/"\s*,\s*"/).map((x) => x.replace(/^\s*"|"\s*$/g, '')).filter(Boolean), confidence: f('confidence') || 'medium' }; }
      ai.last = j && j.glance ? { ...j, sig, reason, t: Date.now() } : { glance: txt.slice(0, 80), why: '', steps: [txt], confidence: 'low', sig, reason, t: Date.now() };
      try { const qtop = advise(st).filter((a) => a.g).sort((x, y) => (y.p || 0) - (x.p || 0))[0]; learn.add({ type: 'ai', at: new Date().toISOString().slice(0, 16), room: st.room, deck: store.get('version', 'Auto'), reason, quick: qtop ? qtop.g : '', ai: ai.last.glance, why: ai.last.why, agree: agrees(qtop && qtop.g, ai.last.glance), ...learn.snap(st) }); } catch (e) { /* ignore */ }
      lastHtml = ''; render(true);
    });
  }
  // decide when to ask: start of my turn, opponent puts something on the chain, a fight starts
  let aiPrev = { turn: -1, myTurn: null, enemyChain: 0, fights: '' };
  function aiTriggers(st) {
    if (!ai.on || st.gameOver || !st.turn) { aiPrev = { turn: st.turn, myTurn: st.myTurn, enemyChain: 0, fights: '' }; return; }
    const enemyChain = st.chain.filter((c) => !c.mine).length;
    const fights = Object.values(st.bf).filter((b) => b.myUnits.length && b.theirUnits.length).map((b) => b.id).join();
    let reason = '';
    if (st.myTurn && (st.turn !== aiPrev.turn || aiPrev.myTurn === false)) reason = 'My turn just started. What is my best plan this turn?';
    else if (enemyChain > aiPrev.enemyChain) reason = `The opponent just put ${st.chain.filter((c) => !c.mine).slice(-1)[0].name} on the chain. Should I respond, and how?`;
    else if (fights) { const fresh = fights.split(',').filter((f) => !(aiPrev.seenFights || []).includes(st.turn + ':' + f)); if (fresh.length) reason = 'A fight is starting at a battlefield. How do I win or minimise it?'; }
    const seenFights = (aiPrev.seenFights || []).concat(fights ? fights.split(',').map((f) => st.turn + ':' + f) : []).slice(-20);
    aiPrev = { turn: st.turn, myTurn: st.myTurn, enemyChain, fights, seenFights };
    if (reason) { const t0 = st.turn, mine0 = st.myTurn;
      setTimeout(() => { const s2 = readState(); if (!s2 || s2.turn !== t0 || s2.myTurn !== mine0) return; // the moment passed (turn ended) — don't answer an old question
        if (/opponent just put/.test(reason) && !s2.chain.some((c) => !c.mine)) return;
        aiMaybe(s2, reason); }, mine0 && /turn just started/.test(reason) ? 2500 : 600); }
  }
  // ---------------- panel ----------------
  const panel = document.createElement('div');
  panel.id = 'rb-coach';
  panel.innerHTML = `<style>
#rb-coach{position:fixed;right:12px;bottom:90px;width:370px;max-height:62vh;display:flex;flex-direction:column;z-index:2147483647;background:rgba(13,18,34,.96);color:#e8ecf8;font:13px/1.4 system-ui,sans-serif;border:1px solid #3d4f86;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
#rb-coach header{cursor:move;padding:6px 10px;background:#22305a;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;font-weight:600;user-select:none}
#rb-coach header button,#rb-coach nav button{background:none;border:0;color:#cbd4f0;cursor:pointer;font:inherit}
#rb-coach nav{display:flex;gap:2px;padding:4px 6px 0;background:#1a2445}#rb-coach nav button{padding:4px 8px;border-radius:6px 6px 0 0;opacity:.7}#rb-coach nav button.on{background:#0d1222;opacity:1}
#rb-coach .b{padding:8px 10px;overflow:auto}#rb-coach .r{margin:0 0 7px;padding:6px 8px;border-radius:6px;background:#19223f}
#rb-coach .r .h{font-weight:600;margin-bottom:2px;display:flex;justify-content:space-between;gap:6px}#rb-coach .r .h button{background:#2c3a66;border:0;color:#dfe6ff;border-radius:4px;cursor:pointer;font-size:11px;padding:1px 6px}
#rb-coach .r ol,#rb-coach .r ul{margin:2px 0 0 16px;padding:0}#rb-coach .r li{margin:1px 0}
#rb-coach .do{border-left:3px solid #4fd18b}#rb-coach .hold{border-left:3px solid #f2c14e}#rb-coach .warn{border-left:3px solid #ff6b6b}#rb-coach .info{border-left:3px solid #6ea8ff}
#rb-coach .sec{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:6px 0 4px}
#rb-coach .s{opacity:.65;font-size:11px;padding:4px 10px 6px;border-top:1px solid #26345f}
#rb-coach textarea,#rb-coach input{width:100%;box-sizing:border-box;background:#0b1020;color:#e8ecf8;border:1px solid #3d4f86;border-radius:6px;padding:6px;font:inherit}
#rb-coach .btn{background:#3a57b0;border:0;color:white;border-radius:6px;padding:5px 10px;cursor:pointer;margin-top:5px}
#rb-coach.min nav,#rb-coach.min .b,#rb-coach.min .s{display:none}
#rb-coach .hl{font-size:17px;font-weight:700;line-height:1.3;padding:9px 10px;border-radius:8px;background:#1d2950;margin-bottom:6px;display:flex;justify-content:space-between;gap:8px;cursor:pointer}
#rb-coach .gl{font-size:14px;font-weight:600;padding:5px 8px;border-radius:6px;background:#161f3b;margin-bottom:4px;display:flex;justify-content:space-between;gap:8px;cursor:pointer}
#rb-coach .hl button,#rb-coach .gl button{background:#2c3a66;border:0;color:#dfe6ff;border-radius:4px;cursor:pointer;font-size:12px;padding:0 7px;align-self:center}
#rb-coach .hl.warn,#rb-coach .gl.warn{border-left:4px solid #ff6b6b}#rb-coach .hl.do,#rb-coach .gl.do{border-left:4px solid #4fd18b}#rb-coach .hl.hold,#rb-coach .gl.hold{border-left:4px solid #f2c14e}#rb-coach .hl.info,#rb-coach .gl.info{border-left:4px solid #6ea8ff}
#rb-coach .ai{border:1px solid #4b5fa8;border-radius:8px;padding:6px;margin-bottom:6px;background:#141c38}#rb-coach .aih{display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:4px}#rb-coach .aih button{background:#3a57b0;border:0;color:#fff;border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer}
#rb-coach ul.xs{margin:0 0 6px 18px;padding:0;font-size:12px;opacity:.9}#rb-coach .more{font-size:11px;opacity:.55;margin-top:2px}
</style>
<header><span>⚔ Coach <span style="opacity:.6;font-weight:400">v${VERSION}</span></span><span><button data-a="ai" title="AI mode on/off">🤖</button><button data-a="set" title="Settings">⚙</button><button data-a="min" title="Minimize">–</button><button data-a="x" title="Hide (run the script again to show)">×</button></span></header>
<nav><button data-t="glance" class="on">Glance</button><button data-t="now">Details</button><button data-t="board">Board</button><button data-t="side">Sideboard</button><button data-t="ask">Ask</button><button data-t="judge">Judge</button><button data-t="stats">Stats</button><button data-t="tests">Tests</button></nav>
<div class="b"></div><div class="s"></div>`;
  document.body.appendChild(panel);
  const body = panel.querySelector('.b'), foot = panel.querySelector('.s');
  let tab = store.get('tab', 'glance'), expanded = null, settings = false, lastHtml = '', lastState = null, askLog = [];
  panel.querySelectorAll('nav button').forEach((b) => { b.classList.toggle('on', b.dataset.t === tab); b.onclick = () => { tab = b.dataset.t; store.set('tab', tab); settings = false; panel.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b)); lastHtml = ''; render(true); }; });
  panel.querySelector('[data-a=min]').onclick = () => panel.classList.toggle('min');
  panel.querySelector('[data-a=x]').onclick = () => { panel.style.display = 'none'; };
  const aiBtn = panel.querySelector('[data-a=ai]');
  const paintAi = () => { aiBtn.style.opacity = ai.on ? '1' : '.35'; aiBtn.title = ai.on ? 'AI mode is ON (click to turn off)' : 'AI mode is OFF (click to turn on)'; };
  paintAi();
  aiBtn.onclick = () => { ai.on = !ai.on; store.set('aiMode', ai.on); paintAi(); tab = 'glance'; panel.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x.dataset.t === 'glance')); lastHtml = ''; render(true); const st = readState(); if (ai.on && st && st.turn) aiMaybe(st, 'AI mode was just turned on. What should I do now?', true); };
  panel.querySelector('[data-a=set]').onclick = () => { settings = !settings; lastHtml = ''; render(true); };
  (() => { const h = panel.querySelector('header'); let sx = null, sy, ox, oy;
    h.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', (e) => { if (sx == null) return; Object.assign(panel.style, { left: ox + e.clientX - sx + 'px', top: oy + e.clientY - sy + 'px', right: 'auto', bottom: 'auto' }); });
    h.addEventListener('pointerup', () => { sx = null; }); })();
  // ---------------- 👎 feedback form ----------------
  let fbBox = null;
  const FB_REASONS = ["Breaks a rule", "Can't afford it", "Card text read wrong", "Wrong Might / combat math", "Misread the board", "Better play exists", "Bad timing (wrong turn/phase)", "Too vague"];
  const REPO = 'ins0dus/riftbound-coach';
  // Reports go to our small feedback server (Cloudflare Worker), which files them as GitHub issues.
  // Players never leave the game and don't need a GitHub account. Until the server is live, reports wait in a queue.
  const FEEDBACK_URL = 'https://rb-coach-feedback.nab-iso.workers.dev';
  function postFeedback(list, cb) {
    if (!FEEDBACK_URL) return cb(false, 'queued');
    const data = JSON.stringify({ version: VERSION, title: list.length === 1 ? `[feedback] ${(list[0].reasons || [])[0] || 'Bad advice'}: ${String(list[0].line).slice(0, 70)}` : `[feedback] ${list.length} reports from coach ${VERSION}`, body: fbIssueBody(list) });
    const done = (ok) => cb(ok, ok ? 'sent' : 'queued');
    try {
      if (typeof GM_xmlhttpRequest === 'function') GM_xmlhttpRequest({ method: 'POST', url: FEEDBACK_URL, headers: { 'content-type': 'application/json' }, data, timeout: 20000, onload: (r) => done(r.status >= 200 && r.status < 300), onerror: () => done(false), ontimeout: () => done(false) });
      else fetch(FEEDBACK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data }).then((r) => done(r.ok)).catch(() => done(false));
    } catch (e) { done(false); }
  }
  function flushFeedback() {
    const all = learn.all(); const un = all.filter((x) => x.type === 'thumbsDown' && x.queued && !x.sent).slice(-10); if (!un.length || !FEEDBACK_URL) return;
    postFeedback(un, (ok) => { if (!ok) return; const a2 = learn.all(); a2.forEach((x) => { if (x.type === 'thumbsDown' && x.queued && !x.sent && un.some((u) => u.at === x.at && u.line === x.line)) x.sent = true; }); store.set('learn', a2); });
  }
  if (FEEDBACK_URL && !/jsdom/i.test(navigator.userAgent)) { setTimeout(flushFeedback, 8000); setInterval(flushFeedback, 5 * 60 * 1000); }
  function issueUrl(title, bodyTxt) {
    let b = bodyTxt; if (b.length > 6000) b = b.slice(0, 6000) + '\n…(trimmed)';
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
  }
  function fbIssueBody(list) {
    return list.map((x) => `### 👎 ${x.line}\n- Why: ${(x.reasons || []).join(', ') || '—'}\n- Note: ${x.note || '—'}\n- Coach ${VERSION} · deck ${x.deck} · T${x.turn} ${x.myTurn ? 'my turn' : 'their turn'} · score ${x.score} · ready runes ${x.ready}\n- Hand: ${(x.hand || []).join(', ')}\n- Mine: ${(x.mine || []).join(', ')}\n- Theirs: ${(x.theirs || []).join(', ')}\n- Chain: ${(x.chain || []).join(', ') || '—'}\n- Opp legend: ${x.opp || '?'}`).join('\n\n') +
      '\n\n_Sent from the coach\'s 👎 form. Claude verifies each report against the core rules and card text before changing the coach._';
  }
  function openFeedback(idx) {
    if (fbBox) fbBox.remove();
    const entry = learn.all()[idx]; if (!entry) return;
    fbBox = document.createElement('div');
    fbBox.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif';
    fbBox.innerHTML = `<div style="background:#14213d;color:#e8eefc;border:1px solid #3a5a9a;border-radius:10px;padding:14px;width:380px;max-width:92vw;box-shadow:0 8px 30px #000a">
      <div style="font-weight:700;margin-bottom:4px">What was wrong?</div>
      <div style="opacity:.8;margin-bottom:8px">${esc(entry.line)}</div>
      <div data-fbr style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${FB_REASONS.map((r) => `<button data-r="${esc(r)}" style="background:#22335a;color:#e8eefc;border:1px solid #3a5a9a;border-radius:14px;padding:3px 9px;cursor:pointer">${esc(r)}</button>`).join('')}</div>
      <textarea data-fbn rows="3" placeholder="Optional: what should it have said? e.g. 'Defy can counter Lacerate — it's a spell'" style="width:100%;box-sizing:border-box;background:#0d1730;color:#e8eefc;border:1px solid #3a5a9a;border-radius:6px;padding:6px"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button data-fbx style="background:none;color:#9fb3dc;border:none;cursor:pointer">Skip</button>
        <button data-fbs style="background:#2b4b8a;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">Save</button>
        <button data-fbg style="background:#3c8d5a;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer" title="Sends the report in the background — you stay in your game">Save & send to developer</button>
      </div></div>`;
    document.body.appendChild(fbBox);
    const picked = new Set();
    fbBox.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { const r = b.getAttribute('data-r'); if (picked.has(r)) { picked.delete(r); b.style.background = '#22335a'; } else { picked.add(r); b.style.background = '#c77d1a'; } }; });
    const save = () => { const all = learn.all(); if (all[idx]) { all[idx].reasons = [...picked]; all[idx].note = fbBox.querySelector('[data-fbn]').value.trim(); all[idx].version = VERSION; store.set('learn', all); } return all[idx]; };
    fbBox.querySelector('[data-fbx]').onclick = () => { fbBox.remove(); fbBox = null; };
    fbBox.querySelector('[data-fbs]').onclick = () => { save(); fbBox.remove(); fbBox = null; };
    fbBox.querySelector('[data-fbg]').onclick = () => {
      const e2 = save(); e2.queued = true; let all = learn.all(); all[idx] = e2; store.set('learn', all);
      const btn = fbBox.querySelector('[data-fbg]'); btn.textContent = 'Sending…'; btn.disabled = true;
      postFeedback([e2], (ok) => { all = learn.all(); if (all[idx]) { all[idx].sent = ok; store.set('learn', all); }
        btn.textContent = ok ? 'Sent ✓ thanks!' : 'Saved ✓ — will send automatically'; setTimeout(() => { if (fbBox) { fbBox.remove(); fbBox = null; } }, 1200); });
    };
    fbBox.addEventListener('click', (e) => { if (e.target === fbBox) { fbBox.remove(); fbBox = null; } });
  }
  body.addEventListener('click', (e) => {
    const x = e.target.closest('[data-exp]'); if (x && !e.target.closest('[data-done],[data-bad],[data-bad-ai]')) { const k = x.getAttribute('data-exp'); expanded = expanded === k ? null : k; lastHtml = ''; render(true); return; }
    const d = e.target.closest('[data-done]'); if (d) { const k = d.getAttribute('data-done'); doneKeys.add(k); reminders = reminders.filter((r) => r.key !== k); lastHtml = ''; render(true); }
    if (e.target.matches('[data-ask]')) submitAsk();
    if (e.target.matches('[data-judge]')) submitJudge();
    const jq = e.target.closest('[data-jq]'); if (jq) { submitJudge(jq.getAttribute('data-jq')); return; }
    const bad = e.target.closest('[data-bad],[data-bad-ai]');
    if (bad) { const st = readState(); if (st) { learn.add({ type: 'thumbsDown', at: new Date().toISOString().slice(0, 16), room: st.room, deck: store.get('version', 'Auto'), line: bad.hasAttribute('data-bad-ai') ? 'AI: ' + (ai.last && ai.last.glance) + ' — ' + (ai.last && ai.last.why) : 'Quick: ' + bad.getAttribute('data-bad'), ...learn.snap(st) }); openFeedback(learn.all().length - 1); } bad.textContent = '✓ saved'; bad.disabled = true; e.stopPropagation(); return; }
    if (e.target.matches('[data-ai-now]')) { const st = readState(); if (st) aiMaybe(st, 'The player asked for advice right now.', true); lastHtml = ''; render(true); return; }
    if (e.target.matches('[data-fbsend]')) { const all = learn.all(); all.forEach((x) => { if (x.type === 'thumbsDown' && !x.sent) x.queued = true; }); store.set('learn', all); e.target.textContent = FEEDBACK_URL ? 'Sending…' : 'Queued ✓ — sends automatically once the server is live'; flushFeedback(); return; }
    if (e.target.matches('[data-tapes]')) { tapes.save(); e.target.textContent = copyText(JSON.stringify(tapes.all())) ? 'Copied ✓ — paste it to Claude' : 'Copy failed'; return; }
    if (e.target.matches('[data-learn]')) { e.target.textContent = copyText(JSON.stringify(learn.all())) ? 'Copied ✓ — paste it to Claude' : 'Copy failed'; return; }
    if (e.target.matches('[data-csv]')) { e.target.textContent = copyText(toCSV(rec.games())) ? 'Copied ✓ — paste into the Game Log' : 'Copy failed'; return; }
    if (e.target.matches('[data-json]')) { e.target.textContent = copyText(JSON.stringify(rec.games())) ? 'Copied ✓' : 'Copy failed'; return; }
    const del = e.target.closest('[data-del]'); if (del) { store.set('games', rec.games().filter((g) => g.id !== del.getAttribute('data-del'))); lastHtml = ''; render(true); return; }
    if (e.target.matches('[data-pastekey]')) {
      const st2 = body.querySelector('#rbkst');
      const save = (k) => { k = (k || '').trim(); if (!/^sk-ant-/.test(k)) { st2.textContent = '⚠ Clipboard doesn\'t contain an sk-ant-… key. Copy the key in the Console first.'; return; } store.set('apiKey', k); body.querySelector('#rbk').value = k; st2.textContent = '✓ key saved — testing…';
        callClaude('Reply with the single word OK.', 'ping', 5, (t, err) => { st2.textContent = err ? '✗ ' + err : '✓ key works'; }); };
      try { navigator.clipboard.readText().then(save, () => { st2.textContent = 'Clipboard blocked — click inside the key box and press Ctrl+V, then Save.'; }); } catch (err2) { st2.textContent = 'Clipboard blocked — paste into the box, then Save.'; }
      return;
    }
    if (e.target.matches('[data-save]')) { store.set('apiKey', body.querySelector('#rbk').value.trim()); store.set('model', body.querySelector('#rbm').value || 'claude-sonnet-5-5'); store.set('aiCap', +body.querySelector('#rbcap').value || 40); store.set('aiEffort', body.querySelector('#rbeff').value || 'medium'); const k = store.get('apiKey', ''); if (k) callClaude('Reply with the single word OK.', 'ping', 5, (t, err) => { ai.err = err ? 'API key test failed: ' + err : ''; lastHtml = ''; render(true); }); settings = false; lastHtml = ''; render(true); }
  });
  ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut'].forEach((ev) => window.addEventListener(ev, (e) => { if ((panel.contains(e.target) || (fbBox && fbBox.contains(e.target))) && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) e.stopImmediatePropagation(); }, true));
  body.addEventListener('change', (e) => { if (e.target.id === 'rbver') { store.set('version', e.target.value); if (rec.cur && !rec.cur.done) rec.cur.version = rec.guessVersion(rec.cur); lastHtml = ''; render(true); } });
  body.addEventListener('keydown', (e) => { if (e.target.id === 'rbq' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAsk(); } if (e.target.id === 'rbj' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitJudge(); } e.stopPropagation(); });
  body.addEventListener('keyup', (e) => e.stopPropagation()); body.addEventListener('keypress', (e) => e.stopPropagation());
  function submitAsk() {
    const ta = body.querySelector('#rbq'); const qv = (ta && ta.value || '').trim(); if (!qv) return;
    const st = lastState || readState();
    askLog.unshift({ q: qv, a: '…thinking' }); const item = askLog[0]; ta.value = '';
    lastHtml = ''; render(true);
    askClaude(st, qv, (ans) => { item.a = ans; lastHtml = ''; render(true); });
  }
  const card2html = (r, k) => `<div class="r ${r.lvl}"><div class="h"><span>${esc(r.title)}</span>${k ? `<button data-done="${esc(k)}">✓ done</button>` : ''}</div>${r.steps.length ? `<ul>${r.steps.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}</div>`;

  // One clear decision: drop duplicates and lines that contradict a higher-priority line about the same battlefield.
  const POS = /\b(win|attack|move|break|take|conquer|play|reinforce)\b/i, NEG = /\b(losing|don't add|do not|no way|can't stop|cannot stop|nothing|just watch|pass)\b/i;
  function resolveConflicts(st, list) {
    const seen = new Set(); const out = [];
    [...list].sort((a, b) => b.p - a.p).forEach((it) => {
      const key = String(it.g).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); if (seen.has(key)) return; seen.add(key);
      const bf = Object.values(st.bf).find((b) => String(it.g).includes(b.name));
      const pol = NEG.test(it.g) ? -1 : POS.test(it.g) ? 1 : 0;
      if (pol) {
        const clash = out.find((o) => { const ob = Object.values(st.bf).find((b) => String(o.g).includes(b.name)); const op = NEG.test(o.g) ? -1 : POS.test(o.g) ? 1 : 0; return op && op !== pol && ((bf && ob && bf.id === ob.id) || (!bf && pol === -1 && op === 1 && o.lvl === 'do' && /\b(pass|nothing|just watch)\b/i.test(it.g))); });
        if (clash) { factLog(st, 'conflict', it.g, `contradicts "${clash.g}"`); return; }
      }
      out.push(it);
    });
    return out;
  }
  const ICON = { warn: '⚠', do: '▶', hold: '⏸', info: '•' };
  function viewGlance(st) {
    const items = [];
    advise(st).forEach((a) => { if (a.g) items.push({ g: a.g, lvl: a.lvl, p: a.p || 0, key: a.key2 || null, steps: a.steps, id: 'a:' + a.title }); });
    reminders.forEach((r) => { if (r.g && (r.lvl === 'do' || r.lvl === 'warn')) items.push({ g: r.g, lvl: r.lvl, p: r.lvl === 'warn' ? 85 : 80, key: r.key, steps: r.steps, id: 'r:' + r.key }); });
    const checked = [];
    items.forEach((it) => { const why = factCheck(st, it.g); if (why) { factLog(st, 'quick', it.g, why); } else checked.push(it); });
    items.length = 0; items.push(...resolveConflicts(st, checked));
    items.sort((a, b) => b.p - a.p);
    let aiHtml = '';
    if (ai.on) {
      const a = ai.last; const stale = a && a.sig !== aiSignature(st);
      const aiBad = a && !stale ? factCheck(st, [a.glance, ...(a.steps || [])].join(' ')) : null;
      if (aiBad) factLog(st, 'ai', a.glance, aiBad);
      aiHtml = `<div class="ai"><div class="aih"><span>🤖 AI coach${ai.busy ? ' — thinking…' : ''}</span><span><button data-ai-now>ask now</button>${ai.last ? ` <button data-bad-ai title="Bad AI advice — save this board">👎</button>` : ''}</span></div>` +
        (ai.err ? `<div style="color:#ff8a8a;font-size:12px">${esc(ai.err)}</div>` : '') +
        (a && aiBad ? `<div class="hl warn"><span>⚠ AI's idea doesn't check out: ${esc(aiBad)}</span></div><div style="font-size:12px;opacity:.7;margin:-2px 0 4px">It suggested "${esc(String(a.glance).slice(0, 60))}" — follow the quick rules below.</div>` : '') + (a && !aiBad ? `<div class="hl do" data-exp="ai" style="${stale ? 'opacity:.55' : ''}"><span>${esc(String(a.glance).slice(0, 70))}${a.confidence === 'low' ? ' <small>(unsure)</small>' : ''}</span></div>` +
          (a.why ? `<div style="font-size:12px;opacity:.85;margin:-2px 0 4px">${esc(a.why)}${stale ? ' <i>(for an earlier board)</i>' : ''}</div>` : '') +
          (expanded === 'ai' ? `<ul class="xs">${(a.steps || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
          : (!a && !ai.busy && !ai.err ? '<div style="font-size:12px;opacity:.7">Waits for your turn, an opponent spell or a fight — or tap "ask now".</div>' : '')) +
        `<div class="more">${ai.calls} AI call${ai.calls === 1 ? '' : 's'} this game</div></div><div class="sec">Quick rules</div>`;
    }
    let readHtml = '';
    if (st.readIssues && st.readIssues.length) { readHtml = `<div class="gl hold" title="${esc(st.readIssues.join(' · '))}"><span>👀 Check the board: ${esc(st.readIssues[0])}</span></div>`; st.readIssues.forEach((r) => factLog(st, 'read', 'board read', r)); }
    aiHtml = readHtml + aiHtml;
    if (!items.length) return aiHtml + '<div class="hl info">✓ Nothing urgent — your call</div>';
    const row = (it, big) => `<div class="${big ? 'hl' : 'gl'} ${it.lvl}" data-exp="${esc(it.id)}"><span>${ICON[it.lvl] || '•'} ${esc(it.g)}</span><span>${it.key ? `<button data-done="${esc(it.key)}">✓</button>` : ''}<button data-bad="${esc(it.g)}" title="Bad advice — save this board so it gets fixed">👎</button></span></div>` +
      (expanded === it.id && it.steps.length ? `<ul class="xs">${it.steps.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
    const [top, ...rest] = items;
    return aiHtml + row(top, !ai.on) + rest.slice(0, 3).map((it) => row(it, false)).join('') +
      (rest.length > 3 ? `<div class="more">+${rest.length - 3} more in Details</div>` : '') + '<div class="more">tap a line for the steps</div>';
  }
  function viewNow(st) {
    let h = '';
    if (reminders.length) h += `<div class="sec">Don't miss</div>` + reminders.map((r) => card2html(r, r.key)).join('');
    const adv = advise(st);
    h += `<div class="sec">Suggestions</div>` + (adv.length ? adv.map((a) => card2html(a, a.lvl === 'do' && a.key2 ? a.key2 : null)).join('') : '<div class="r info">Nothing to do right now.</div>');
    return h;
  }
  function viewBoard(st) {
    const row = (u, who) => { const c = u.c; if (!c) return `<li>${esc(u.name)}</li>`; const act = /\[tap\]|exhaust (me|a friendly)|kill this|: (ready|give|move|draw|add)/i.test(c.text); return `<li>${B(u.name)}${u.mightNow != null ? ` <b style="color:#7fd1ff">${esc(mightTxt(u))} Might</b>${u.role ? ' <i>' + u.role + '</i>' : ''}` : ''}${u.ready ? '' : ' <i>(exhausted)</i>'}${st.bf[u.zone] ? ' @ ' + esc(st.bf[u.zone].name) : ''}${act ? ' <span style="color:#f2c14e">⚡ has an activated ability</span>' : ''}<br><span style="opacity:.8">${esc(c.text)}</span></li>`; };
    let h = '<div class="sec">Your legends</div><div class="r info"><ul>' + st.legends.map((l) => row(l)).join('') + '</ul></div>';
    h += '<div class="sec">Your units & gear</div><div class="r do"><ul>' + ([...st.myUnits, ...st.gear.filter((g) => g.mine)].map((u) => row(u)).join('') || '<li>none</li>') + '</ul></div>';
    h += '<div class="sec">Opponent</div><div class="r warn"><ul>' + ([...st.oppLegends, ...st.theirUnits, ...st.gear.filter((g) => !g.mine)].map((u) => row(u)).join('') || '<li>nothing visible</li>') + '</ul></div>';
    h += '<div class="sec">Battlefields</div><div class="r info"><ul>' + Object.values(st.bf).map((b) => { const c = card(b.name); return `<li>${B(b.name)}: you ${b.mine} vs ${b.theirs} (${b.controller})${(b.simMine !== b.calcMine && b.myUnits.length) || (b.simTheirs !== b.calcTheirs && b.theirUnits.length) ? ` <span style="color:#f2c14e">— with unapplied effects it would be ${b.calcMine} vs ${b.calcTheirs}</span>` : ''}${c ? '<br><span style="opacity:.8">' + esc(c.text) + '</span>' : ''}</li>`; }).join('') + '</ul></div>';
    return h;
  }
  function viewSide(st) {
    const s = sideboard(st);
    let h = `<div class="r info"><div class="h">Opponent</div>${s.m.legend ? B(s.m.legend) : 'Legend not seen yet'} · ${s.seenCount} card(s) seen this match.${s.seenCount < 4 ? '<br>Game 1 advice is light — it gets sharper after you see their cards.' : ''}</div>`;
    if (s.ins.length) h += `<div class="r do"><div class="h">Suggested swaps</div><ol>${s.ins.map((x, i) => `<li>IN ${B(x.n)} — OUT ${B(s.outs[i])}<br><span style="opacity:.8">${esc(x.why)}</span></li>`).join('')}</ol></div>`;
    else h += `<div class="r info"><div class="h">No swaps</div>Play the main list.</div>`;
    s.notes.forEach((n) => { h += `<div class="r hold">${esc(n)}</div>`; });
    h += `<div class="r info" style="opacity:.8">Seen: spells ${s.prof.spells}, small units ${s.prof.small}, big units ${s.prof.big}, gear ${s.prof.gear}, hidden ${s.prof.hidden}.</div>`;
    return h;
  }
  // ---------------- Judge tab ----------------
  // Rulings from the official Core Rules + card text + the live board. Cited rule numbers are checked against the rules text.
  const judgeLog = [];
  let RNUM = null;
  function ruleLine(num) {
    if (!RNUM) { RNUM = {}; (RULES.chunks || []).forEach(([head, chap, text]) => text.split('\n').forEach((ln) => { const m = ln.match(/^(\d{3}(?:\.\d+)*(?:\.[a-z])?)\.\s/); if (m) RNUM[m[1]] = { head, line: ln }; })); }
    return RNUM[num] || null;
  }
  function citeHtml(txt) {
    const nums = [...new Set((txt.match(/\b\d{3}(?:\.\d+)*(?:\.[a-z])?\b/g) || []))].filter((n) => +n.slice(0, 3) >= 1);
    const ok = [], bad = [];
    nums.forEach((n) => { const r = ruleLine(n); if (r) ok.push(`<details><summary>✓ ${esc(n)} — ${esc(r.head)}</summary><div style="opacity:.85">${esc(r.line)}</div></details>`); else if (/rule/i.test(txt)) bad.push(n); });
    return (ok.length ? `<div style="margin-top:6px;font-size:12px">${ok.join('')}</div>` : '') + (bad.length ? `<div style="color:#f2c14e;font-size:12px">⚠ Couldn't find rule ${bad.map(esc).join(', ')} in the Core Rules — treat that part with care.</div>` : '');
  }
  function judgeSuggestions(st) {
    const out = [];
    if (!st || !st.turn) return ['Can hidden cards be played the turn they are hidden?', 'When does a hold score?'];
    const top = st.chain[st.chain.length - 1];
    if (top) { out.push(`Can I respond to ${top.name} right now, and with what?`); out.push(`How does ${top.name} resolve here?`); }
    Object.values(st.bf).filter((b) => b.myUnits.length && b.theirUnits.length).forEach((b) => out.unshift(`Who wins the battle at ${b.name}, and why?`));
    const last = (st.log || [])[0]; if (last && /^(Played|Moved|Equipped|Readied|Exhausted)/.test(last.text)) out.push(`Was this legal: "${last.text}"`);
    out.push('What can I legally do right now?');
    return out.slice(0, 4);
  }
  // Full board facts for the judge: every zone, every unit's Might with its breakdown, damage, gear, this-turn effects.
  function judgeFacts(st) {
    if (!st || !st.turn) return [];
    const who = (m) => (m ? 'You' : 'Opponent');
    const unitLine = (u) => `${who(u.mine)}: ${u.name} — ${mightTxt(u)} Might${u.role ? ', ' + u.role : ''}${u.damage ? `, ${u.damage} damage` : ''}${u.ready ? '' : ', exhausted'}${st.gear.filter((g) => g.sim && g.sim.attachedTo === u.id).map((g) => `, equipped ${g.name}`).join('')}`;
    const out = [`Turn ${st.turn} (${st.myTurn ? 'your' : "opponent's"} turn), score ${st.myScore}–${st.oppScore}.`];
    out.push(`Legends: you ${st.legendNames.join(', ') || '?'}; opponent ${st.oppLegends.map((l) => l.name).join(', ') || '?'}.`);
    Object.values(st.bf).forEach((b) => {
      const bt = ((card(b.name) || {}).text) || '';
      out.push(`${b.name}${bt ? ` ("${bt}")` : ''} — controlled by ${b.controller === 'me' ? 'you' : b.controller === 'them' ? 'opponent' : b.controller}; Might ${b.mine} vs ${b.theirs}${b.simUnset ? ' (coach count; RiftAtlas showed 0–0)' : ''}.`);
      [...b.myUnits, ...b.theirUnits].forEach((u) => out.push('  · ' + unitLine(u)));
    });
    const bases = st.units.filter((u) => u.zone === 'base'); if (bases.length) out.push('In base: ' + bases.map((u) => `${who(u.mine)} ${u.name} (${u.mightNow})`).join('; ') + '.');
    if (st.chain.length) out.push('On the chain (top last): ' + st.chain.map((c) => `${c.mine ? 'your' : 'their'} ${c.name}`).join(' → ') + '.');
    (st.turnMods || []).forEach((m) => out.push(`This turn: ${m.name} gave ${m.delta > 0 ? '+' : ''}${m.delta} Might${m.min != null ? ` (min ${m.min})` : ''} to ${m.ids.length} unit(s).`));
    if (st.hidden.length) out.push(`Facedown cards: yours ${st.hidden.filter((h) => h.mine).length}, theirs ${st.hidden.filter((h) => !h.mine).length}.`);
    return out;
  }
  const isFightQ = (q) => /\b(who wins|win(s)?\b.*\b(battle|fight|combat)|outcome|result|what happens|who (dies|survives|lives)|does .* (die|survive|live))\b/i.test(q);
  function fightRuling(st, qtext) {
    const fights = Object.values(st.bf).filter((b) => b.myUnits.length && b.theirUnits.length);
    const named = fights.find((b) => qtext.toLowerCase().includes(b.name.toLowerCase())) || fights[0]; if (!named) return null;
    const f = predictFight(st, named); if (!f) return null;
    const sh = +((((card(named.name) || {}).text) || '').match(/SHIELD (\d+)/i) || [0, 0])[1];
    const facts = [...named.myUnits, ...named.theirUnits].map((u) => `${u.mine ? 'Your' : 'Their'} ${esc(u.name)}: ${esc(mightTxt(u))} Might${f.shieldOn && f.shieldOn === short(u.name) && sh ? ` +${sh} Shield (${esc(named.name)}) = ${u.mightNow + sh}` : ''}${u.damage ? ` (${u.damage} damage)` : ''} — "${esc(((u.c && u.c.text) || '').slice(0, 140))}"`);
    const rules = ['466.2 (combat opens, triggers go on the chain)', '359.3.f.2 (amounts checked when it resolves)', '323.4 / 142.4 (lethal damage kills in the cleanup)', '467.2 (combat damage, lethal assigned in full)', '468.3 (who won)'];
    if (f.shieldOn) rules.splice(1, 0, '814.1 (Shield: +X Might while defending)');
    return `<b>Ruling:</b> ${esc(f.result)}${f.deaths.length ? ` — dies: ${esc(f.deaths.join(', '))}` : ''}.<br><br><b>Facts on the board (${esc(named.name)}):</b><br>${facts.map((x) => '· ' + x).join('<br>')}${f.shieldOn ? `<br>· ${esc(named.name)}'s Shield assumed on ${esc(f.shieldOn)} (the defender's best choice)` : ''}<br><br><b>How it plays out:</b><br>${f.log.map((x, i) => `${i + 1}. ${esc(x)}`).join('<br>')}<br><br><b>Rules:</b> ${rules.map(esc).join(' · ')}`;
  }
  function localJudge(st, qtext) {
    if (st && st.turn && isFightQ(qtext)) { const fr = fightRuling(st, qtext); if (fr) return `<div style="opacity:.7;font-size:11px;margin-bottom:4px">Rules engine (no AI) — from the live board:</div>` + fr; }
    const named = Object.values(CARDS).map((c) => c[0]).filter((n) => n.length > 3 && qtext.toLowerCase().includes(n.toLowerCase()));
    const cardBits = named.slice(0, 3).map((n) => { const c = card(n); return `${B(c.name)} — ${esc(c.type)}: ${esc(c.text)}`; });
    const hits = searchRules(qtext + ' ' + named.map((n) => (card(n) || {}).text || '').join(' '), 5000);
    const ruleBits = hits.slice(0, 3).map((d) => `<details${d === hits[0] ? ' open' : ''}><summary><b>${esc(d.head)}</b> <span style="opacity:.7">${esc(d.chap)}</span></summary><div style="white-space:pre-wrap;opacity:.9">${esc(d.text.slice(0, 1800))}${d.text.length > 1800 ? '…' : ''}</div></details>`);
    const qt = rtok(qtext); const lessonHit = LESSONS.map((l) => [qt.filter((w) => rtok(l).includes(w)).length, l]).filter(([n]) => n >= 3).sort((a, b) => b[0] - a[0])[0];
    const lessonHtml = lessonHit ? `<div class="r do" style="margin-bottom:6px"><b>Verified ruling:</b> ${esc(lessonHit[1])}</div>` : '';
    return lessonHtml + `<div style="opacity:.7;font-size:11px;margin-bottom:4px">Rules lookup (no AI): the closest rule sections and card text. Add an API key in ⚙ for a ruling about your exact board.</div>${cardBits.join('<br>')}${cardBits.length ? '<br><br>' : ''}${ruleBits.join('') || 'No matching rule found — try other words (e.g. "showdown", "hidden", "hold").'}`;
  }
  function judgeClaude(st, qtext, cb) {
    if (!store.get('apiKey', '')) return cb(localJudge(st, qtext));
    const engine = st && st.turn && isFightQ(qtext) ? fightRuling(st, qtext) : null;
    const facts = judgeFacts(st).join('\n');
    const { cardText, kw, board } = buildContext(st);
    const names = Object.values(CARDS).map((c) => c[0]).filter((n) => n.length > 3 && qtext.toLowerCase().includes(n.toLowerCase()));
    const extraCards = names.filter((n) => !cardText.includes(n)).map(card).filter(Boolean).map((c) => `- ${c.name} [${c.type}; ${costTxt(c)}]: ${c.text}`).join('\n');
    const kwTerms = Object.keys(GLOSSARY).filter((k) => new RegExp('\\b' + k + '\\b', 'i').test(qtext + ' ' + cardText + ' ' + extraCards)).join(' ');
    const rules = rulesBlock(searchRules(qtext + ' ' + st.chain.map((c) => c.name).join(' '), 12000, kwTerms));
    const recent = (st.log || []).slice(0, 10).map((l) => `- ${l.mine === true ? 'Me' : l.mine === false ? 'Opponent' : '?'}: ${l.text}`).join('\n');
    const system = `You are a certified Riftbound TCG judge. A player asks about the game in front of them. Rule ONLY from the official Core Rules excerpts and the exact card texts provided; card text beats rules text (Golden Rule, 002). Look at the live board and recent actions to apply the rules to this exact situation.
Answer in this format, plain text, short:
Ruling: <one sentence, a clear yes/no or outcome>
Facts: <the board facts and card texts that decide it, each as "- " lines with the Might math, e.g. "- Graves: 4 printed +2 Shield -3 Watcher = 3">
How it plays out: <numbered steps in rules order, only if it is about a fight or a chain>
Rules: <the rule numbers you relied on, e.g. 811.2, 346>
Use the BOARD FACTS below; a FIGHT FORECAST from the coach's rules engine is included when relevant — check it against the rules and say so if you disagree.
Verified rulings from earlier games (apply when relevant):
${LESSONS.map((l) => '- ' + l).join('\n')}
If the excerpts and card texts don't settle it, say "Ruling: Unclear" and say exactly what is missing (and that a floor judge should be called in a tournament). Never invent rule numbers or card text.`;
    callClaude(system, `OFFICIAL CORE RULES — relevant excerpts (revision ${RULES.rev || '?'}):\n${rules || '(none matched)'}\n\nCARD TEXTS:\n${cardText}${extraCards ? '\n' + extraCards : ''}\n\nKEYWORDS:\n${kw}\n\nBOARD:\n${board}\n\nRECENT ACTIONS (newest first):\n${recent || '—'}\n\nQUESTION: ${qtext}`, 900, (txt, err) => {
      if (err) return cb(`<span style="color:#ff8a8a">${esc(err)}</span><br><br>${localJudge(st, qtext)}`);
      const html = esc(txt).replace(/^(Ruling|Why|Facts|How it plays out|Rules):/gm, '<b>$1:</b>').replace(/\n/g, '<br>');
      cb(html + citeHtml(txt) + (engine ? `<details style="margin-top:6px"><summary>Rules-engine check (from the live board)</summary>${engine}</details>` : ''));
    });
  }
  function submitJudge(qv) {
    const ta = body.querySelector('#rbj'); qv = (qv || (ta && ta.value) || '').trim(); if (!qv) return;
    const st = lastState || readState();
    judgeLog.unshift({ q: qv, a: '…checking the rules' }); const item = judgeLog[0]; const factsHtml = st && st.turn ? `<details style="margin-top:6px;font-size:11px"><summary>Board the judge saw</summary>${judgeFacts(st).map(esc).join('<br>')}</details>` : ''; if (ta) ta.value = '';
    lastHtml = ''; render(true);
    judgeClaude(st, qv, (ans) => { item.a = ans + factsHtml; lastHtml = ''; render(true); });
  }
  function viewJudge(st) {
    const key = store.get('apiKey', '');
    const sug = judgeSuggestions(st);
    return `<div style="opacity:.75;font-size:11px;margin-bottom:6px">⚖ Rulings from the official Core Rules (rev ${esc(RULES.rev || '?')}), card text${st && st.turn ? ' and your live board' : ''}.${key ? '' : ' No API key: rules lookup only.'}</div>
<textarea id="rbj" rows="2" placeholder="Ask a rules question about your play… e.g. 'Can I Defy Lacerate?' or 'Does my unit enter ready?'"></textarea><button class="btn" data-judge>Ask the judge</button>
<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${sug.map((x) => `<button class="btn" style="font-size:11px;padding:2px 6px" data-jq="${esc(x)}">${esc(x)}</button>`).join('')}</div>` +
      judgeLog.slice(0, 5).map((x) => `<div class="r info"><div class="h">⚖ ${esc(x.q)}</div>${x.a}</div>`).join('');
  }
  function viewAsk() {
    const key = store.get('apiKey', '');
    return `<textarea id="rbq" rows="2" placeholder="Ask anything… e.g. 'Can I Defy this?' or 'What does Deflect do?'"></textarea><button class="btn" data-ask>Ask</button>
<div style="opacity:.6;font-size:11px;margin:4px 0 8px">${key ? 'Answers by Claude using the live board.' : 'Offline mode: card and keyword lookups. Add an API key in ⚙ for full answers.'}</div>` +
      askLog.slice(0, 6).map((x) => `<div class="r info"><div class="h">${esc(x.q)}</div>${x.a}</div>`).join('');
  }

  // ---------------- Stats tab ----------------
  // Your own results (kept only on this device) + a strength profile of your deck worked out from card text.
  // Riot's Riftbound developer policy bars publishing or retaining metagame data (deck/card win or play rates across
  // players), so nothing here is pooled or compared with other users.
  function myDecklist(st) {
    const ver = store.get('version', 'Auto');
    if (st && st.inverted) {
      const d = { ...MAIN, 'Irelia, Fervent': 1 };
      if (ver === 'Hold-breaker') { d['Charm'] = 2; d['Back Off'] = 1; delete d['Ki Burst']; delete d['Life from Stone']; d['En Garde'] = 1; }
      return { cards: d, source: `Inverted Mask list (${ver === 'Auto' ? 'Base' : ver})` };
    }
    const L = st && st.legendNames[0]; const seen = L ? store.get('myCards:' + norm(L), {}) : {};
    return { cards: seen, source: `${Object.keys(seen).length} different cards seen in your games with ${L || 'this legend'}` };
  }
  const STAT_TAGS = {
    removal: /\b(?:kill|banish) (?:a|an|target|up to \w+|all|each|any)\b(?! friendly)|deal \d+ damage to (?:a|an|target|each|all|any)|return (?:a|an|target)?\s*(?:enemy )?unit (?:at|with|that)[^.]*hand|enemy unit[^.]*to (?:its|their) owner/i,
    holdBreak: /\b(?:kill|banish) (?:a|an|target|up to \w+|all|each|any)\b(?! friendly)|deal \d+ damage to (?:a|an|target|each|all|any)|return (?:a|an|target)?\s*(?:enemy )?unit (?:at|with|that)[^.]*hand|enemy unit[^.]*to (?:its|their) owner|move (?:a|an|target)?\s*enemy unit|move a unit an opponent controls/i,
    counters: /\bcounter (?:a|an|target)\b/i,
    pump: /\+\d+ \[?might\]? this turn|\bbuff\b/i,
    draw: /\bdraw (?:\d|a|one|two)\b/i,
    ramp: /\bgold\b|add \[|ready (?:up to )?\d+ runes?/i,
    mobility: /move (?:a|an|target|up to \w+)?\s*friendly unit|\bmove me\b|GANKING|move (?:a|one) unit you control/i,
  };
  function deckProfile(list) {
    const rows = Object.entries(list).map(([n, k]) => [card(n), k]).filter(([c]) => c);
    const N = rows.reduce((a, [, k]) => a + k, 0) || 1;
    const sum = (f) => rows.reduce((a, [c, k]) => a + (f(c) ? k : 0), 0);
    const units = rows.filter(([c]) => c.isUnit), spells = rows.filter(([c]) => c.isSpell), gear = rows.filter(([c]) => c.isGear);
    const curve = [0, 0, 0, 0, 0, 0]; rows.forEach(([c, k]) => { curve[Math.min(5, c.e || 0)] += k; });
    const avgCost = rows.reduce((a, [c, k]) => a + (c.e || 0) * k, 0) / N;
    const unitN = units.reduce((a, [, k]) => a + k, 0);
    const mightPerE = unitN ? units.reduce((a, [c, k]) => a + (c.might || 0) * k, 0) / Math.max(1, units.reduce((a, [c, k]) => a + Math.max(1, c.e || 0) * k, 0)) : 0;
    const t = {}; Object.entries(STAT_TAGS).forEach(([k, re]) => { t[k] = sum((c) => re.test(c.text)); });
    const fast = sum((c) => /\b(REACTION|ACTION)\b/.test(c.text));
    const cheapUnits = units.filter(([c]) => (c.e || 0) <= 2).reduce((a, [, k]) => a + k, 0);
    const clamp = (x) => Math.max(0, Math.min(10, Math.round(x)));
    const per40 = (x) => x * 40 / N;
    const scores = {
      'Early board': clamp(per40(cheapUnits) * 1.1), 'Board power': clamp(mightPerE * 7), 'Interaction': clamp(per40(t.counters + fast * 0.4) * 0.9),
      'Removal': clamp(per40(t.removal) * 1.4 + 1), 'Breaking holds': clamp(per40(t.holdBreak) * 1.4 + 1), 'Card flow': clamp(per40(t.draw + t.ramp) * 0.8), 'Mobility': clamp(per40(t.mobility) * 1.4 + 1),
    };
    const notes = [];
    if (scores['Breaking holds'] <= 3) notes.push(`Only ${t.holdBreak} card(s) can remove or move a unit that's holding a battlefield — opponents who hold early may run away with points.`);
    if (scores['Early board'] <= 3) notes.push(`Few cheap units (${cheapUnits} at 0–2 Energy): you may fall behind on battlefields in the first turns.`);
    if (avgCost >= 3.4) notes.push(`High average cost (${avgCost.toFixed(1)} Energy): watch for slow starts.`);
    if (scores['Interaction'] >= 7) notes.push('Lots of instant-speed interaction: hold runes up on their turn.');
    return { N, units: unitN, spells: spells.reduce((a, [, k]) => a + k, 0), gear: gear.reduce((a, [, k]) => a + k, 0), curve, avgCost, mightPerE, t, fast, scores, notes };
  }
  function viewStats(st) {
    const games = rec.games().filter((g) => g.done && g.result !== 'Unfinished' && !g.self);
    const wl = (gs) => { const w = gs.filter((g) => g.result === 'W').length; return `${w}-${gs.length - w}${gs.length ? ' (' + Math.round(100 * w / gs.length) + '%)' : ''}`; };
    let h = `<div style="opacity:.7;font-size:11px;margin-bottom:6px">Your stats stay on this device. Riot's rules for Riftbound apps don't allow pooling win rates across players, so there's no global ranking — instead, here's how your deck is built and how you've done.</div>`;
    // deck strength
    const dl = myDecklist(st); const pr = deckProfile(dl.cards);
    if (Object.keys(dl.cards).length >= 5) {
      const bar = (v) => `<span style="display:inline-block;width:${v * 10}px;height:8px;background:${v >= 7 ? '#3c8d5a' : v >= 4 ? '#c7a21a' : '#b0413e'};border-radius:3px;margin-right:6px"></span>${v}/10`;
      h += `<div class="r do"><div class="h">Deck strength profile</div><div style="opacity:.7;font-size:11px">From card text · ${esc(dl.source)} · ${pr.N} cards</div><table style="width:100%;font-size:12px">${Object.entries(pr.scores).map(([k, v]) => `<tr><td>${k}</td><td>${bar(v)}</td></tr>`).join('')}</table>
        <div style="font-size:12px;margin-top:4px">Curve (Energy 0·1·2·3·4·5+): ${pr.curve.join(' · ')} — avg ${pr.avgCost.toFixed(1)} · ${pr.units} units, ${pr.spells} spells, ${pr.gear} gear · ${pr.fast} Reaction/Action cards</div>
        ${pr.notes.length ? `<ul class="xs">${pr.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
    } else h += `<div class="r info">Deck strength profile appears after the coach has seen a few of your cards in games.</div>`;
    // results
    if (games.length) {
      const by = (key) => { const m = {}; games.forEach((g) => { const k = key(g) || '?'; (m[k] = m[k] || []).push(g); }); return Object.entries(m).sort((a, b) => b[1].length - a[1].length); };
      h += `<div class="r info"><div class="h">Your results (${games.length} games vs real opponents)</div><table style="width:100%;font-size:12px"><tr><th align=left>Your deck</th><th>W-L</th></tr>${by((g) => g.myLegend || (g.version ? 'Inverted Mask · ' + g.version : '')).map(([k, gs]) => `<tr><td>${esc(k)}</td><td>${wl(gs)}</td></tr>`).join('')}</table>
        <table style="width:100%;font-size:12px;margin-top:6px"><tr><th align=left>Vs opponent legend</th><th>W-L</th></tr>${by((g) => g.opp).slice(0, 10).map(([k, gs]) => `<tr><td>${esc(k)}</td><td>${wl(gs)}</td></tr>`).join('')}</table>
        <div style="font-size:12px;margin-top:6px">Holds per game: you ${(games.reduce((a, g) => a + (g.holds || 0), 0) / games.length).toFixed(1)} · them ${(games.reduce((a, g) => a + (g.oppHolds || 0), 0) / games.length).toFixed(1)} — conquers: you ${(games.reduce((a, g) => a + (g.conquers || 0), 0) / games.length).toFixed(1)} · them ${(games.reduce((a, g) => a + (g.oppConquers || 0), 0) / games.length).toFixed(1)}</div></div>`;
    } else h += `<div class="r info">Your results show up here after your first finished game.</div>`;
    // coach quality
    const L = learn.all(); const td = L.filter((x) => x.type === 'thumbsDown'), fc = L.filter((x) => x.type === 'factcheck');
    const nG = Math.max(1, new Set(L.map((x) => x.room || x.at && x.at.slice(0, 13))).size);
    h += `<div class="r hold"><div class="h">Coach quality</div><div style="font-size:12px">👎 per game: ${(td.length / Math.max(1, games.length || nG)).toFixed(2)} (goal: under 1) · advice blocked by the fact-checker: ${fc.filter((x) => x.src !== 'read').length} · board-read warnings: ${fc.filter((x) => x.src === 'read').length}</div></div>`;
    return h;
  }
  function viewTests() {
    const all = rec.games(); const done = all.filter((g) => g.done && g.result !== 'Unfinished');
    const um = store.get('usage', null); let usageHtml = '';
    if (um && um.calls) { const gs = Object.values(um.games).filter((g) => g.calls >= 3); const per = gs.length ? gs.reduce((a, g) => a + g.cost, 0) / gs.length : 0; usageHtml = `<div class="r info"><div class="h">AI cost meter</div>${um.calls} calls · $${um.cost.toFixed(3)} total · $${(um.cost / um.calls).toFixed(4)}/call${gs.length ? ` · $${per.toFixed(3)}/game over ${gs.length} game(s)` : ''}<br><span style="opacity:.7">~${Math.round(um.inTok / um.calls)} in / ${Math.round(um.outTok / um.calls)} out tokens per call</span></div>`; }
    const real = done.filter((g) => !g.self);
    const ver = store.get('version', 'Auto');
    let h = `<div class="r info"><div class="h">Deck test — is Inverted Mask competitive?</div>Every game with this deck is recorded automatically. Plan: ${PLAN.perVersion} games per version, split between Kennen and Kai'Sa, half on the play and half on the draw.<br>
Version being played: <select id="rbver">${['Auto', ...VERSIONS].map((v) => `<option${v === ver ? ' selected' : ''}>${v}</option>`).join('')}</select>${rec.cur && !rec.cur.done ? `<br>Recording now: ${esc(rec.cur.version || '?')} vs ${esc(rec.cur.opp || '?')} (${esc(rec.cur.order || '?')})` : ''}</div>`;
    const line = (label, gs) => { const w = gs.filter((g) => g.result === 'W').length, n = gs.length, ci = wilson(w, n); return `<tr><td>${esc(label)}</td><td>${w}-${n - w}</td><td>${n ? pct(w / n) : '–'}</td><td>${n ? pct(ci[0]) + '–' + pct(ci[1]) : ''}</td></tr>`; };
    h += `<div class="r do"><div class="h">Results (real opponents: ${real.length}, self-play: ${done.length - real.length})</div><table style="width:100%;font-size:12px"><tr><th align=left>Group</th><th>W-L</th><th>Win</th><th>95% range</th></tr>${line('All real games', real)}${VERSIONS.map((v) => line(v + ` (${real.filter((g) => g.version === v).length}/${PLAN.perVersion})`, real.filter((g) => g.version === v))).join('')}${PLAN.opponents.map((o) => line('vs ' + o, real.filter((g) => g.opp.includes(o)))).join('')}${line('On the play', real.filter((g) => g.order === 'First'))}${line('On the draw', real.filter((g) => g.order === 'Second'))}</table></div>`;
    // theory checks
    const vs = (v) => real.filter((g) => g.version === v); const wr = (gs) => gs.length ? gs.filter((g) => g.result === 'W').length / gs.length : null;
    const cmp = (a, b, label) => { const A = vs(a), Bb = vs(b); const ok = A.length >= 10 && Bb.length >= 10; return `<li>${label}: ${A.length ? pct(wr(A)) : '–'} (${A.length}) vs ${Bb.length ? pct(wr(Bb)) : '–'} (${Bb.length}) — ${ok ? 'early read, still noisy' : 'not enough games yet'}</li>`; };
    const nk = real.filter((g) => g.neeko);
    h += `<div class="r hold"><div class="h">Theory checks</div><ul>
<li>Deck is competitive (≥50% vs Kennen/Kai'Sa): ${real.length ? pct(wr(real)) + ' over ' + real.length + ' games' : 'no games yet'}${real.length >= 20 ? '' : ' — need 20+'}</li>
${cmp('Hold-breaker', 'Base', 'Hold-breaker (+2 Charm, +1 Back Off) stops their holds')}<li>Opponent hold points per game: Base ${(() => { const b = vs('Base'); return b.length ? (b.reduce((t, g) => t + g.oppHolds, 0) / b.length).toFixed(1) : '–'; })()} vs Hold-breaker ${(() => { const b = vs('Hold-breaker'); return b.length ? (b.reduce((t, g) => t + g.oppHolds, 0) / b.length).toFixed(1) : '–'; })()} (lower is better)</li>${cmp('Hall of Legends', 'Base', 'Hall of Legends beats Abandoned Hall')}${cmp('Boots', 'Base', 'Boots of Swiftness beats Guardian Angel')}${cmp('Entourage', 'Base', 'Royal Entourage adds value')}
<li>Engine shows up: Neeko resolved in ${real.length ? pct(nk.length / real.length) : '–'} of games; Irelia readies/game ${real.length ? (real.reduce((s, g) => s + g.irelia, 0) / real.length).toFixed(1) : '–'}; Gold/game ${real.length ? (real.reduce((s, g) => s + g.golds, 0) / real.length).toFixed(1) : '–'}</li>
<li>How we score: conquers ${real.reduce((s, g) => s + g.conquers, 0)}, holds ${real.reduce((s, g) => s + g.holds, 0)} · how they score: conquers ${real.reduce((s, g) => s + g.oppConquers, 0)}, holds ${real.reduce((s, g) => s + g.oppHolds, 0)}</li></ul></div>`;
    // card use
    const agg = {}; real.forEach((g) => Object.entries(g.cards).forEach(([n, v]) => { const a = (agg[n] = agg[n] || { d: 0, p: 0, w: 0, g: 0 }); a.d += v.drawn; a.p += v.played; a.g++; if (g.result === 'W') a.w++; }));
    const rows = Object.entries(agg).filter(([, a]) => a.d).sort((x, y) => (x[1].p / x[1].d) - (y[1].p / y[1].d)).slice(0, 12);
    if (rows.length) h += `<div class="r info"><div class="h">Cards: drawn vs played (lowest first = candidates to cut)</div><table style="width:100%;font-size:12px"><tr><th align=left>Card</th><th>Drawn</th><th>Played</th><th>Win% when drawn</th></tr>${rows.map(([n, a]) => `<tr><td>${esc(n)}</td><td>${a.d}</td><td>${a.p} (${pct(a.p / a.d)})</td><td>${pct(a.w / a.g)}</td></tr>`).join('')}</table></div>`;
    h += `<div class="r info"><div class="h">Last games</div><ul>${all.slice(-5).reverse().map((g) => `<li>${esc(g.date)} · ${esc(g.version || '?')} vs ${esc(g.opp || '?')} · ${esc(g.order)} · <b>${esc(g.result || 'in progress')}</b> ${esc(g.score)} ${g.self ? '(self)' : ''} <button data-del="${esc(g.id)}">delete</button></li>`).join('') || '<li>none yet</li>'}</ul>
<button class="btn" data-csv>Copy results (CSV for the Test Log sheet)</button> <button class="btn" data-json>Copy raw data (JSON)</button></div>`;
    const L = learn.all(); const aiN = L.filter((x) => x.type === 'ai'), dis = aiN.filter((x) => x.agree === false), td = L.filter((x) => x.type === 'thumbsDown');
    h += `<div class="r hold"><div class="h">Learning log</div>${aiN.length} AI answers saved · ${dis.length} where AI and quick rules disagreed · ${td.length} 👎 marked.<br>Send this to Claude in chat so the quick rules learn from it.<br><button class="btn" data-learn>Copy learning log</button> <button class="btn" data-tapes>Copy game recordings (${tapes.all().length})</button> ${td.filter((x) => !x.sent).length ? `<button class="btn" data-fbsend>Send ${td.filter((x) => !x.sent).length} unsent 👎 report(s) to developer</button>` : ''}</div>`;
    return usageHtml + h;
  }
  function viewSettings() {
    return `<div class="r info"><div class="h">Claude API key (optional)</div>Enables full answers in the Ask tab. Stored only in this browser. Leave empty for offline mode.<br><input id="rbk" type="password" value="${esc(store.get('apiKey', ''))}" placeholder="sk-ant-…" autocomplete="off">
<button class="btn" data-pastekey>📋 Paste key from clipboard</button> <span id="rbkst" style="font-size:12px">${store.get('apiKey', '') ? (/^sk-ant-/.test(store.get('apiKey', '')) ? '✓ key saved' : '⚠ saved key doesn\'t look like sk-ant-…') : 'no key saved'}</span><div class="h" style="margin-top:6px">Model</div><select id="rbm">${['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'].map((m) => `<option${m === store.get('model', 'claude-sonnet-5-5') ? ' selected' : ''}>${m}</option>`).join('')}</select><div style="font-size:11px;opacity:.7">Sonnet: best balance. Haiku: fastest and cheapest. Opus: strongest, slowest.</div>
<div class="h" style="margin-top:6px">AI depth</div><select id="rbeff">${[['low', 'fast'], ['medium', 'normal'], ['high', 'deep (slow)']].map(([v, l]) => `<option value="${v}"${v === store.get('aiEffort', 'medium') ? ' selected' : ''}>${l}</option>`).join('')}</select>
<div class="h" style="margin-top:6px">AI calls per game (cost cap)</div><input id="rbcap" type="number" min="1" max="200" value="${esc(store.get('aiCap', 40))}"><button class="btn" data-save>Save</button></div>`;
  }

  // ---------------- game tapes (record → replay) ----------------
  // Every time the board changes, a compact snapshot is saved with the advice shown. Tapes can be copied from the
  // Tests tab and replayed through new coach versions (tests/replay.js) to catch regressions before release.
  const tapes = {
    cur: null, lastSig: '',
    all() { return store.get('tapes', []); },
    spec(st) {
      const U = (u) => [u.name, u.zone, u.mine ? 1 : 0, u.ready ? 1 : 0, (u.sim && u.sim.buff) || 0, u.sim && u.sim.white != null ? u.sim.white : null];
      return { t: st.turn, my: st.myTurn ? 1 : 0, s: [st.myScore, st.oppScore],
        bf: Object.values(st.bf).map((b) => [b.id, b.name, b.simSeen ? b.simMine : null, b.simSeen ? b.simTheirs : null]),
        r: st.runes.map((r) => [r.domain, r.ready ? 1 : 0]), leg: st.legendNames, oleg: st.oppLegends.map((l) => l.name), ch0: st.champion,
        u: st.units.map(U), g: st.gear.map((g) => [g.name, g.zone, g.mine ? 1 : 0, g.ready ? 1 : 0, (g.sim && g.sim.attachedTo) || null]),
        h: st.hand, c: st.chain.map((c) => [c.name, c.mine ? 1 : 0]), log: (st.log || []).slice(0, 6).map((l) => [l.text, l.mine === true ? 1 : l.mine === false ? 0 : null]),
        fe: st.floatE, fp: st.floatP };
    },
    tick(st) {
      if (!st || !st.turn) return;
      const sig = aiSignature(st) + '|' + ((st.log[0] || {}).text || ''); if (sig === this.lastSig) return; this.lastSig = sig;
      const gid = (rec.cur && rec.cur.id) || st.room;
      if (!this.cur || this.cur.id !== gid) { this.cur = { id: gid, v: VERSION, deck: store.get('version', 'Auto'), date: new Date().toISOString().slice(0, 16), snaps: [] }; this.save(); }
      let adv = []; try { adv = advise(st).filter((a) => a.g).sort((a, b) => (b.p || 0) - (a.p || 0)).slice(0, 4).map((a) => a.g); } catch (e) { /* ignore */ }
      try { const L = st.legendNames[0]; if (L) { const k = 'myCards:' + norm(L); const seen = store.get(k, {}); const cnt = {}; [...st.hand, ...st.champion, ...st.myUnits.map((u) => u.name), ...st.gear.filter((g) => g.mine).map((g) => g.name)].forEach((n) => { if (card(n) && !/^gold$/i.test(n)) cnt[n] = (cnt[n] || 0) + 1; }); let ch = false; Object.keys(cnt).forEach((n) => { if ((seen[n] || 0) < Math.min(3, cnt[n])) { seen[n] = Math.min(3, cnt[n]); ch = true; } }); if (ch) store.set(k, seen); } } catch (e) { /* ignore */ }
      const sp = this.spec(st); sp.adv = adv; sp.ai = ai.last && ai.last.sig === aiSignature(st) ? ai.last.glance : null; sp.at = Date.now();
      this.cur.snaps.push(sp); if (this.cur.snaps.length > 220) this.cur.snaps.splice(1, 1);
      if (this.cur.snaps.length % 5 === 1) this.save();
    },
    save() { if (!this.cur) return; const all = this.all().filter((g) => g.id !== this.cur.id); all.push(this.cur); while (all.length > 8) all.shift(); store.set('tapes', all); },
  };
  window.addEventListener('beforeunload', () => { try { tapes.save(); } catch (e) { /* ignore */ } });
  function render(force) {
    let st = null;
    try { st = readState(); } catch (e) { body.innerHTML = `<div class="r warn">Couldn't read the board: ${esc(e.message)}</div>`; return; }
    if (!st) { // not in a game: settings, tests and ask still work
      const h = settings ? viewSettings() : tab === 'tests' ? viewTests() : tab === 'stats' ? viewStats(null) : '<div class="r info">Waiting for a game… (⚙ settings and the Tests tab work here too)</div>';
      if (h !== lastHtml || force) { body.innerHTML = h; lastHtml = h; } foot.textContent = ''; return; }
    try { track(st); } catch (e) { console.warn('[coach] track', e); }
    try { oppMemory(st); } catch (e) { /* ignore */ }
    try { rec.tick(st); } catch (e) { console.warn('[coach] rec', e); }
    try { tapes.tick(st); } catch (e) { console.warn('[coach] tape', e); }
    try { aiTriggers(st); } catch (e) { console.warn('[coach] ai', e); }
    lastState = st;
    // don't redraw the Ask tab while typing
    if (!force && (tab === 'ask' || tab === 'judge') && document.activeElement && /^(rbq|rbj)$/.test(document.activeElement.id)) return;
    let h;
    try { h = settings ? viewSettings() : tab === 'glance' ? viewGlance(st) : tab === 'board' ? viewBoard(st) : tab === 'side' ? viewSide(st) : tab === 'ask' ? viewAsk() : tab === 'judge' ? viewJudge(st) : tab === 'stats' ? viewStats(st) : tab === 'tests' ? viewTests() : viewNow(st); }
    catch (e) { h = `<div class="r warn">Coach error: ${esc(e.message)}</div>`; console.warn(e); }
    if (h !== lastHtml || force) { const keep = body.querySelector('#rbq')?.value, keepJ = body.querySelector('#rbj')?.value; body.innerHTML = h; lastHtml = h; if (keep && body.querySelector('#rbq')) body.querySelector('#rbq').value = keep; if (keepJ && body.querySelector('#rbj')) body.querySelector('#rbj').value = keepJ; }
    foot.textContent = `T${st.turn} · ${st.myTurn ? 'your turn' : 'their turn'} · ${st.myScore}–${st.oppScore} · runes ${st.ready}/${st.runes.length} · hand ${st.hand.length}${st.inverted ? '' : ' · generic mode (not Inverted Mask)'}`;
    // auto-open sideboard between games
    if (!force && (st.gameOver || !st.turn) && tab === 'now' && !panel.dataset.sbShown) { panel.dataset.sbShown = '1'; }
  }
  // the Deserter suggestion can be dismissed per turn
  const _advise = advise;
  advise = function (st) { return _advise(st).map((a) => { if (/Riven, Deserter|Free Gold/.test(a.title)) a.key2 = turnKey(st, 'deserter'); return a; }); };

  let timer = null;
  const obs = new MutationObserver((muts) => {
    if (muts.every((m) => panel.contains(m.target))) return;
    if (!timer) timer = setTimeout(() => { timer = null; render(false); }, 300);
  });
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-exhausted', 'data-turn-number', 'data-active-player-id', 'data-viewer-score', 'data-opponent-score', 'data-turn-step', 'data-face-down', 'data-drop-zone', 'data-room-phase'] });
  try { if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Set Claude API key…', () => { const k = (prompt('Paste your Claude API key (starts with sk-ant-):', '') || '').trim(); if (k) { store.set('apiKey', k); callClaude('Reply with the single word OK.', 'ping', 5, (t, err) => alert(err ? 'Key saved, but the test failed: ' + err : 'Key saved and working ✓')); } }); } catch (e) { /* ignore */ }
  render(true);
  window.__rbCoach = { judgeFacts, predictFight, deckProfile, myDecklist, stats: (s) => viewStats(s), tapes, resolveConflicts, factCheck, searchRules, judge: (st, q, cb) => judgeClaude(st, q, cb), ruleLine, judgeSuggestions, usage: () => store.get('usage', null), version: VERSION, toggle: () => { panel.style.display = panel.style.display === 'none' ? '' : 'none'; }, stop: () => { obs.disconnect(); panel.remove(); }, readState, ai, aiMaybe, buildContext, learn, advise: (s) => advise(s), glance: (s) => viewGlance(s), tests: () => viewTests(), rec, csv: () => toCSV(rec.games()), sideboard, reminders: () => reminders, render };
})();
