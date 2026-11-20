import JSZip from 'jszip';
const extensions={javascript:'js',typescript:'ts',python:'py',html:'html',css:'css',json:'json',bash:'sh',shell:'sh',svg:'svg',xml:'xml',kotlin:'kt',java:'java',dart:'dart',swift:'swift',yaml:'yml',markdown:'md',sql:'sql',jsx:'jsx',tsx:'tsx'};
export function safeProjectPath(path){
 if(typeof path!=='string'||path.length>180||!path||path.startsWith('/')||path.includes('\\')||path.includes(':')||/[\u0000-\u001f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Недопустимое имя файла проекта.');
 return path;
}
export function extractProject(source){
 const files=[],seen=new Set();let index=0;
 for(const match of source.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)){
  const [language,...meta]=match[1].trim().split(/\s+/),hint=meta.join(' ').replace(/^filename=/,'').replace(/^"|"$/g,'');
  const path=safeProjectPath(hint||('file-'+(++index)+'.'+(extensions[language.toLowerCase()]||'txt')));
  if(seen.has(path))throw new Error('В проекте повторяется файл '+path+'. Попросите исправить имена.');
  if(match[2].length>500000||files.length>=40)throw new Error('Проект слишком большой для одного архива.');
  files.push({path,content:match[2]});seen.add(path);
 }
 if(!files.length)throw new Error('В ответе нет файлов с кодом.');
 const notes=source.replace(/```[^\n`]*\n[\s\S]*?```/g,'\n[Код находится в файлах архива.]\n').trim();
 if(notes&&!seen.has('README-TALGAT.md'))files.push({path:'README-TALGAT.md',content:notes});
 return files;
}
export async function project(files){
 if(!Array.isArray(files)||!files.length||files.length>41)throw new Error('Нужны файлы проекта.');
 let size=0;const zip=new JSZip(),seen=new Set();
 for(const file of files){const path=safeProjectPath(file.path);if(seen.has(path)||typeof file.content!=='string')throw new Error('Неверный список файлов.');seen.add(path);size+=file.content.length;if(size>2000000)throw new Error('Архив превышает допустимый размер.');zip.file(path,file.content)}
 return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
