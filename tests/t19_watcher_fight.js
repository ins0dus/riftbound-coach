// Thousand-Tailed Watcher (-3 to enemy units, min 1) + Fizz attack Graves + Master Yi at Fortified Position.
// Expected (rules): Graves 4+2 Shield-3 = 3, Yi 1; Graves' trigger kills Fizz; Watcher survives; both defenders die; they take it.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="op" data-turn-number="8" data-viewer-score="3" data-opponent-score="1"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldA"><img alt="Fortified Position"></div>'));
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Rockfall Path"></div>'));
root.appendChild(el('<ul><li data-turn-player-id="op"><span data-log-action-kind="play"></span>Played Thousand-Tailed Watcher from hand.</li></ul>'));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<5;i++) put('Calm Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend');
put('Graves, Blasting Through','battlefieldA'); put('Master Yi, Tempered','battlefieldA');
put('Thousand-Tailed Watcher','battlefieldA','opponent'); put('Fizz, Trickster','battlefieldA','opponent');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
st.units.forEach(u=>console.log(u.name, u.mightNow, JSON.stringify(u.mightParts)));
const f=C.predictFight(st, st.bf.battlefieldA); console.log(f);
let ok = f && /They win/.test(f.result) && f.deaths.some(x=>/their Fizz/.test(x)) && f.deaths.some(x=>/your Graves/.test(x)) && f.deaths.some(x=>/your Master Yi/.test(x)) && !f.deaths.some(x=>/Watcher/.test(x));
process.exit(ok?0:1);
