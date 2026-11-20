import {metered,AccessError} from './lib/commerce.mjs';
import OpenAI from 'openai';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const env=name=>{try{return Netlify.env.get(name)}catch{return undefined}};
async function speech(req){
 const openaiKey=env('TALGAT_TTS_API_KEY'),fishKey=env('FISH_API_KEY'),fishVoice=env('FISH_VOICE_ID');
 const heygenKey=env('HEYGEN_API_KEY'),heygenVoice=env('HEYGEN_VOICE_ID')||'2298ae4b21174051a80ab99dc6df6dcc';
 const qwenURL=env('QWEN_VOICE_URL'),qwenToken=env('QWEN_VOICE_TOKEN');
 const qwenConfigured=Boolean(qwenURL?.startsWith('https://')&&qwenToken);
 const providers={openai:{configured:Boolean(openaiKey)},fish:{configured:Boolean(fishKey&&fishVoice),key_set:Boolean(fishKey),voice_set:Boolean(fishVoice)},...(qwenConfigured?{qwen:{configured:true}}:{}),heygen:{configured:Boolean(heygenKey)}};
 if(req.method==='GET')return json({configured:providers.openai.configured||providers.fish.configured||qwenConfigured||providers.heygen.configured,providers});
 if(req.method!=='POST')return json({error:'Используйте POST с текстом.'},405);
 let body;try{body=await req.json()}catch{return json({error:'Некорректный запрос.'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Некорректный запрос.'},400);
 if(body?.provider!==undefined&&!['fish','openai','qwen','heygen'].includes(body.provider))return json({error:'Неизвестный сервис озвучки.'},400);
 const provider=body?.provider??(providers.heygen.configured?'heygen':'openai');
 if(provider==='heygen'&&body.language&&!['ru','en'].includes(body.language))return json({error:'Выбранный голос поддерживает русский и английский языки.'},400);
 if(provider==='heygen'&&!providers.heygen.configured)return json({error:'Выбранный голос ещё не подключён на сервере.',code:'voice_not_configured',provider},503);
 if(provider==='qwen'&&!qwenConfigured)return json({error:'Сервер голоса по образцу ещё не подключён.'},503);
 if(provider==='qwen'&&body.language!=='ru')return json({error:'Голос по образцу поддерживает русский язык.'},400);
 if(!providers[provider]?.configured)return json({error:provider==='fish'?'Fish Audio не подключён. На сервере нужны FISH_API_KEY и идентификатор выбранного голоса FISH_VOICE_ID.':'Нейронный голос OpenAI не подключён. На сервере нужен TALGAT_TTS_API_KEY.',code:'voice_not_configured',provider},503);
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(!text||text.length>1200)return json({error:'Для озвучки нужен текст от 1 до 1200 символов.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),['qwen','heygen'].includes(provider)?50000:25000);
 try{
  if(provider==='heygen'){
   const model=env('HEYGEN_VOICE_MODEL')||'heygen-voice-1-turbo-free';
   if(!['heygen-voice-1-turbo-free','heygen-voice-1-turbo','heygen-voice-1'].includes(model))return json({error:'Модель выбранного голоса настроена некорректно.'},503);
   // A private workspace voice; credentials and speaker selection stay server-side.
   // Never retry or switch to a paid model/provider automatically.
   const upstream=await fetch('https://api.heygen.com/v3/models/audio/tts/stream',{
    method:'POST',redirect:'error',headers:{'X-Api-Key':heygenKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
    body:JSON.stringify({model,voice_id:heygenVoice,text,language:body.language||'ru',expressiveness_boost:0.5,with_timestamps:false,output_format:{encoding:'mp3',sample_rate_hertz:44100,bitrate_bps:128000}}),signal:controller.signal
   });
   if(!upstream.ok){
    const limited=upstream.status===429;
    return json({error:limited?'Лимит выбранного голоса исчерпан или сервис занят. Попробуйте позже.':upstream.status===401?'Серверный ключ HeyGen отклонён.':upstream.status===403?'Ключ HeyGen не имеет доступа к выбранному голосу.':upstream.status===402?'Для выбранного голоса требуется баланс HeyGen.':'Выбранный голос временно недоступен.',code:limited?'voice_rate_limited':'voice_provider_error',provider},limited?429:502);
   }
   const type=upstream.headers.get('content-type')||'';
   if(!type.startsWith('audio/mpeg'))return json({error:'Сервис выбранного голоса вернул неверный формат звука.'},502);
   const audio=await upstream.arrayBuffer();
   if(!audio.byteLength||audio.byteLength>4_000_000)return json({error:'Сервис выбранного голоса вернул пустую или слишком большую запись.'},502);
   return new Response(audio,{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  if(provider==='qwen'){
   if(text.length>120)return json({error:'Для этого голоса максимум 120 символов на запрос.'},400);
   const upstream=await fetch(new URL('/speech',qwenURL),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+qwenToken,'Content-Type':'application/json'},body:JSON.stringify({text}),signal:controller.signal});
   if(upstream.status===429)return json({error:'Сервер голоса занят. Попробуйте через несколько секунд.'},429);
   if(!upstream.ok||!upstream.headers.get('content-type')?.startsWith('audio/wav'))return json({error:'Сервер голоса не вернул аудио.'},502);
   return new Response(await upstream.arrayBuffer(),{headers:{'content-type':'audio/wav','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
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

export default metered(speech,{metric:'speech',measure:async r=>{const b=await r.json();const n=Array.from(String(b.text||'')).length;if(n<1||n>1200)throw new AccessError('Текст озвучки: 1–1200 символов',400);return n}});
