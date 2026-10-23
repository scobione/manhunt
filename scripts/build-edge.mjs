import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const pkg=JSON.parse(await readFile('node_modules/@supabase/supabase-js/package.json','utf8'));
await mkdir('supabase/functions/manhunt-api',{recursive:true});
await build({entryPoints:['server/edge-entry.ts'],outfile:'supabase/functions/manhunt-api/index.js',bundle:true,format:'esm',platform:'node',target:'es2022',minify:true,
 banner:{js:'import { Buffer } from "node:buffer"; import process from "node:process";'},
 define:{'process.env.NODE_ENV':'"production"','process.env.TEST_AUTH':'"false"'},
 plugins:[{name:'deno-supabase',setup(build){build.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:`npm:@supabase/supabase-js@${pkg.version}`,external:true}));}}],
});
await writeFile('supabase/functions/manhunt-api/deno.json',JSON.stringify({compilerOptions:{lib:['deno.window','dom','dom.iterable','esnext']}},null,2)+'\n');
console.log('Edge production bundle built; test authentication compiled out.');
