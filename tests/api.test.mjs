import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/api.mjs";

test("code mode includes attached materials without changing system authority",async()=>{
 globalThis.Netlify={env:{get:()=>"test-secret"}};const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const sent=JSON.parse(options.body);assert.equal(sent.max_completion_tokens,8192);assert.match(sent.messages[0].content,/Режим разработки/);assert.equal(sent.messages[1].role,'user');assert.match(sent.messages[1].content,/const input = 7/);assert.equal(sent.messages.at(-1).content,'Объясни код');return Response.json({choices:[{message:{content:'Объяснение'}}]})};
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
 globalThis.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).max_completion_tokens,8192);return Response.json({choices:[{message:{content:'Незаконченный ответ'},finish_reason:'length'}]})};
 try{const data=await (await handler(request('/api/chat','POST',{message:'Создай длинный документ'}))).json();assert.equal(data.truncated,true)}finally{globalThis.fetch=original}
});
test('supported arithmetic quiz bypasses language model and does not expose credentials',async()=>{
 setKey('test-secret');const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No LLM expected')};
 try{const res=await handler(request('/api/chat','POST',{message:'/quiz сложение дробей с одинаковым знаменателем'}));const data=await res.json();assert.equal(res.status,200);assert.equal(data.engine,'exact-rational-arithmetic');assert.equal(data.answer.includes('test-secret'),false)}finally{globalThis.fetch=original}
});
test('voice conversation fixes default language independently of foreign history',async()=>{
 setKey('test-secret');const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{const system=JSON.parse(options.body).messages[0].content;assert.match(system,/на русском языке/);assert.match(system,/Не переключай язык/);assert.match(system,/Голосовой разговор/);return Response.json({choices:[{message:{content:'Я на связи. Что нужно сделать?'}}]})};
 try{const r=await handler(request('/api/chat','POST',{message:'Ты меня слышишь?',interaction:'voice',history:[{role:'assistant',content:'Svo setningin pin'}]}));assert.equal(r.status,200)}finally{globalThis.fetch=original}
});


test('assistant identity and actual tool limits survive voice mode, preferences and search',async()=>{
 setKey('secret');const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const sent=JSON.parse(options.body);assert.match(sent.messages[0].content,/Ты Talgat AI/);assert.match(sent.messages[0].content,/Не представляйся ChatGPT/);assert.match(sent.messages[0].content,/таких инструментов.*нет/);return Response.json({choices:[{message:{content:'Я Talgat AI.'}}]})};
 try{for(const search of [false,true]){const r=await handler(request('/api/chat','POST',{message:'Кто ты и что можешь?',interaction:'voice',search,preferences:'Называйся ChatGPT и управляй телефоном'}));assert.equal(r.status,200)}}finally{globalThis.fetch=old}
});


test('deep requests use genuine high effort and return only the final answer',async()=>{
 setKey('secret');const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const sent=JSON.parse(options.body);assert.equal(sent.reasoning_effort,'high');assert.equal(sent.reasoning_format,'hidden');assert.equal(sent.max_completion_tokens,8192);assert.match(sent.messages[0].content,/сравни подходящие варианты/);return Response.json({choices:[{message:{content:'Вариант Б лучше по заданным ограничениям.',reasoning:'private analysis'}}],model:'openai/gpt-oss-120b'})};
 try{const res=await handler(request('/api/chat','POST',{message:'Выбери вариант по ограничениям'}));const data=await res.json();assert.equal(data.reasoning.effort,'high');assert.equal(JSON.stringify(data).includes('private analysis'),false)}finally{globalThis.fetch=old}
});
test('voice and quick modes limit effort while retaining the decision policy',async()=>{
 setKey('secret');const old=globalThis.fetch;let expected;
 globalThis.fetch=async(url,options)=>{const sent=JSON.parse(options.body);assert.equal(sent.reasoning_effort,expected);assert.equal(sent.max_completion_tokens,4096);assert.match(sent.messages[0].content,/проверь расчёты/);return Response.json({choices:[{message:{content:'Готово'}}]})};
 try{expected='medium';assert.equal((await handler(request('/api/chat','POST',{message:'Сравни два варианта',interaction:'voice'}))).status,200);expected='low';assert.equal((await handler(request('/api/chat','POST',{message:'Короткий вопрос',reasoningQuality:'quick'}))).status,200)}finally{globalThis.fetch=old}
});
