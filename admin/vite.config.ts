import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {resolve} from 'node:path';
export default defineConfig({resolve:{dedupe:['react','react-dom','react-router-dom','react-router']},plugins:[react(),tailwind()],worker:{format:'es'},build:{rollupOptions:{input:{admin:resolve('index.html'),simulation:resolve('simulation.html')}}},server:{port:5175,strictPort:true},preview:{port:4175,strictPort:true}});
