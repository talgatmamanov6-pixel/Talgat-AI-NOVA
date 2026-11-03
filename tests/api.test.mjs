import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/api.mjs";

test("code mode includes attached materials without changing system authority",async()=>{
 globalThis.Netlify={env:{get:()=>"test-secret"}};const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const sent=JSON.parse(options.body);assert.equal(sent.max_completion_tokens,4096);assert.match(sent.messages[0].content,/Режим разработки/);assert.equal(sent.messages[1].role,'user');assert.match(sent.messages[1].content,/const input = 7/);assert.equal(sent.messages.at(-1).content,'Объясни код');return Response.json({choices:[{message:{content:'Объяснение'}}]})};
 try{const body=JSON.stringify({message:'Объясни код',mode:'code',materials:'const input = 7'});const res=await handler(new Request('https://site/api/chat',{method:'POST',body}));assert.equal(res.status,200)}finally{globalThis.fetch=original}
});

const request=(path,method="GET",body)=>new Request("https://example.netlify.app"+path,{method,...(body!==undefined?{headers:{"content-type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body)}:{})});
const setKey=(value)=>{globalThis.Netlify={env:{get:name=>name==="GROQ_API_KEY"?value:undefined}}};

test("status returns JSON without secrets",async()=>{
  setKey("test-secret");
  const res=await handler(request("/api/status"));
  const data=await res.json();
  assert.equal(res.status,200);assert.equal(data.ai_configured,true);
  assert.equal(JSON.stringify(data).includes("test-secret"),false);
});
test("status reports missing key",async()=>{
  setKey(undefined);
  const data=await (await handler(request("/api/status"))).json();
  assert.equal(data.ai_configured,false);
});
test("chat rejects missing key",async()=>{
  setKey(undefined);
  const res=await handler(request("/api/chat","POST",{message:"Привет"}));
  assert.equal(res.status,503);
});
test("chat rejects malformed JSON",async()=>{
  setKey("test-secret");
  const res=await handler(request("/api/chat","POST","{invalid"));
  assert.equal(res.status,400);
});
test("chat returns actual provider answer and hides key",async()=>{
  setKey("test-secret");
  const old=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/api\.groq\.com/);
    assert.equal(options.headers.Authorization,"Bearer test-secret");
    return new Response(JSON.stringify({choices:[{message:{content:"Ответ **готов**"}}],model:"mock-model"}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const res=await handler(request("/api/chat","POST",{message:"Привет"}));
    const data=await res.json();
    assert.equal(res.status,200);assert.equal(data.answer,"Ответ **готов**");
    assert.equal(JSON.stringify(data).includes("test-secret"),false);
  }finally{globalThis.fetch=old}
});
test("provider HTML error is still JSON to browser",async()=>{
  setKey("test-secret");
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response("<html>bad gateway</html>",{status:502});
  try{
    const res=await handler(request("/api/chat","POST",{message:"Привет"}));
    assert.equal(res.status,502);
    assert.match(res.headers.get("content-type"),/application\/json/);
    assert.equal(typeof(await res.json()).error,"string");
  }finally{globalThis.fetch=old}
});
test("provider 429 is reported as JSON 429",async()=>{
  setKey("test-secret");
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:"rate limit"}}),{status:429});
  try{
    const res=await handler(request("/api/chat","POST",{message:"Привет"}));
    assert.equal(res.status,429);
    assert.equal((await res.json()).upstream_status,429);
  }finally{globalThis.fetch=old}
});
test('provider length cutoff is explicitly reported',async()=>{
 setKey('test-secret');const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).max_completion_tokens,4096);return Response.json({choices:[{message:{content:'Незаконченный ответ'},finish_reason:'length'}]})};
 try{const data=await (await handler(request('/api/chat','POST',{message:'Создай длинный документ'}))).json();assert.equal(data.truncated,true)}finally{globalThis.fetch=original}
});
test('supported arithmetic quiz bypasses language model and does not expose credentials',async()=>{
 setKey('test-secret');const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No LLM expected')};
 try{const res=await handler(request('/api/chat','POST',{message:'/quiz сложение дробей с одинаковым знаменателем'}));const data=await res.json();assert.equal(res.status,200);assert.equal(data.engine,'exact-rational-arithmetic');assert.equal(data.answer.includes('test-secret'),false)}finally{globalThis.fetch=original}
});
