// TALGAT AI NOVA: retrieval-augmented context API.
// POST JSON {"question":"..."} -> {context, sources, instruction}.
// The client/server calling the actual LLM must prepend the returned context
// to its LLM prompt; this endpoint does NOT itself invoke or train a model.
import knowledge from "../../app/src/main/assets/knowledge.json" with { type: "json" };
const words = s => (String(s||"").toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu)||[]);
function retrieve(question) {
 const q = new Set(words(question));
 return knowledge.map(d => {
  const terms = new Set(words(d.text));
  const score = [...q].filter(t=>terms.has(t)).length;
  return {source:d.source,text:d.text,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
}
export default async (request) => {
 if(request.method!=="POST")return new Response(JSON.stringify({error:"Use POST"}),{status:405,headers:{"content-type":"application/json"}});
 let body;
 try{body=await request.json();}catch{return new Response(JSON.stringify({error:"Invalid JSON"}),{status:400,headers:{"content-type":"application/json"}});}
 const question=String(body.question||"").slice(0,4000);
 if(!question.trim())return new Response(JSON.stringify({error:"question required"}),{status:400,headers:{"content-type":"application/json"}});
 const sources=retrieve(question);
 const context=sources.map(s=>`Источник: ${s.source}\n${s.text}`).join("\n\n");
 return new Response(JSON.stringify({
  instruction:"Используй контекст только когда он относится к вопросу. Не выдумывай сведения и указывай источники. Если данных недостаточно, скажи об этом.",
  context,sources:sources.map(({source,score})=>({source,score})),
  integration:"Pass instruction and context into the server-side LLM messages before calling the model"
 }),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
};
export const config={path:"/api/knowledge"};
