// Replay recorded games (tests/replays/*.json, copied from the coach's Tests tab) through the current coach build.
// Reports, per game: snapshots replayed, where the advice changed vs. what was shown live, fact-check rejections,
// board-read warnings and crashes. Exit code 1 only on crashes, so it can run in CI; review the changes by eye.
// Usage: node tests/replay.js [file.json ...]   (after: python3 src/build.py)
const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'coach2.built.js'), 'utf8');
const files = process.argv.slice(2).length ? process.argv.slice(2) : (fs.existsSync(path.join(__dirname, 'replays')) ? fs.readdirSync(path.join(__dirname, 'replays')).filter((f) => f.endsWith('.json')).map((f) => path.join(__dirname, 'replays', f)) : []);
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function paint(d, root, sp) {
  root.innerHTML = '';
  root.setAttribute('data-turn-number', sp.t); root.setAttribute('data-active-player-id', sp.my ? 'me' : 'op');
  root.setAttribute('data-viewer-score', sp.s[0]); root.setAttribute('data-opponent-score', sp.s[1]);
  const add = (h) => { const t = d.createElement('template'); t.innerHTML = h.trim(); root.appendChild(t.content.firstChild); };
  let id = 0; const card = (n, z, owner, ready, extra = '', cid) => add(`<div data-board-card-visual data-card-id="${cid || 'r' + (++id)}" data-drop-zone="${z}" data-visual-owner="${owner}" data-exhausted="${ready ? 'false' : 'true'}"><img alt="${esc(n)}">${extra}</div>`);
  sp.bf.forEach(([bid, name, sm, sth]) => { add(`<div data-battlefield-marker="${bid}"><img alt="${esc(name)}"></div>`); if (sm != null) add(`<div data-battlefield-might-zone="${bid}"><div data-might-side="self"><span data-battlefield-might-value="${sm}">${sm}</span></div><div data-might-side="opponent"><span data-battlefield-might-value="${sth}">${sth}</span></div></div>`); });
  sp.r.forEach(([dom, rd]) => card(dom[0].toUpperCase() + dom.slice(1) + ' Rune', 'runeArea', 'self', rd));
  sp.leg.forEach((n) => card(n, 'legend', 'self', 1)); sp.oleg.forEach((n) => card(n, 'legend', 'opponent', 1));
  (sp.ch0 || []).forEach((n) => card(n, 'champion', 'self', 1));
  sp.u.forEach(([n, z, m, rd, buff, white], i) => { const cid = 'u' + i; card(n, z, m ? 'self' : 'opponent', rd, buff ? `<span>Buff ${buff}</span>` : '', cid); if (white != null) add(`<div data-card-counter-card-id="${cid}" data-card-counter="white"><span data-card-counter-display>${white}</span></div>`); });
  sp.g.forEach(([n, z, m, rd]) => card(n, z, m ? 'self' : 'opponent', rd));
  sp.h.forEach((n) => add(`<div data-drop-zone="hand" data-card-id="h${++id}"><img alt="${esc(n)}"></div>`));
  if (sp.c.length) { const ch = sp.c.map(([n, m]) => `<div data-visual-owner="${m ? 'self' : 'opponent'}"><img alt="${esc(n)}"></div>`).join(''); add(`<div data-chain-drop>${ch}</div>`); }
  if (sp.log.length) add(`<ul>${sp.log.map(([t, m]) => `<li data-turn-player-id="${m === 1 ? 'me' : m === 0 ? 'op' : ''}"><span data-log-action-kind="x"></span>${esc(t)}</li>`).join('')}</ul>`);
}
let crashed = 0;
for (const f of files) {
  const games = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const g of (Array.isArray(games) ? games : [games])) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://play.riftatlas.com/game' });
    const d = dom.window.document; const root = d.createElement('div'); root.setAttribute('data-testid', 'game-state'); root.setAttribute('data-room-mode', 'multiplayer'); root.setAttribute('data-viewer-player-id', 'me'); d.body.appendChild(root);
    dom.window.eval(src); const C = dom.window.__rbCoach;
    let changed = 0, errors = 0; const examples = [];
    const before = C.learn.all().length;
    g.snaps.forEach((sp, i) => {
      try {
        paint(d, root, sp); const st = C.readState(); const box = d.createElement('div'); box.innerHTML = C.glance(st);
        const now = [...box.querySelectorAll('.hl > span:first-child, .gl > span:first-child')].map((x) => x.textContent.replace(/^[▶⚠⏸•👀]\s*/, '').trim()).filter((x) => !/^⚠ AI/.test(x));
        const was = (sp.adv || []).slice(0, 2); const top = now.slice(0, 2);
        if (was.length && top.join('|') !== was.join('|')) { changed++; if (examples.length < 6) examples.push(`  T${sp.t} ${sp.my ? 'me' : 'op'}: was [${was.join(' / ')}] → now [${top.join(' / ')}]`); }
      } catch (e) { errors++; if (examples.length < 6) examples.push(`  T${sp.t}: CRASH ${e.message}`); }
    });
    const L = C.learn.all().slice(before); const fc = L.filter((x) => x.type === 'factcheck');
    console.log(`${path.basename(f)} · ${g.id} (${g.deck || '?'}, recorded on ${g.v}): ${g.snaps.length} snapshots · ${changed} advice changes · ${fc.filter((x) => x.src === 'quick').length} quick lines blocked · ${fc.filter((x) => x.src === 'read').length} board-read warnings · ${errors} crashes`);
    examples.forEach((x) => console.log(x));
    [...new Set(fc.filter((x) => x.src === 'quick').map((x) => `  blocked: "${x.line}" — ${x.why}`))].slice(0, 5).forEach((x) => console.log(x));
    crashed += errors;
  }
}
if (!files.length) console.log('No recordings in tests/replays/ yet — copy them from the coach (Tests → Copy game recordings).');
process.exit(crashed ? 1 : 0);
