// regression: opponent Akali with a 9 Might counter; RiftAtlas totals 9 (me) vs 12 (them) at Abandoned Hall
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync('coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="op" data-turn-number="12" data-viewer-score="6" data-opponent-score="6"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-battlefield-marker="battlefieldB"><img alt="Abandoned Hall"></div>'));
root.appendChild(el('<div data-battlefield-might-zone="battlefieldB"><div data-might-side="self"><span data-battlefield-might-value="9">9</span></div><div data-might-side="opponent"><span data-battlefield-might-value="12">12</span></div></div>'));
let id=0; const put=(n,z,o='self')=>{root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`)); return 'c'+id;};
for(let i=0;i<5;i++) put('Calm Rune','runeArea');
['Neeko, Blending In','Riven, The Exile','Scuttle Crab','Traveling Merchant'].forEach(n=>put(n,'battlefieldB'));
['Discipline','Battle Preparations','Blade of the Exile','Blade of the Exile','Blade of the Exile'].forEach(n=>put(n,'hand'));
const ak=put('Akali, Silent','battlefieldB','opponent'); put('Reckless Innovator','battlefieldB','opponent');
root.appendChild(el(`<div data-card-counter-card-id="${ak}" data-card-counter="white"><span data-card-counter-display>9</span></div>`));
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState(); const b=st.bf.battlefieldB;
console.log('totals',b.mine,b.theirs,'akali',st.theirUnits.find(u=>/Akali/.test(u.name)).mightNow);
if(b.mine!==9||b.theirs!==12) {console.log('FAIL'); process.exit(1);}
const g=C.glance(st).replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); console.log(g.slice(0,300));
if(!/Win Abandoned Hall/.test(g)){console.log('FAIL no win line');process.exit(1);}
const it=C.advise(st).find(x=>/need \+/.test(x.title)); console.log(it&&it.steps.join(' | ').replace(/<[^>]+>/g,''));
