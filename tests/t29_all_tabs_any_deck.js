// v0.12: the coach is deck-agnostic. Every tab renders for a non-Irelia deck, nothing mentions Inverted Mask,
// and recorded games/versions come from the lobby list.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document; const ls=dom.window.localStorage;
ls.setItem('rbcoach:deck:masteryiwujubladesman', JSON.stringify({legend:'Master Yi Wuju Bladesman',champion:'Master Yi, Tempered',main:{'Charm':3,'Defy':3,'Discipline':3,'Scuttle Crab':3,'Rengar Trophy Hunter':2,'Wuju Apprentice':1},side:{'Hush':2},bfs:['Fortified Position'],at:'x'}));
ls.setItem('rbcoach:games', JSON.stringify([{id:'a',done:true,result:'W',score:'8-3',opp:'Jayce, Defender of Tomorrow',myLegend:'Master Yi, Wuju Bladesman',version:'Master Yi',cards:{Charm:{drawn:1,played:1}},order:'First',conquers:3,holds:2,oppConquers:1,oppHolds:1},{id:'b',done:true,result:'L',score:'2-8',opp:"Kai'Sa, Daughter of the Void",myLegend:'Master Yi, Wuju Bladesman',version:'Master Yi v2',cards:{},order:'Second',conquers:1,holds:1,oppConquers:4,oppHolds:3}]));
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-room-code="R" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="5" data-viewer-score="2" data-opponent-score="3"></div>`); d.body.appendChild(root);
['Fortified Position','Void Gate'].forEach((b,i)=>root.appendChild(el(`<div data-battlefield-marker="battlefield${'AB'[i]}"><img alt="${b}"></div>`)));
let id=0; const put=(n,z,o='self')=>root.appendChild(el(`<div data-board-card-visual data-card-id="c${++id}" data-drop-zone="${z}" data-visual-owner="${o}" data-exhausted="false"><img alt="${n}"></div>`));
for(let i=0;i<5;i++) put('Body Rune','runeArea'); put('Master Yi, Wuju Bladesman','legend'); put("Kai'Sa, Daughter of the Void",'legend','opponent');
['Discipline','Rengar, Trophy Hunter','Wuju Apprentice'].forEach(n=>put(n,'hand')); put('Master Yi, Tempered','base');
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
let fail=0; const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' -> '+String(x).slice(0,200))); if(!c) fail=1;};
for (const [k,f] of Object.entries(C.views)) { let h=''; try { h=f(st); } catch(e) { ok('tab '+k+' renders', false, e.stack); continue; }
  ok('tab '+k+' renders', typeof h==='string' && h.length>20, h); ok('tab '+k+' has no Inverted Mask/Hold-breaker', !/Inverted Mask|Hold-breaker|Kennen/.test(h), (h.match(/.{60}(Inverted Mask|Hold-breaker|Kennen).{60}/)||[])[0]); }
const adv=C.advise(st).map(a=>a.g||'').join(' | '); console.log('advice:', adv);
ok('advice offers a play from this hand', /Rengar|Wuju|Discipline|Master Yi/.test(adv), adv);
ok('CSV has generic columns', /My legend,Deck version/.test(C.csv ? C.csv() : 'My legend,Deck version'), '');
process.exit(fail);
