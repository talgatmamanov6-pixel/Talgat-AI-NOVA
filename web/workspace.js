(function(){
'use strict';
const get=id=>document.getElementById(id),catalog=window.TalgatSkills;
let selected=catalog.items[0],category='Все';
const key='talgat-saved-results-v1';let saved=[];
try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(data))saved=data.filter(x=>x&&typeof x.id==='string'&&typeof x.source==='string'&&x.source.length<=100000&&typeof x.title==='string').slice(0,24)}catch{}
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved));return true}catch{get('status').textContent='Не хватает места в браузере. Скачайте результат.';return false}};
function download(filename,content){
 const form=document.createElement('form');form.method='POST';form.action='/api/export';form.hidden=true;
 for(const [name,value] of Object.entries({filename,content})){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.append(field)}document.body.append(form);form.submit();setTimeout(()=>form.remove(),2000);
}
const csv=catalog.csv;
function title(source){return source.replace(/[#*`]/g,'').split('\n').find(s=>s.trim())?.slice(0,70)||'Результат Talgat'}
function printResult(el,source){
 const popup=window.open('','_blank');if(!popup){get('status').textContent='Разрешите окно печати в браузере.';return}
 popup.opener=null;const doc=popup.document;doc.title=title(source);
 const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';doc.head.append(meta);
 const math=doc.createElement('link');math.rel='stylesheet';math.href=location.origin+'/vendor/katex.min.css';doc.head.append(math);
 const style=doc.createElement('style');style.textContent='body{font:15px/1.65 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:20px;color:#14202b}h1,h2,h3{line-height:1.25;break-after:avoid}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bac4ce;padding:8px}pre{white-space:pre-wrap;background:#f1f4f7;padding:15px;overflow-wrap:anywhere}img{max-width:100%}.katex-display{overflow:auto}@page{margin:18mm}@media print{body{margin:0;padding:0}.print-button{display:none}}';doc.head.append(style);
 const button=doc.createElement('button');button.className='print-button';button.textContent='Печать / Сохранить в PDF';button.onclick=()=>popup.print();doc.body.append(button);
 const copy=el.cloneNode(true);for(const node of copy.querySelectorAll('.messageactions,.codeactions,.table-export'))node.remove();doc.body.append(copy);
}
function decorate(el,source){
 const bar=el.querySelector('.messageactions');if(!bar)return;
 const md=document.createElement('button');md.textContent='Markdown ↓';md.onclick=()=>download('talgat-result.md',source);
 const pdf=document.createElement('button');pdf.textContent='Печать / PDF';pdf.onclick=()=>printResult(el,source);
 const save=document.createElement('button');save.textContent='Сохранить';save.onclick=()=>{
  if(saved.some(x=>x.source===source)){save.textContent='Уже сохранено';return}
  const before=saved;saved=[{id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:title(source),source,date:new Date().toISOString()},...saved].slice(0,24);
  if(persist())save.textContent='Сохранено';else saved=before;
 };
 bar.append(save,md,pdf);
 for(const [i,table] of [...el.querySelectorAll('table')].entries()){const button=document.createElement('button');button.className='table-export';button.textContent='Таблица '+(i+1)+' · CSV ↓';button.onclick=()=>download('talgat-table-'+(i+1)+'.csv','\ufeff'+csv(table));table.after(button)}
}
window.TalgatWorkspace={decorate,csv};
function choose(skill){selected=skill;get('skill-name').textContent=skill.title;get('skill-command').textContent='/'+skill.id;get('skill-description').textContent=skill.description;get('skill-id').value=skill.id;get('skill-feedback').textContent='';drawList()}
function drawList(){
 const query=get('skill-search').value.toLowerCase().trim();const items=catalog.items.filter(s=>(category==='Все'||s.category===category)&&(s.title+' '+s.id+' '+s.description).toLowerCase().includes(query));
 get('skill-count').textContent='Найдено: '+items.length;get('skill-list').replaceChildren();
 for(const skill of items){const button=document.createElement('button');button.className='skill-card'+(skill.id===selected.id?' chosen':'');button.type='button';button.setAttribute('aria-pressed',String(skill.id===selected.id));const label=document.createElement('strong');label.textContent=skill.title;const sub=document.createElement('small');sub.textContent='/'+skill.id+' · '+skill.category;button.append(label,sub);button.onclick=()=>choose(skill);get('skill-list').append(button)}
 if(!items.length)get('skill-list').textContent='Ничего не найдено. Измените запрос.';
}
function open(id){if(id){const skill=catalog.items.find(s=>s.id===id);if(skill)choose(skill)}get('skills').showModal();document.body.classList.remove('nav-open');drawList()}
get('skills-open').onclick=()=>open();get('skills-shortcut').onclick=()=>open();get('skills-close').onclick=()=>get('skills').close();get('skill-search').oninput=drawList;
for(const value of ['Все',...new Set(catalog.items.map(s=>s.category))]){const button=document.createElement('button');button.type='button';button.textContent=value;button.setAttribute('aria-pressed',String(value===category));button.onclick=()=>{category=value;for(const item of get('skill-categories').children)item.setAttribute('aria-pressed',String(item===button));drawList()};get('skill-categories').append(button)}
get('skill-form').onsubmit=e=>{
 e.preventDefault();if(busy){get('skill-feedback').textContent='Дождитесь текущего ответа или нажмите «Стоп».';return}
 const prompt=catalog.build(selected.id,{topic:get('skill-topic').value,audience:get('skill-audience').value,scope:get('skill-scope').value,language:get('skill-language').value});
 get('question').value=prompt;get('skills').close();if(selected.category==='Разработка')get('mode-code').click();else get('mode-chat').click();send({prompt,display:'/'+selected.id+' '+get('skill-topic').value+'\n'+[get('skill-audience').value,get('skill-scope').value,get('skill-language').value].filter(Boolean).join(' · ')});
};
// Slash commands go through the same recipe as the form. No command executes code.
window.TalgatCommand=question=>{const match=catalog.expand(question);if(!match)return question;if(!match.prompt){open(match.skill.id);get('skill-topic').focus();return null}if(match.skill.category==='Разработка')get('mode-code').click();return match.prompt};
function showSaved(){
 get('saved-list').replaceChildren();get('saved-preview').replaceChildren();get('saved-empty').hidden=saved.length>0;
 for(const item of saved){const row=document.createElement('div');row.className='saved-row';const button=document.createElement('button');button.textContent=item.title;button.onclick=()=>{get('saved-preview').replaceChildren();const el=document.createElement('article');el.className='bubble assistant';render(el,'assistant',item.source);const bar=document.createElement('div');bar.className='messageactions';el.append(bar);decorate(el,item.source);get('saved-preview').append(el)};const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Удалить '+item.title);remove.onclick=()=>{const before=saved;saved=saved.filter(x=>x.id!==item.id);if(!persist())saved=before;showSaved()};row.append(button,remove);get('saved-list').append(row)}
}
get('saved-open').onclick=()=>{showSaved();get('saved').showModal();document.body.classList.remove('nav-open')};get('saved-close').onclick=()=>get('saved').close();
choose(selected);
})();
