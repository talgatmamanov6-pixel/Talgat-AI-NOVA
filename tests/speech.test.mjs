import test from 'node:test';import assert from 'node:assert/strict';import speech from '../netlify/functions/speech.mjs';
const request=(method,body)=>new Request('https://site/api/speech',{method,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})});
test('voice status exposes only availability, not a key',async()=>{globalThis.Netlify={env:{get:()=>undefined}};assert.deepEqual(await (await speech(request('GET'))).json(),{configured:false,providers:{openai:{configured:false},fish:{configured:false,key_set:false,voice_set:false},heygen:{configured:false}}});assert.equal((await speech(request('POST',{text:'Тест'}))).status,503)});
test('voice uses protected server credentials and returns binary audio',async()=>{
 globalThis.Netlify={env:{get:name=>name==='TALGAT_TTS_API_KEY'?'server-secret':undefined}};const original=globalThis.fetch;globalThis.fetch=async(input,options)=>{const req=input instanceof Request?input:new Request(input,options);assert.equal(new URL(req.url).origin,'https://api.openai.com');assert.equal(req.headers.get('authorization'),'Bearer server-secret');const body=await req.json();assert.equal(body.voice,'cedar');assert.equal(body.input,'Привет, Талгат.');return new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}})};
 try{const r=await speech(request('POST',{text:'Привет, Талгат.',language:'ru'}));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.equal((await r.arrayBuffer()).byteLength,6);assert.equal((await speech(request('POST',{text:'x'.repeat(1201)}))).status,400)}finally{globalThis.fetch=original}
});
test('Fish adapter uses chosen voice and server key without exposing either in status',async()=>{
 const values={FISH_API_KEY:'fish-server-secret',FISH_VOICE_ID:'chosen-public-voice',FISH_MODEL:'s2.1-pro'};globalThis.Netlify={env:{get:name=>values[name]}};const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.fish.audio/v1/tts');assert.equal(opts.headers.Authorization,'Bearer fish-server-secret');assert.equal(opts.headers.model,'s2.1-pro');const body=JSON.parse(opts.body);assert.equal(body.reference_id,'chosen-public-voice');assert.equal(body.latency,'balanced');assert.equal(body.text,'Привет, Талгат.');return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}})};
 try{const status=await (await speech(request('GET'))).json();assert.equal(status.providers.fish.configured,true);assert.equal(JSON.stringify(status).includes('fish-server-secret'),false);assert.equal(JSON.stringify(status).includes('chosen-public-voice'),false);const res=await speech(request('POST',{provider:'fish',text:'Привет, Талгат.'}));assert.equal(res.status,200);assert.equal((await res.arrayBuffer()).byteLength,4)}finally{globalThis.fetch=original}
});
test('Fish never falls back to another provider or an unknown model',async()=>{
 const values={TALGAT_TTS_API_KEY:'other-key'};globalThis.Netlify={env:{get:name=>values[name]}};const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No upstream request expected')};
 try{assert.equal((await speech(request('POST',{provider:'fish',text:'Тест'}))).status,503);assert.equal((await speech(request('POST',{provider:'unknown',text:'Тест'}))).status,400);Object.assign(values,{FISH_API_KEY:'key',FISH_VOICE_ID:'voice',FISH_MODEL:'typo'});assert.equal((await speech(request('POST',{provider:'fish',text:'Тест'}))).status,503)}finally{globalThis.fetch=original}
});

test('HeyGen uses the approved clone and never exposes server credentials or accepts a browser voice override',async()=>{
 const values={HEYGEN_API_KEY:'private-key'};globalThis.Netlify={env:{get:name=>values[name]}};const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.heygen.com/v3/models/audio/tts/stream');assert.equal(opts.headers['X-Api-Key'],'private-key');assert.equal(opts.redirect,'error');const body=JSON.parse(opts.body);assert.equal(body.voice_id,'2298ae4b21174051a80ab99dc6df6dcc');assert.equal(body.model,'heygen-voice-1-turbo-free');assert.equal(body.with_timestamps,false);assert.equal(body.output_format.encoding,'mp3');assert.equal(body.language,'ru');return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}})};
 try{const status=await (await speech(request('GET'))).json();assert.equal(status.providers.heygen.configured,true);assert.equal(status.configured,true);assert.equal(JSON.stringify(status).includes('private-key'),false);assert.equal(JSON.stringify(status).includes('2298ae'),false);const res=await speech(request('POST',{text:'Привет, Талгат.',voice_id:'not-authorized'}));assert.equal(res.status,200);assert.equal((await res.arrayBuffer()).byteLength,4);assert.equal(calls,1)}finally{globalThis.fetch=original}
});
test('HeyGen errors never trigger a retry, a paid model or another provider',async()=>{
 const values={HEYGEN_API_KEY:'private-key',TALGAT_TTS_API_KEY:'other-provider'};globalThis.Netlify={env:{get:name=>values[name]}};const original=globalThis.fetch;
 try{for(const code of [401,403,429,502]){let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'sensitive upstream details'},{status:code})};const res=await speech(request('POST',{provider:'heygen',text:'Тест'}));assert.equal(res.status,code===429?429:502);assert.equal(calls,1);assert.equal((await res.text()).includes('sensitive upstream'),false)}
  globalThis.fetch=()=>{throw new Error('Must not call upstream')};values.HEYGEN_VOICE_MODEL='unknown';assert.equal((await speech(request('POST',{provider:'heygen',text:'Тест'}))).status,503);delete values.HEYGEN_VOICE_MODEL;assert.equal((await speech(request('POST',{provider:'heygen',text:'Тест',language:'kk'}))).status,400)
 }finally{globalThis.fetch=original}
});
test('HeyGen rejects HTML and empty output before the player receives it',async()=>{
 globalThis.Netlify={env:{get:name=>name==='HEYGEN_API_KEY'?'private-key':undefined}};const original=globalThis.fetch;
 try{for(const [content,type] of [['<html>failure</html>','text/html'],['','audio/mpeg']]){globalThis.fetch=async()=>new Response(content,{headers:{'content-type':type}});assert.equal((await speech(request('POST',{provider:'heygen',text:'Тест'}))).status,502)}}finally{globalThis.fetch=original}
});

test('a null JSON body is rejected before provider access',async()=>{globalThis.Netlify={env:{get:name=>name==='HEYGEN_API_KEY'?'server-key':undefined}};assert.equal((await speech(new Request('https://site/api/speech',{method:'POST',body:'null',headers:{'content-type':'application/json'}}))).status,400)});
