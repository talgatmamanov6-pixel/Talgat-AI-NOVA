const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const sizes={square:'1024x1024',landscape:'1536x1024',portrait:'1024x1536'};
function publicError(error){
 const status=Number(error?.status)||0;
 if(error?.name==='AbortError'||error?.name==='APIConnectionTimeoutError')return 'Изображение не успело создаться за 50 секунд. Попробуйте упростить запрос.';
 if(status===401||status===403)return 'Сервис изображений отклонил доступ. Проверьте подключение AI Gateway.';
 if(status===402||status===429)return 'Недостаточно доступных кредитов или достигнут лимит сервиса изображений.';
 if(status===404)return 'Выбранная модель изображений недоступна. Требуется настройка сервера.';
 if(status===400)return 'Сервис не принял параметры или содержание запроса. Измените описание.';
 return 'Не удалось создать изображение. Повторите позже.';
}
export function imageHandler({configured,model,clientFactory,toImageFile}){
 return async request=>{
  if(request.method==='GET'){
   if(new URL(request.url).searchParams.get('capabilities')==='1'&&configured()){
    try{const listing=await clientFactory().models.list({timeout:8000,maxRetries:0});return json({configured:true,model:model(),imageModels:(listing.data||[]).map(item=>item.id).filter(id=>typeof id==='string'&&/image|banana/.test(id)).slice(0,30)})}catch(error){return json({configured:true,model:model(),catalogAvailable:false,upstream_status:Number(error?.status)||null})}
   }
   return json({configured:Boolean(configured()),model:model(),supportsReference:true});
  }
  if(request.method!=='POST')return json({error:'Используйте POST.'},405);
  if(!configured())return json({error:'Генерация изображений ещё не подключена: серверу нужен доступ к AI Gateway.',code:'images_not_configured'},503);
  if(Number(request.headers.get('content-length'))>2300000)return json({error:'Запрос слишком большой.'},413);
  let body;try{body=await request.json()}catch{return json({error:'Некорректный JSON.'},400)}
  const prompt=typeof body?.prompt==='string'?body.prompt.trim():'';
  if(!prompt||prompt.length>6000)return json({error:'Опишите изображение: от 1 до 6000 символов.'},400);
  if(!sizes[body?.format||'square'])return json({error:'Неизвестный формат изображения.'},400);
  const reference=body?.reference;
  if(reference!==undefined&&(typeof reference!=='string'||reference.length>2000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(reference)))return json({error:'Референс должен быть JPEG размером до 1,5 МБ.'},400);
  // Do not accept a provider key, model name, tool definition or URL from the browser.
  let cancelled=false;
  const chosen=model(),abort=new AbortController(),encoder=new TextEncoder();
  const stop=()=>abort.abort();request.signal.addEventListener('abort',stop,{once:true});
  const stream=new ReadableStream({
   async start(output){
    let ended=false;const emit=data=>{if(!ended&&!cancelled)output.enqueue(encoder.encode(JSON.stringify(data)+'\n'))};
    const timer=setTimeout(()=>abort.abort(),50000);
    try{
     emit({type:'status',message:'Создаю изображение…',model:chosen});
     const client=clientFactory();
     const params={model:chosen,prompt,n:1,size:sizes[body.format||'square'],quality:'medium',output_format:'jpeg',output_compression:85,stream:true,partial_images:0};
     const options={signal:abort.signal,timeout:50000,maxRetries:0};
     const events=reference?await client.images.edit({...params,image:await toImageFile(reference)},options):await client.images.generate(params,options);
     let complete=false;
     for await(const event of events){
      if(event.type==='image_generation.completed'||event.type==='image_edit.completed'){
       const base64=event.b64_json;
       if(typeof base64!=='string'||base64.length>5000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('invalid_image');
       const bytes=Buffer.from(base64,'base64'),mime=event.mime||'image/jpeg';
       const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false;
       if(bytes.length<8||!valid)throw new Error('invalid_image');
       emit({type:'image',base64,mime,model:chosen});complete=true;break;
      }
     }
     if(!complete)throw new Error('missing_image');
    }catch(error){emit({type:'error',error:publicError(error),upstream_status:Number(error?.status)||null,provider_code:typeof error?.code==='string'?error.code.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80):undefined,parameter:typeof error?.param==='string'?error.param.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80):undefined})}
    finally{clearTimeout(timer);request.signal.removeEventListener('abort',stop);ended=true;if(!cancelled)output.close()}
   },
   cancel(){cancelled=true;abort.abort()}
  });
  return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 };
}
