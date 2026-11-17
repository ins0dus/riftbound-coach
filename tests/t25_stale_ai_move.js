// AI said 'Move Yi to Fortified, then Punch First' after Yi had already moved (exhausted) — must be caught.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(''+__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="5" data-viewer-score="1" data-opponent-score="2"></div>`); d.body.appendChild(root);
['Fortified Position',"Ornn's Forge"].forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div>`)));
let id=0; const put=(n,z,o='self',ex=false)=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="${ex}"><img alt="${n}"></div>`));
for(let i=0;i<2;i++) put('Body Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put('Punch First','hand');
put('Master Yi, Tempered','battlefieldB','self',true); put('Pit Crew','battlefieldA','opponent',true);
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const r=C.factCheck(st,'Move Yi to Fortified Position, then Punch First'); console.log((/exhausted|already/.test(r||'')?'PASS':'FAIL')+' exhausted Yi cannot move -> '+r); process.exit(/exhausted|already/.test(r||'')?0:1);
