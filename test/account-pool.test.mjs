import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountPool } from '../account-pool.mjs';
const signal = () => new AbortController().signal;
function setup(send, now=()=>0) { return new AccountPool({ candidates:async()=>['a','b','c'].map(uid=>({uid,resolve:async()=>({uid})})), send, now }); }
test('credit exhaustion retries unchanged request and remembers next account',async()=>{
const calls=[],body={model:'m',messages:[{role:'user',content:'x'}]};
const p=setup(async(c,b)=>{calls.push(c.uid);assert.equal(b,body);return c.uid==='a'?{ok:false,kind:'hard_credit'}:{ok:true};});
assert.equal((await p.chat(body,signal())).ok,true);
assert.equal((await p.chat(body,signal())).ok,true);assert.deepEqual(calls,['a','b','b']);
});
test('rate, auth, server and client failures do not rotate',async()=>{
for(const kind of ['soft_rate','session_dead','server','client']){let calls=0;const p=setup(async()=>{calls++;return {ok:false,kind};});await p.chat({},signal());assert.equal(calls,1);}
});
test('all exhausted terminates, cooldown suppresses requests then expires',async()=>{
let now=0,calls=0;const p=setup(async()=>{calls++;return {ok:false,kind:'hard_credit'};},()=>now);
await p.chat({},signal());assert.equal(calls,3);assert.equal((await p.chat({},signal())).kind,'hard_credit');assert.equal(calls,3);
now=900001;await p.chat({},signal());assert.equal(calls,6);
});
test('successful stream is returned intact; no replay after a stream failure',async()=>{
let calls=0;const response={body:new ReadableStream({start(c){c.error(Error('mid-stream'));}})};
const p=setup(async()=>{calls++;return {ok:true,response};});const r=await p.chat({},signal());assert.equal(r.response,response);
await assert.rejects(response.body.getReader().read());assert.equal(calls,1);
});
test('cancelled request never sends',async()=>{let calls=0;const p=setup(async()=>{calls++;});const c=new AbortController();c.abort();await assert.rejects(p.chat({},c.signal));assert.equal(calls,0);});
test('changed desktop identity is skipped and duplicate identities are tried once',async()=>{
const calls=[];const p=new AccountPool({candidates:async()=>[{uid:'a',resolve:async()=>({uid:'other'})},{uid:'b',resolve:async()=>({uid:'b'})},{uid:'b',resolve:async()=>({uid:'b'})}],send:async c=>{calls.push(c.uid);return {ok:false,kind:'hard_credit'};}});await p.chat({},signal());assert.deepEqual(calls,['b']);
});

test('null credentials are skipped', async () => {
 const p = new AccountPool({ candidates: async () => [{uid:'a',resolve:async()=>null},{uid:'b',resolve:async()=>({uid:'b'})}], send:async()=>({ok:true}) });
 assert.equal((await p.credential()).uid,'b'); assert.equal((await p.chat({},signal())).ok,true);
});
test('cancellation during credential resolution never sends upstream', async () => {
 const controller=new AbortController();let calls=0;
 const p=new AccountPool({candidates:async()=>[{uid:'a',resolve:async()=>{controller.abort();return {uid:'a'};}}],send:async()=>{calls++;return {ok:true};}});
 await assert.rejects(p.chat({},controller.signal)); assert.equal(calls,0);
});
