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
test('Russian is explicit and foreign-script or uncertain transcripts are not sent to chat',async()=>{
 setup();const original=globalThis.fetch;
 try{
  for(const transcript of [{text:'Svo setningin pin er blanda af islensku og russnesku',segments:[]},{text:'Тишина',segments:[{no_speech_prob:0.95,avg_logprob:-2}]}]){
   globalThis.fetch=async(url,options)=>{assert.equal(options.body.get('language'),'ru');assert.equal(options.body.get('response_format'),'verbose_json');return Response.json(transcript)};
   const body=new FormData();body.append('file',new Blob(['audio'.repeat(40)]),'voice.webm');const r=await handler(new Request('https://site/api/transcribe',{method:'POST',body}));assert.equal(r.status,422);assert.equal((await r.json()).code,'uncertain_transcript');
  }
 }finally{globalThis.fetch=original}
});
test('selected recognition language is forwarded',async()=>{
 setup();const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(options.body.get('language'),'kk');return Response.json({text:'Сәлем, Талғат.'})};
 try{const body=new FormData();body.append('language','kk');body.append('file',new Blob(['audio'.repeat(40)]),'voice.webm');const r=await handler(new Request('https://site/api/transcribe',{method:'POST',body}));assert.equal((await r.json()).language,'kk')}finally{globalThis.fetch=original}
});
