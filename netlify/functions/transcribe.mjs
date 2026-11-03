const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export default async function transcribe(request){
 if(request.method!=='POST')return json({error:'Используйте POST с аудиозаписью.'},405);
 let key;try{key=Netlify.env.get('GROQ_API_KEY')}catch{}
 if(!key)return json({error:'Распознавание речи не настроено на сервере.'},503);
 if(Number(request.headers.get('content-length'))>4500000)return json({error:'Запись слишком большая. Ограничение — 4 МБ.'},413);
 let form;try{form=await request.formData()}catch{return json({error:'Не удалось прочитать аудиозапись.'},400)}
 const language=['ru','kk','en'].includes(form.get('language'))?form.get('language'):'ru';
 const file=form.get('file');
 if(!file||typeof file.arrayBuffer!=='function'||file.size<100||file.size>4000000)return json({error:'Прикрепите аудиозапись размером до 4 МБ.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  let result,model='whisper-large-v3-turbo';
  for(const candidate of ['whisper-large-v3-turbo','whisper-large-v3']){
   model=candidate;const body=new FormData();body.append('file',file,file.name||'voice.webm');body.append('model',model);body.append('response_format','verbose_json');body.append('temperature','0');body.append('language',language);body.append('prompt',language==='ru'?'Русская речь. Талгат, помощник, вопрос, задача.':language==='kk'?'Қазақ тіліндегі сөйлеу.':'English speech.');
   result=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body,signal:controller.signal});
   if(![404,410].includes(result.status))break;
  }
  if(!result.ok)return json({error:result.status===429?'Лимит распознавания исчерпан. Попробуйте немного позже.':result.status===401?'Серверный ключ распознавания отклонён.':'Не удалось распознать запись.',upstream_status:result.status},result.status===429?429:502);
  const data=await result.json(),text=typeof data.text==='string'?data.text.trim():'';
  const segments=Array.isArray(data.segments)?data.segments:[];
  const uncertain=segments.length>0&&segments.every(s=>s.no_speech_prob>0.75||s.avg_logprob < -1.2);
  const wrongScript=language==='ru'&&(text.match(/[a-zA-ZÀ-ž]/g)||[]).length>18&&!/[А-Яа-яЁё]/.test(text);
  if(uncertain||wrongScript)return json({error:'Не удалось уверенно разобрать речь. Повторите фразу ближе к микрофону.',code:'uncertain_transcript'},422);
  if(!text)return json({error:'Речь не обнаружена. Попробуйте говорить ближе к микрофону.'},422);
  return json({text,language,provider:'groq',model});
 }catch(e){return json({error:e.name==='AbortError'?'Распознавание заняло слишком много времени.':'Сервис распознавания временно недоступен.'},e.name==='AbortError'?504:502)}finally{clearTimeout(timer)}
}
export const config={path:'/api/transcribe'};
