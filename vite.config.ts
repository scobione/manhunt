import { defineConfig, type Plugin } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static hosts need a real entrypoint for direct navigation and OAuth callbacks.
// Derive routes from the router so newly added pages cannot silently lose theirs.
function staticRouteEntrypoints():Plugin {
 return {name:'static-route-entrypoints',apply:'build',async writeBundle(options,bundle){
  const index=bundle['index.html'];
  if(!options.dir||index?.type!=='asset')throw new Error('Missing built HTML entrypoint');
  const router=await readFile(new URL('./src/App.tsx',import.meta.url),'utf8');
  const routes=[...router.matchAll(/<Route path="(\/[a-z/]+)"/g)].map(match=>match[1]);
  if(!routes.length)throw new Error('No static application routes found');
  for(const route of new Set(routes)){
   const directory=resolve(options.dir,route.slice(1));
   await mkdir(directory,{recursive:true});
   await writeFile(resolve(directory,'index.html'),index.source);
  }
 }};
}
const proxy={'/api':'http://127.0.0.1:3001','/socket.io':{target:'http://127.0.0.1:3001',ws:true}};
export default defineConfig(({mode})=>({
 plugins:[react(),tailwindcss(),staticRouteEntrypoints()],worker:{format:'es'},
 preview:{proxy:mode==='test'?proxy:{}},server:{host:'0.0.0.0',port:5173,proxy},
 build:{sourcemap:false,rollupOptions:{output:{manualChunks:{map:['maplibre-gl'],react:['react','react-dom','react-router-dom']}}}}
}));
