const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const elements=new Map(),recognizers=[],utterances=[],calls=[];
 function el(){return {value:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},append(){},before(){},replaceChildren(){},remove(){},focus(){},scrollIntoView(){},setAttribute(k,v){this[k]=v},addEventListener(k,f){this[k]=f},querySelectorAll(){return []},getBoundingClientRect(){return {width:0,height:0}}}}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)};
 class Recognition{constructor(){recognizers.push(this)}start(){this.started=true}stop(){this.onend?.()}abort(){this.onend?.()}}
 const document={getElementById:get,body:el(),documentElement:el(),createElement:el,querySelector:()=>get('actions'),querySelectorAll:()=>[]};
 const synth={cancel(){},getVoices(){return []},speak(u){utterances.push(u);u.onstart?.()}};
 const context={document,console,Response,Request,AbortController,TypeError,localStorage:{getItem(){return null},setItem(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:synth,SpeechRecognition:Recognition,setTimeout,clearTimeout,requestAnimationFrame(){},matchMedia:()=>({matches:false}),fetch:async(url,opts)=>{calls.push({url,opts});return Response.json(url==='/api/status'?{ok:true,ai_configured:true}:{answer:'Ответ **готов**. $$x=2$$'})}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('web/app.js','utf8'),context);
 return {context,get,recognizers,utterances,calls};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('voice session sends recognized speech, speaks answer and listens again',async()=>{
 const app=setup();await settle();
 app.get('settings-open');
 // The user-created navigation button is retained through document.createElement.
 vm.runInContext('talk.onclick()',app.context);
 assert.equal(app.recognizers.length,1);assert.equal(app.recognizers[0].started,true);
 app.recognizers[0].onresult({results:[[{transcript:'Сколько будет два плюс два?'}]]});
 app.recognizers[0].onend();await settle();await settle();
 const chat=app.calls.find(c=>c.url==='/api/chat');assert.ok(chat);assert.equal(JSON.parse(chat.opts.body).message,'Сколько будет два плюс два?');
 assert.equal(app.utterances.length,1);assert.equal(app.utterances[0].text.includes('$$'),false);assert.equal(app.utterances[0].text.includes('**'),false);
 app.utterances[0].onend();assert.equal(app.recognizers.length,2);
 vm.runInContext('stopVoiceSession()',app.context);assert.equal(vm.runInContext('voiceSession',app.context),false);
});
test('microphone denial ends session and reports a readable error',async()=>{
 const app=setup();await settle();vm.runInContext('talk.onclick()',app.context);
 app.recognizers[0].onerror({error:'not-allowed'});
 assert.equal(vm.runInContext('voiceSession',app.context),false);assert.match(app.get('status').textContent,/Разрешите микрофон/);
});
