const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default async function handler(request){
 const path=new URL(request.url).pathname;
 const key=Netlify.env.get("GROQ_API_KEY");
 if(path.endsWith("/status"))return request.method==="GET"?reply({ok:true,ai_configured:!!key,version:"2.0-staging"}):reply({error:"Method not allowed"},405);
 if(!path.endsWith("/chat"))return reply({error:"Not found"},404);
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 if(!key)return reply({error:"AI service is not configured"},503);
 let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400)}
 const message=typeof body?.message==="string"?body.message.trim():"";
 if(!message||message.length>12000)return reply({error:"Введите вопрос до 12000 символов"},400);
 const history=Array.isArray(body.history)?body.history.slice(-12).filter(x=>["user","assistant"].includes(x?.role)&&typeof x.content==="string").map(x=>({role:x.role,content:x.content.slice(0,12000)})):[];
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
 const upstream=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"Ты Talgat AI 2.0. Отвечай на языке пользователя, точно и понятно. Используй Markdown и LaTeX при необходимости."},...history,{role:"user",content:message}],max_tokens:1800,temperature:0.5}),signal:controller.signal});
 const data=await upstream.json().catch(()=>({}));
 if(!upstream.ok)return reply({error:upstream.status===429?"Слишком много запросов, повторите позже":"Ошибка AI-сервиса",upstream_status:upstream.status},upstream.status===429?429:502);
 const answer=data?.choices?.[0]?.message?.content;
 return typeof answer==="string"&&answer.trim()?reply({answer}):reply({error:"Пустой ответ модели"},502);
 }catch(e){return reply({error:e?.name==="AbortError"?"Превышено время ожидания":"Не удалось связаться с AI-сервисом"},504)}finally{clearTimeout(timer)}
}
export const config={path:["/api/status","/api/chat"]};
