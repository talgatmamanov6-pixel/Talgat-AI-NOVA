import test from 'node:test';import assert from 'node:assert/strict';
import {imageHandler} from '../netlify/functions/lib/image-service.mjs';
const request=body=>new Request('https://site/api/images',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
const jpeg=Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
const events=async response=>(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
test('image capability status contains no credentials and missing setup never calls a provider',async()=>{
 const handler=imageHandler({configured:()=>false,model:()=> 'model',clientFactory:()=>{throw Error('must not call')}});
 assert.deepEqual(await (await handler(new Request('https://site/api/images'))).json(),{configured:false,model:'model',supportsReference:true});assert.equal((await handler(request({prompt:'дом'}))).status,503);
});
test('image generation streams a validated JPEG and keeps model/provider selection server-side',async()=>{
 let calls=0;const handler=imageHandler({configured:()=>true,model:()=> 'server-model',clientFactory:()=>({images:{generate:async(params,options)=>{calls++;assert.equal(params.model,'server-model');assert.equal(params.n,1);assert.equal(params.size,'1536x1024');assert.equal(params.output_format,'jpeg');assert.equal(params.stream,true);assert.equal(options.maxRetries,0);return (async function*(){yield {type:'image_generation.completed',b64_json:jpeg}})()}}})});
 const response=await handler(request({prompt:'Дом у озера',format:'landscape',model:'attacker-model',apiKey:'browser-secret'}));assert.match(response.headers.get('content-type'),/ndjson/);const result=await events(response);assert.equal(result.at(-1).type,'image');assert.equal(result.at(-1).base64,jpeg);assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('browser-secret'),false);
});
test('a reference uses image editing; remote URLs and invalid formats are rejected',async()=>{
 const handler=imageHandler({configured:()=>true,model:()=> 'model',toImageFile:async data=>{assert.match(data,/^data:image\/jpeg/);return 'uploaded-file'},clientFactory:()=>({images:{edit:async params=>{assert.equal(params.image,'uploaded-file');return(async function*(){yield {type:'image_edit.completed',b64_json:jpeg}})()}}})});
 assert.equal((await events(await handler(request({prompt:'Измени свет',reference:'data:image/jpeg;base64,'+jpeg})))).at(-1).type,'image');
 for(const body of [{prompt:'x',reference:'https://internal/secret'},{prompt:'x',format:'invalid'},{prompt:'x'.repeat(6001)},null])assert.equal((await handler(request(body))).status,400);
});
test('provider failures and non-image data never become a fake image or leak internal errors',async()=>{
 for(const status of [401,402,429,500]){
  const handler=imageHandler({configured:()=>true,model:()=> 'model',clientFactory:()=>({images:{generate:async()=>{throw Object.assign(new Error('provider secret-key'),{status})}}})});
  const result=await events(await handler(request({prompt:'x'})));assert.equal(result.at(-1).type,'error');assert.equal(JSON.stringify(result).includes('secret-key'),false);
 }
 const handler=imageHandler({configured:()=>true,model:()=> 'model',clientFactory:()=>({images:{generate:async()=> (async function*(){yield {type:'image_generation.completed',b64_json:Buffer.from('<html>error</html>').toString('base64')}})()}})});
 assert.equal((await events(await handler(request({prompt:'x'})))).at(-1).type,'error');
});

test('Gemini adapter uses runtime SDK, reference parts and image aspect ratio',async()=>{
 const {geminiImageClient}=await import('../netlify/functions/lib/gemini-image.mjs');
 const client=geminiImageClient({models:{generateContent:async request=>{assert.equal(request.model,'gemini-model');assert.equal(request.config.imageConfig.aspectRatio,'3:2');assert.equal(request.config.httpOptions.retryOptions.attempts,1);assert.equal(request.contents[0].parts[1].inlineData.data,jpeg);return {candidates:[{content:{parts:[{inlineData:{data:jpeg,mimeType:'image/jpeg'}}]}}]}}}});
 const stream=await client.images.edit({model:'gemini-model',prompt:'Свет',size:'1536x1024',image:'data:image/jpeg;base64,'+jpeg},{signal:new AbortController().signal});for await(const event of stream){assert.equal(event.b64_json,jpeg);assert.equal(event.mime,'image/jpeg')}
});
