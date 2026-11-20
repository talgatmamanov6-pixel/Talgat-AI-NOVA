(function(){
'use strict';
const get=id=>document.getElementById(id),dialog=get('creative');
let active=null,imageURL=null,reference=null,referenceVersion=0,referencePending=false;
const notes={image:'Опишите детали: композицию, свет, материалы и желаемый стиль. Генерация использует доступные кредиты сервиса.', 'architecture-concept':'Укажите участок, габариты здания, этажи, комнаты и ограничения. Результат — концептуальный SVG-эскиз и экспликация, не рабочая документация.', 'interior-concept':'Укажите размеры, назначение, предпочтения и бюджет. Для фоторендера выберите «Изображение».', 'site-project':'Опишите страницы, внешний вид и функции. HTML можно просмотреть; файлы проекта — скачать ZIP.', 'app-project':'Укажите платформу и функции. Результат — исходники и инструкции сборки. APK и публикация требуют отдельной сборки.', 'evidence-analysis':'Прикрепите данные через «Добавить файл» в чате. Укажите вопрос, критерии решения и ограничения.'};
function refresh(){const kind=get('creative-kind').value;get('creative-image-options').hidden=kind!=='image';get('creative-note').textContent=notes[kind];}
async function status(){try{const response=await fetch('/api/images',{cache:'no-store'}),data=await response.json();get('creative-image-service').textContent=data.configured?'Сервис подключён · '+data.model:'Сервис изображений пока не подключён.'}catch{get('creative-image-service').textContent='Не удалось проверить сервис изображений.'}}
get('creative-open').onclick=()=>{dialog.showModal();window.closeTalgatNavigation?.();refresh();status()};
get('creative-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>active?.abort());get('creative-stop').onclick=()=>active?.abort();
get('creative-kind').onchange=refresh;
get('creative-reference').onchange=async event=>{
 const version=++referenceVersion,file=event.target.files[0];reference=null;referencePending=Boolean(file);if(!file)return;
 try{const tools=await import('/generated/files.mjs'),result=await tools.readFile(file);if(version!==referenceVersion)return;if(!result.image||result.image.length>2000000)throw new Error('Фото слишком большое. Обрежьте его или уменьшите.');reference=result.image;get('creative-status').textContent='Референс готов.'}catch(error){if(version===referenceVersion)get('creative-status').textContent=error.message}finally{if(version===referenceVersion)referencePending=false}
};
async function image(prompt){
 const abort=new AbortController();active=abort;get('creative-submit').disabled=true;get('creative-stop').hidden=false;get('creative-status').textContent='Создаю изображение…';
 const timeout=setTimeout(()=>abort.abort(),58000);let received=false;
 try{
  const response=await fetch('/api/images',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,format:get('creative-format').value,...(reference?{reference}:{})}),signal:abort.signal});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||(response.status===429?'Слишком много запросов. Подождите несколько минут.':'Сервис изображений недоступен.'))}
  if(!(response.headers.get('content-type')||'').startsWith('application/x-ndjson'))throw new Error('Сервер вернул неверный формат ответа.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw new Error(event.error);if(event.type==='status')get('creative-status').textContent=event.message;if(event.type==='image'){
   if(event.mime!=='image/jpeg'||typeof event.base64!=='string'||event.base64.length>5000000)throw new Error('Неверный файл изображения.');
   const bytes=Uint8Array.from(atob(event.base64),c=>c.charCodeAt(0));if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
   const picture=document.createElement('img');picture.src=imageURL;picture.alt=prompt;const download=document.createElement('a');download.href=imageURL;download.download='talgat-image.jpg';download.textContent='Скачать JPG';const caption=document.createElement('p');caption.textContent='Создано AI · '+event.model;get('creative-result').replaceChildren(picture,download,caption);received=true;
  }};
  while(true){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});if(pending.length>7000000)throw new Error('Изображение слишком большое.');let end;while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1)}}pending+=decoder.decode();consume(pending);
  if(!received)throw new Error('Сервис не вернул изображение.');get('creative-status').textContent='Изображение готово. Скачайте JPG, чтобы сохранить его.';
 }catch(error){get('creative-status').textContent=error.name==='AbortError'?'Генерация остановлена или превышено время ожидания.':error.message}
 finally{clearTimeout(timeout);active=null;get('creative-submit').disabled=false;get('creative-stop').hidden=true}
}
get('creative-form').onsubmit=event=>{
 event.preventDefault();if(active)return;const topic=get('creative-prompt').value.trim(),kind=get('creative-kind').value;if(!topic)return;
 if(kind==='image'){if(get('creative-reference').files.length&&!reference&&!referencePending){get('creative-status').textContent='Исправьте референс или уберите выбранный файл.';return}if(referencePending){get('creative-status').textContent='Дождитесь подготовки референса.';return}image(topic);return}
 if(busy){get('creative-status').textContent='Дождитесь текущего ответа или нажмите «Стоп» в чате.';return}
 const skill=window.TalgatSkills.items.find(item=>item.id===kind);if(!skill)return;
 const prompt=window.TalgatSkills.build(kind,{topic,language:({ru:'русский',kk:'қазақша',en:'English'})[prefs.language]||'русский'});
 dialog.close();get(skill.category==='Разработка'?'mode-code':'mode-chat').click();send({prompt,display:skill.title+'\n'+topic});
};
window.TalgatCreative={route(question){
 if(!/^\/image\s+|^(?:создай|сгенерируй|нарисуй)\s+(?:мне\s+)?(?:изображение|картинку|иллюстрацию|фото|рендер|визуализацию)(?=\s|[:,.!?-]|$)/iu.test(question))return false;
 if(active)return false;if(voiceSession)stopVoiceSession();reference=null;referencePending=false;referenceVersion++;get('creative-reference').value='';get('creative-kind').value='image';get('creative-prompt').value=question.replace(/^\/image\s+/i,'');dialog.showModal();window.closeTalgatNavigation?.();refresh();image(get('creative-prompt').value);return true;
}};
refresh();
})();
