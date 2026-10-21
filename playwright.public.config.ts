import { defineConfig } from '@playwright/test';
// Against the actual production bundle, without any test identities or GPS samples.
export default defineConfig({
 testDir:'./tests',testMatch:'public.spec.ts',outputDir:'test-results-public',workers:1,timeout:45000,expect:{timeout:10000},reporter:[['list']],
 use:{baseURL:process.env.PUBLIC_URL||'http://127.0.0.1:4173',browserName:'chromium',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})},screenshot:'only-on-failure'},
 webServer:process.env.PUBLIC_URL?undefined:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}
});
