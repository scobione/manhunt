import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],worker:{format:'es'},preview:{proxy:{}},server:{host:'0.0.0.0',port:5173,proxy:{'/api':'http://127.0.0.1:3001','/socket.io':{target:'http://127.0.0.1:3001',ws:true}}},build:{sourcemap:false,rollupOptions:{output:{manualChunks:{map:['maplibre-gl'],react:['react','react-dom','react-router-dom']}}}}});
