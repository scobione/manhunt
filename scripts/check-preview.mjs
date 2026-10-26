// Read the temporary, deployment-scoped share link through hidden stdin only.
// No test identities, mocked APIs, simulated GPS, or saved authentication traces.
import {chromium} from '@playwright/test';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}
const {url,share,accessUrl}=JSON.parse(input);const origin=new URL(url).origin;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const first=new URL(origin);if(share)first.searchParams.set('x-vercel-protection-bypass',share);if(share)first.searchParams.set('x-vercel-set-bypass-cookie','true');
 const response=await page.goto(accessUrl||first.href);console.log(JSON.stringify({navigationStatus:response.status(),title:await page.title(),origin:new URL(page.url()).origin,cookies:(await context.cookies()).map(c=>c.name)}));await page.getByRole('heading',{name:'Raus aus dem Alltag.',exact:true}).waitFor();
 await page.goto(origin+'/modes');await page.getByRole('button',{name:/XP-JAGD.*HINZUFÜGEN/}).click();await page.getByRole('button',{name:/ZOMBIE.*HINZUFÜGEN/}).click();
 const link=await page.getByRole('link',{name:'Mit dieser Kombination starten'}).getAttribute('href');if(!link?.includes('xpHunt')||!link.includes('zombie'))throw Error('Module selection missing');
 await page.goto(origin+'/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).waitFor();if(await page.getByRole('button',{name:/Google/}).count())throw Error('Google button remains');
 await page.goto(origin+'/join');await page.getByLabel('Dein Gastname').waitFor();
 await page.goto(origin+'/zone');await page.getByTestId('zone-map').waitFor();await page.getByTestId('zone-map').locator('canvas').click({position:{x:150,y:160}});await page.getByRole('button',{name:'Achteck',exact:true}).click();if(await page.locator('.mh-zone-handle').count()!==8)throw Error('Octagon missing');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow');
 await page.screenshot({path:'/tmp/manhunt-preview-check/mobile.png',fullPage:true});
 if(errors.length)throw Error(errors.join(';'));
 console.log(JSON.stringify({url:origin,status:'PASSED',checks:['mobile landing','combination picker','email login UI','no Google button','guest join UI','octagon editor','no horizontal overflow','no JS exception']}));
}catch(error){console.error(String(error).replaceAll(share||'NON_SECRET','[REDACTED]'));process.exitCode=1;}finally{await browser.close();}
