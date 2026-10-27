import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'/tmp/manhunt-redirect-artifact');
await mkdir(out+'/dist',{recursive:true});await mkdir(out+'/.openai',{recursive:true});
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));hosting.static={directory:'dist'};
await writeFile(out+'/.openai/hosting.json',JSON.stringify(hosting,null,2)+'\n');
await copyFile('redirect/index.html',out+'/dist/index.html');await copyFile('redirect/sw.js',out+'/dist/sw.js');
// Older delivered auth emails and notifications still reference these public icons.
for(const icon of ['icon-192.png','icon-512.png'])await copyFile('public/'+icon,out+'/dist/'+icon);
console.log(out);
