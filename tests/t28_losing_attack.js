// Feedback #4: AI said "Attack Fortified Position with Ruin Runner" — 5 (+2 Discipline) into Orianna defending at 8.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
function run(oppMight){
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="9" data-viewer-score="2" data-opponent-score="5"></div>`); d.body.appendChild(root);
['Fortified Position',"Ornn's Forge"].forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div><div data-battlefield-might-value="${i?0:oppMight}" data-battlefield-id="battlefield${'AB'[i]}" data-side="opponent"></div>`)));
let id=0; const put=(n,z,o='self',ex=false)=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="${ex}"><img alt="${n}"></div>`));
for(let i=0;i<8;i++) put(i<5?'Body Rune':'Calm Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put('Discipline','hand');
put('Ruin Runner','base'); put('Orianna, Exquisite','battlefieldA','opponent'); put('Mask of Foresight','battlefieldA','opponent');
dom.window.eval(src); const C=dom.window.__rbCoach; return C.factCheck(C.readState(),'Attack Fortified Position with Ruin Runner');
}
const r=run(8); const ok=/loses/.test(r||''); console.log((ok?'PASS':'FAIL')+' losing attack caught -> '+r);
process.exit(ok?0:1);
