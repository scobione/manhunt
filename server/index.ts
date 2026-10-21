import 'dotenv/config';
import { createBackend } from './app.js';

const port=Number(process.env.PORT??3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid TCP port.');
if(process.env.NODE_ENV==='production'&&process.env.TEST_AUTH==='true')throw new Error('Test authentication cannot be enabled in production.');
const backend=await createBackend();
backend.httpServer.listen(port,'0.0.0.0',()=>console.log(`MANHUNT API listening on port ${port}`));
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{if(stopping)return;stopping=true;const timeout=setTimeout(()=>process.exit(1),10_000);timeout.unref();void backend.close().then(()=>process.exit(0),()=>process.exit(1));});
