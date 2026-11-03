(function(root){
'use strict';
function chunks(text,max=1000){const result=[];let rest=text.trim();while(rest){if(rest.length<=max){result.push(rest);break}const slice=rest.slice(0,max);let end=Math.max(slice.lastIndexOf('. '),slice.lastIndexOf('! '),slice.lastIndexOf('? '));if(end<max*.4)end=slice.lastIndexOf(' ');if(end<1)end=max;else end++;result.push(rest.slice(0,end).trim());rest=rest.slice(end).trim()}return result}
function sentenceChunks(text){
 const sentences=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ru',{granularity:'sentence'}).segment(text)].map(x=>x.segment.trim()).filter(Boolean):text.trim().split(/(?<=[.!?])\s+/);
 const result=[];let buffer='';for(const sentence of sentences){for(const part of chunks(sentence,280)){if(!result.length&&!buffer){result.push(part);continue}if(buffer&&buffer.length+part.length+1>420){result.push(buffer);buffer=''}buffer+=(buffer?' ':'')+part}}if(buffer)result.push(buffer);return result;
}
class NeuralVoice{
 constructor(deps){this.deps=deps;this.token=0;this.requests=new Set();this.player=null;this.url=null;this.release=null}
 stop(){this.token++;for(const request of this.requests)request.abort();this.requests.clear();if(this.player){this.player.pause();this.player.src='';this.player=null}if(this.url){this.deps.revokeURL(this.url);this.url=null}this.release?.();this.release=null}
 async speak(text,language,rate,provider='openai'){
  this.stop();const token=this.token,parts=this.deps.lowLatency?sentenceChunks(text):chunks(text),pending=new Map();
  const prepare=index=>{
   if(pending.has(index))return pending.get(index);
   const promise=(async()=>{
    const request=new AbortController();this.requests.add(request);const timer=setTimeout(()=>request.abort(),this.deps.timeoutMs||30000);
    try{
     const res=await this.deps.fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:parts[index],language,provider}),signal:request.signal});
     if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Не удалось получить голосовой ответ.')}
     const blob=await res.blob();if(blob.type&&!/^audio\//.test(blob.type)&&blob.type!=='application/octet-stream')throw new Error('Сервис вернул неверный формат звука.');if(!blob.size)throw new Error('Сервис вернул пустую аудиозапись.');return {blob};
    }catch(error){return {error}}finally{clearTimeout(timer);this.requests.delete(request)}
   })();pending.set(index,promise);return promise;
  };
  try{
   for(let index=0;index<parts.length;index++){
    if(token!==this.token)return;this.deps.onState('preparing');const result=await prepare(index);if(token!==this.token)return;if(result.error)throw result.error;
    if(index+1<parts.length)prepare(index+1); // One chunk ahead; never queues an entire answer.
    if(this.url)this.deps.revokeURL(this.url);this.url=this.deps.createURL(result.blob);const audio=new this.deps.Audio(this.url);this.player=audio;audio.playbackRate=rate||1;this.deps.onPlayer?.(audio);
    await new Promise((resolve,reject)=>{this.release=resolve;audio.onended=resolve;audio.onerror=()=>reject(new Error('Не удалось воспроизвести звук.'));audio.onplaying=()=>{if(token===this.token)this.deps.onState('speaking')};Promise.resolve(audio.play()).catch(()=>reject(new Error('Нажмите «Озвучить», чтобы браузер разрешил воспроизведение.')))});
    if(token!==this.token)return;
   }
   this.stop();this.deps.onEnd();
  }catch(e){if(token===this.token){this.stop();this.deps.onError(e.name==='AbortError'?new Error('Превышено время ожидания озвучки. Попробуйте ещё раз.'):e)}}
 }
}
const api={NeuralVoice,chunks,sentenceChunks};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TalgatNeural=api;
})(typeof window!=='undefined'?window:globalThis);
