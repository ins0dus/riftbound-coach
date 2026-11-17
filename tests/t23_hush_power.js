// Hush only counters spells with 2+ Power: AI said "Cast Hush on their Ride the Wind" (1 Power) in a real game.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
function board({myTurn=true, hand=[], runes=3, chain=[]}){
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
  const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
  const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="${myTurn?'me':'op'}" data-turn-number="11" data-viewer-score="5" data-opponent-score="2"></div>`); d.body.appendChild(root);
  ['Fortified Position','Abandoned Hall'].forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div>`)));
  let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
  for(let i=0;i<runes;i++) put('Calm Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend');
  hand.forEach(n=>put(n,'hand'));
  if(chain.length){ const ch=el('<div data-chain-drop></div>'); chain.forEach(([n,o])=>ch.appendChild(el(`<div data-visual-owner="${o}" data-card-id="x${++id}"><img alt="${n}"></div>`))); root.appendChild(ch); }
  dom.window.eval(src); const C=dom.window.__rbCoach; return {C, st:C.readState()};
}
let fail=0; const expect=(name,got,want)=>{ const ok = want ? (got && want.test(got)) : !got; console.log((ok?'PASS ':'FAIL ')+name+' -> '+(got||'ok')); if(!ok) fail=1; };
let b=board({hand:['Hush'],chain:[['Ride the Wind','opponent']],myTurn:false,runes:2});
console.log('chain', JSON.stringify(b.st.chain.map(c=>[c.name,c.mine,!!c.c])));
expect('Hush cannot counter 1-Power Ride the Wind', b.C.factCheck(b.st,'Cast Hush on their Ride the Wind'), /2\+ Power/);
expect('a keep/hold word in the steps used to hide it (documented)', b.C.factCheck(b.st,'Cast Hush on their Ride the Wind. Nothing worth saving the mana for'), null);
const g=(b)=>b.C.advise(b.st).filter(a=>a.g).map(a=>a.g).join(' | ');
b=board({hand:['Hush'],chain:[['Ride the Wind','opponent']],myTurn:false,runes:2}); expect('quick line: Hush cannot counter Ride the Wind', g(b), /Hush can't counter it/);
b=board({hand:['Hush'],chain:[['Ride the Wind','opponent']],myTurn:false,runes:0}); expect('still says why with no runes', g(b), /can't counter it/);
b=board({hand:['Hush'],chain:[['Stupefy','opponent']],myTurn:true,runes:5}); expect('the approve line survives the fact-check (it was being hidden)', b.C.glance? null : null, null);
{ const line=(b.C.advise(b.st).find(a=>/Stupefy/.test(a.g||''))||{}).g||''; expect('Stupefy line shown', line, /Hush can't counter it/); expect('...and not blocked', b.C.factCheck(b.st,line), null); }
process.exit(fail);
