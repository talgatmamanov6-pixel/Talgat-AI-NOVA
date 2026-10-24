import os,json,urllib.request,urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
PORT=int(os.environ.get("PORT","10000"))
API_KEY=os.environ.get("OPENAI_API_KEY","")
MODEL=os.environ.get("OPENAI_MODEL","gpt-4.1-mini")
PAGE='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Talgat AI NOVA</title><style>body{background:#111927;color:white;font:16px system-ui;max-width:700px;margin:auto;padding:20px}h1{color:#67e5c2}textarea{width:100%;height:120px;background:#222e40;color:white;border:1px solid #60758a;border-radius:10px;padding:10px;box-sizing:border-box}button{padding:13px;background:#39c8a9;border:0;border-radius:10px;font-weight:bold}pre{white-space:pre-wrap;background:#222e40;padding:15px;border-radius:10px}</style><h1>Talgat AI NOVA</h1><p>Прототип ИИ-помощника</p><textarea id="q" placeholder="Ваш вопрос"></textarea><p><button onclick="send()">Отправить</button></p><pre id="out">Готов к работе. Для ответов ИИ необходим API-ключ администратора.</pre><script>async function send(){let q=document.getElementById('q').value;let o=document.getElementById('out');o.textContent='Обработка...';try{let r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q})});let d=await r.json();o.textContent=d.answer||d.error||'Нет ответа'}catch(e){o.textContent='Ошибка соединения'}}</script></html>'''
class Handler(BaseHTTPRequestHandler):
 def sendjson(self,status,obj):
  data=json.dumps(obj,ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  if self.path=='/api/status':return self.sendjson(200,{'ok':True,'ai_configured':bool(API_KEY)})
  if self.path!='/':return self.sendjson(404,{'error':'Not found'})
  data=PAGE.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path!='/api/chat':return self.sendjson(404,{'error':'Not found'})
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n<1 or n>10000:return self.sendjson(413,{'error':'Некорректный размер'})
   q=json.loads(self.rfile.read(n)).get('message','')
   if not isinstance(q,str) or not q.strip() or len(q)>6000:return self.sendjson(400,{'error':'Введите вопрос'})
   if not API_KEY:return self.sendjson(503,{'error':'ИИ ещё не подключён. Требуется API-ключ администратора.'})
   payload=json.dumps({'model':MODEL,'messages':[{'role':'system','content':'Ты Talgat AI NOVA. Отвечай полезно и достоверно на русском языке.'},{'role':'user','content':q}]}).encode()
   request=urllib.request.Request('https://api.openai.com/v1/chat/completions',data=payload,headers={'Authorization':'Bearer '+API_KEY,'Content-Type':'application/json'})
   with urllib.request.urlopen(request,timeout=35) as resp:answer=json.load(resp)['choices'][0]['message']['content']
   return self.sendjson(200,{'answer':answer})
  except urllib.error.HTTPError as e:return self.sendjson(502,{'error':'Ошибка ИИ API: '+str(e.code)})
  except Exception:return self.sendjson(500,{'error':'Ошибка сервера'})
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
