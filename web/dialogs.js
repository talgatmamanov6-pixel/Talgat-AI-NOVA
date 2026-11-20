(function(root){
'use strict';
function copy(value){return JSON.parse(JSON.stringify(value))}
function createStore({storage,userId,now=()=>Date.now(),uuid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}={}){
 if(typeof userId!=='string'||!userId.trim())throw Error('Войдите в аккаунт, чтобы открыть личные диалоги.');
 const key='talgat-dialogs-v1-'+encodeURIComponent(userId);let state={current:null,dialogs:[]};
 const validMessages=data=>Array.isArray(data)?data.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content})):[];
 try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved&&Array.isArray(saved.dialogs)){state.dialogs=saved.dialogs.filter(d=>d&&typeof d.id==='string'&&typeof d.title==='string'&&Array.isArray(d.messages)).map(d=>({id:d.id,title:d.title.slice(0,80),updated:Number(d.updated)||0,messages:validMessages(d.messages)}));state.current=state.dialogs.some(d=>d.id===saved.current)?saved.current:state.dialogs[0]?.id||null}}catch{}
 function persist(next){storage.setItem(key,JSON.stringify(next));state=next}
 function create(){const existing=state.dialogs.find(d=>d.id===state.current);if(existing&&!existing.messages.length)return existing.id;if(state.dialogs.length>=50)throw Error('Сохранено 50 диалогов. Удалите ненужный, чтобы создать новый.');const id=uuid();persist({current:id,dialogs:[{id,title:'Новый диалог',updated:now(),messages:[]},...state.dialogs]});return id}
 function save(messages){if(!state.current)create();const clean=validMessages(messages),next=copy(state),d=next.dialogs.find(d=>d.id===next.current);d.messages=clean;d.title=clean.find(m=>m.role==='user')?.content.replace(/\s+/g,' ').trim().slice(0,80)||'Новый диалог';d.updated=now();persist(next)}
 // Only migrate the authenticated user's old key; never import shared or guest history.
 if(!state.current){let legacy=[];try{legacy=validMessages(JSON.parse(storage.getItem('talgat-ai-2-history-'+userId)||'[]'))}catch{}const id=uuid();persist({current:id,dialogs:[{id,title:legacy.find(m=>m.role==='user')?.content.replace(/\s+/g,' ').trim().slice(0,80)||'Новый диалог',updated:now(),messages:legacy}]})}
 return {key,current:()=>state.current,messages:()=>copy(state.dialogs.find(d=>d.id===state.current)?.messages||[]),list:()=>copy(state.dialogs.map(({id,title,updated,messages})=>({id,title,updated,count:messages.length})).sort((a,b)=>b.updated-a.updated)),create,save,open(id){if(!state.dialogs.some(d=>d.id===id))throw Error('Диалог не найден.');persist({...copy(state),current:id});return this.messages()},remove(id){if(!state.dialogs.some(d=>d.id===id))return;const next=copy(state);next.dialogs=next.dialogs.filter(d=>d.id!==id);if(next.current===id)next.current=next.dialogs[0]?.id||null;if(!next.current){const fresh=uuid();next.current=fresh;next.dialogs=[{id:fresh,title:'Новый диалог',updated:now(),messages:[]}]}persist(next);return this.messages()}};
}
const api={createStore};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TalgatDialogs=api;
})(typeof window!=='undefined'?window:globalThis);
