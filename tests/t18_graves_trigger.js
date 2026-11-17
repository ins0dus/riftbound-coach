// Graves defending vs Seraphic Wyvern with Discipline in hand: coach must say to pump BEFORE the defend trigger resolves.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="op" data-turn-number="10" data-viewer-score="5" data-opponent-score="5"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Cosmic Vista"></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<3;i++) put('Calm Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put('Discipline','hand');
put('Graves, Blasting Through','battlefieldB'); put('Seraphic Wyvern','battlefieldB','opponent');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const lines=C.advise(st).map(a=>a.g).filter(Boolean); console.log(lines);
process.exit(lines.some(g=>/BEFORE its trigger resolves: Discipline/.test(g)) ? 0 : 1);
