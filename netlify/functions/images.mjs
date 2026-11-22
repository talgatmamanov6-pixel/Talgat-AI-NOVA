import {metered} from './lib/commerce.mjs';
import {GoogleGenAI} from '@google/genai';
import {imageHandler} from './lib/image-service.mjs';
import {geminiImageClient} from './lib/gemini-image.mjs';
// Official model announcement: Netlify, Oct 6, 2026. Override server-side if needed.
const handler=imageHandler({
 configured:()=>Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),
 model:()=>process.env.TALGAT_IMAGE_MODEL||'gemini-nano-banana-2.1',
 clientFactory:()=>geminiImageClient(new GoogleGenAI({})),
 toImageFile:async reference=>reference
});
export const config={path:'/api/images',rateLimit:{windowLimit:4,windowSize:180,aggregateBy:['ip','domain']}};

export default metered(handler,{metric:'image',stream:true,guest:true});
