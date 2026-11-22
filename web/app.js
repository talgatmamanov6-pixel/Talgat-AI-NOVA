"use strict";
const $=id=>document.getElementById(id);
window.TalgatAccount=window.TalgatAccount||{id:null,owner:false};
let busy=false,voice=false,controller=null,recognition=null,voiceSession=false;
let workMode="chat",attachments=[],recordingToken=0,voiceController=null;
const speechError=code=>({"not-allowed":"Разрешите микрофон и звук в настройках браузера.","audio-capture":"Микрофон не найден.","network":"Проверьте интернет для распознавания речи.","service-not-allowed":"Голосовой сервис недоступен в этом браузере.","language-not-supported":"Русская речь не поддерживается голосовой системой устройства.","synthesis-unavailable":"На устройстве недоступен голос для озвучки."}[code]||"Голосовая функция недоступна. Попробуйте другой браузер.");
let storageKey="talgat-ai-2-history-guest",dialogStore=null,conversationEpoch=0,persistenceError=false;
let history=[];
const save=()=>{try{persistenceError=false;if(dialogStore){dialogStore.save(history);renderDialogList()}else localStorage.setItem(storageKey,JSON.stringify(history))}catch{persistenceError=true;$("status").textContent="Не удалось сохранить диалог: на устройстве не хватает места. Сохраните важный текст в файл."}};
function renderDialogList(){
 const list=$("dialog-list"),panel=$("dialogs-panel");if(!list)return;list.replaceChildren();if(panel)panel.hidden=!dialogStore;if(!dialogStore)return;
 for(const d of dialogStore.list()){
  const row=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');row.className='dialog-row';open.className='dialog-open';open.textContent=d.title;open.setAttribute('aria-pressed',String(d.id===dialogStore.current()));open.onclick=()=>switchDialog(d.id);remove.textContent='×';remove.setAttribute('aria-label','Удалить диалог '+d.title);remove.onclick=()=>{if(busy||!confirm('Удалить этот диалог с устройства?'))return;try{stopVoiceSession();conversationEpoch++;history=dialogStore.remove(d.id);paintConversation();renderDialogList()}catch(e){$("status").textContent=e.message}};row.append(open,remove);list.append(row);
 }
}
function paintConversation(){ $("chat").replaceChildren();document.body.classList.remove("has-chat");for(const m of history)add(m.role,m.content)}
function switchDialog(id){
 if(busy){$("status").textContent="Дождитесь ответа или нажмите «Стоп», затем откройте другой диалог.";return}
 if(!dialogStore){location.href='/account.html';return}stopVoiceSession();conversationEpoch++;fileVersion++;attachments=[];renderAttachments();$("file-input").value="";$("question").value='';try{if(id)history=dialogStore.open(id);else{dialogStore.create();history=dialogStore.messages()}paintConversation();renderDialogList();closeNavigation()}catch(e){$("status").textContent=e.message}
}
let voiceError='',lastSpokenSource='',deviceSpeechTimer=null,sharedAudioContext=null;
function voiceFeedback(phase,detail='',level=0){
 const panel=$("voice-feedback"),title=$("voice-phase"),note=$("voice-detail"),meter=$("voice-meter");
 if(!panel||!title)return;
 panel.dataset.phase=phase;const label=({idle:'Готов к разговору',permission:'Включаю микрофон',listening:'Слушаю вас',pause:'Пауза — скоро отвечу',transcribing:'Распознаю речь',thinking:'Готовлю ответ',preparing:'Готовлю голос',speaking:'Отвечаю',error:'Нужна ваша помощь',auth:'Войдите для разговора'})[phase]||phase;if(title.textContent!==label)title.textContent=label;
 if(note)note.textContent=detail;if(meter){meter.style.setProperty('--voice-level',String(Math.max(0,Math.min(1,level))));meter.setAttribute('aria-valuenow',String(Math.round(level*100)))}
 const login=$("voice-login");if(login)login.hidden=phase!=='auth';
}
function clearVoiceError(){voiceError='';const node=$("voice-error");if(node){node.textContent='';node.hidden=true}$("voice-retry").hidden=true;$("voice-audio-retry").hidden=true}
function voiceFailure(message,{account=false,audio=false}={}){
 voiceError=message;$("status").textContent=message;const node=$("voice-error");if(node){node.textContent=message;node.hidden=false}
 voiceFeedback(account?'auth':'error',message);$("voice-retry").hidden=account;$("voice-audio-retry").hidden=!audio||!lastSpokenSource;
}
function voiceAccountReady(){
 if(window.TalgatAccount?.id)return true;
 const detail=window.TalgatAccount?.error||(!window.TalgatAccount?'Проверяю вход. Повторите запуск через секунду.':'Для распознавания и ответа войдите в свой аккаунт.');
 voiceFailure(detail,{account:Boolean(window.TalgatAccount)});return false;
}
function speechFailed(error){
 outputActive=false;document.body.dataset.state='idle';voiceFailure('Ответ есть в чате, но озвучка не сработала: '+error.message,{audio:true});
 if(voiceSession&&!busy&&!voiceController)startListening();
}
async function audioReadyWithTimeout(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Аудиосистема не запустилась. Нажмите «Начать разговор» ещё раз.')),5000)})])}finally{clearTimeout(timer)}}
async function protectedFetch(url,options){
 const account=window.TalgatAccount?.id;const response=await fetch(url,options);
 if(response.status!==401||!account||window.TalgatAccount?.id!==account||!window.TalgatRefreshSession)return response;
 let timer,abort;
 try{
  const pending=[window.TalgatRefreshSession(),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),9000)})];
  if(options?.signal){if(options.signal.aborted)throw Object.assign(Error('Запрос остановлен'),{name:'AbortError'});pending.push(new Promise((_,reject)=>{abort=()=>reject(Object.assign(Error('Запрос остановлен'),{name:'AbortError'}));options.signal.addEventListener('abort',abort,{once:true})}))}
  const refreshed=await Promise.race(pending);
  if(refreshed&&window.TalgatAccount?.id===account)return fetch(url,options);
  return response;
 }finally{clearTimeout(timer);if(abort)options.signal.removeEventListener('abort',abort)}
}
function safeMath(source){
  const tokens=[];
  const protectedText=source.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?\$)/g,m=>{
    if(!m.startsWith("$$")&&/^\$\d/.test(m)&&!/^\$\d+(?:[.,]\d+)?(?:\s*[\/+*\-]\s*\d+(?:[.,]\d+)?)*\$$/.test(m)&&!/[=^_\\]/.test(m))return m;
    const display=m.startsWith("$$")||m.startsWith("\\[");
    const latex=m.startsWith("$$")?m.slice(2,-2):m.startsWith("\\[")||m.startsWith("\\(")?m.slice(2,-2):m.slice(1,-1);
    let html;
    try{html=window.katex?katex.renderToString(latex,{displayMode:display,throwOnError:false,trust:false,output:"htmlAndMathml"}):null}catch{}
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
  const idle=()=>!busy&&!voiceSession&&!recognition&&!outputActive;
  try{
    const r=await fetch("/api/status",{cache:"no-store"});
    const d=await readJson(r);
    if(!r.ok||!d.ok)throw new Error(d.error||"HTTP "+r.status);
    if(idle()&&!voiceError)$("status").textContent=d.ai_configured?"На связи · Talgat AI":"Сервер доступен · модель не настроена";
  }catch(e){if(idle()&&!voiceError)$("status").textContent="● API недоступен: "+e.message}
}
check();
let neuralVoice=null,neuralConfigured=false,fishConfigured=false,qwenConfigured=false,heygenConfigured=false,outputToken=0,outputActive=false;
async function checkNeural(){try{const r=await fetch("/api/speech",{cache:"no-store"});const d=await r.json();neuralConfigured=r.ok&&d.providers?.openai?.configured===true;fishConfigured=r.ok&&d.providers?.fish?.configured===true;qwenConfigured=r.ok&&d.providers?.qwen?.configured===true;heygenConfigured=r.ok&&d.providers?.heygen?.configured===true;for(const [value,configured] of [['heygen',heygenConfigured],['qwen',qwenConfigured],['neural',neuralConfigured],['fish',fishConfigured]]){const option=$("speech-engine").querySelector?.('option[value='+value+']');if(option)option.disabled=!configured}if(heygenConfigured&&prefs.heygenVoiceVersion!==1){prefs.engine="heygen";prefs.rate=1;prefs.heygenVoiceVersion=1;applyPrefs()}$("neural-status").textContent='Ваш голос: '+(heygenConfigured?'настроен':'не подключён')+' · Fish Audio: '+(fishConfigured?'настроен':'не подключён')+' · OpenAI: '+(neuralConfigured?'настроен':'не подключён')}catch{$("neural-status").textContent="Не удалось проверить нейронную озвучку"}}
function cloudVoice(){return ['heygen','neural','fish','qwen'].includes(prefs.engine)}
function voiceReady(){return prefs.engine==='heygen'?heygenConfigured:prefs.engine==='qwen'?qwenConfigured:prefs.engine==='fish'?fishConfigured:neuralConfigured}
checkNeural();
function stopOutput(){clearTimeout(deviceSpeechTimer);deviceSpeechTimer=null;outputToken++;outputActive=false;neuralVoice?.stop();window.speechSynthesis?.cancel?.()}
function stopCapture(){recordingToken++;recognition?.abort?.();recognition=null;voiceController?.abort();voiceController=null}
function say(source){
  if(!voice)return;
  lastSpokenSource=source;
  if(recognition)stopCapture();
  stopOutput();
  const token=outputToken;
  const text=source.replace(/```[\s\S]*?```/g," Фрагмент кода на экране. ").replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?\$/g," Формула на экране. ").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[`*_#~]/g," ").slice(0,4000);
  if(cloudVoice()){
    if(!voiceReady()){speechFailed(Error("Нейронный голос ещё не подключён. Проверьте настройки голоса."));return}
    outputActive=true;
    if(!neuralVoice)neuralVoice=new TalgatNeural.NeuralVoice({lowLatency:true,fetch:(...args)=>protectedFetch(...args),Audio:window.Audio,createURL:blob=>URL.createObjectURL(blob),revokeURL:url=>URL.revokeObjectURL(url),onState:state=>{document.body.dataset.state=state==='preparing'?'thinking':'speaking';voiceFeedback(state,state==='preparing'?'Ответ получен. Ожидаю аудио от выбранного сервиса.':'Воспроизвожу ответ');$("status").textContent=state==='preparing'?"Готовлю голосовой ответ…":"Отвечаю · нейронный голос"},onEnd:()=>{outputActive=false;document.body.dataset.state='idle';voiceFeedback('idle','Ответ озвучен');if(voiceSession)startListening();else check()},onError:e=>speechFailed(e)});
    neuralVoice.speak(text,prefs.language||'ru',Number($("voice-rate").value)||1,prefs.engine==='neural'?'openai':prefs.engine);return;
  }
  if(!('speechSynthesis' in window)){speechFailed(Error("Голос устройства недоступен."));return}
  outputActive=true;
  const u=new SpeechSynthesisUtterance(text);
  u.lang=({ru:"ru-RU",kk:"kk-KZ",en:"en-US"})[prefs.language]||"ru-RU";u.rate=Number($("voice-rate").value)||0.95;
  const deep=prefs.engine==="deep";
  if(deep){u.pitch=0.75;u.rate*=0.92}
  u.onstart=()=>{if(token!==outputToken)return;voiceFeedback("speaking","Воспроизвожу ответ");document.body.dataset.state="speaking";$("status").textContent=deep?"Отвечаю · низкий голос устройства":"Отвечаю · голос устройства"};
  u.onend=()=>{if(token!==outputToken)return;clearTimeout(deviceSpeechTimer);outputActive=false;voiceFeedback("idle","Ответ озвучен");document.body.dataset.state="idle";if(voiceSession)startListening();else check()};
  u.onerror=e=>{if(token!==outputToken)return;clearTimeout(deviceSpeechTimer);if(!["interrupted","canceled"].includes(e.error))speechFailed(Error(speechError(e.error)));else outputActive=false};
  const voices=speechSynthesis.getVoices();
  u.voice=voices.find(v=>v.lang.toLowerCase().startsWith(prefs.language||"ru"))||null;
  voiceFeedback("preparing","Запускаю выбранный голос устройства");deviceSpeechTimer=setTimeout(()=>{if(token===outputToken){stopOutput();speechFailed(Error("Голос устройства завис. Нажмите «Повторить озвучку»."))}},Math.min(360000,Math.max(25000,text.length*160+10000)));
  try{speechSynthesis.speak(u)}catch{clearTimeout(deviceSpeechTimer);speechFailed(Error("Не удалось запустить голос устройства."))}
}
async function send(prepared){
  let question=typeof prepared?.prompt==="string"?prepared.prompt:$("question").value.trim();
  const visibleQuestion=typeof prepared?.display==="string"?prepared.display:question;
  if(!question||busy)return;
  if(typeof prepared?.prompt!=="string"&&window.TalgatCreative?.route(question)){$("question").value="";return}
  if(typeof prepared?.prompt!=="string")question=window.TalgatCommand?window.TalgatCommand(question):question;if(!question)return;
  if(question.length>12000){$("status").textContent="Вопрос слишком длинный. Оставьте до 12 000 символов или прикрепите текстовый файл.";return}
  stopCapture();stopOutput();
  const requestEpoch=conversationEpoch,requestAccount=window.TalgatAccount.id;
  const previous=history.slice(-12);
  add("user",visibleQuestion);$("question").value="";
  busy=true;document.body.dataset.state="thinking";$("send").disabled=true;
  const requestController=new AbortController();controller=requestController;
  const pending=add("assistant","Думаю…");let completed=false;if(voiceSession)voiceFeedback("thinking","Речь распознана. Запрос отправлен модели.");
  $("status").textContent=voiceSession||prefs.reasoningQuality==="quick"?"Готовлю ответ…":"Обдумываю задачу и проверяю вывод…";
  const timeout=setTimeout(()=>requestController.abort(),prefs.reasoningQuality!=="quick"&&!voiceSession?55000:35000);
  try{
    const r=await protectedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:question,history:previous,preferences:prefs.memory||"",language:prefs.language||"ru",interaction:voiceSession?"voice":"text",mode:workMode,artifact:prepared?.artifact===true,reasoningQuality:prefs.reasoningQuality,search:Boolean($("web-search").checked),image:attachments[0]?.image,materials:attachments.filter(f=>f.text).map(f=>"Файл: "+f.name+"\n"+f.text).join("\n\n")}),signal:requestController.signal});
    const d=await readJson(r);
    if(requestEpoch!==conversationEpoch||requestAccount!==window.TalgatAccount?.id)return;
    if(!r.ok){const error=new Error(d.error||"HTTP "+r.status);error.status=r.status;throw error}
    if(typeof d.answer!=="string"||!d.answer.trim())throw new Error("Модель вернула пустой ответ");
    const answer=d.answer+(d.truncated?"\n\n> Ответ остановлен из-за лимита длины и может быть незавершён. Напишите «Продолжи», чтобы получить оставшуюся часть.":"");
    completed=true;pending.remove();add("assistant",answer);
    history.push({role:"user",content:visibleQuestion},{role:"assistant",content:answer});save();say(answer);
  }catch(e){
    if(requestEpoch!==conversationEpoch||requestAccount!==window.TalgatAccount?.id)return;
    pending.remove();
    const detail=e.name==="AbortError"?"Превышено время ожидания или запрос остановлен.":e instanceof TypeError?"Не удалось подключиться к API. Проверьте интернет и публикацию /api/chat.":e.message;
    add("assistant","Ошибка: "+detail);if(voiceSession){stopVoiceSession();voiceFailure(detail,{account:[401,402,403].includes(e.status)})}
    $("question").value=visibleQuestion;
  }finally{clearTimeout(timeout);if(requestEpoch===conversationEpoch&&requestAccount===window.TalgatAccount?.id){busy=false;if(completed&&!outputActive&&!voiceError)$("status").textContent=persistenceError?"Ответ готов, но диалог не сохранён: не хватает места на устройстве.":"Ответ готов · Talgat AI";if(!outputActive)document.body.dataset.state="idle";controller=null;$("send").disabled=false;if(voiceSession&&!outputActive)startListening()}}
}
$("send").addEventListener("click",send);
$("question").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}});
$("voice").addEventListener("click",()=>{
  if(!cloudVoice()&&!("speechSynthesis" in window)){alert("Озвучка недоступна в этом браузере");return}
  voice=!voice;$("voice").textContent=voice?"◉ Озвучка: вкл.":"◉ Озвучка: выкл.";
  $("voice").setAttribute("aria-pressed",String(voice));if(!voice){stopVoiceSession();stopOutput();document.body.dataset.state="idle"}
});
$("stop").addEventListener("click",()=>{stopVoiceSession();controller?.abort();stopOutput();document.body.dataset.state="idle";recognition?.stop?.()});
const actions=document.querySelector(".buttons");
const clear=document.createElement("button");clear.className="secondary";clear.textContent="Очистить историю";
clear.onclick=()=>{if(busy)return;stopVoiceSession();history=[];save();$("chat").replaceChildren();document.body.classList.remove("has-chat");document.body.dataset.state="idle";window.speechSynthesis?.cancel?.();closeNavigation()};
$("newchat").onclick=()=>switchDialog();
// Audio is recorded locally and transcribed by the protected server endpoint.
const talk=document.createElement("button");talk.className="navitem";talk.textContent="◉  Голосовой режим";talk.id="voice-dialog";talk.setAttribute("aria-pressed","false");$("settings-open").before(talk);
function stopVoiceSession(){
 voiceSession=false;stopOutput();stopCapture();if(sharedAudioContext){const context=sharedAudioContext;sharedAudioContext=null;context.close().catch(()=>{})}
 talk.textContent="◉  Голосовой режим";talk.setAttribute("aria-pressed","false");
 $("stage-voice").lastElementChild.textContent="Начать разговор";document.body.dataset.state="idle";$("status").textContent="Разговор завершён";voiceFeedback("idle","Разговор остановлен. Можно начать снова.");document.documentElement.style.setProperty("--audiolevel","0");
}
function startListening(){if(voiceSession&&!busy&&!recognition&&!voiceController&&!outputActive)captureVoice(false)}
async function captureVoice(dictation){
 if(recognition||busy||voiceController)return;
 if(!voiceAccountReady())return;
 stopOutput();
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){stopVoiceSession();voiceFailure("Запись микрофона не поддерживается. Откройте сайт в современном браузере.");return}
 const token=++recordingToken;let stream,audioContext,inputSource,recorder,watchdog,cancelled=false,spoken=false,settled=false,reachedLimit=false;
 recognition={abort:()=>{cancelled=true;if(recorder?.state==="recording")recorder.stop();else stream?.getTracks().forEach(t=>t.stop())},stop:()=>{if(recorder?.state==="recording")recorder.stop()}};
 const cleanup=()=>{clearInterval(watchdog);stream?.getTracks().forEach(t=>t.stop());inputSource?.disconnect?.();if(!voiceSession&&sharedAudioContext===audioContext){sharedAudioContext=null;audioContext?.close().catch(()=>{})}if(token===recordingToken)document.documentElement.style.setProperty("--audiolevel","0")};
 try{
  $("status").textContent="Разрешите доступ к микрофону…";document.body.dataset.state='permission';voiceFeedback('permission','Подтвердите разрешение микрофона в окне телефона или браузера.');
  const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw Error('Web Audio не поддерживается. Откройте приложение в обновлённом браузере.');
  if(!sharedAudioContext||sharedAudioContext.state==='closed')sharedAudioContext=new AudioContext();audioContext=sharedAudioContext;const audioReady=Promise.resolve(audioContext.resume()).then(()=>null,error=>error);
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(token!==recordingToken||cancelled){cleanup();return}
  const resumeError=await audioReadyWithTimeout(audioReady);if(resumeError)throw resumeError;if(token!==recordingToken||cancelled){cleanup();return}
  const analyser=audioContext.createAnalyser();analyser.fftSize=1024;inputSource=audioContext.createMediaStreamSource(stream);inputSource.connect(analyser);
  const samples=new Float32Array(analyser.fftSize),types=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'],mime=typeof MediaRecorder.isTypeSupported==='function'?types.find(t=>MediaRecorder.isTypeSupported(t)):undefined;
  recorder=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:48000}:{});const chunks=[];const started=performance.now();let lastSpeech=started,noiseFloor=.0004;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>{cancelled=true;cleanup();if(token!==recordingToken)return;stopVoiceSession();$("status").textContent="Не удалось записать микрофон. Попробуйте ещё раз."};
  recorder.onstop=async()=>{
   if(settled)return;settled=true;cleanup();if(token===recordingToken)recognition=null;
   if(cancelled||token!==recordingToken)return;
   if(!spoken){document.body.dataset.state="idle";$("status").textContent="Речь не обнаружена";voiceFeedback("listening","Пока не слышу речи. Проверьте микрофон и говорите ближе.");if(voiceSession)setTimeout(startListening,700);return}
   const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(blob.size>4000000){stopVoiceSession();voiceFailure("Слишком длинная запись. Говорите короткими репликами.");return}
   document.body.dataset.state="transcribing";$("status").textContent="Распознаю речь…";voiceFeedback("transcribing","Пауза обнаружена. Отправляю запись на распознавание.");
   const form=new FormData();const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';form.append('file',blob,'voice.'+ext);form.append('language',prefs.language||'ru');
   const transcriptionController=new AbortController();voiceController=transcriptionController;let answered=false;const deadline=setTimeout(()=>transcriptionController.abort(),30000);
   try{
    const res=await protectedFetch('/api/transcribe',{method:'POST',body:form,signal:transcriptionController.signal});const data=await readJson(res);
    if(token!==recordingToken)return;if(!res.ok){const error=new Error(data.error||'Не удалось распознать речь');error.status=res.status;throw error}
    $("question").value=data.text;document.body.dataset.state="idle";
    if(dictation||reachedLimit){if(reachedLimit)stopVoiceSession();$("status").textContent=reachedLimit?"Записаны 2 минуты речи. Проверьте текст и нажмите «Отправить» — ответ ещё не начат.":"Речь распознана. Можно отправить или отредактировать.";$("question").focus()}else{answered=true;await send()}
   }catch(e){if(token===recordingToken){if(e.status===422&&voiceSession){document.body.dataset.state='idle';$("status").textContent=e.message+" Слушаю ещё раз…";setTimeout(startListening,1000)}else{stopVoiceSession();voiceFailure(e.name==='AbortError'?'Распознавание остановлено.':e.message,{account:[401,402,403].includes(e.status)})}}}finally{clearTimeout(deadline);if(voiceController===transcriptionController)voiceController=null;if(answered&&voiceSession&&!busy&&!outputActive)startListening()}
  };
  recorder.start(250);document.body.dataset.state="listening";$("status").textContent="Слушаю. После паузы отвечу автоматически.";voiceFeedback("listening","Микрофон включён. Говорите — индикатор покажет звук.");
  watchdog=setInterval(()=>{
   if(token!==recordingToken||cancelled){if(recorder.state==='recording')recorder.stop();return}
   analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length),now=performance.now();
   const level=Math.min(1,Math.sqrt(rms)*7);document.documentElement.style.setProperty('--audiolevel',String(level));voiceFeedback(spoken&&rms<.0012?'pause':'listening',`Микрофон включён · ${Math.floor((now-started)/1000)} с · ${rms>.0012?'речь слышна':'ожидаю речь или паузу'}`,level);
   // Track quiet background only; do not learn the speaker's voice as noise.
   const threshold=Math.max(.0012,Math.min(.009,noiseFloor*2.4));
   if(rms>threshold){spoken=true;lastSpeech=now}else if(rms<Math.max(.0007,noiseFloor*1.5)){noiseFloor=noiseFloor*.96+rms*.04}
   const pause=([2,4,6,8].includes(Number(prefs.listenPause))?Number(prefs.listenPause):2)*1000;
   reachedLimit=now-started>=120000;
   if((spoken&&now-lastSpeech>pause&&now-started>2000)||reachedLimit||(!spoken&&now-started>30000)){if(recorder.state==='recording')recorder.stop()}
  },80);
 }catch(e){cleanup();if(token===recordingToken){recognition=null;stopVoiceSession();voiceFailure(e.name==='NotAllowedError'?'Разрешите доступ к микрофону в настройках приложения или браузера.':e.name==='NotFoundError'?'Микрофон не найден.':e.message||'Не удалось включить запись микрофона.')}}
}
talk.onclick=()=>{
 if(voiceSession){stopVoiceSession();stopOutput();check();return}
 if(!voiceAccountReady())return;clearVoiceError();if(cloudVoice()&&!voiceReady())voiceFailure("Выбранная озвучка пока недоступна. Микрофон и текстовые ответы продолжат работать.");
 stopCapture();stopOutput();voiceSession=true;voice=true;$("voice").textContent="◉ Озвучка: вкл.";$("voice").setAttribute('aria-pressed','true');talk.textContent="■  Завершить разговор";talk.setAttribute('aria-pressed','true');
 $("stage-voice").lastElementChild.textContent="Завершить разговор";closeNavigation();startListening();
};
$("stage-voice").onclick=()=>talk.onclick();
$("voice-retry").onclick=()=>{stopVoiceSession();talk.onclick()};
$("voice-audio-retry").onclick=()=>{if(!voiceAccountReady()||!lastSpokenSource)return;clearVoiceError();voice=true;say(lastSpokenSource)};
window.addEventListener('talgat-account-changed',()=>{if(!voiceSession&&!recognition)voiceFeedback(window.TalgatAccount?.id?'idle':'auth',window.TalgatAccount?.error||(window.TalgatAccount?.id?'Нажмите «Начать разговор».':'Войдите в аккаунт для распознавания и ответа.'));});
const mic=document.createElement('button');mic.id='mic';mic.textContent="🎙 Диктовка";mic.title="Запись и распознавание через Whisper";mic.onclick=()=>{if(recognition){recognition.stop();return}if(voiceSession)stopVoiceSession();captureVoice(true)};actions.append(mic);
function previewPage(source){
 const dialog=document.createElement('dialog');dialog.className='settings';
 dialog.style.width='min(1100px, 96vw)';
 const close=document.createElement('button');close.textContent='Закрыть предпросмотр';
 const frame=document.createElement('iframe');frame.title='Предпросмотр веб-приложения';
 frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
 frame.style.cssText='display:block;width:100%;height:70vh;border:0;background:white';
 frame.srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1">'+source.replace(/^\s*<!doctype html>/i,'');
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.append(close,frame);document.body.append(dialog);dialog.showModal();
}
function addCodeDownloads(el){
 for(const [index,code] of [...el.querySelectorAll('pre code')].entries()){
  const ext=({javascript:'js',typescript:'ts',python:'py',html:'html',css:'css',json:'json',bash:'sh',shell:'sh',sql:'sql',java:'java',cpp:'cpp',csharp:'cs',yaml:'yml',svg:'svg',kotlin:'kt',dart:'dart',swift:'swift',jsx:'jsx',tsx:'tsx'})[(code.className.match(/language-([a-z]+)/)||[])[1]]||'txt';
  const bar=document.createElement('div');bar.className='codeactions';const label=document.createElement('span');label.textContent='talgat-code-'+(index+1)+'.'+ext;
  const download=document.createElement('button');download.textContent='Скачать файл ↓';download.onclick=()=>{const form=document.createElement('form');form.method='POST';form.action='/api/export';form.style.display='none';for(const [name,value] of [['filename',label.textContent],['content',code.textContent]]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)}document.body.append(form);form.submit();setTimeout(()=>form.remove(),2000)};bar.append(label,download);
  if(ext==='html'||ext==='svg'){
   const preview=document.createElement('button');preview.textContent='Запустить предпросмотр';
   preview.onclick=()=>previewPage(code.textContent);bar.append(preview);
  }
  code.parentElement.before(bar);
 }
}
function renderAttachments(){
 $("attachments").replaceChildren();for(const [i,file] of attachments.entries()){const chip=document.createElement('span');chip.className='file-chip';chip.textContent=file.name;const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Убрать '+file.name);remove.onclick=()=>{attachments.splice(i,1);renderAttachments()};chip.append(remove);$("attachments").append(chip)}
}
$("attach").onclick=()=>$("file-input").click();
let fileVersion=0;
$("file-input").onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const version=++fileVersion;
 $("status").textContent="Читаю файл…";
 try{
  const {readFile}=await import('/generated/files.mjs');
  const result=await readFile(file);
  if(version!==fileVersion)return;
  if(result.image?.length>2_000_000)throw new Error("Фото слишком большое после обработки. Обрежьте лишнее вокруг задания.");
  attachments=[{name:file.name,...result}];renderAttachments();
  if(result.image)$("web-search").checked=false;
  $("status").textContent="Файл готов. Напишите, что нужно сделать.";
 }catch(error){if(version===fileVersion)$("status").textContent=error.message||"Не удалось прочитать файл."}
};
$("school-open").onclick=()=>{
 $("school").showModal();
 closeNavigation();
};
$("school-form").onsubmit=e=>{
 e.preventDefault();
 const grade=$("school-grade").value;
 const subject=$("school-subject").value.trim();
 const task=$("school-task").value.trim();
 if(!subject||!task)return;
 const book=$("school-book").value.trim();
 $("question").value="Казахстан, "+(grade==="0"?"предшкольный 0 класс":grade+" класс")+", предмет: "+subject+"."+(book?" Учебник, издание и страница: "+book+".":"")+"\n"+task+"\nОбъясни решение по шагам на уровне класса и проверь ответ.";
 $("school").close();
 $("question").focus();
};
for(const mode of ['chat','code'])$("mode-"+mode).onclick=()=>{workMode=mode;for(const m of ['chat','code']){$('mode-'+m).classList.toggle('selected',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode))}$('mode-title').textContent=mode==='code'?'Генерация и разбор кода':'Диалог с Talgat';$('question').placeholder=mode==='code'?'Опишите программу, файл или ошибку…':'Вопрос, задача или идея…'};
const fitViewport=()=>document.documentElement.style.setProperty('--appheight',(window.visualViewport?.height||innerHeight)+'px');window.visualViewport?.addEventListener('resize',fitViewport);window.addEventListener('resize',fitViewport);fitViewport();
// Local preferences never contain provider credentials.
let prefsKey="talgat-ui-preferences-guest";
let prefs={theme:"dark",font:16,rate:0.95,motion:"on",memory:"",language:"ru",engine:"device",listenPause:2,reasoningQuality:"quick"};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(prefsKey)||"{}"))}catch{}
function applyPrefs(){
  if(prefs.autoReplyVersion!==1){prefs.listenPause=2;prefs.autoReplyVersion=1}
  if(prefs.responseSpeedVersion!==1){prefs.reasoningQuality="quick";prefs.responseSpeedVersion=1}
  prefs.reasoningQuality=prefs.reasoningQuality==='deep'?'deep':'quick';
  prefs.listenPause=[2,4,6,8].includes(Number(prefs.listenPause))?Number(prefs.listenPause):2;
  prefs.theme=prefs.theme==='light'?'light':'dark';prefs.engine=['heygen','neural','fish','deep','qwen'].includes(prefs.engine)?prefs.engine:'device';prefs.language=['ru','kk','en'].includes(prefs.language)?prefs.language:'ru';prefs.font=Math.max(14,Math.min(20,Number(prefs.font)||16));prefs.rate=Math.max(.7,Math.min(1.3,Number(prefs.rate)||.95));prefs.motion=prefs.motion==='off'?'off':'on';prefs.memory=typeof prefs.memory==='string'?prefs.memory.slice(0,2000):'';
  document.body.classList.toggle("light",prefs.theme==="light");
  document.documentElement.style.setProperty("--size",Math.max(14,Math.min(20,Number(prefs.font)||16))+"px");
  $("reasoning-quality").value=prefs.reasoningQuality;$("speech-engine").value=prefs.engine;$("listen-pause").value=String(prefs.listenPause);
  $("speech-language").value=["ru","kk","en"].includes(prefs.language)?prefs.language:"ru";
  $("theme").value=prefs.theme==="light"?"light":"dark";
  $("memory").value=typeof prefs.memory==="string"?prefs.memory:"";$("font-size").value=prefs.font;$("voice-rate").value=prefs.rate;$("motion").value=prefs.motion;
  try{localStorage.setItem(prefsKey,JSON.stringify(prefs))}catch{}
}
applyPrefs();
for(const [id,key] of [["reasoning-quality","reasoningQuality"],["listen-pause","listenPause"],["speech-engine","engine"],["speech-language","language"],["theme","theme"],["font-size","font"],["voice-rate","rate"],["motion","motion"],["memory","memory"]])$(id).addEventListener("input",()=>{prefs[key]=$(id).value;applyPrefs()});
$("settings-open").onclick=()=>{$("settings").showModal();closeNavigation()};
$("settings-close").onclick=()=>$("settings").close();
$("settings").addEventListener("click",e=>{if(e.target===$("settings")){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
function updateNavigation(){const mobile=matchMedia('(max-width:700px)').matches,open=document.body.classList.contains?.('nav-open')||false;const sidebar=$('sidebar');sidebar.inert=mobile&&!open;sidebar.setAttribute('aria-hidden',String(mobile&&!open));$('menu').setAttribute('aria-expanded',String(mobile&&open))}
function closeNavigation(){document.body.classList.remove('nav-open');updateNavigation()}
window.closeTalgatNavigation=closeNavigation;
$('menu').onclick=()=>{document.body.classList.toggle('nav-open');updateNavigation()};$('nav-backdrop').onclick=()=>{closeNavigation();$('menu').focus()};window.addEventListener('resize',updateNavigation);document.addEventListener?.('keydown',e=>{if(e.key==='Escape')closeNavigation()});updateNavigation();
$("navchat").onclick=()=>closeNavigation();
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
 const moving=prefs.motion!=='off'&&!reduced.matches,state=document.body.dataset.state||'idle',active=['listening','thinking','speaking','transcribing'].includes(state),t=moving?time/1000:0;
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

let activeAccount=undefined;
window.TalgatSwitchAccount=id=>{
 if(id===activeAccount)return;activeAccount=id;conversationEpoch++;lastSpokenSource="";clearVoiceError();
 controller?.abort();controller=null;busy=false;$("send").disabled=false;stopVoiceSession();fileVersion++;attachments=[];renderAttachments();$("file-input").value="";$("question").value="";dialogStore=null;history=[];
 storageKey="talgat-ai-2-history-"+(id||"guest");prefsKey="talgat-ui-preferences-"+(id||"guest");
 if(id){try{if(window.TalgatDialogs){dialogStore=TalgatDialogs.createStore({storage:localStorage,userId:id});history=dialogStore.messages()}else{const data=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(data))history=data.filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string")}}catch{$("status").textContent="Не удалось открыть личную историю. Проверьте свободное место на устройстве."}}else{try{const data=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(data))history=data.filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string").slice(-20)}catch{}}
 paintConversation();renderDialogList();
 prefs={theme:"dark",font:16,rate:.95,motion:"on",memory:"",language:"ru",engine:"device",listenPause:2,reasoningQuality:"quick"};

// Initialize the public guest workspace immediately; account module may replace it with a signed-in profile later.
window.TalgatSwitchAccount(null);
document.documentElement.classList.remove('account-loading');
 try{Object.assign(prefs,JSON.parse(localStorage.getItem(prefsKey)||"{}"))}catch{}if(id&&heygenConfigured&&prefs.heygenVoiceVersion!==1){prefs.engine="heygen";prefs.rate=1;prefs.heygenVoiceVersion=1}applyPrefs();
};
