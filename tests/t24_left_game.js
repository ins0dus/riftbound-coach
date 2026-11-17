// Leaving a game at 7-3 (opponent conceded, no 8 on screen) must close it as a win right away.
const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/'});
dom.window.eval(src); const C=dom.window.__rbCoach;
C.rec.cur={id:'R:1',room:'R',lastTurn:12,done:false,lastMy:7,lastOpp:3,cards:{},result:'',notes:''};
C.rec.left();
const g=C.rec.games().find(x=>x.id==='R:1');
const ok=g && g.done && g.result==='W' && g.score==='7-3';
console.log((ok?'PASS':'FAIL')+' left at 7-3 -> '+JSON.stringify(g&&{r:g.result,s:g.score}));
C.rec.cur={id:'R:2',room:'R',lastTurn:1,done:false,lastMy:0,lastOpp:0,cards:{},result:'',notes:''};
C.rec.left(); const g2=C.rec.games().find(x=>x.id==='R:2');
console.log((!g2?'PASS':'FAIL')+' a game left at setup is not recorded');
process.exit(ok && !g2 ? 0 : 1);
