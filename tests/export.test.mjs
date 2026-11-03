import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/export.mjs';
test('generated code downloads as an attachment with unchanged contents',async()=>{
 const form=new FormData();form.append('content','print("СЕВЕР")\n');form.append('filename','talgat-code-1.py');
 const res=await handler(new Request('https://site/api/export',{method:'POST',body:form}));
 assert.equal(res.status,200);assert.match(res.headers.get('content-disposition'),/attachment; filename="talgat-code-1.py"/);assert.equal(await res.text(),'print("СЕВЕР")\n');
});
test('empty content and unsupported methods are rejected',async()=>{
 assert.equal((await handler(new Request('https://site/api/export'))).status,405);
 assert.equal((await handler(new Request('https://site/api/export',{method:'POST',body:new FormData()}))).status,400);
});
