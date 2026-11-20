(function () {
 'use strict';
 if (window.__talgatAndroidDownloads || !window.TalgatFiles) return;
 window.__talgatAndroidDownloads = true;
 let converting = false;
 const notify = message => window.TalgatFiles.postMessage(JSON.stringify({type:'notice',message}));
 async function saveBlob(blob, filename) {
  if (converting) { notify('Дождитесь подготовки предыдущего файла.'); return; }
  if (blob.size > 12 * 1024 * 1024) { notify('Файл больше 12 МБ. Скачайте его через браузер.'); return; }
  converting = true;
  try {
   const data = await new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = reject; reader.readAsDataURL(blob);
   });
   window.TalgatFiles.postMessage(JSON.stringify({type:'save',filename:filename||'talgat-file.bin',mime:blob.type,base64:data.slice(data.indexOf(',')+1)}));
  } catch (_) { notify('Не удалось подготовить файл. Повторите скачивание.'); }
  finally { converting = false; }
 }
 function handleLink(link) {
  if (!link.href.startsWith('blob:' + location.origin + '/')) return false;
  fetch(link.href).then(r => { if (!r.ok) throw new Error(); return r.blob(); })
   .then(blob => saveBlob(blob,link.download)).catch(() => notify('Не удалось прочитать файл. Повторите создание.'));
  return true;
 }
 const originalClick = HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click = function () { if (!handleLink(this)) return originalClick.call(this); };
 document.addEventListener('click', event => {
  const link = event.target.closest && event.target.closest('a');
  if (link && handleLink(link)) { event.preventDefault(); event.stopImmediatePropagation(); }
 }, true);
 const originalSubmit = HTMLFormElement.prototype.submit;
 HTMLFormElement.prototype.submit = function () {
  const url = new URL(this.action,location.href);
  if (this.method.toLowerCase() !== 'post' || url.origin !== location.origin || url.pathname !== '/api/export') return originalSubmit.call(this);
  const fields = new FormData(this);
  fetch(url.href,{method:'POST',body:new URLSearchParams(fields)})
   .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
   .then(blob => saveBlob(blob,String(fields.get('filename')||'talgat-file.txt')))
   .catch(() => notify('Не удалось скачать файл. Проверьте подключение.'));
 };
 window.print = () => window.TalgatFiles.postMessage(JSON.stringify({type:'print'}));
})();
