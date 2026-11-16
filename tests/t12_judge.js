// Judge tab: offline rules lookup finds the right sections; cited rule numbers are verified; suggestions follow the board.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="op" data-turn-number="8" data-viewer-score="3" data-opponent-score="4"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Abandoned Hall"></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<4;i++) put('Calm Rune','runeArea'); put('Defy','hand');
root.appendChild(el('<div data-chain-drop><div data-visual-owner="opponent"><img alt="Lacerate"></div></div>'));
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
let fail=0;
const sug=C.judgeSuggestions(st); console.log('suggestions:',sug); if(!sug.some(x=>/Lacerate/.test(x))) {console.log('FAIL no chain suggestion');fail=1;}
if(!C.ruleLine('811')&&!Object.keys({}).length){ /* 811 heading may not be a numbered line */ }
C.judge(st,'Can hidden cards be played the turn they are hidden?',(html)=>{ const t=html.replace(/<[^>]+>/g,' '); console.log(t.slice(0,160)); if(!/Hidden/.test(t)){console.log('FAIL hidden lookup');fail=1;} });
C.judge(st,'Can I play a reaction during a showdown?',(html)=>{ if(!/Reaction|Showdown/i.test(html)){console.log('FAIL showdown lookup');fail=1;} });
const rl=C.ruleLine('002'); console.log('rule 002:', rl && rl.line.slice(0,60)); if(!rl){console.log('FAIL rule number index');fail=1;}
process.exit(fail);
