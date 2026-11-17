// K'Sante (legend gives Assault = Shield) attacks Master Yi defending alone at Fortified Position. RiftAtlas shows 7 vs 8:
// the forecast must follow RiftAtlas's totals (effects the coach can't read) and say they win — not "you win".
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="op" data-turn-number="6" data-viewer-score="2" data-opponent-score="0"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Fortified Position"></div>'));
root.appendChild(el('<div data-battlefield-might-zone="battlefieldA"><div data-might-side="self"><span data-battlefield-might-value="7">7</span></div><div data-might-side="opponent"><span data-battlefield-might-value="8">8</span></div></div>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<5;i++) put('Body Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put("K'Sante, Pride of Nazumah",'legend','opponent');
put('Master Yi, Tempered','battlefieldA'); put("K'Sante, Dauntless",'battlefieldA','opponent');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState(); const f=C.predictFight(st, st.bf.battlefieldA); console.log(f.result, f.log);
process.exit(/They win/.test(f.result) ? 0 : 1);
