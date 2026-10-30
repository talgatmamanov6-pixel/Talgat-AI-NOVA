import os,json,time,math,ast,operator,urllib.request,urllib.error,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from collections import defaultdict,deque
from urllib.parse import urlparse
PORT=int(os.environ.get("PORT","10000"))
API_KEY=os.environ.get("GROQ_API_KEY") or os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY","")
MODEL=os.environ.get("AI_MODEL") or os.environ.get("OPENAI_MODEL") or ("llama-3.3-70b-versatile" if os.environ.get("GROQ_API_KEY") and not (os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY")) else "gpt-4.1-mini")
BASE=(os.environ.get("AI_BASE_URL") or ("https://api.groq.com/openai/v1" if os.environ.get("GROQ_API_KEY") and not (os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY")) else "https://api.openai.com/v1")).rstrip("/")
REVIEW_MODEL=os.environ.get("AI_REVIEW_MODEL","")
MAX_TOKENS=int(os.environ.get("AI_MAX_TOKENS","1300"))
TOKENS=defaultdict(deque)
LOCK=threading.Lock()
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Mod:operator.mod}
def evaluate(value):
 if not isinstance(value,str) or len(value)>100:raise ValueError("Длинное выражение")
 def calc(node,depth=0):
  if depth>15:raise ValueError("Слишком сложная формула")
  if isinstance(node,ast.Constant) and type(node.value) in (int,float):return node.value
  if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)):
   v=calc(node.operand,depth+1);return v if isinstance(node.op,ast.UAdd) else -v
  if isinstance(node,ast.BinOp) and type(node.op) in OPS:
   a,b=calc(node.left,depth+1),calc(node.right,depth+1)
   if abs(a)>1e12 or abs(b)>1e12:raise ValueError("Слишком большие числа")
   result=OPS[type(node.op)](a,b)
   if not math.isfinite(result):raise ValueError("Неопределённый результат")
   return result
  raise ValueError("Поддерживаются числа, скобки и + - * / %")
 return calc(ast.parse(value,mode="eval").body)
def complete(messages,model):
 data=json.dumps({"model":model,"messages":messages,"temperature":0.3,"max_tokens":MAX_TOKENS}).encode()
 router_key=os.environ.get("OPENROUTER_API_KEY","")
 routes=[]
 if "openrouter.ai" in BASE:
  if router_key or API_KEY:routes.append((BASE,router_key or API_KEY,os.environ.get("OPENROUTER_MODEL",model)))
 elif API_KEY:routes.append((BASE,API_KEY,model))
 if router_key and "openrouter.ai" not in BASE:
  routes.append(("https://openrouter.ai/api/v1",router_key,os.environ.get("OPENROUTER_MODEL","openrouter/free")))
 last_error=None
 for base,key,selected_model in routes:
  payload=json.dumps({"model":selected_model,"messages":messages,"temperature":0.3,"max_tokens":MAX_TOKENS}).encode()
  req=urllib.request.Request(base+"/chat/completions",data=payload,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"})
  try:
   with urllib.request.urlopen(req,timeout=48) as response:return json.load(response)["choices"][0]["message"]["content"]
  except urllib.error.HTTPError as exc:
   last_error=exc
   if exc.code not in (401,403,404,429,500,502,503):raise
  except (urllib.error.URLError,TimeoutError) as exc:last_error=exc
 if last_error:raise last_error
 raise RuntimeError("No AI provider configured")
def plan(task):
 return ["Определить конечную цель, ограничения и критерии успеха","Разделить запрос на независимые проверяемые задачи","Найти доказательства и отметить неопределённости","Составить решение и проверить ошибки","Подготовить практические следующие действия"]
def offline_answer(q):
 t=q.lower().strip()
 if any(x in t for x in ("что умеешь","помощь","возможност")):return "Я NOVA. Сейчас доступны голосовой ввод и озвучивание в браузере, планирование задач и вычисления. Полноценный диалог с языковой моделью пока недоступен из-за ошибки облачного провайдера."\n if any(x in t for x in ("привет","здравствуй","добрый день","салам","сәлем","ассаламу","алейкум")):return "Привет! Я NOVA. Сейчас могу составлять планы и выполнять расчёты. Облачная языковая модель пока недоступна."
 if any(x in t for x in ("что умеешь","помощь","возможност")):return "Без API-ключа доступны: планирование задач, арифметика и голосовое управление браузера. Напиши «план: создать сайт» или «посчитай: (12+4)*3»."
 if t.startswith(("план:","план ","составь план")):
  goal=q.split(":",1)[-1].strip() if ":" in q else q
  return "План по задаче «"+goal[:150]+"»:\\n"+ "\\n".join(str(i+1)+". "+step for i,step in enumerate(plan(goal)))
 if t.startswith(("посчитай:","вычисли:","считай:")):
  expr=q.split(":",1)[-1].strip()
  try:return "Результат: "+str(evaluate(expr))
  except Exception:return "Не удалось вычислить. Используй числа, скобки, +, -, *, /, %."
 return "Я работаю без ключа в ограниченном автономном режиме и не стану выдумывать ответ. Могу составить план: напиши «план: "+q[:100]+"». Для полноценной беседы потребуется локальная модель на мощном устройстве или облачный API."

PAGE=r"""<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b1324"><title>Talgat AI NOVA</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#eaf5ff;background:#090f1e}*{box-sizing:border-box}body{margin:0}main{max-width:850px;margin:auto;min-height:100dvh;display:flex;flex-direction:column;padding:16px}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #263b54;padding-bottom:14px}h1{font-size:22px;margin:0;color:#8df4ce}.sub{color:#93a9c4;font-size:12px}.mode{background:#18283e;color:#fff;border:1px solid #385371;border-radius:12px;padding:8px}#chat{flex:1;overflow-y:auto;padding:18px 0;min-height:40vh}.bubble{padding:12px 15px;border-radius:15px;margin-bottom:11px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.me{background:#164c46;margin-left:14%}.ai{background:#19273c;margin-right:8%}.note{color:#a9bdd5;background:#122036;padding:12px;border-radius:12px}footer{position:sticky;bottom:0;background:#090f1e;padding:9px 0 3px}textarea{width:100%;min-height:70px;max-height:160px;resize:vertical;border:1px solid #3b526e;background:#101c2e;border-radius:14px;color:white;padding:12px;font:inherit}button{background:#36c4a5;color:#04211b;border:0;border-radius:12px;padding:11px 15px;font-weight:700;cursor:pointer}button.secondary{background:#1e3047;color:#cfebf5}.tools{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-top:9px}small{color:#829bb6}button:disabled{opacity:.5}</style>
<main><div class="head"><div><h1>✦ Talgat AI NOVA</h1><div class="sub">Многоэтапный интеллектуальный помощник</div></div><select id="mode" class="mode"><option value="chat">Чат</option><option value="think">Глубокий ответ</option><option value="plan">Планировщик</option><option value="calculate">Калькулятор</option></select></div>
<div id="chat"><div class="note">Добро пожаловать в Talgat AI NOVA. Планирование и калькулятор работают без облачного ключа. Чат и глубокие ответы требуют подключения модели администратором. Данные этой истории хранятся в браузере.</div></div>
<footer><textarea id="question" placeholder="Напиши задачу для Talgat AI..."></textarea><div class="tools"><button id="send">Отправить ↗</button><button class="secondary" id="clear">Очистить историю</button><small id="status">Проверка сервера...</small></div></footer></main>
<script>
const area=document.getElementById('chat'),q=document.getElementById('question'),send=document.getElementById('send'),mode=document.getElementById('mode'),status=document.getElementById('status');
let history=[];try{history=JSON.parse(localStorage.getItem('nova-history')||'[]');if(!Array.isArray(history))history=[]}catch(e){history=[]}
function add(role,text,store=true){let el=document.createElement('div');el.className='bubble '+(role==='user'?'me':'ai');el.textContent=text;area.append(el);area.scrollTop=area.scrollHeight;if(store){history.push({role,content:text});history=history.slice(-40);localStorage.setItem('nova-history',JSON.stringify(history))}}
history.forEach(m=>{if(m&&typeof m.content==='string')add(m.role,m.content,false)});
function refresh(){fetch('/api/status').then(r=>r.json()).then(d=>status.textContent=d.ai_configured?'Модель подключена':'Режим без API-ключа').catch(()=>status.textContent='Нет связи')}
refresh();
async function run(){const text=q.value.trim();if(!text)return;const selected=mode.value;const context=history.slice(-12);add('user',text);q.value='';send.disabled=true;status.textContent='Обработка...';try{let endpoint=selected==='calculate'?'/api/nova/calculate':selected==='plan'?'/api/nova/plan':selected==='think'?'/api/nova/think':'/api/chat';let data=selected==='calculate'?{expression:text}:selected==='plan'?{task:text}:{message:text,history:context};let r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let out=await r.json();let answer=out.answer||out.error||(out.steps?out.steps.map((s,i)=>(i+1)+'. '+s).join('\n'):out.result!==undefined?String(out.result):'Нет результата');add('assistant',answer)}catch(e){add('assistant','Ошибка соединения с сервером')}finally{send.disabled=false;refresh()}}
send.onclick=run;q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();run()}});
document.getElementById('clear').onclick=()=>{history=[];localStorage.removeItem('nova-history');area.querySelectorAll('.bubble').forEach(x=>x.remove())}
</script></html>"""
class Handler(BaseHTTPRequestHandler):
 def respond(self,status,obj):
  data=json.dumps(obj,ensure_ascii=False).encode()
  self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Cache-Control","no-store");self.send_header("X-Content-Type-Options","nosniff");self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
 def do_HEAD(self):
  p=urlsplit(self.path).path
  if p in ("/","/api/status","/favicon.ico"):
   self.send_response(200 if p!="/favicon.ico" else 204)
   self.send_header("Content-Length","0")
   self.end_headers()
  else:
   self.send_response(404);self.send_header("Content-Length","0");self.end_headers()
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=="/favicon.ico":
   self.send_response(204);self.send_header("Content-Length","0");self.end_headers();return
  if path=="/api/status":return self.respond(200,{"ok":True,"ai_configured":bool(API_KEY or os.environ.get("OPENROUTER_API_KEY")),"version":"nova-2","review_available":bool(REVIEW_MODEL),"offline_available":True,"provider_verified":False,"openrouter_fallback_configured":bool(os.environ.get("OPENROUTER_API_KEY")),"provider":"groq" if "api.groq.com" in BASE else "custom" if BASE!="https://api.openai.com/v1" else "openai"})
  if path!="/":return self.respond(404,{"error":"Not found"})
  data=open(os.path.join(os.path.dirname(__file__),"hologram.html"),encoding="utf-8").read().encode();self.send_response(200);self.send_header("Content-Type","text/html; charset=utf-8");self.send_header("X-Content-Type-Options","nosniff");self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  path=urlsplit(self.path).path
  if path not in ("/api/chat","/api/nova/think","/api/nova/plan","/api/nova/calculate"):return self.respond(404,{"error":"Not found"})
  ip=self.client_address[0]
  with LOCK:
   dq=TOKENS[ip];now=time.monotonic()
   while dq and now-dq[0]>60:dq.popleft()
   if len(dq)>=20:return self.respond(429,{"error":"Слишком много запросов. Попробуйте через минуту."})
   dq.append(now)
  try:
   length=int(self.headers.get("Content-Length","0"))
   if length<1 or length>25000:return self.respond(413,{"error":"Размер запроса превышен"})
   d=json.loads(self.rfile.read(length))
   if not isinstance(d,dict):return self.respond(400,{"error":"Некорректный JSON"})
   if path=="/api/nova/calculate":
    try:return self.respond(200,{"result":evaluate(d.get("expression",""))})
    except Exception as e:return self.respond(400,{"error":"Ошибка выражения: "+str(e)})
   if path=="/api/nova/plan":
    task=d.get("task","")
    if not isinstance(task,str) or not task.strip() or len(task)>6000:return self.respond(400,{"error":"Введите задачу"})
    return self.respond(200,{"steps":plan(task),"goal":task})
   question=d.get("message","")
   if not isinstance(question,str) or not question.strip() or len(question)>6000:return self.respond(400,{"error":"Введите вопрос до 6000 символов"})
   if not (API_KEY or os.environ.get("OPENROUTER_API_KEY")):return self.respond(200,{"answer":offline_answer(question),"mode":"offline","reviewed":False})
   context=[]
   for m in (d.get("history") if isinstance(d.get("history"),list) else [])[-12:]:
    if isinstance(m,dict) and m.get("role") in ("user","assistant") and isinstance(m.get("content"),str):
     context.append({"role":m["role"],"content":m["content"][:2500]})
   sys="Ты Talgat AI NOVA. Пиши на языке пользователя; отвечай точно, отмечай неопределённость, не выдумывай источники и доступные инструменты. Не утверждай, что ты сверхинтеллект или учишься самостоятельно."
   if path=="/api/nova/think":sys+=" Разбери задачу на шаги, проверь логические ошибки и факты, затем дай структурированный практический ответ."
   answer=complete([{"role":"system","content":sys}]+context+[{"role":"user","content":question}],MODEL)
   reviewed=False
   if path=="/api/nova/think" and REVIEW_MODEL:
    try:
     check=complete([{"role":"system","content":"Ты редактор-проверяющий: исправь необоснованные выводы и логические ошибки в тексте. Верни только полезный улучшенный ответ."},{"role":"user","content":"Запрос: "+question+"\n\nТекст: "+answer}],REVIEW_MODEL)
     if isinstance(check,str) and check.strip():answer=check;reviewed=True
    except Exception:pass
   return self.respond(200,{"answer":answer,"mode":"online","reviewed":reviewed})
  except urllib.error.HTTPError as e:
   return self.respond(200,{"answer":offline_answer(question),"mode":"offline","provider_error_code":e.code,"notice":"Облачный ИИ недоступен. Используется ограниченный автономный режим."})
  except Exception:return self.respond(200,{"answer":offline_answer(question),"mode":"offline","notice":"Облачный ИИ временно недоступен. Используется ограниченный автономный режим."})
if __name__=="__main__":ThreadingHTTPServer(("0.0.0.0",PORT),Handler).serve_forever()
