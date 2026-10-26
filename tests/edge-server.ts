// A local-only HTTP harness for browser regression tests. Production deploys
// server/edge-entry.ts instead; this file is never bundled or hosted.
import { createServer } from 'node:http';
import { createEdgeHandler } from '../server/edge-runtime';
import { MemoryRepository } from '../server/repository';
import { authenticate } from '../server/auth';
import { TestEdgeStore } from './edge-fixtures';
if(process.env.NODE_ENV!=='test'||process.env.TEST_AUTH!=='true')throw new Error('Isolated test environment required');
const repo=new MemoryRepository(),store=new TestEdgeStore();repo.checkpoints=store.lobbies;
const handler=createEdgeHandler({repository:repo,store,verify:token=>authenticate(token,null),origins:['http://127.0.0.1:5174'],pathLoader:async()=>[{longitude:13.405,latitude:52.52,pathId:'isolated-test-way',label:'AUTOMATED TEST PATH'},{longitude:13.408,latitude:52.52,pathId:'isolated-test-way2',label:'AUTOMATED TEST PATH 2'}]});
createServer(async(req,res)=>{
 try{
  store.clock=Date.now();const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const body=Buffer.concat(chunks);const response=await handler(new Request(`http://127.0.0.1:3002${req.url}`,{method:req.method,headers:req.headers as HeadersInit,...(body.length?{body}:{} )}));
  // Mirror the migration's social-change trigger in this in-memory harness.
  if(response.ok&&['POST','PATCH','DELETE'].includes(req.method||'')&&!req.url?.endsWith('/events'))store.socialRevision++;
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
}).listen(3002,'127.0.0.1');
