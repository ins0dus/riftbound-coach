// One unit, two empty battlefields: the coach must pick ONE (Fortified Position over Vilemaw's Lair), not tell you to take both.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="6" data-viewer-score="0" data-opponent-score="0"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Fortified Position"></div>'));
root.appendChild(el(`<div data-battlefield-marker="battlefieldB"><img alt="Vilemaw's Lair"></div>`));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<7;i++) put('Calm Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend');
put('Master Yi, Tempered','base');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const lines=C.advise(st).map(a=>a.g).filter(Boolean); console.log(lines);
const moves=lines.filter(g=>/Move .*→/.test(g));
process.exit(moves.length===1 && /Fortified Position/.test(moves[0]) ? 0 : 1);
