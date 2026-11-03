"use strict";
const $=id=>document.getElementById(id);
let busy=false,voice=false,controller=null,recognition=null,voiceSession=false;
const speechError=code=>({"not-allowed":"Разрешите микрофон и звук в настройках браузера.","audio-capture":"Микрофон не найден.","network":"Проверьте интернет для распознавания речи.","service-not-allowed":"Голосовой сервис недоступен в этом браузере.","language-not-supported":"Русская речь не поддерживается голосовой системой устройства.","synthesis-unavailable":"На устройстве недоступен голос для озвучки."}[code]||"Голосовая функция недоступна. Попробуйте другой браузер.");
const storageKey="talgat-ai-2-history";
let history=[];
try{const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))history=saved.filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string").slice(-20)}catch{}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(history.slice(-20)))}catch{}};
function safeMath(source){
  const tokens=[];
  const protectedText=source.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?\$)/g,m=>{
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
    for(const link of el.querySelectorAll("a[href]")){link.target="_blank";link.rel="noopener noreferrer"}
  }catch{el.textContent=source}
}
function add(role,source){
  const el=document.createElement("article");
  el.className="bubble "+role;
  render(el,role,source);
  $("chat").append(el);
  document.body.classList.add("has-chat");
  if(role==="assistant"&&source!=="Думаю…"){const bar=document.createElement("div");bar.className="messageactions";const copy=document.createElement("button");copy.textContent="Копировать";copy.onclick=async()=>{try{await navigator.clipboard.writeText(source);copy.textContent="Скопировано"}catch{copy.textContent="Копирование недоступно"}};const read=document.createElement("button");read.textContent="Озвучить";read.onclick=()=>{voice=true;$("voice").textContent="◉ Голос: вкл.";say(source)};bar.append(copy,read);el.append(bar)}
  el.scrollIntoView({block:"end"});
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
    $("status").textContent=d.ai_configured?"● API доступен, ключ задан · "+(d.version||"2.0"):"● Сервер доступен, но API-ключ не настроен";
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
async function send(){
  const question=$("question").value.trim();
  if(!question||busy)return;
  const previous=history.slice(-12);
  add("user",question);$("question").value="";
  busy=true;document.body.dataset.state="thinking";$("send").disabled=true;
  controller=new AbortController();
  const pending=add("assistant","Думаю…");
  const timeout=setTimeout(()=>controller?.abort(),35000);
  try{
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:question,history:previous,preferences:prefs.memory||""}),signal:controller.signal});
    const d=await readJson(r);
    if(!r.ok)throw new Error(d.error||"HTTP "+r.status);
    if(typeof d.answer!=="string"||!d.answer.trim())throw new Error("Модель вернула пустой ответ");
    pending.remove();add("assistant",d.answer);
    history.push({role:"user",content:question},{role:"assistant",content:d.answer});save();say(d.answer);
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
  voice=!voice;$("voice").textContent=voice?"◉ Голос: вкл.":"◉ Голос: выкл.";
  $("voice").setAttribute("aria-pressed",String(voice));if(!voice){stopVoiceSession();speechSynthesis.cancel();document.body.dataset.state="idle"}
});
$("stop").addEventListener("click",()=>{stopVoiceSession();controller?.abort();window.window.speechSynthesis?.cancel?.();document.body.dataset.state="idle";recognition?.stop?.()});
const actions=document.querySelector(".buttons");
const clear=document.createElement("button");clear.className="secondary";clear.textContent="Очистить историю";
clear.onclick=()=>{if(busy)return;stopVoiceSession();history=[];save();$("chat").replaceChildren();document.body.classList.remove("has-chat");document.body.dataset.state="idle";window.speechSynthesis?.cancel?.();document.body.classList.remove("nav-open")};
$("newchat").onclick=clear.onclick;
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const talk=document.createElement("button");talk.className="navitem";talk.textContent="◉  Голосовой диалог";talk.id="voice-dialog";talk.setAttribute("aria-pressed","false");
$("settings-open").before(talk);
function stopVoiceSession(){voiceSession=false;talk.textContent="◉  Голосовой диалог";talk.setAttribute("aria-pressed","false");recognition?.abort?.();document.body.dataset.state="idle"}
function startListening(){
 if(!voiceSession||busy||recognition||!SpeechRecognition)return;
 recognition=new SpeechRecognition();recognition.lang="ru-RU";recognition.interimResults=false;recognition.continuous=false;
 let gotResult=false;
 document.body.dataset.state="listening";$("status").textContent="Слушаю вас…";
 recognition.onresult=e=>{const text=(e.results[0]?.[0]?.transcript||"").trim();if(text){gotResult=true;$("question").value=text;send()}};
 recognition.onerror=e=>{if(!["no-speech","aborted"].includes(e.error)){stopVoiceSession();$("status").textContent=speechError(e.error)}};
 recognition.onend=()=>{recognition=null;if(voiceSession&&!gotResult&&!busy)setTimeout(startListening,800)};
 try{recognition.start()}catch{recognition=null;stopVoiceSession();$("status").textContent="Не удалось запустить микрофон"}
}
talk.onclick=()=>{
 if(voiceSession){stopVoiceSession();window.speechSynthesis?.cancel?.();check();return}
 if(!SpeechRecognition){$("status").textContent="Распознавание речи не поддерживается браузером";return}
 if(!("speechSynthesis" in window)){ $("status").textContent="Озвучка не поддерживается браузером";return }
 voiceSession=true;voice=true;$("voice").textContent="◉ Голос: вкл.";$("voice").setAttribute("aria-pressed","true");talk.textContent="■  Завершить разговор";talk.setAttribute("aria-pressed","true");document.body.classList.remove("nav-open");startListening();
};
if(SpeechRecognition){
 const mic=document.createElement("button");mic.textContent="🎙 Диктовка";mic.title="Распознавание речи средствами браузера";
 mic.onclick=()=>{
  if(voiceSession){stopVoiceSession();return}
  if(recognition){recognition.stop();return}
  recognition=new SpeechRecognition();recognition.lang="ru-RU";recognition.interimResults=false;
  recognition.onresult=e=>{$("question").value=(e.results[0]?.[0]?.transcript||"").trim()};
  recognition.onerror=e=>{$("status").textContent=speechError(e.error)};
  recognition.onend=()=>{recognition=null;mic.textContent="🎙 Диктовка";document.body.dataset.state="idle"};
  mic.textContent="■ Слушаю";document.body.dataset.state="listening";try{recognition.start()}catch{recognition=null;mic.textContent="🎙 Диктовка"}
 };actions.append(mic);
}
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
// Fibonacci particles are rotated in 3D and projected on both canvases.
const dots=Array.from({length:500},(_,i)=>{const y=1-2*i/499,r=Math.sqrt(1-y*y),a=i*2.399963;return{x:Math.cos(a)*r,y,z:Math.sin(a)*r}});
let rotation=0,lastFrame=0;
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
function drawOrb(canvas,mini,time){
 if(!canvas)return;
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
 const dpr=Math.min(devicePixelRatio||1,2),w=box.width,h=box.height;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const state=document.body.dataset.state||"idle",active=state==="thinking"||state==="speaking";
 const pulse=active&&prefs.motion!=="off"&&!reduced.matches?1+Math.sin(time/200)*.035:1;
 const radius=Math.min(w,h)*.35*pulse,cx=w/2,cy=h/2;
 const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*1.4);glow.addColorStop(0,"#64ded51a");glow.addColorStop(.6,"#46b4bf15");glow.addColorStop(1,"#46b4bf00");ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
 const a=rotation,b=.32,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
 const project=p=>{const x=p.x*ca-p.z*sa,z=p.x*sa+p.z*ca,y=p.y*cb-z*sb,zz=p.y*sb+z*cb;return{x:cx+x*radius,y:cy+y*radius,z:zz}};
 ctx.lineWidth=.55;
 for(let ring=-2;ring<=2;ring++){
  const y=ring*.29,rr=Math.sqrt(1-y*y);ctx.beginPath();
  for(let j=0;j<=96;j++){const t=j/96*Math.PI*2,p=project({x:Math.cos(t)*rr,y,z:Math.sin(t)*rr});j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}
  ctx.strokeStyle="#71e4d529";ctx.stroke();
 }
 for(const p of dots.map(project).sort((a,b)=>a.z-b.z)){
  const depth=(p.z+1)/2;ctx.beginPath();ctx.arc(p.x,p.y,(mini?.5:.7)+depth*(mini?.5:1),0,Math.PI*2);ctx.fillStyle=`rgba(113,228,213,${.12+depth*.82})`;ctx.fill();
 }
 ctx.beginPath();ctx.ellipse(cx,cy,radius*1.23,radius*.27,-.32,0,Math.PI*2);ctx.strokeStyle="#71e4d52d";ctx.stroke();
 canvas.dataset.animation=prefs.motion==="off"||reduced.matches?"paused":"rotating";
 canvas.dataset.state=state;
}
function animateOrb(time){
 if(time-lastFrame>32){const delta=Math.min(70,time-lastFrame||32);lastFrame=time;if(prefs.motion!=="off"&&!reduced.matches)rotation+=delta*(document.body.dataset.state==="thinking"?.0012:.00022);
 drawOrb($("orb"),false,time);drawOrb($("orb-small"),true,time);
 $("orb-state").textContent=document.body.dataset.state==="thinking"?"ОБРАБАТЫВАЮ ВОПРОС":document.body.dataset.state==="speaking"?"ОЗВУЧИВАЮ ОТВЕТ":document.body.dataset.state==="listening"?"СЛУШАЮ ВАС":"ГОТОВ К ДИАЛОГУ";
 }requestAnimationFrame(animateOrb);
}
requestAnimationFrame(animateOrb);
