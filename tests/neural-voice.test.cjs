const test=require('node:test'),assert=require('node:assert/strict');const {NeuralVoice,chunks}=require('../web/neural-voice.js');
const settle=()=>new Promise(r=>setImmediate(r));
function setup(fetch){const players=[],states=[],errors=[],revoked=[];let ended=0;class Audio{constructor(url){this.src=url;players.push(this)}play(){this.onplaying?.();return Promise.resolve()}pause(){this.paused=true}}const voice=new NeuralVoice({fetch,Audio,createURL:()=>`blob:${players.length}`,revokeURL:u=>revoked.push(u),onState:s=>states.push(s),onError:e=>errors.push(e.message),onEnd:()=>ended++});return {voice,players,states,errors,revoked,get ended(){return ended}}}
test('neural audio plays in order, releases blobs and resumes conversation only at the end',async()=>{
 const calls=[],a=setup(async(url,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true,blob:async()=>new Blob(['mp3-data'])}});const running=a.voice.speak('Первое предложение. '.repeat(80),'ru',1);await settle();assert.equal(a.players.length,1);assert.equal(a.ended,0);a.players[0].onended();await settle();assert.equal(a.players.length,2);a.players[1].onended();await running;assert.equal(a.ended,1);assert.ok(calls.every(c=>c.language==='ru'&&c.text.length<=1000));assert.equal(a.errors.length,0);assert.equal(a.revoked.length,2);
});
test('Stop prevents stale fetched speech from playing',async()=>{
 let release;const a=setup(()=>new Promise(r=>release=r));const running=a.voice.speak('Я на связи.','ru',1);a.voice.stop();release(new Response(new Blob(['late audio'])));await running;assert.equal(a.players.length,0);assert.equal(a.ended,0);
});
test('missing server voice reports an error and never substitutes device speech',async()=>{
 const a=setup(async()=>Response.json({error:'Голос не подключён'},{status:503}));await a.voice.speak('Тест','ru',1);assert.deepEqual(a.errors,['Голос не подключён']);assert.equal(a.players.length,0);assert.equal(a.ended,0);
});
test('chunking preserves every word within endpoint limits',()=>{const source=('длинная реплика '.repeat(400)).trim(),result=chunks(source);assert.ok(result.length>1&&result.every(x=>x.length<=1000));assert.equal(result.join(' '),source)});
test('hung neural requests time out with a readable error',async()=>{
 const a=setup((url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))));a.voice.deps.timeoutMs=10;await a.voice.speak('Тест','ru',1);assert.match(a.errors[0],/время ожидания/);assert.equal(a.ended,0);
});
test('HTML masquerading as a successful audio response is rejected',async()=>{
 const a=setup(async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}}));await a.voice.speak('Тест','ru',1);assert.match(a.errors[0],/формат звука/);assert.equal(a.players.length,0);
});
test('sentence mode starts with the first sentence and prefetches only one chunk ahead',async()=>{
 const calls=[];let prefetchAborted=false;
 const a=setup(async(url,opts)=>{calls.push(JSON.parse(opts.body));if(calls.length===1)return {ok:true,blob:async()=>new Blob(['audio'],{type:'audio/wav'})};return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>{prefetchAborted=true;reject(Object.assign(new Error('stopped'),{name:'AbortError'}))}))});
 a.voice.deps.lowLatency=true;const running=a.voice.speak('Добрый день. Я вас слушаю. Чем помочь?','ru',1,'fish');await settle();assert.equal(calls[0].text,'Добрый день.');assert.equal(calls[0].provider,'fish');assert.equal(calls.length,2);assert.equal(a.players.length,1);a.voice.stop();await running;await settle();assert.equal(prefetchAborted,true);assert.equal(a.players.length,1);assert.equal(a.ended,0);
});
