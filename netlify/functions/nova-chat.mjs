// Server-side integration point for TALGAT AI NOVA.
// IMPORTANT: Existing talgat-ai.netlify.app /api/chat is on a separate
// Netlify Drop deployment; this file does not modify that deployment.
import knowledge from "../../app/src/main/assets/knowledge.json" with { type: "json" };
const words=s=>(String(s||"").toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu)||[]);
function contextFor(question) {
 const q=new Set(words(question));
 const ranked=knowledge.map(d=>({...d,score:[...q].filter(t=>new Set(words(d.text)).has(t)).length}))
  .filter(d=>d.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
 return {context:ranked.map(d=>`Источник: ${d.source}\n${d.text}`).join("\n\n"),sources:ranked.map(d=>d.source)};
}
export default async function handler(request) {
 if(request.method!=="POST")return Response.json({error:"POST required"},{status:405});
 let body;
 try{body=await request.json()}catch{return Response.json({error:"Invalid JSON"},{status:400})}
 const message=String(body.message||body.question||"").slice(0,4000);
 if(!message.trim())return Response.json({error:"message required"},{status:400});
 const {context,sources}=contextFor(message);
 const system="Ты TALGAT AI NOVA. Отвечай точно на языке пользователя. Используй извлечённые материалы только если они относятся к вопросу. Указывай источники. Не придумывай сведения.";
 const model=Netlify.env.get("NOVA_MODEL")||"";
 const endpoint=Netlify.env.get("NOVA_LLM_ENDPOINT")||"";
 const key=Netlify.env.get("NOVA_LLM_API_KEY")||"";
 if(!endpoint||!model)return Response.json({error:"LLM not configured",sources,setup:"Set NOVA_LLM_ENDPOINT and NOVA_MODEL (and NOVA_LLM_API_KEY if needed) as server-side environment variables"},{status:503});
 const messages=[{role:"system",content:system+(context?"\n\nМатериалы пользователя:\n"+context:"")},{role:"user",content:message}];
 try {
  const headers={"content-type":"application/json"};
  if(key)headers.authorization="Bearer "+key;
  const upstream=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({model,messages,stream:false})});
  const result=await upstream.json();
  if(!upstream.ok)return Response.json({error:"LLM request failed",status:upstream.status},{status:502});
  const answer=result.choices?.[0]?.message?.content;
  if(typeof answer!=="string")return Response.json({error:"Unexpected model response"},{status:502});
  return Response.json({answer,sources});
 }catch(e){return Response.json({error:"LLM unreachable"},{status:502})}
}
export const config={path:"/api/nova-chat"};
