"use strict";
const $=id=>document.getElementById(id);
let busy=false,voice=false,controller=null,recognition=null;
const storageKey="talgat-ai-2-history";
let history=[];
try{const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))history=saved.filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string").slice(-20)}catch{}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(history.slice(-20)))}catch{}};
function safeMath(source){
  const tokens=[];
  const protectedText=source.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\]|\$(?!\s)[^$\n]+?\$)/g,m=>{
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
    const {protectedText,tokens}=safeMath(source);
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
    $("status").textContent=d.ai_configured?"● Сервер готов · "+(d.version||"2.0"):"● Сервер доступен, но API-ключ не настроен";
  }catch(e){$("status").textContent="● API недоступен: "+e.message}
}
check();
function say(source){
  if(!voice||!("speechSynthesis" in window))return;
  speechSynthesis.cancel();
  const text=source.replace(/[\`*_#~]/g," ").replace(/\[[^\]]+\]\([^)]+\)/g," ").slice(0,4000);
  const u=new SpeechSynthesisUtterance(text);
  u.lang="ru-RU";u.rate=0.96;
  const voices=speechSynthesis.getVoices();
  u.voice=voices.find(v=>v.lang.toLowerCase().startsWith("ru"))||null;
  speechSynthesis.speak(u);
}
async function send(){
  const question=$("question").value.trim();
  if(!question||busy)return;
  const previous=history.slice(-12);
  add("user",question);$("question").value="";
  busy=true;$("send").disabled=true;
  controller=new AbortController();
  const pending=add("assistant","Думаю…");
  const timeout=setTimeout(()=>controller?.abort(),35000);
  try{
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:question,history:previous}),signal:controller.signal});
    const d=await readJson(r);
    if(!r.ok)throw new Error(d.error||"HTTP "+r.status);
    if(typeof d.answer!=="string"||!d.answer.trim())throw new Error("Модель вернула пустой ответ");
    pending.remove();add("assistant",d.answer);
    history.push({role:"user",content:question},{role:"assistant",content:d.answer});save();say(d.answer);
  }catch(e){
    pending.remove();
    const detail=e.name==="AbortError"?"Превышено время ожидания или запрос остановлен.":e instanceof TypeError?"Не удалось подключиться к API. Проверьте интернет и публикацию /api/chat.":e.message;
    add("assistant","Ошибка: "+detail);
    $("question").value=question;
  }finally{clearTimeout(timeout);busy=false;controller=null;$("send").disabled=false}
}
$("send").addEventListener("click",send);
$("question").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}});
$("voice").addEventListener("click",()=>{
  if(!("speechSynthesis" in window)){alert("Озвучка недоступна в этом браузере");return}
  voice=!voice;$("voice").textContent=voice?"🔊 Голос: вкл.":"🔊 Голос: выкл.";
  if(!voice)speechSynthesis.cancel();
});
$("stop").addEventListener("click",()=>{controller?.abort();speechSynthesis?.cancel?.();recognition?.stop?.()});
const actions=document.querySelector(".buttons");
const clear=document.createElement("button");clear.className="secondary";clear.textContent="Очистить историю";
clear.onclick=()=>{history=[];save();$("chat").replaceChildren();add("assistant","История этого устройства очищена.")};
actions.append(clear);
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SpeechRecognition){
  const mic=document.createElement("button");mic.className="secondary";mic.textContent="🎙️ Диктовка";
  mic.title="Распознавание зависит от браузера и может требовать интернет";
  mic.onclick=()=>{
    if(recognition){recognition.stop();return}
    recognition=new SpeechRecognition();recognition.lang="ru-RU";recognition.interimResults=false;
    recognition.onresult=e=>{$("question").value=(e.results[0]?.[0]?.transcript||"").trim()};
    recognition.onerror=e=>{$("status").textContent="● Ошибка распознавания: "+e.error};
    recognition.onend=()=>{recognition=null;mic.textContent="🎙️ Диктовка"};
    mic.textContent="⏹ Остановить диктовку";
    try{recognition.start()}catch{recognition=null;mic.textContent="🎙️ Диктовка"}
  };
  actions.append(mic);
}
