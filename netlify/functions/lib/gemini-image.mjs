export function geminiImageClient(ai){
 async function generate(params,options){
  const parts=[{text:params.prompt}];
  if(params.image)parts.push({inlineData:{mimeType:'image/jpeg',data:params.image.split(',')[1]}});
  const ratio=params.size==='1536x1024'?'3:2':params.size==='1024x1536'?'2:3':'1:1';
  const response=await ai.models.generateContent({model:params.model,contents:[{role:'user',parts}],config:{imageConfig:{aspectRatio:ratio,imageSize:'1K'},abortSignal:options.signal,httpOptions:{timeout:50000,retryOptions:{attempts:1}}}});
  return (async function*(){
   for(const candidate of response.candidates||[])for(const part of candidate.content?.parts||[])if(part.inlineData?.data){yield {type:'image_generation.completed',b64_json:part.inlineData.data,mime:part.inlineData.mimeType||'image/png'};return}
   throw new Error('missing_image');
  })();
 }
 return {images:{generate,edit:generate},models:{async list(options){const pager=await ai.models.list({config:{httpOptions:{timeout:8000,retryOptions:{attempts:1}}}});const data=[];for await(const item of pager){data.push({id:item.name||''});if(data.length>=100)break}return {data}}}};
}
