// TALGAT AI NOVA — grounded multi-turn assistant with bounded tool execution.
// Deploy separately; the existing Netlify Drop /api/chat remains unchanged.
import knowledge from "../../app/src/main/assets/knowledge.json" with { type: "json" };
const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});
const words=s=>(String(s||"").toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu)||[]);
function retrieve(question){
 const q=new Set(words(question));
 return knowledge.map(d=>({source:d.source,text:d.text,score:[...q].filter(t=>new Set(words(d.text)).has(t)).length}))
  .filter(d=>d.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
}
function calculate(expression){
 const s=String(expression).replace(/\s+/g,"");
 if(s.length>120||!/^[\d.+*/()%-]+$/.test(s))throw Error("Разрешены только числа и арифметические операции");
 const tokens=s.match(/\d+(?:\.\d+)?|[()+*/%-]/g);
 if(!tokens||tokens.join("")!==s)throw Error("Неверное выражение");
 const output=[],ops=[],priority={"+":1,"-":1,"*":2,"/":2,"%":2};
 let expectNumber=true;
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(/^\d/.test(t)){if(!expectNumber)throw Error("Синтаксис");output.push(Number(t));expectNumber=false}
  else if(t==="("){if(!expectNumber)throw Error("Синтаксис");ops.push(t)}
  else if(t===")"){while(ops.length&&ops.at(-1)!=="(")output.push(ops.pop());if(ops.pop()!=="(")throw Error("Скобки");expectNumber=false}
  else if(t==="-"&&expectNumber){output.push(0);ops.push("-")}
  else {if(expectNumber)throw Error("Синтаксис");while(ops.length&&priority[ops.at(-1)]>=priority[t])output.push(ops.pop());ops.push(t);expectNumber=true}
 }
 if(expectNumber)throw Error("Синтаксис");
 while(ops.length){const op=ops.pop();if(op==="(")throw Error("Скобки");output.push(op)}
 const stack=[];for(const x of output){if(typeof x==="number")stack.push(x);else{const b=stack.pop(),a=stack.pop();if(a===undefined||b===undefined)throw Error("Синтаксис");const n=x==="+"?a+b:x==="-"?a-b:x==="*"?a*b:x==="/"?a/b:a%b;if(!Number.isFinite(n))throw Error("Недопустимый результат");stack.push(n)}}
 if(stack.length!==1)throw Error("Синтаксис");return stack[0];
}
const tools=[{type:"function",function:{name:"knowledge_search",description:"Найти факты в материалах пользователя; не выдавать их за универсальную истину.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},{type:"function",function:{name:"calculate",description:"Точно вычислить арифметическое выражение.",parameters:{type:"object",properties:{expression:{type:"string"}},required:["expression"]}}}];
const system=`Ты TALGAT AI NOVA — практичный, точный русскоязычный интеллектуальный помощник.
Отвечай своим ясным, законченным ответом, а не списком ссылок. Ссылки давай только когда пользователь просит источники, адреса или переходы. Не имитируй выполненные действия.
Для фактов из пользовательских материалов используй knowledge_search; для вычислений calculate. Учитывай историю разговора. Не утверждай, что обучил свои веса, имеешь сознание, непрерывно самообучаешься или можешь управлять телефоном без доступного инструмента.
Если пользователь просит действие, выполни его только при наличии реального разрешённого инструмента; иначе чётко скажи, что именно не выполнено и что нужно для запуска. Перед необратимыми действиями запроси подтверждение.
Будь инициативной, но не подменяй выполнение обещаниями. При неопределённости уточняй факты и отделяй гипотезы от доказательств.`;
export default async function handler(request){
 if(request.method!=="POST")return json({error:"POST required"},405);
 let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
 const prompt=String(body.message||body.question||"").slice(0,6000);
 if(!prompt.trim())return json({error:"message required"},400);
 const endpoint=Netlify.env.get("NOVA_LLM_ENDPOINT")||"",model=Netlify.env.get("NOVA_MODEL")||"",key=Netlify.env.get("NOVA_LLM_API_KEY")||"";
 if(!endpoint||!model)return json({error:"LLM not configured",setup:"Configure NOVA_LLM_ENDPOINT and NOVA_MODEL in Netlify server environment"},503);
 if(!/^https:\/\//.test(endpoint))return json({error:"LLM endpoint must use HTTPS"},503);
 const history=Array.isArray(body.history)?body.history.slice(-16).filter(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,4000)})):[];
 const messages=[{role:"system",content:system},...history,{role:"user",content:prompt}];
 const headers={"content-type":"application/json"};if(key)headers.authorization="Bearer "+key;
 const usedSources=new Set();const executed=[];
 try{
  for(let step=0;step<4;step++){
   const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({model,messages,tools,tool_choice:"auto",temperature:0.35,stream:false})});
   if(!response.ok)return json({error:"Model request failed",status:response.status},502);
   const result=await response.json(),reply=result.choices?.[0]?.message;
   if(!reply)return json({error:"Invalid model response"},502);
   if(!Array.isArray(reply.tool_calls)||!reply.tool_calls.length)return json({answer:String(reply.content||""),sources:[...usedSources],actions:executed});
   messages.push(reply);
   for(const call of reply.tool_calls.slice(0,4)){
    let output;
    try{
     const args=JSON.parse(call.function?.arguments||"{}");
     if(call.function?.name==="knowledge_search"){const found=retrieve(String(args.query||""));found.forEach(d=>usedSources.add(d.source));output={matches:found}}
     else if(call.function?.name==="calculate")output={result:calculate(args.expression)};
     else output={error:"Unknown tool"};
    }catch(e){output={error:String(e.message||e)}}
    executed.push({tool:call.function?.name,success:!output.error});
    messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(output)});
   }
  }
  return json({error:"Tool step limit reached; retry with a narrower task",actions:executed},422);
 }catch{return json({error:"Model unavailable; no action performed"},502)}
}
export const config={path:"/api/nova-chat"};
