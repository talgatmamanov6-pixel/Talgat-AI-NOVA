import OpenAI from 'openai';
const json=(data,status)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export default async function speech(req){
 if(req.method!=='POST')return json({error:'Используйте POST с текстом.'},405);
 let body;try{body=await req.json()}catch{return json({error:'Некорректный запрос.'},400)}
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(!text||text.length>1200)return json({error:'Для озвучки нужен текст от 1 до 1200 символов.'},400);
 try{
  const client=new OpenAI({timeout:25000,maxRetries:0});
  const result=await client.chat.completions.create({model:'gpt-audio-mini',modalities:['text','audio'],audio:{voice:'onyx',format:'mp3'},max_completion_tokens:700,messages:[{role:'system',content:'Ты озвучиваешь текст по-русски. Спокойный естественный мужской голос. Произнеси только переданный текст, без добавлений.'},{role:'user',content:text}]});
  const encoded=result.choices?.[0]?.message?.audio?.data;
  if(!encoded)return json({error:'Провайдер не вернул звук.'},503);
  return new Response(Buffer.from(encoded,'base64'),{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(e){return json({error:'Нейронная озвучка недоступна.',provider_status:Number.isInteger(e.status)?e.status:undefined,provider_code:typeof e.code==='string'?e.code.replace(/[^a-z_-]/gi,'').slice(0,60):undefined,reason:/endpoint|path|route/i.test(e.message)?'unsupported_endpoint':/model/i.test(e.message)?'unsupported_model':'provider_rejected'},503)}
}
export const config={path:'/api/speech',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
