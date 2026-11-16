// Fact-checker: catches the kinds of mistakes seen in real games.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
function board({myTurn=true, hand=[], runes=3, chain=[], mine=[], theirs=[], bfs=['Abandoned Hall','Forgotten Monument']}){
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
  const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
  const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="${myTurn?'me':'op'}" data-turn-number="8" data-viewer-score="3" data-opponent-score="4"></div>`); d.body.appendChild(root);
  bfs.forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div>`)));
  let id=0; const put=(n,z,o='self',ex=false)=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="${ex}"><img alt="${n}"></div>`));
  for(let i=0;i<runes;i++) put('Calm Rune','runeArea'); put('Irelia, Blade Dancer','legend');
  hand.forEach(n=>put(n,'hand')); mine.forEach(([n,z,ex])=>put(n,z,'self',!!ex)); theirs.forEach(([n,z])=>put(n,z,'opponent'));
  if(chain.length){ const ch=el('<div data-chain-drop></div>'); chain.forEach(([n,o])=>ch.appendChild(el(`<div data-visual-owner="${o}"><img alt="${n}"></div>`))); root.appendChild(ch); }
  dom.window.eval(src); const C=dom.window.__rbCoach; return {C, st:C.readState()};
}
let fail=0; const expect=(name,got,want)=>{ const ok = want ? (got && want.test(got)) : !got; console.log((ok?'PASS ':'FAIL ')+name+' -> '+(got||'ok')); if(!ok) fail=1; };
let b;
b=board({hand:['Defy'],chain:[['Lacerate','opponent']],myTurn:false,runes:2}); expect('Defy vs Lacerate is fine', b.C.factCheck(b.st,'DEFY Lacerate'), null);
b=board({hand:['Defy'],chain:[['Black Market Broker','opponent']],myTurn:false,runes:2}); expect('Defy cannot counter a unit', b.C.factCheck(b.st,'Defy Black Market Broker'), /only counters spells/);
b=board({hand:['Accelerate'].concat(['Akali, Silent']),runes:2}); expect('cannot afford Akali with 2 runes', b.C.factCheck(b.st,'Play Akali, Silent'), /can't pay/);
b=board({hand:['Scuttle Crab'],myTurn:false,runes:3}); expect('unit on opponent turn', b.C.factCheck(b.st,'Play Scuttle Crab'), /can't be played right now/);
b=board({hand:['Discipline'],myTurn:false,runes:3}); expect('reaction on opponent turn ok', b.C.factCheck(b.st,'Discipline → Neeko'), null);
b=board({hand:[],runes:3}); expect('card not in hand', b.C.factCheck(b.st,'Play Riven, Deserter'), /isn't in your hand/);
b=board({hand:[],runes:3,mine:[['Irelia, Fervent','battlefieldA',true]]}); expect('exhausted unit cannot move', b.C.factCheck(b.st,'Move Irelia, Fervent → Forgotten Monument'), /exhausted/);
b=board({hand:['Defy'],runes:3,myTurn:false}); expect('hold line ok', b.C.factCheck(b.st,'Their turn — hold Defy'), null);
process.exit(fail);
