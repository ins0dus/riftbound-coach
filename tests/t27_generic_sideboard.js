// Generic sideboard (lobby decks): vs Kai'Sa removal, Hush only reaches Falling Star → don't bring it in; warn about gear.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const ls=dom.window.localStorage;
ls.setItem('rbcoach:deck:masteryiwujubladesman', JSON.stringify({legend:'Master Yi Wuju Bladesman',main:{'Trinity Force':1,'Jagged Cutlass':1,'Ruin Runner':1,'Rengar Trophy Hunter':2,'Charm':3},side:{'Hush':2,'Decree of Strength':2},bfs:[],at:'x'}));
ls.setItem('rbcoach:opp', JSON.stringify({RM:{legend:"Kai'Sa, Daughter of the Void",seen:{'Hextech Ray':1,'Falling Star':1,'Void Seeker':1,'Bellows Breath':1,'Stupefy':1}}}));
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-room-code="RM" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="3" data-viewer-score="0" data-opponent-score="0"></div>`); d.body.appendChild(root);
root.appendChild(el(`<div data-board-card-visual data-card-id="c1" data-drop-zone="legend" data-visual-owner="self"><img alt="Master Yi, Wuju Bladesman"></div>`));
root.appendChild(el(`<div data-board-card-visual data-card-id="c2" data-drop-zone="legend" data-visual-owner="opponent"><img alt="Kai'Sa, Daughter of the Void"></div>`));
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const h=C.sideboard(st); console.log(JSON.stringify({ins:h.ins.map(x=>x.n+': '+x.why),outs:h.outs,notes:h.notes}));
let fail=0; const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c) fail=1;};
ok('Hush not suggested (reaches only Falling Star)', !h.ins.some(x=>x.n==='Hush'));
ok('Decree of Strength in vs a Mind deck', h.ins.some(x=>x.n==='Decree of Strength'));
ok('gear goes out first', h.outs[0]==='Trinity Force');
ok('removal note', h.notes.some(n=>/removal/.test(n)));
process.exit(fail);
