import {defineConfig} from '@playwright/test';
export default defineConfig({
 outputDir:'test-results-edge',testDir:'./tests',testMatch:['edge-browser.spec.ts','gps-privacy.spec.ts','gps-safety.spec.ts'],workers:1,timeout:60000,expect:{timeout:15000},reporter:'list',
 use:{baseURL:'http://127.0.0.1:5174',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})},screenshot:'only-on-failure'},
 webServer:[
  {command:'node --import tsx tests/edge-server.ts',url:'http://127.0.0.1:3002/api/health',reuseExistingServer:false,env:{NODE_ENV:'test',TEST_AUTH:'true'}},
  {command:'node node_modules/vite/bin/vite.js build --mode test --outDir .edge-test-dist && node node_modules/vite/bin/vite.js preview --mode test --outDir .edge-test-dist --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:90000,env:{VITE_TEST_AUTH:'true',VITE_API_URL:'http://127.0.0.1:3002',VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:''}},
 ],
});
