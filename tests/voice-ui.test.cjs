const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup({denied=false,instantSpeech=false,delayedStop=false,voiceStatus={},chatPromise=null}={}){
 const elements=new Map(),recorders=[],utterances=[],calls=[],pendingStops=[];let interval,now=1000,loud=.1,stopped=0;
 function el(){return {value:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},append(){},before(){},replaceChildren(){},remove(){},focus(){},scrollIntoView(){},setAttribute(k,v){this[k]=v},addEventListener(k,f){this[k]=f},querySelectorAll(){return []},getBoundingClientRect(){return {width:0,height:0}}}}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)};get('stage-voice').lastElementChild=el();
 class Recorder{static isTypeSupported(){return true}constructor(){recorders.push(this);this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded voice '.repeat(30)])});if(delayedStop)pendingStops.push(()=>this.onstop());else this.onstop()}}
 class AudioContext{async resume(){}async close(){}createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {fftSize:1024,getFloatTimeDomainData(a){a.fill(loud)}}}}
 const document={getElementById:get,body:el(),documentElement:el(),createElement:el,querySelector:()=>get('actions'),querySelectorAll:()=>[]};
 const synth={cancel(){},getVoices(){return []},speak(u){utterances.push(u);u.onstart?.();if(instantSpeech)u.onend?.()}};
 const context={document,console,Response,Request,FormData,Blob,URL,AbortController,TypeError,Float32Array,innerHeight:800,performance:{now:()=>now},addEventListener(){},navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return {getTracks:()=>[{stop(){stopped++}}]}}}},AudioContext,MediaRecorder:Recorder,localStorage:{getItem(){return null},setItem(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:synth,setInterval(f){interval=f;return 1},clearInterval(){interval=null},setTimeout,clearTimeout,requestAnimationFrame(){},matchMedia:()=>({matches:false}),fetch:async(url,opts)=>{calls.push({url,opts});if(url==='/api/chat'&&chatPromise)return chatPromise;return Response.json(url==='/api/status'?{ok:true,ai_configured:true}:url==='/api/speech'?voiceStatus:url==='/api/transcribe'?{text:'Сколько будет два плюс два?'}:{answer:'Ответ **готов**. $$x=2$$'})}};
 context.TalgatAccount={id:"test-user"};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('web/app.js','utf8'),context);
 return {context,get,recorders,utterances,calls,flushStops(){while(pendingStops.length)pendingStops.shift()()},tick(level,elapsed=80){loud=level;now+=elapsed;interval?.()},endSpeech(){interval();loud=0;now+=4500;interval()},get stopped(){return stopped}};
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
test('canceled speech callbacks cannot end a replacement conversation',async()=>{
 const a=setup();await settle();vm.runInContext('voice=true;say("Первый ответ")',a.context);const old=a.utterances[0];vm.runInContext('say("Второй ответ");voiceSession=true',a.context);
 old.onerror({error:'canceled'});old.onend();assert.equal(vm.runInContext('voiceSession',a.context),true);assert.equal(vm.runInContext('outputActive',a.context),true);assert.equal(a.recorders.length,0);vm.runInContext('stopVoiceSession()',a.context);
});
test('manual dictation cancels assistant playback before microphone starts',async()=>{
 const a=setup();await settle();vm.runInContext('voice=true;say("Говорю");captureVoice(true)',a.context);await settle();assert.equal(vm.runInContext('outputActive',a.context),false);assert.equal(a.recorders.length,1);a.utterances[0].onend();assert.equal(a.recorders.length,1);vm.runInContext('stopVoiceSession()',a.context);
});
test('instant speech completion resumes microphone after request busy state clears',async()=>{
 const a=setup({instantSpeech:true});await settle();vm.runInContext('voiceSession=true;voice=true',a.context);a.get('question').value='Привет';await vm.runInContext('send()',a.context);await settle();assert.equal(a.recorders.length,1);assert.equal(vm.runInContext('busy',a.context),false);vm.runInContext('stopVoiceSession()',a.context);
});
test('invalid persisted preferences are normalized before use',async()=>{
 const a=setup();await settle();vm.runInContext('prefs={font:999,rate:-2,memory:42,language:"bad",engine:"bad",motion:"bad"};applyPrefs()',a.context);assert.equal(vm.runInContext('prefs.font',a.context),20);assert.equal(vm.runInContext('prefs.rate',a.context),.7);assert.equal(vm.runInContext('prefs.language',a.context),'ru');assert.equal(vm.runInContext('prefs.memory',a.context),'');
});
test('numeric math is rendered while currency ranges remain unchanged',async()=>{
 const a=setup();await settle();const seen=[];a.context.katex={renderToString(value){seen.push(value);return '<span>math</span>'}};
 const result=vm.runInContext('safeMath("$1$ и $3/4$, бюджет $2,000–$5,000")',a.context);assert.deepEqual(seen,['1','3/4']);assert.ok(result.protectedText.includes('$2,000–$5,000'));
});
test('delayed stop from an old recorder cannot erase the new recording session',async()=>{
 const a=setup({delayedStop:true});await settle();vm.runInContext('talk.onclick()',a.context);await settle();vm.runInContext('stopVoiceSession();talk.onclick()',a.context);await settle();assert.equal(a.recorders.length,2);a.flushStops();assert.equal(vm.runInContext('recognition!==null && voiceSession',a.context),true);assert.equal(a.calls.some(c=>c.url==='/api/chat'),false);vm.runInContext('stopVoiceSession()',a.context);a.flushStops();
});

test('the approved HeyGen voice becomes default once and later voice selections persist',async()=>{
 const a=setup({voiceStatus:{providers:{heygen:{configured:true}}}});await settle();
 assert.equal(vm.runInContext('prefs.engine',a.context),'heygen');assert.equal(vm.runInContext('prefs.rate',a.context),1);assert.equal(vm.runInContext('cloudVoice() && voiceReady()',a.context),true);
 vm.runInContext('prefs.engine="device";applyPrefs()',a.context);await vm.runInContext('checkNeural()',a.context);assert.equal(vm.runInContext('prefs.engine',a.context),'device');
});
test('an unconfigured HeyGen voice cannot silently become device playback',async()=>{
 const a=setup();await settle();vm.runInContext('prefs.engine="heygen";voice=true;say("Привет")',a.context);assert.equal(a.utterances.length,0);assert.match(a.get('status').textContent,/не подключён/);
});


test('quiet speech and a thinking pause do not end the turn early',async()=>{
 const a=setup();await settle();vm.runInContext('talk.onclick()',a.context);await settle();
 a.tick(.009);a.tick(0,1800);assert.equal(a.recorders[0].state,'recording');assert.equal(a.calls.some(c=>c.url==='/api/transcribe'),false);
 a.tick(.009,80);a.tick(0,4200);await settle();await settle();assert.ok(a.calls.some(c=>c.url==='/api/chat'));vm.runInContext('stopVoiceSession()',a.context);
});
test('manual finish mode never sends during long pauses and finishes on request',async()=>{
 const a=setup();await settle();vm.runInContext('prefs.listenPause=0;talk.onclick()',a.context);await settle();a.tick(.02);a.tick(0,12000);
 assert.equal(a.recorders[0].state,'recording');assert.equal(a.calls.some(c=>c.url==='/api/chat'),false);a.get('speech-finish').onclick();await settle();await settle();assert.ok(a.calls.some(c=>c.url==='/api/chat'));vm.runInContext('stopVoiceSession()',a.context);
});
test('speech continues past 25 seconds; the two-minute limit never auto-answers a cut sentence',async()=>{
 const a=setup();await settle();vm.runInContext('talk.onclick()',a.context);await settle();a.tick(.02,26000);assert.equal(a.recorders[0].state,'recording');
 a.tick(.02,95000);await settle();await settle();assert.ok(a.calls.some(c=>c.url==='/api/transcribe'));assert.equal(a.calls.some(c=>c.url==='/api/chat'),false);assert.equal(vm.runInContext('voiceSession',a.context),false);assert.match(a.get('question').value,/Сколько/);assert.match(a.get('status').textContent,/2 минуты/);
});

test('reasoning quality is normalized, persisted in controls and forwarded with the task',async()=>{
 const a=setup();await settle();vm.runInContext('prefs.reasoningQuality="invalid";applyPrefs()',a.context);assert.equal(a.get('reasoning-quality').value,'quick');
 a.get('question').value='Сравни варианты';await vm.runInContext('send()',a.context);assert.equal(JSON.parse(a.calls.find(c=>c.url==='/api/chat').opts.body).reasoningQuality,'quick');assert.match(a.get('status').textContent,/Ответ готов/);
});
test('late answer from a previous account cannot appear in the next user conversation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const a=setup({chatPromise:pending});await settle();a.get('question').value='Секрет первого пользователя';const sending=vm.runInContext('send()',a.context);await settle();a.context.TalgatAccount={id:'second-user'};vm.runInContext('TalgatSwitchAccount("second-user")',a.context);resolve(Response.json({answer:'Старый секретный ответ'}));await sending;assert.equal(vm.runInContext('history.length',a.context),0);assert.equal(a.get('question').value,'');assert.equal(vm.runInContext('busy',a.context),false);
});
test('quiet speech is heard and a thinking pause is not cut short',async()=>{
 const a=setup();await settle();vm.runInContext('talk.onclick()',a.context);await settle();a.tick(.005);a.tick(0,2500);assert.equal(a.recorders[0].state,'recording');assert.equal(a.calls.some(c=>c.url==='/api/chat'),false);a.tick(.005);a.tick(0,4200);await settle();await settle();assert.ok(a.calls.some(c=>c.url==='/api/chat'));vm.runInContext('stopVoiceSession()',a.context);
});
test('the optional two-second pause starts a reply faster, while manual mode remains available',async()=>{
 const a=setup();await settle();vm.runInContext('prefs.listenPause=2;applyPrefs();talk.onclick()',a.context);await settle();a.tick(.02);a.tick(0,2150);await settle();await settle();assert.ok(a.calls.some(c=>c.url==='/api/chat'));vm.runInContext('stopVoiceSession()',a.context);
});
test('instant voice playback resumes listening after transcription cleanup',async()=>{
 const a=setup({instantSpeech:true});await settle();vm.runInContext('talk.onclick()',a.context);await settle();a.endSpeech();await settle();await settle();assert.equal(a.recorders.length,2);vm.runInContext('stopVoiceSession()',a.context);
});
test('quick default can be explicitly changed back to deep mode',async()=>{
 const a=setup();await settle();assert.equal(vm.runInContext('prefs.reasoningQuality',a.context),'quick');vm.runInContext('prefs.reasoningQuality="deep";applyPrefs()',a.context);assert.equal(a.get('reasoning-quality').value,'deep');
});
test('a fresh authenticated account keeps the approved voice after provider setup resolves first',async()=>{
 const a=setup({voiceStatus:{providers:{heygen:{configured:true}}}});await settle();vm.runInContext('TalgatSwitchAccount("fresh-user")',a.context);assert.equal(vm.runInContext('prefs.engine',a.context),'heygen');assert.equal(vm.runInContext('prefs.heygenVoiceVersion',a.context),1);
});
test('personal dialog UI preserves previous chat and sends only the opened conversation context',async()=>{
 const a=setup();await settle();const data=new Map();a.context.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};a.context.TalgatDialogs=require('../web/dialogs.js');
 vm.runInContext('TalgatSwitchAccount("test-user")',a.context);a.get('question').value='Первый личный вопрос';await vm.runInContext('send()',a.context);const first=vm.runInContext('dialogStore.current()',a.context);
 a.get('newchat').onclick();assert.equal(vm.runInContext('history.length',a.context),0);assert.equal(vm.runInContext('dialogStore.list().length',a.context),2);a.get('question').value='Второй личный вопрос';await vm.runInContext('send()',a.context);const secondRequest=JSON.parse(a.calls.filter(c=>c.url==='/api/chat')[1].opts.body);assert.equal(secondRequest.history.length,0);
 a.context.selectedDialog=first;vm.runInContext('switchDialog(selectedDialog)',a.context);assert.equal(vm.runInContext('history[0].content',a.context),'Первый личный вопрос');
 a.context.TalgatAccount={id:'other-user'};vm.runInContext('TalgatSwitchAccount("other-user")',a.context);assert.equal(vm.runInContext('history.length',a.context),0);assert.equal(vm.runInContext('dialogStore.list().length',a.context),1);
});
