// "Revealed their hand: …" in the log → the coach remembers their cards and drops them as they're played.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
function board(logs, myTurn){
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
  const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
  const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-room-code="RM" data-viewer-player-id="me" data-active-player-id="${myTurn?'me':'op'}" data-turn-number="10" data-viewer-score="2" data-opponent-score="5"></div>`); d.body.appendChild(root);
  ['Fortified Position','Void Gate'].forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div>`)));
  let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
  for(let i=0;i<3;i++) put('Body Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put('Charm','hand');
  const lg=el('<div></div>'); logs.forEach(t=>lg.appendChild(el(`<div data-log-action-kind="x" data-turn-player-id="op">${t}</div>`))); root.appendChild(lg);
  dom.window.eval(src); return dom.window.__rbCoach;
}
let fail=0; const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c) fail=1;};
let C=board(['Revealed their hand: Time Warp , Temporal Breach , Watchful Sentry.'], true);
let g=C.advise(C.readState()).map(a=>a.g||'').join(' | '); console.log(g);
ok('remembers their hand', /Time Warp|Temporal Breach|Watchful Sentry/.test(g));
process.exit(fail);
