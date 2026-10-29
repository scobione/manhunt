import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({resolve:{dedupe:['react','react-dom']},plugins:[react()],server:{port:5175,strictPort:true},preview:{port:4175,strictPort:true}});
