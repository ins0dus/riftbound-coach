// Stats tab: deck profile from a lobby list (base vs a version with hold-breakers) and rendering without crashes.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'}); const d=dom.window.document;
const el=(h)=>{const t=d.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const root=el(`<div data-testid="game-state" data-room-mode="multiplayer" data-viewer-player-id="me" data-active-player-id="me" data-turn-number="4"></div>`); d.body.appendChild(root);
root.appendChild(el('<div data-board-card-visual data-card-id="l1" data-drop-zone="legend" data-visual-owner="self" data-exhausted="false"><img alt="Irelia, Blade Dancer"></div>'));
const LIST={'Tideturner':3,'Scuttle Crab':3,'Reckless Innovator':3,'Akali, Silent':1,'Vex, Apathetic':1,'Riven, Deserter':2,'Neeko, Blending In':2,'Heartening Soul':1,'Guardian Angel':3,'Defiant Dance':3,'Discipline':3,'Hunker Down':2,'En Garde':2,'Ki Burst':1,'Life from Stone':1,'Defy':3,'Not So Fast':2,'Ride the Wind':1,'Gust':1,'Star-Crossed':1};
const setList=(m)=>dom.window.localStorage.setItem('rbcoach:deck:ireliabladedancer', JSON.stringify({legend:'Irelia Blade Dancer',champion:'Irelia, Fervent',main:m,side:{},bfs:[],at:'t'}));
setList(LIST);
dom.window.eval(src); const C=dom.window.__rbCoach; const st=C.readState();
const base=C.deckProfile(C.myDecklist(st).cards);
const HB={...LIST,'Charm':2,'Back Off':1,'En Garde':1}; delete HB['Ki Burst']; delete HB['Life from Stone']; setList(HB);
const hb=C.deckProfile(C.myDecklist(st).cards);
console.log('cards', base.N, hb.N, 'holdBreak', base.t.holdBreak, '->', hb.t.holdBreak, base.scores, base.notes);
let fail=0; if(base.N!==40||hb.N!==40){console.log('FAIL deck size');fail=1;} if(!(hb.t.holdBreak>base.t.holdBreak)){console.log('FAIL hold-breaker should add hold-breaking');fail=1;}
const html=C.stats(st); if(!/Deck strength profile/.test(html)){console.log('FAIL render');fail=1;}
process.exit(fail);
