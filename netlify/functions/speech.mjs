import OpenAI from 'openai';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const env=name=>{try{return Netlify.env.get(name)}catch{return undefined}};
export default async function speech(req){
 const key=env('TALGAT_TTS_API_KEY');
 if(req.method==='GET')return json({configured:Boolean(key),engine:'openai-neural',voice:'cedar'});
 if(req.method!=='POST')return json({error:'Используйте POST с текстом.'},405);
 if(!key)return json({error:'Нейронный голос не подключён. В Netlify нужен секрет TALGAT_TTS_API_KEY для OpenAI API.',code:'voice_not_configured'},503);
 let body;try{body=await req.json()}catch{return json({error:'Некорректный запрос.'},400)}
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(!text||text.length>1200)return json({error:'Для озвучки нужен текст от 1 до 1200 символов.'},400);
 const language=({ru:'Russian',kk:'Kazakh',en:'English'})[body?.language]||'Russian';
 try{
  const client=new OpenAI({apiKey:key,baseURL:'https://api.openai.com/v1',timeout:25000,maxRetries:0});
  const audio=await client.audio.speech.create({model:'gpt-4o-mini-tts',voice:'cedar',input:text,response_format:'mp3',instructions:'Speak '+language+' naturally, as a calm intelligent male assistant. Warm resonant voice, clear diction, conversational phrasing, natural pauses. No announcer or theatrical delivery. Do not add words.'});
  return new Response(audio.body,{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(e){return json({error:e.status===401?'Ключ сервиса озвучки отклонён.':e.status===429?'Лимит или баланс сервиса озвучки исчерпан.':'Сервис нейронной озвучки временно недоступен.'},e.status===429?429:502)}
}
export const config={path:'/api/speech',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
