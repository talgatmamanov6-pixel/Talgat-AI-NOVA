const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../web/dialogs.js');
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),data}}
const message=text=>[{role:'user',content:text},{role:'assistant',content:'Ответ: '+text}];
test('different accounts never load shared, guest or another account history',()=>{
 const s=storage();s.setItem('talgat-ai-2-history',JSON.stringify(message('Shared secret')));s.setItem('talgat-ai-2-history-guest',JSON.stringify(message('Guest secret')));
 const a=createStore({storage:s,userId:'a'});a.save(message('Alice private'));
 const b=createStore({storage:s,userId:'b'});assert.deepEqual(b.messages(),[]);b.save(message('Bob private'));
 assert.deepEqual(createStore({storage:s,userId:'a'}).messages(),message('Alice private'));
 assert.deepEqual(createStore({storage:s,userId:'b'}).messages(),message('Bob private'));
 assert.throws(()=>createStore({storage:s,userId:''}),/Войдите/);
});
test('new conversation preserves previous dialog; switching restores the correct context',()=>{
 const s=storage(),a=createStore({storage:s,userId:'a'});const first=a.current();a.save(message('Первый вопрос'));const second=a.create();assert.notEqual(first,second);assert.deepEqual(a.messages(),[]);a.save(message('Другой вопрос'));
 assert.deepEqual(a.open(first),message('Первый вопрос'));assert.deepEqual(a.open(second),message('Другой вопрос'));assert.equal(a.list().length,2);
 const saved=createStore({storage:s,userId:'a'});assert.equal(saved.current(),second);assert.deepEqual(saved.messages(),message('Другой вопрос'));
});
test('migration imports only the same verified account legacy history',()=>{
 const s=storage();s.setItem('talgat-ai-2-history-a',JSON.stringify(message('Old Alice')));const a=createStore({storage:s,userId:'a'}),b=createStore({storage:s,userId:'b'});assert.deepEqual(a.messages(),message('Old Alice'));assert.deepEqual(b.messages(),[]);
});
test('storage failures preserve existing saved conversations instead of silently deleting them',()=>{
 const s=storage(),a=createStore({storage:s,userId:'a'});a.save(message('Saved'));s.setItem=()=>{throw Error('quota')};assert.throws(()=>a.save(message('Unsaved')),/quota/);assert.deepEqual(a.messages(),message('Saved'));
});
test('only the chosen conversation is removed and independent snapshots cannot mutate state',()=>{
 const a=createStore({storage:storage(),userId:'a'});a.save(message('One'));const first=a.current();a.create();a.save(message('Two'));const second=a.current();a.messages()[0].content='Mutated';assert.equal(a.messages()[0].content,'Two');a.remove(first);assert.equal(a.current(),second);assert.equal(a.list().length,1);a.remove(second);assert.deepEqual(a.messages(),[]);assert.equal(a.list().length,1);
});
