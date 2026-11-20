import test from 'node:test';import assert from 'node:assert/strict';import JSZip from 'jszip';
import {extractProject,project,safeProjectPath} from '../src/project.mjs';
test('project archive preserves real filenames, Unicode contents and setup notes',async()=>{
 const source='Запуск: откройте index.html\n```html index.html\n<h1>Талгат</h1>\n```\n```javascript src/app.js\nconsole.log("готово");\n```';
 const files=extractProject(source);assert.equal(files[0].path,'index.html');assert.equal(files[1].path,'src/app.js');
 const blob=await project(files),zip=await JSZip.loadAsync(await blob.arrayBuffer());assert.equal(await zip.file('index.html').async('string'),'<h1>Талгат</h1>\n');assert.match(await zip.file('README-TALGAT.md').async('string'),/Запуск/);
});
test('archive rejects traversal paths, duplicate filenames and oversized output',async()=>{
 for(const path of ['../secret','src/../../secret','/root','C:/file','a\\b','a//b','a\u0000b'])assert.throws(()=>safeProjectPath(path));
 assert.throws(()=>extractProject('```js same.js\nx\n```\n```js same.js\ny\n```'));
 assert.throws(()=>extractProject('Нет кода'));await assert.rejects(()=>project([{path:'ok.js',content:'x'.repeat(2000001)}]));
});
