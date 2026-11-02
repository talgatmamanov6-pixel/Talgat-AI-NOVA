const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default async function handler(request){
 const path=new URL(request.url).pathname.split("/").slice(-2).join("/");
 const key=Netlify.env.get("GROQ_API_KEY")||Netlify.env.get("OPENAI_API_KEY");
 if(request.method==="GET")return reply({ok:true,ai_configured:Boolean(key),version:"2.0-staging"});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400)}
 const message=String(body.message||"").trim();
 if(!message||message.length>6000)return reply({error:"Введите вопрос до 6000 символов"},400);
 if(!key)return reply({error:"Для работы модели нужен серверный API-ключ",code:"NO_API_KEY"},503);
 const groq=Boolean(Netlify.env.get("GROQ_API_KEY"));
 const base=groq?"https://api.groq.com/openai/v1":"https://api.openai.com/v1";
 const model=Netlify.env.get("AI_MODEL")||(groq?"llama-3.3-70b-versatile":"gpt-4.1-mini");
 try{
  const upstream=await fetch(base+"/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:"Ты Talgat AI NOVA. Отвечай понятно и точно на языке пользователя."},{role:"user",content:message}],max_tokens:1200})});
  if(!upstream.ok)return reply({error:"Ошибка ИИ-провайдера",status:upstream.status},502);
  const data=await upstream.json();return reply({answer:data.choices[0].message.content,mode:"online"});
 }catch{return reply({error:"Нет соединения с ИИ-провайдером"},502)}
}