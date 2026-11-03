const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup({denied=false}={}){
 const elements=new Map(),recorders=[],utterances=[],calls=[];let interval,now=1000,loud=true,stopped=0;
 function el(){return {value:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},append(){},before(){},replaceChildren(){},remove(){},focus(){},scrollIntoView(){},setAttribute(k,v){this[k]=v},addEventListener(k,f){this[k]=f},querySelectorAll(){return []},getBoundingClientRect(){return {width:0,height:0}}}}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)};get('stage-voice').lastElementChild=el();
 class Recorder{static isTypeSupported(){return true}constructor(){recorders.push(this);this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded voice '.repeat(30)])});this.onstop()}}
 class AudioContext{async resume(){}async close(){}createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {fftSize:1024,getFloatTimeDomainData(a){a.fill(loud?.1:0)}}}}
 const document={getElementById:get,body:el(),documentElement:el(),createElement:el,querySelector:()=>get('actions'),querySelectorAll:()=>[]};
 const synth={cancel(){},getVoices(){return []},speak(u){utterances.push(u);u.onstart?.()}};
 const context={document,console,Response,Request,FormData,Blob,URL,AbortController,TypeError,Float32Array,innerHeight:800,performance:{now:()=>now},addEventListener(){},navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return {getTracks:()=>[{stop(){stopped++}}]}}}},AudioContext,MediaRecorder:Recorder,localStorage:{getItem(){return null},setItem(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:synth,setInterval(f){interval=f;return 1},clearInterval(){interval=null},setTimeout,clearTimeout,requestAnimationFrame(){},matchMedia:()=>({matches:false}),fetch:async(url,opts)=>{calls.push({url,opts});return Response.json(url==='/api/status'?{ok:true,ai_configured:true}:url==='/api/transcribe'?{text:'Сколько будет два плюс два?'}:{answer:'Ответ **готов**. $$x=2$$'})}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('web/app.js','utf8'),context);
 return {context,get,recorders,utterances,calls,endSpeech(){interval();loud=false;now+=2000;interval()},get stopped(){return stopped}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('recorded speech is transcribed server-side, answered and listened for again',async()=>{
 const a=setup();await settle();vm.runInContext('talk.onclick()',a.context);await settle();assert.equal(a.recorders.length,1);
 a.endSpeech();await settle();await settle();
 assert.ok(a.calls.find(c=>c.url==='/api/transcribe'));const chat=a.calls.find(c=>c.url==='/api/chat');assert.equal(JSON.parse(chat.opts.body).message,'Сколько будет два плюс два?');
 assert.equal(a.utterances.length,1);assert.equal(a.utterances[0].text.includes('$$'),false);assert.equal(a.utterances[0].text.includes('**'),false);
 a.utterances[0].onend();await settle();assert.equal(a.recorders.length,2);vm.runInContext('stopVoiceSession()',a.context);assert.equal(vm.runInContext('voiceSession',a.context),false);assert.ok(a.stopped>=2);
});
test('microphone denial ends session with a readable message',async()=>{
 const a=setup({denied:true});await settle();vm.runInContext('talk.onclick()',a.context);await settle();assert.equal(vm.runInContext('voiceSession',a.context),false);assert.match(a.get('status').textContent,/Разрешите доступ к микрофону/);
});
test('stopped recording cannot send a stale transcript to chat',async()=>{
 const a=setup();await settle();vm.runInContext('talk.onclick()',a.context);await settle();vm.runInContext('stopVoiceSession()',a.context);await settle();assert.equal(a.calls.some(c=>c.url==='/api/chat'),false);
});
test('configured task sends its prompt once and stores a concise user message',async()=>{
 const a=setup();await settle();a.context.TalgatCommand=()=>{throw new Error('A prepared task must not be expanded again')};
 await vm.runInContext('send({prompt:"/lesson-plan — full configured task\\n6 класс, 20 минут",display:"/lesson-plan Дроби · 20 минут"})',a.context);
 const chat=a.calls.find(c=>c.url==='/api/chat');assert.equal(JSON.parse(chat.opts.body).message,'/lesson-plan — full configured task\n6 класс, 20 минут');assert.equal(vm.runInContext('history[0].content',a.context),'/lesson-plan Дроби · 20 минут');
});
