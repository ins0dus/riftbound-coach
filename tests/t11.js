const { JSDOM } = require('jsdom'); const fs=require('fs');
let src=fs.readFileSync(__dirname+'/t9.js','utf8').replace(/if\(!\/Win[\s\S]*$/,'');
src+=`
C.render(true);
const btn=d.querySelector('[data-bad]'); if(!btn){console.log('FAIL no 👎 button');process.exit(1);}
dom.window.open=(u)=>{global.opened=u;};
btn.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
const box=[...d.body.children].find(x=>x.querySelector&&x.querySelector('[data-fbg]')); if(!box){console.log('FAIL no form');process.exit(1);}
box.querySelector('[data-r]').click(); box.querySelector('[data-fbn]').value='Battle Preparations is a Reaction';
box.querySelector('[data-fbg]').click();
const L=C.learn.all(); const e=L[L.length-1]; console.log('saved', e.reasons, e.note, e.sent);
if (global.opened) { console.log('FAIL redirected to', global.opened); process.exit(1); }
if (!e.queued || !/Battle Preparations/.test(e.note)) { console.log('FAIL not queued'); process.exit(1); }
console.log('queued, no redirect');
`;
fs.writeFileSync(__dirname+'/t11_run.js',src); require(__dirname+'/t11_run.js');
