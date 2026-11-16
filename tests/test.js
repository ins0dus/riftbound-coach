// jsdom harness: fake RiftAtlas board, drive events, print coach output
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/coach2.built.js', 'utf8');
const dom = new JSDOM(`<!doctype html><body></body>`, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://play.riftatlas.com/game' });
const { window } = dom; const d = window.document;
let uid = 0;
function el(html) { const t = d.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
const G = { turn: 3, active: 'me', myScore: 2, oppScore: 1 };
const root = el(`<div data-testid="game-state" data-room-mode="multiplayer" data-room-phase="in_game" data-room-code="TEST1" data-viewer-player-id="me"></div>`);
d.body.appendChild(root);
const zones = {};
for (const z of ['base', 'battlefieldA', 'battlefieldB', 'runeArea', 'legend', 'champion', 'hand']) { zones[z] = el(`<div data-drop-zone-root="${z}"></div>`); root.appendChild(zones[z]); }
const markA = el(`<div data-battlefield-marker="battlefieldA"><img alt="Abandoned Hall"></div>`), markB = el(`<div data-battlefield-marker="battlefieldB"><img alt="Targon's Peak"></div>`);
root.append(markA, markB);
const might = el(`<div></div>`); root.appendChild(might);
const chain = el(`<div data-chain-drop="true"></div>`); root.appendChild(chain);
const log = el(`<ul data-turn-player-id="me"></ul>`); root.appendChild(log);
function sync() { root.setAttribute('data-turn-number', G.turn); root.setAttribute('data-active-player-id', G.active); root.setAttribute('data-viewer-score', G.myScore); root.setAttribute('data-opponent-score', G.oppScore); }
function put(name, zone, owner = 'self', ex = false, fd = false) {
  const id = 'card_' + (++uid);
  if (zone === 'hand') { zones.hand.appendChild(el(`<div data-drop-zone="hand" data-card-id="${id}"><img alt="${name}"></div>`)); return id; }
  const e = el(`<div data-board-card-visual="true" data-card-id="${id}" data-drop-zone="${zone}" data-visual-owner="${owner}" data-exhausted="${ex}" data-face-down="${fd}"><img alt="${name}"></div>`);
  zones[zone].appendChild(e); return id;
}
const q = (id) => d.querySelector(`[data-board-card-visual][data-card-id="${id}"]`);
const setEx = (id, v) => q(id).setAttribute('data-exhausted', v);
const move = (id, z) => q(id).setAttribute('data-drop-zone', z);
function setMight(zone, mine, theirs) {
  might.innerHTML = '';
  for (const [side, v] of [['self', mine], ['opponent', theirs]]) if (v) might.appendChild(el(`<div data-battlefield-might-zone="${zone}"><div data-might-side="${side}"><span data-battlefield-might-value>${v}</span></div></div>`));
}
function addLog(text, mine = true) { const ul = log; ul.setAttribute('data-turn-player-id', mine ? 'me' : 'opp'); ul.insertBefore(el(`<li><span data-log-action-kind="board"></span>12:00${text}</li>`), ul.firstChild); }
function fromHand(name) { const h = [...zones.hand.children].find((c) => c.querySelector('img').alt === name); h.remove(); }

// ---- setup
sync();
for (let i = 0; i < 3; i++) put('Calm Rune', 'runeArea'); for (let i = 0; i < 3; i++) put('Chaos Rune', 'runeArea');
put('Irelia, Blade Dancer', 'legend');
put('Irelia, Fervent', 'champion');
['Reckless Innovator', 'Riven, Deserter', 'Defy', 'Discipline', 'En Garde', 'Guardian Angel', 'Heartening Soul'].forEach((n) => put(n, 'hand'));
const tide = put('Tideturner', 'battlefieldA'); setMight('battlefieldA', 2, 0);
window.eval(src);
const C = window.__rbCoach;
const show = (label) => {
  const st = C.readState();
  console.log('\n=== ' + label + ` (T${st.turn}, ready ${st.ready}/${st.runes.length})`);
  C.reminders().forEach((r) => console.log('  [REMIND ' + r.lvl + '] ' + r.title + ' :: ' + r.steps.join(' | ').replace(/<[^>]+>/g, '')));
  console.log('  GLANCE: ' + C.glance(st).replace(/<li>/g,'\n      - ').replace(/<\/div>/g,'\n  ').replace(/<[^>]+>/g,'').replace(/\n\s*\n/g,'\n'));
  if (process.env.FULL) C.advise(st).forEach((a) => console.log('  [' + a.lvl + '] ' + a.title + ' :: ' + a.steps.join(' | ').replace(/<[^>]+>/g, '')));
};
const tick = () => C.render(true);
tick(); show('start T3 (hold Hall with Tideturner)');

// play Innovator to base
fromHand('Reckless Innovator'); addLog('Played Reckless Innovator from hand to base.'); const inn = put('Reckless Innovator', 'base', 'self', true); for (const r of [...zones.runeArea.children].slice(0, 3)) r.setAttribute('data-exhausted', 'true');
tick(); show('after playing Innovator (3 runes tapped)');

// next turn: play Deserter etc
G.turn = 5; sync(); [...zones.runeArea.children].forEach((r) => r.setAttribute('data-exhausted', 'false')); for (let i = 0; i < 2; i++) put('Calm Rune', 'runeArea'); setEx(inn, 'false'); setEx(tide, 'false');
tick(); show('T5 start');
fromHand('Riven, Deserter'); addLog('Played Riven, Deserter from hand to Abandoned Hall.'); const des = put('Riven, Deserter', 'battlefieldA', 'self', true); setMight('battlefieldA', 7, 0);
tick(); show('Deserter played to Hall (sim left it exhausted)');
setEx(inn, 'true'); tick(); show('Innovator exhausted (Deserter loop)');

// opponent moves into the Hall with a 6 might unit
G.active = 'opp'; G.turn = 6; sync();
addLog('Played Gutter Guardian from hand to base.', false); const opp = put('Gutter Guardian', 'battlefieldA', 'opponent'); setMight('battlefieldA', 7, 9);
tick(); show('opponent unit enters the Hall: 7 vs 9');
chain.appendChild(el(`<div data-visual-owner="opponent"><img alt="Punch First"></div>`)); tick(); show('opponent casts Punch First');
chain.innerHTML = ''; tick();

// my turn, conquer Targon's Peak
G.active = 'me'; G.turn = 7; sync(); [...zones.runeArea.children].forEach((r) => r.setAttribute('data-exhausted', 'false'));
setEx(inn, 'false'); move(inn, 'battlefieldB'); setEx(inn, 'true'); setMight('battlefieldB', 3, 0); addLog("Conquered Targon's Peak and scored 1.");
tick(); show('Innovator moved & conquered Targon');

// Heartening Soul scenario that confused the user: Soul exhausted in base, Irelia legend ready, Discipline in hand
fromHand('Heartening Soul'); addLog('Played Heartening Soul from hand to base.'); const soul = put('Heartening Soul', 'base', 'self', true);
for (let i = 0; i < 6; i++) put('Chaos Rune', 'runeArea');
tick(); show('Heartening Soul played (exhausted in base)');
// my spell on chain
chain.appendChild(el(`<div data-visual-owner="self"><img alt="Discipline"></div>`)); tick(); show('I cast Discipline');
chain.innerHTML = '';
put("Gutter Guardian","base","opponent"); G.oppScore=6; sync(); tick(); show("opp unit in base, opp at 6");
G.myScore = 8; sync(); tick(); show("game over");
console.log('\nSIDEBOARD', JSON.stringify(C.sideboard(C.readState())).slice(0, 600));
console.log('\nCSV:\n' + C.csv());
console.log('\nTESTS:\n' + C.tests().replace(/<(li|tr)>/g,'\n').replace(/<[^>]+>/g,' ').replace(/ +/g,' '));
