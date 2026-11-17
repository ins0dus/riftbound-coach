// Game 2 vs Jayce: K'Sante, Courageous (Shield 2) defends ALONE at Veiled Temple vs Skystrike Squadron. RiftAtlas showed 4 vs 4
// (no Shield, no Wuju bonus). Real result: Squadron died, K'Sante lived. The coach must add the Shield + "alone" bonuses.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="7" data-viewer-score="5" data-opponent-score="2"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Veiled Temple"></div>'));
root.appendChild(el('<div data-battlefield-might-zone="battlefieldB"><div data-might-side="self"><span data-battlefield-might-value="4">4</span></div><div data-might-side="opponent"><span data-battlefield-might-value="4">4</span></div></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<5;i++) put('Body Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend');
put("K'Sante, Courageous",'battlefieldB');
dom.window.eval(src); const C=dom.window.__rbCoach; C.readState(); // I control Veiled Temple first
put('Skystrike Squadron','battlefieldB','opponent'); const st=C.readState();
// Charm moved their unit in on MY turn: I am the defender (I controlled it before)
const f=C.predictFight(st, st.bf.battlefieldB); console.log(st.bf.battlefieldB.mine, st.bf.battlefieldB.theirs, f.result, f.log);
process.exit(/You win/.test(f.result) && !/your K'Sante/.test(f.deaths.join()) ? 0 : 1);
