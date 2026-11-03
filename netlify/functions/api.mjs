// Talgat AI 2.0 — server-side Groq proxy. Never expose GROQ_API_KEY to the browser.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const getEnv=(name)=>{try{return Netlify.env.get(name)}catch{return undefined}};
export default async function handler(request){
  const path=new URL(request.url).pathname;
  const key=getEnv("GROQ_API_KEY");
  if(path==="/api/status"){
    if(request.method!=="GET")return json({error:"Method not allowed"},405);
    return json({ok:true,ai_configured:Boolean(key),version:"2.0-staging",provider:"groq"});
  }
  if(path!=="/api/chat")return json({error:"Not found"},404);
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  if(!key)return json({error:"AI service is not configured"},503);
  let body;
  try{body=await request.json()}catch{return json({error:"Некорректный JSON в запросе"},400)}
  const message=typeof body?.message==="string"?body.message.trim():"";
  if(!message||message.length>12000)return json({error:"Введите вопрос длиной от 1 до 12000 символов"},400);
  const history=(Array.isArray(body.history)?body.history:[])
    .filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string")
    .slice(-12).map(m=>({role:m.role,content:m.content.slice(0,8000)}));
  const model=getEnv("GROQ_MODEL")||"llama-3.3-70b-versatile";
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
    let upstream=await fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",signal:controller.signal,
      headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,max_tokens:2048,temperature:0.4,
        messages:[{role:"system",content:"Ты Talgat AI 2.0, интеллектуальный помощник. Отвечай самостоятельно, по существу, на языке пользователя. Используй корректный Markdown, а для формул LaTeX. Не выдумывай факты, возможности, выполненные действия или ссылки. Если данных недостаточно, сообщай об ограничениях."},...history,{role:"user",content:message}]
      })
    });
    if(upstream.status===404||upstream.status===410){
      const available=await fetch("https://api.groq.com/openai/v1/models",{headers:{"Authorization":"Bearer "+key},signal:controller.signal});
      if(available.ok){
        const listing=await available.json();
        const ids=(listing.data||[]).filter(m=>m.active!==false&&typeof m.id==="string").map(m=>m.id);
        const candidates=["llama-3.3-70b-versatile","openai/gpt-oss-120b","qwen/qwen3-32b","openai/gpt-oss-20b","llama-3.1-8b-instant"].filter(id=>ids.includes(id)&&id!==model);
        for(const fallback of candidates.slice(0,2)){
          upstream=await fetch("https://api.groq.com/openai/v1/chat/completions",{
            method:"POST",signal:controller.signal,
            headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
            body:JSON.stringify({model:fallback,max_completion_tokens:2048,messages:[{role:"system",content:"Ты Talgat AI 2.0. Отвечай по существу на языке пользователя. Используй Markdown и LaTeX для формул. Не выдумывай факты или выполненные действия."},...history,{role:"user",content:message}]})
          });
          if(upstream.ok||![404,410].includes(upstream.status))break;
        }
      }
    }
    const raw=await upstream.text();
    let data;try{data=JSON.parse(raw)}catch{return json({error:"AI-провайдер вернул ответ не в формате JSON",upstream_status:upstream.status},502)}
    if(!upstream.ok){
      const code=upstream.status;
      const error=code===401?"Ключ AI-провайдера недействителен":code===429?"Превышен лимит запросов к модели":code===400?"Модель или параметры запроса отклонены AI-провайдером":"Ошибка AI-провайдера";
      return json({error,upstream_status:code,provider_code:typeof data?.error?.code==="string"?data.error.code.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80):undefined},code===429?429:502);
    }
    const answer=data?.choices?.[0]?.message?.content;
    if(typeof answer!=="string"||!answer.trim())return json({error:"Модель вернула пустой ответ"},502);
    return json({answer,model:data.model||model});
  }catch(e){
    return json({error:e?.name==="AbortError"?"Истекло время ожидания ответа AI":"Не удалось подключиться к AI-провайдеру"},e?.name==="AbortError"?504:502);
  }finally{clearTimeout(timer)}
}
export const config={path:["/api/status","/api/chat"]};
