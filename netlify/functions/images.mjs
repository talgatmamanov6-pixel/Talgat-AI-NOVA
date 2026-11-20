import OpenAI,{toFile} from 'openai';
import {imageHandler} from './lib/image-service.mjs';
// Current model verified against Netlify's Nov 4, 2026 image-model announcement.
// Override only on the server when the provider catalog changes.
export default imageHandler({
 configured:()=>Boolean(process.env.OPENAI_API_KEY),
 model:()=>process.env.TALGAT_IMAGE_MODEL||'gpt-image-2.6-flare',
 clientFactory:()=>new OpenAI(),
 toImageFile:reference=>toFile(Buffer.from(reference.split(',')[1],'base64'),'reference.jpg',{type:'image/jpeg'})
});
export const config={path:'/api/images',rateLimit:{windowLimit:4,windowSize:180,aggregateBy:['ip','domain']}};
