import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/transcribe.mjs';
const setup=()=>{globalThis.Netlify={env:{get:()=> 'server-test-secret'}}};
test('transcription rejects wrong methods and missing files',async()=>{
 setup();assert.equal((await handler(new Request('https://site/api/transcribe'))).status,405);
 const body=new FormData();assert.equal((await handler(new Request('https://site/api/transcribe',{method:'POST',body}))).status,400);
});
test('speech endpoint forwards audio with server key and returns text only',async()=>{
 setup();const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer server-test-secret');assert.equal(options.body.get('model'),'whisper-large-v3-turbo');assert.ok(options.body.get('file').size>100);return Response.json({text:'Привет, Талгат.'})};
 try{const body=new FormData();body.append('file',new Blob(['audio'.repeat(40)],{type:'audio/webm'}),'test.webm');const res=await handler(new Request('https://site/api/transcribe',{method:'POST',body}));const value=await res.json();assert.equal(res.status,200);assert.equal(value.text,'Привет, Талгат.');assert.ok(!JSON.stringify(value).includes('server-test-secret'))}finally{globalThis.fetch=original}
});
