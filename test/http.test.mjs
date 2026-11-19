import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
function localRequest(url, options={}) { return new Promise((resolve,reject)=>{
 const req=httpRequest(url,options,res=>{res.resume();res.once('end',()=>resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300}));});
 req.once('error',reject);req.end(options.body);
}); }
// A private loopback address avoids interfering with the running gateway.
test('HTTP boundary: authorization, origins and request validation', async () => {
 const temp=await mkdtemp(join(tmpdir(),'transapi-test-'));
 const addr='127.0.0.2';
 const probe=createServer();await new Promise((ok,bad)=>probe.once('error',bad).listen(3081,addr,ok));await new Promise(ok=>probe.close(ok));
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,WORKBUDDY_DATA_DIR:temp,WORKBUDDY_LISTEN_HOST:addr,WORKDADDY_ACCOUNTS_DIR:join(temp,'accounts'),WORKBUDDY_AUTH_FILE:join(temp,'missing.info')},stdio:'ignore'});
 const exited=once(server,'exit');
 try {
  let key;
  for(let i=0;i<100;i++){
   try { key=(await readFile(join(temp,'api-key'),'utf8')).trim();const r=await localRequest(`http://${addr}:3081/healthz`,{headers:{Host:'localhost',Authorization:`Bearer ${key}`}});if(r.ok)break; }
   catch {} await new Promise(ok=>setTimeout(ok,50));
  }
  assert.ok(key,'server generated a local key');
  const req=(path,options={})=>localRequest(`http://${addr}:3081${path}`,{...options,headers:{Host:'localhost',Authorization:`Bearer ${key}`,...options.headers}});
  assert.equal((await req('/healthz')).status,200);
  assert.equal((await req('/healthz',{headers:{Authorization:'Bearer invalid'}})).status,401);
  assert.equal((await req('/healthz',{headers:{Host:'untrusted.example'}})).status,403);
  assert.equal((await req('/healthz',{headers:{Origin:'not-a-url'}})).status,403);
  assert.equal((await req('/healthz',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await req('/v1/chat/completions',{method:'POST',body:'{}'})).status,415);
  assert.equal((await req('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await req('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
 } finally {server.kill('SIGTERM');await exited;await rm(temp,{recursive:true,force:true});}
});
