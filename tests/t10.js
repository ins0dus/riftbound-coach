const { JSDOM } = require('jsdom'); const fs=require('fs');
const src=fs.readFileSync('coach2.built.js','utf8');
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://play.riftatlas.com/game'});
dom.window.eval(src); const C=dom.window.__rbCoach;
for (const q of ['Can hidden cards be played the turn they are hidden?','When does a player score a hold?','Can I play a reaction during a showdown?','What happens if both units deal lethal damage in combat?']) {
  console.log('Q:',q,'\n  ->', (C.searchRules? C.searchRules(q,6000).map(d=>d.head).join(' | ') : 'no export'));
}
