import OpenAI from 'openai';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const env=name=>{try{return Netlify.env.get(name)}catch{return undefined}};
export default async function speech(req){
 const openaiKey=env('TALGAT_TTS_API_KEY'),fishKey=env('FISH_API_KEY'),fishVoice=env('FISH_VOICE_ID');
 const providers={openai:{configured:Boolean(openaiKey)},fish:{configured:Boolean(fishKey&&fishVoice),key_set:Boolean(fishKey),voice_set:Boolean(fishVoice)}};
 if(req.method==='GET')return json({configured:providers.openai.configured||providers.fish.configured,providers});
 if(req.method!=='POST')return json({error:'Используйте POST с текстом.'},405);
 let body;try{body=await req.json()}catch{return json({error:'Некорректный запрос.'},400)}
 if(body?.provider!==undefined&&!['fish','openai'].includes(body.provider))return json({error:'Неизвестный сервис озвучки.'},400);
 const provider=body?.provider==='fish'?'fish':'openai';
 if(!providers[provider].configured)return json({error:provider==='fish'?'Fish Audio не подключён. На сервере нужны FISH_API_KEY и идентификатор выбранного голоса FISH_VOICE_ID.':'Нейронный голос OpenAI не подключён. На сервере нужен TALGAT_TTS_API_KEY.',code:'voice_not_configured',provider},503);
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(!text||text.length>1200)return json({error:'Для озвучки нужен текст от 1 до 1200 символов.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  if(provider==='fish'){
   // Uses the documented Fish API. No Jarvis application source or private voice is bundled.
   const model=env('FISH_MODEL')||'s2.1-pro';
   if(!['s1','s2-pro','s2.1-pro','s2.1-pro-free','drama-3'].includes(model))return json({error:'Модель Fish Audio настроена некорректно.'},503);
   const upstream=await fetch('https://api.fish.audio/v1/tts',{method:'POST',headers:{Authorization:'Bearer '+fishKey,'Content-Type':'application/json',model},body:JSON.stringify({text,reference_id:fishVoice,format:'mp3',mp3_bitrate:128,latency:'balanced',normalize:true,temperature:0.7,prosody:{speed:1,volume:0}}),signal:controller.signal});
   if(!upstream.ok)return json({error:upstream.status===401?'Ключ Fish Audio отклонён.':upstream.status===429?'Лимит Fish Audio исчерпан.':'Fish Audio не смог озвучить текст. Проверьте доступ к выбранному голосу.'},upstream.status===429?429:502);
   const contentType=upstream.headers.get('content-type')||'';if(contentType&&!/^(audio\/|application\/octet-stream)/.test(contentType))return json({error:'Fish Audio вернул неверный формат звука.'},502);
   const audio=await upstream.arrayBuffer();if(!audio.byteLength)return json({error:'Fish Audio вернул пустую запись.'},502);
   return new Response(audio,{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  const language=({ru:'Russian',kk:'Kazakh',en:'English'})[body?.language]||'Russian';
  const client=new OpenAI({apiKey:openaiKey,baseURL:'https://api.openai.com/v1',timeout:25000,maxRetries:0});
  const audio=await client.audio.speech.create({model:'gpt-4o-mini-tts',voice:'cedar',input:text,response_format:'mp3',instructions:'Speak '+language+' naturally, as a calm intelligent male assistant. Warm resonant voice, clear diction, conversational phrasing, natural pauses. No announcer or theatrical delivery. Do not add words.'},{signal:controller.signal});
  return new Response(await audio.arrayBuffer(),{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(e){return json({error:e.name==='AbortError'?'Превышено время ожидания озвучки.':e.status===401?'Ключ сервиса озвучки отклонён.':e.status===429?'Лимит или баланс сервиса озвучки исчерпан.':'Сервис нейронной озвучки временно недоступен.'},e.status===429?429:502)}finally{clearTimeout(timer)}
}
export const config={path:'/api/speech',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:30}};
