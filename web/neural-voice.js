(function(root){
'use strict';
function chunks(text){const result=[];let rest=text.trim();while(rest){if(rest.length<=1000){result.push(rest);break}const slice=rest.slice(0,1000);let end=Math.max(slice.lastIndexOf('. '),slice.lastIndexOf('! '),slice.lastIndexOf('? '));if(end<400)end=slice.lastIndexOf(' ');if(end<1)end=1000;else end++;result.push(rest.slice(0,end).trim());rest=rest.slice(end).trim()}return result}
class NeuralVoice{
 constructor(deps){this.deps=deps;this.token=0;this.abort=null;this.player=null;this.url=null;this.release=null}
 stop(){this.token++;this.abort?.abort();this.abort=null;if(this.player){this.player.pause();this.player.src='';this.player=null}if(this.url){this.deps.revokeURL(this.url);this.url=null}this.release?.();this.release=null}
 async speak(text,language,rate){
  this.stop();const token=this.token;
  try{
   for(const part of chunks(text)){
    if(token!==this.token)return;this.abort=new AbortController();this.deps.onState('preparing');
    const requestController=this.abort;const timer=setTimeout(()=>requestController.abort(),this.deps.timeoutMs||30000);let blob;
    try{
     const res=await this.deps.fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:part,language}),signal:requestController.signal});
     if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Не удалось получить голосовой ответ.')}
     blob=await res.blob();
    }finally{clearTimeout(timer)}
    if(token!==this.token)return;if(blob.type&&!/^audio\//.test(blob.type)&&blob.type!=='application/octet-stream')throw new Error('Сервис вернул неверный формат звука.');if(!blob.size)throw new Error('Сервис вернул пустую аудиозапись.');
    if(this.url)this.deps.revokeURL(this.url);this.url=this.deps.createURL(blob);const audio=new this.deps.Audio(this.url);this.player=audio;audio.playbackRate=rate||1;
    await new Promise((resolve,reject)=>{this.release=resolve;audio.onended=resolve;audio.onerror=()=>reject(new Error('Не удалось воспроизвести звук.'));audio.onplaying=()=>{if(token===this.token)this.deps.onState('speaking')};Promise.resolve(audio.play()).catch(()=>reject(new Error('Нажмите «Озвучить», чтобы браузер разрешил воспроизведение.')))});
    if(token!==this.token)return;
   }
   this.stop();this.deps.onEnd();
  }catch(e){if(token===this.token){this.stop();this.deps.onError(e.name==='AbortError'?new Error('Превышено время ожидания озвучки. Попробуйте ещё раз.'):e)}}
 }
}
const api={NeuralVoice,chunks};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TalgatNeural=api;
})(typeof window!=='undefined'?window:globalThis);
