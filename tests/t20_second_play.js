// 6 runes, Rengar costs 5: the coach must not suggest K'Sante "after that".
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="9" data-viewer-score="3" data-opponent-score="3"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Fortified Position"></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
['Body Rune','Body Rune','Body Rune','Calm Rune','Calm Rune','Calm Rune'].forEach(r=>put(r,'runeArea')); put('Master Yi, Wuju Bladesman','legend');
['Rengar, Trophy Hunter',"K'Sante, Courageous"].forEach(n=>root.appendChild(el(`<div data-drop-zone="hand" data-card-id="h${++id}"><img alt="${n}"></div>`)));
put('Master Yi, Tempered','battlefieldA');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const best=C.advise(st).find(a=>a.title==='Best play'); const t=best?best.steps.join(' | ').replace(/<[^>]+>/g,''):'(none)'; console.log(t);
process.exit(best && !/K'Sante/.test(t.split('|').slice(1).join('|')) ? 0 : 1);
