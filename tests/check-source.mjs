import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
let count=0;
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist'].includes(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())visit(path);else if(path.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);count++;}}}
visit(root);console.log(`Syntax verified for ${count} modules.`);
