import test from 'node:test';
import assert from 'node:assert/strict';
import {reasoningOptions} from '../netlify/functions/reasoning-policy.mjs';
test('unsupported fallback models never receive unsupported effort parameters',()=>{
 const result=reasoningOptions('llama-3.3-70b-versatile');assert.equal(result.reasoning_effort,undefined);assert.equal(result.reasoning_format,undefined);
 assert.equal(reasoningOptions('openai/gpt-oss-20b').reasoning_effort,'high');
 assert.equal(reasoningOptions('qwen/qwen3.8-27b',{quality:'quick'}).reasoning_effort,'low');
});
