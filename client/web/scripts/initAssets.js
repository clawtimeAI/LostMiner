const fs = require('fs');
const path = require('path');
const biomes = ['Desert','Green','Ice','Lost','Lunar','Red','Swamp','Volcanic'];
const categories = ['ground','obstacle','trap'];
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
const root = path.join(__dirname,'..','public','assets','hex');
ensureDir(root);
for(const b of biomes){
  const bdir = path.join(root,b);
  ensureDir(bdir);
  for(const c of categories){
    const cdir = path.join(bdir,c);
    ensureDir(cdir);
    const keep = path.join(cdir,'.keep');
    if(!fs.existsSync(keep)) fs.writeFileSync(keep,'');
  }
}
console.log('assets initialized');

