// Board self-check: flags a Might mismatch between RiftAtlas totals and the cards, and a card it can't read.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="8" data-viewer-score="3" data-opponent-score="4"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Abandoned Hall"></div>'));
root.appendChild(el('<div data-battlefield-might-zone="battlefieldA"><div data-might-side="self"><span data-battlefield-might-value="1">1</span></div><div data-might-side="opponent"><span data-battlefield-might-value="2">2</span></div></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<4;i++) put('Calm Rune','runeArea');
put('Akali, Silent','battlefieldA'); put('Sneaky Zeebles','battlefieldA','opponent'); put('Totally Unknown Card','base');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
console.log(st.readIssues); let fail=0;
if(!st.readIssues.some(x=>/your Might at Abandoned Hall/.test(x))){console.log('FAIL might mismatch not flagged');fail=1;}
if(!st.readIssues.some(x=>/can't read card text/.test(x))){console.log('FAIL unknown card not flagged');fail=1;}
const g=C.glance(st); if(!/Check the board/.test(g)){console.log('FAIL glance missing warning');fail=1;}
process.exit(fail);
