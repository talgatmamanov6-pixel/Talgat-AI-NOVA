"use strict";
const $=id=>document.getElementById(id);
let busy=false,voice=false,controller=null,recognition=null,voiceSession=false;
let workMode="chat",attachments=[],recordingToken=0,voiceController=null;
const speechError=code=>({"not-allowed":"Разрешите микрофон и звук в настройках браузера.","audio-capture":"Микрофон не найден.","network":"Проверьте интернет для распознавания речи.","service-not-allowed":"Голосовой сервис недоступен в этом браузере.","language-not-supported":"Русская речь не поддерживается голосовой системой устройства.","synthesis-unavailable":"На устройстве недоступен голос для озвучки."}[code]||"Голосовая функция недоступна. Попробуйте другой браузер.");
const storageKey="talgat-ai-2-history";
let history=[];
try{const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))history=saved.filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string").slice(-20)}catch{}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(history.slice(-20)))}catch{}};
function safeMath(source){
  const tokens=[];
  const protectedText=source.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?\$)/g,m=>{
    if(!m.startsWith("$$")&&/^\$\d/.test(m)&&!/[=^_\\]/.test(m))return m;
    const display=m.startsWith("$$")||m.startsWith("\\[");
    const latex=m.startsWith("$$")?m.slice(2,-2):m.startsWith("\\[")||m.startsWith("\\(")?m.slice(2,-2):m.slice(1,-1);
    let html;
    try{html=window.katex?katex.renderToString(latex,{displayMode:display,throwOnError:false,trust:false,output:"html"}):null}catch{}
    tokens.push(html||m.replace(/&/g,"&amp;").replace(/</g,"&lt;"));
    return "TALGATMATHPLACEHOLDER"+(tokens.length-1)+"END";
  });
  return {protectedText,tokens};
}
function render(el,role,source){
  if(role!=="assistant"||!window.marked||!window.DOMPurify){el.textContent=source;return}
  try{
    const codeBlocks=[];
    const codeProtected=source.replace(/```[\s\S]*?```|`[^`\n]+`/g,m=>{codeBlocks.push(m);return "TALGATCODEBLOCK"+(codeBlocks.length-1)+"END"});
    let {protectedText,tokens}=safeMath(codeProtected);
    protectedText=protectedText.replace(/TALGATCODEBLOCK(\d+)END/g,(_,n)=>codeBlocks[Number(n)]||"");
    let html=marked.parse(protectedText,{gfm:true,breaks:true});
    html=html.replace(/TALGATMATHPLACEHOLDER(\d+)END/g,(_,n)=>tokens[Number(n)]||"");
    el.innerHTML=DOMPurify.sanitize(html);
    addCodeDownloads(el);
    for(const link of el.querySelectorAll("a[href]")){link.target="_blank";link.rel="noopener noreferrer"}
  }catch{el.textContent=source}
}
function add(role,source){
  const el=document.createElement("article");
  el.className="bubble "+role;
  render(el,role,source);
  $("chat").append(el);
  document.body.classList.add("has-chat");
  if(role==="assistant"&&source!=="Думаю…"){const bar=document.createElement("div");bar.className="messageactions";const copy=document.createElement("button");copy.textContent="Копировать";copy.onclick=async()=>{try{await navigator.clipboard.writeText(source);copy.textContent="Скопировано"}catch{copy.textContent="Копирование недоступно"}};const read=document.createElement("button");read.textContent="Озвучить";read.onclick=()=>{voice=true;$("voice").textContent="◉ Озвучка: вкл.";say(source)};bar.append(copy,read);el.append(bar);window.TalgatWorkspace?.decorate(el,source)}
  $("chat").scrollTop=$("chat").scrollHeight;
  return el;
}
for(const m of history)add(m.role,m.content);
async function readJson(response){
  const raw=await response.text();
  try{return JSON.parse(raw)}catch{throw new Error("Сервер вернул HTML или другой текст вместо JSON (HTTP "+response.status+"). Проверьте развёртывание Netlify Functions и маршруты /api/*.")}
}
async function check(){
  try{
    const r=await fetch("/api/status",{cache:"no-store"});
    const d=await readJson(r);
    if(!r.ok||!d.ok)throw new Error(d.error||"HTTP "+r.status);
    $("status").textContent=d.ai_configured?"На связи · Talgat AI":"Сервер доступен · модель не настроена";
  }catch(e){$("status").textContent="● API недоступен: "+e.message}
}
check();
function say(source){
  if(!voice||!("speechSynthesis" in window))return;
  speechSynthesis.cancel();
  const text=source.replace(/```[\s\S]*?```/g," Фрагмент кода на экране. ").replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?\$/g," Формула на экране. ").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[`*_#~]/g," ").slice(0,4000);
  const u=new SpeechSynthesisUtterance(text);
  u.lang="ru-RU";u.rate=Number($("voice-rate").value)||0.95;
  u.onstart=()=>{document.body.dataset.state="speaking"};
  u.onend=()=>{document.body.dataset.state="idle";if(voiceSession)startListening()};
  u.onerror=e=>{document.body.dataset.state="idle";if(voiceSession)stopVoiceSession();if(!["interrupted","canceled"].includes(e.error))$("status").textContent=speechError(e.error)};
  const voices=speechSynthesis.getVoices();
  u.voice=voices.find(v=>v.lang.toLowerCase().startsWith("ru"))||null;
  speechSynthesis.speak(u);
}
async function send(prepared){
  let question=typeof prepared?.prompt==="string"?prepared.prompt:$("question").value.trim();
  const visibleQuestion=typeof prepared?.display==="string"?prepared.display:question;
  if(!question||busy)return;
  if(typeof prepared?.prompt!=="string")question=window.TalgatCommand?window.TalgatCommand(question):question;if(!question)return;
  const previous=history.slice(-12);
  add("user",visibleQuestion);$("question").value="";
  busy=true;document.body.dataset.state="thinking";$("send").disabled=true;
  controller=new AbortController();
  const pending=add("assistant","Думаю…");
  const timeout=setTimeout(()=>controller?.abort(),35000);
  try{
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:question,history:previous,preferences:prefs.memory||"",mode:workMode,materials:attachments.map(f=>"Файл: "+f.name+"\n"+f.text).join("\n\n")}),signal:controller.signal});
    const d=await readJson(r);
    if(!r.ok)throw new Error(d.error||"HTTP "+r.status);
    if(typeof d.answer!=="string"||!d.answer.trim())throw new Error("Модель вернула пустой ответ");
    pending.remove();add("assistant",d.answer);
    history.push({role:"user",content:visibleQuestion},{role:"assistant",content:d.answer});save();say(d.answer);
  }catch(e){
    pending.remove();
    const detail=e.name==="AbortError"?"Превышено время ожидания или запрос остановлен.":e instanceof TypeError?"Не удалось подключиться к API. Проверьте интернет и публикацию /api/chat.":e.message;
    add("assistant","Ошибка: "+detail);if(voiceSession)stopVoiceSession();
    $("question").value=question;
  }finally{clearTimeout(timeout);busy=false;if(document.body.dataset.state!=="speaking")document.body.dataset.state="idle";controller=null;$("send").disabled=false}
}
$("send").addEventListener("click",send);
$("question").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}});
$("voice").addEventListener("click",()=>{
  if(!("speechSynthesis" in window)){alert("Озвучка недоступна в этом браузере");return}
  voice=!voice;$("voice").textContent=voice?"◉ Озвучка: вкл.":"◉ Озвучка: выкл.";
  $("voice").setAttribute("aria-pressed",String(voice));if(!voice){stopVoiceSession();speechSynthesis.cancel();document.body.dataset.state="idle"}
});
$("stop").addEventListener("click",()=>{stopVoiceSession();controller?.abort();window.window.speechSynthesis?.cancel?.();document.body.dataset.state="idle";recognition?.stop?.()});
const actions=document.querySelector(".buttons");
const clear=document.createElement("button");clear.className="secondary";clear.textContent="Очистить историю";
clear.onclick=()=>{if(busy)return;stopVoiceSession();history=[];save();$("chat").replaceChildren();document.body.classList.remove("has-chat");document.body.dataset.state="idle";window.speechSynthesis?.cancel?.();document.body.classList.remove("nav-open")};
$("newchat").onclick=clear.onclick;
// Audio is recorded locally and transcribed by the protected server endpoint.
const talk=document.createElement("button");talk.className="navitem";talk.textContent="◉  Голосовой режим";talk.id="voice-dialog";talk.setAttribute("aria-pressed","false");$("settings-open").before(talk);
function stopVoiceSession(){
 voiceSession=false;recordingToken++;voiceController?.abort();voiceController=null;
 talk.textContent="◉  Голосовой режим";talk.setAttribute("aria-pressed","false");recognition?.abort?.();recognition=null;
 $("stage-voice").lastElementChild.textContent="Начать разговор";document.body.dataset.state="idle";document.documentElement.style.setProperty("--audiolevel","0");
}
function startListening(){if(voiceSession&&!busy&&!recognition)captureVoice(false)}
async function captureVoice(dictation){
 if(recognition||busy)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$("status").textContent="Запись микрофона не поддерживается. Откройте сайт в современном браузере.";stopVoiceSession();return}
 const token=++recordingToken;let stream,audioContext,recorder,watchdog,cancelled=false,spoken=false,settled=false;
 recognition={abort:()=>{cancelled=true;if(recorder?.state==="recording")recorder.stop();else stream?.getTracks().forEach(t=>t.stop())},stop:()=>{if(recorder?.state==="recording")recorder.stop()}};
 const cleanup=()=>{clearInterval(watchdog);stream?.getTracks().forEach(t=>t.stop());audioContext?.close().catch(()=>{});document.documentElement.style.setProperty("--audiolevel","0")};
 try{
  $("status").textContent="Разрешите доступ к микрофону…";stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(token!==recordingToken||cancelled){cleanup();return}
  const AudioContext=window.AudioContext||window.webkitAudioContext;audioContext=new AudioContext();await audioContext.resume();
  const analyser=audioContext.createAnalyser();analyser.fftSize=1024;audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples=new Float32Array(analyser.fftSize),types=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'],mime=types.find(t=>MediaRecorder.isTypeSupported(t));
  recorder=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:48000}:{});const chunks=[];const started=performance.now();let lastSpeech=started;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>{cancelled=true;cleanup();stopVoiceSession();$("status").textContent="Не удалось записать микрофон. Попробуйте ещё раз."};
  recorder.onstop=async()=>{
   if(settled)return;settled=true;cleanup();recognition=null;
   if(cancelled||token!==recordingToken)return;
   if(!spoken){$("status").textContent="Речь не обнаружена";if(voiceSession)setTimeout(startListening,700);return}
   const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(blob.size>4000000){stopVoiceSession();$("status").textContent="Слишком длинная запись. Говорите короткими репликами.";return}
   document.body.dataset.state="transcribing";$("status").textContent="Распознаю речь…";
   const form=new FormData();const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';form.append('file',blob,'voice.'+ext);
   voiceController=new AbortController();const deadline=setTimeout(()=>voiceController?.abort(),30000);
   try{
    const res=await fetch('/api/transcribe',{method:'POST',body:form,signal:voiceController.signal});const data=await readJson(res);
    if(token!==recordingToken)return;if(!res.ok)throw new Error(data.error||'Не удалось распознать речь');
    $("question").value=data.text;document.body.dataset.state="idle";
    if(dictation){$("status").textContent="Речь распознана. Можно отправить или отредактировать.";$("question").focus()}else{await send()}
   }catch(e){if(token===recordingToken){stopVoiceSession();$("status").textContent=e.name==='AbortError'?'Распознавание остановлено.':e.message}}finally{clearTimeout(deadline);voiceController=null}
  };
  recorder.start(250);document.body.dataset.state="listening";$("status").textContent=dictation?"Диктовка: говорите…":"Слушаю вас…";
  watchdog=setInterval(()=>{
   if(token!==recordingToken||cancelled){if(recorder.state==='recording')recorder.stop();return}
   analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length),now=performance.now();
   document.documentElement.style.setProperty('--audiolevel',String(Math.min(1,rms*12)));
   if(rms>.018){spoken=true;lastSpeech=now}
   if((spoken&&now-lastSpeech>1200&&now-started>1600)||now-started>25000||(!spoken&&now-started>8000)){if(recorder.state==='recording')recorder.stop()}
  },80);
 }catch(e){cleanup();recognition=null;if(token===recordingToken){stopVoiceSession();$("status").textContent=e.name==='NotAllowedError'?'Разрешите доступ к микрофону в настройках браузера.':e.name==='NotFoundError'?'Микрофон не найден.':'Не удалось включить запись микрофона.'}}
}
talk.onclick=()=>{
 if(voiceSession){stopVoiceSession();window.speechSynthesis?.cancel?.();check();return}
 if(!('speechSynthesis' in window)){$("status").textContent="Озвучка недоступна. Можно использовать диктовку.";return}
 voiceSession=true;voice=true;$("voice").textContent="◉ Озвучка: вкл.";$("voice").setAttribute('aria-pressed','true');talk.textContent="■  Завершить разговор";talk.setAttribute('aria-pressed','true');
 $("stage-voice").lastElementChild.textContent="Завершить разговор";document.body.classList.remove('nav-open');startListening();
};
$("stage-voice").onclick=()=>talk.onclick();
const mic=document.createElement('button');mic.textContent="🎙 Диктовка";mic.title="Запись и распознавание через Whisper";mic.onclick=()=>{if(recognition){recognition.stop();return}if(voiceSession)stopVoiceSession();captureVoice(true)};actions.append(mic);
function addCodeDownloads(el){
 for(const [index,code] of [...el.querySelectorAll('pre code')].entries()){
  const ext=({javascript:'js',typescript:'ts',python:'py',html:'html',css:'css',json:'json',bash:'sh',shell:'sh',sql:'sql',java:'java',cpp:'cpp',csharp:'cs',yaml:'yml'})[(code.className.match(/language-([a-z]+)/)||[])[1]]||'txt';
  const bar=document.createElement('div');bar.className='codeactions';const label=document.createElement('span');label.textContent='talgat-code-'+(index+1)+'.'+ext;
  const download=document.createElement('button');download.textContent='Скачать файл ↓';download.onclick=()=>{const form=document.createElement('form');form.method='POST';form.action='/api/export';form.style.display='none';for(const [name,value] of [['filename',label.textContent],['content',code.textContent]]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)}document.body.append(form);form.submit();setTimeout(()=>form.remove(),2000)};bar.append(label,download);code.parentElement.before(bar);
 }
}
function renderAttachments(){
 $("attachments").replaceChildren();for(const [i,file] of attachments.entries()){const chip=document.createElement('span');chip.className='file-chip';chip.textContent=file.name;const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Убрать '+file.name);remove.onclick=()=>{attachments.splice(i,1);renderAttachments()};chip.append(remove);$("attachments").append(chip)}
}
$("attach").onclick=()=>$("file-input").click();
$("file-input").onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 if(!/\.(txt|md|json|csv|js|ts|py|html|css|xml|yaml|yml)$/i.test(file.name)||file.size>200000){$("status").textContent="Поддерживаются текстовые файлы до 200 КБ. PDF и изображения пока не подключены.";return}
 const text=await file.text();if(text.length>24000){$("status").textContent="Материал длиннее 24 000 символов. Выберите меньший фрагмент.";return}
 attachments=[{name:file.name,text}];renderAttachments();$("status").textContent="Материал будет отправлен вместе с вопросом";
};
for(const mode of ['chat','code'])$("mode-"+mode).onclick=()=>{workMode=mode;for(const m of ['chat','code']){$('mode-'+m).classList.toggle('selected',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode))}$('mode-title').textContent=mode==='code'?'Генерация и разбор кода':'Диалог с Talgat';$('question').placeholder=mode==='code'?'Опишите программу, файл или ошибку…':'Вопрос, задача или идея…'};
const fitViewport=()=>document.documentElement.style.setProperty('--appheight',(window.visualViewport?.height||innerHeight)+'px');window.visualViewport?.addEventListener('resize',fitViewport);window.addEventListener('resize',fitViewport);fitViewport();
// Local preferences never contain provider credentials.
const prefsKey="talgat-ui-preferences";
let prefs={theme:"dark",font:16,rate:0.95,motion:"on",memory:""};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(prefsKey)||"{}"))}catch{}
function applyPrefs(){
  document.body.classList.toggle("light",prefs.theme==="light");
  document.documentElement.style.setProperty("--size",Math.max(14,Math.min(20,Number(prefs.font)||16))+"px");
  $("theme").value=prefs.theme==="light"?"light":"dark";
  $("memory").value=typeof prefs.memory==="string"?prefs.memory:"";$("font-size").value=prefs.font;$("voice-rate").value=prefs.rate;$("motion").value=prefs.motion;
  try{localStorage.setItem(prefsKey,JSON.stringify(prefs))}catch{}
}
applyPrefs();
for(const [id,key] of [["theme","theme"],["font-size","font"],["voice-rate","rate"],["motion","motion"],["memory","memory"]])$(id).addEventListener("input",()=>{prefs[key]=$(id).value;applyPrefs()});
$("settings-open").onclick=()=>{$("settings").showModal();document.body.classList.remove("nav-open")};
$("settings-close").onclick=()=>$("settings").close();
$("settings").addEventListener("click",e=>{if(e.target===$("settings")){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$("menu").onclick=()=>document.body.classList.toggle("nav-open");
$("navchat").onclick=()=>document.body.classList.remove("nav-open");
for(const card of document.querySelectorAll("[data-prompt]"))card.onclick=()=>{$("question").value=card.dataset.prompt;$("question").focus()};
// A deforming 3D graph: irregular filaments, depth and travelling energy pulses.
let seed=72831;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const nodes=Array.from({length:390},()=>{const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);return{x:Math.cos(a)*r,y,z:Math.sin(a)*r,phase:random()*6.28}});
const edges=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(d<.29&&d>.045)edges.push([i,j,random()])}
let rotation=0,lastFrame=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function drawOrb(canvas,time){
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
 const ratio=Math.min(devicePixelRatio||1,2),w=box.width,h=box.height;if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio)}
 const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const moving=prefs.motion!=='off'&&!reduced.matches,state=document.body.dataset.state||'idle',active=['thinking','speaking','transcribing'].includes(state),t=moving?time/1000:0;
 const radius=Math.min(w,h)*.355,cx=w/2,cy=h/2,ca=Math.cos(rotation),sa=Math.sin(rotation),tilt=.18+Math.sin(t*.13)*.14,ct=Math.cos(tilt),st=Math.sin(tilt);
 const gradient=ctx.createRadialGradient(cx,cy,radius*.1,cx,cy,radius*1.4);gradient.addColorStop(0,'#5c8be508');gradient.addColorStop(.65,'#229bc716');gradient.addColorStop(1,'#124d8200');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 const points=nodes.map(p=>{const ripple=1+.06*Math.sin(p.phase+t*.7)+.035*Math.sin(p.y*8+t*(active?1.8:.5)),x=(p.x*ca-p.z*sa)*ripple,z=(p.x*sa+p.z*ca)*ripple,y=p.y*ripple*ct-z*st,depth=p.y*ripple*st+z*ct,perspective=1+depth*.12;return{x:cx+x*radius*perspective,y:cy+y*radius*perspective,z:depth}});
 ctx.globalCompositeOperation='lighter';
 for(const [i,j,phase] of edges){const a=points[i],b=points[j],depth=(a.z+b.z+2)/4,front=depth>.55;ctx.beginPath();ctx.moveTo(a.x,a.y);const bend=Math.sin(t*.5+phase*6)*3;ctx.quadraticCurveTo((a.x+b.x)/2+bend,(a.y+b.y)/2-bend,b.x,b.y);ctx.lineWidth=front?.65:.4;ctx.strokeStyle=phase>.78?`rgba(122,107,230,${.04+depth*.27})`:`rgba(90,218,240,${.03+depth*.35})`;ctx.stroke();
  if(moving&&phase>.95){const progress=(t*(active?.6:.19)+phase*3)%1,x=a.x+(b.x-a.x)*progress,y=a.y+(b.y-a.y)*progress;ctx.beginPath();ctx.arc(x,y,front?1.5:1,0,Math.PI*2);ctx.fillStyle='rgba(176,243,255,'+(.2+depth*.65)+')';ctx.shadowBlur=front?9:0;ctx.shadowColor='#6be9ff';ctx.fill();ctx.shadowBlur=0}
 }
 for(let i=0;i<points.length;i++){const p=points[i],depth=(p.z+1.15)/2.3;ctx.beginPath();ctx.arc(p.x,p.y,.35+depth*.8,0,Math.PI*2);ctx.fillStyle='rgba(159,231,255,'+(.08+depth*.65)+')';ctx.fill()}
 for(let k=0;k<3;k++){ctx.save();ctx.translate(cx,cy);ctx.rotate(.35+k*.65+t*.035*(k%2?1:-1));ctx.beginPath();ctx.ellipse(0,0,radius*(1.17+k*.045),radius*(.31+k*.055),0,0,Math.PI*(1.5+k*.1));ctx.lineWidth=.6;ctx.strokeStyle=k===1?'#9299e230':'#68d7ef25';ctx.stroke();ctx.restore()}
 ctx.globalCompositeOperation='source-over';canvas.dataset.animation=moving?'rotating':'paused';canvas.dataset.state=state;
}
function animateOrb(time){
 if(time-lastFrame>40){const delta=Math.min(80,time-lastFrame||40);lastFrame=time;if(prefs.motion!=='off'&&!reduced.matches)rotation+=delta*(document.body.dataset.state==='thinking'?.00035:.00011);drawOrb($('orb'),time);const state=document.body.dataset.state;$("orb-state").textContent=state==='thinking'?'ФОРМИРУЮ ОТВЕТ':state==='speaking'?'ОЗВУЧИВАЮ':state==='listening'?'СЛУШАЮ ВАС':state==='transcribing'?'РАСПОЗНАЮ РЕЧЬ':'ГОТОВ К РАБОТЕ'}requestAnimationFrame(animateOrb);
}
requestAnimationFrame(animateOrb);
