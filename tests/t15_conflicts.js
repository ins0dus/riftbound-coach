// One clear decision: no "win X" next to "losing X — don't add more"; no "pass" next to a play; duplicates removed.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="8"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Abandoned Hall"></div>'));
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const out=C.resolveConflicts(st,[{g:'Win Abandoned Hall: Discipline → Neeko',lvl:'do',p:90},{g:"Losing Abandoned Hall by 4 — don't add more",lvl:'warn',p:88},{g:'Pass — nothing worth doing',lvl:'info',p:10},{g:'Win Abandoned Hall: Discipline → Neeko',lvl:'do',p:90}]).map(x=>x.g);
console.log(out); process.exit(out.length===1 && /Win/.test(out[0]) ? 0 : 1);
