import OpenAI from 'openai';
const json=(data,status)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export default async function speech(req){
 if(req.method!=='POST')return json({error:'Используйте POST с текстом.'},405);
 let body;try{body=await req.json()}catch{return json({error:'Некорректный запрос.'},400)}
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(!text||text.length>1200)return json({error:'Для озвучки нужен текст от 1 до 1200 символов.'},400);
 try{
  const client=new OpenAI({timeout:25000,maxRetries:0});
  const audio=await client.audio.speech.create({model:'gpt-4o-mini-tts',voice:'cedar',input:text,response_format:'mp3',instructions:'Speak Russian naturally, as a calm intelligent male assistant. Warm resonant voice, clear diction, conversational phrasing, natural pauses. No announcer or theatrical delivery. Do not add words.'});
  return new Response(audio.body,{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(e){return json({error:'Нейронная озвучка недоступна.',provider_status:Number.isInteger(e.status)?e.status:undefined,provider_code:typeof e.code==='string'?e.code.replace(/[^a-z_-]/gi,'').slice(0,60):undefined,reason:/endpoint|path|route/i.test(e.message)?'unsupported_endpoint':/model/i.test(e.message)?'unsupported_model':'provider_rejected'},503)}
}
export const config={path:'/api/speech',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
