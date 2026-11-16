const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync('coach2.built.js','utf8');
function run(turn){
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="${turn}" data-viewer-score="0" data-opponent-score="1"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Forgotten Monument"></div>'));
let id=0; const put=(n,z,o='self',ex=false)=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="${ex}"><img alt="${n}"></div>`));
for(let i=0;i<5;i++) put('Calm Rune','runeArea'); put('Irelia, Blade Dancer','legend'); put('Scuttle Crab','base');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
console.log('turn',turn, C.glance(st).replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));}
run(4); run(6);
