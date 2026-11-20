import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {Pool} from 'pg';
import {commerceService,AccessError} from '../netlify/functions/lib/commerce.mjs';
import {commerceHandler} from '../netlify/functions/commerce.mjs';
let db,pool,svc,owner;
before(async()=>{db=new NetlifyDB({logger:()=>{}});const connectionString=await db.start();await db.applyMigrations('netlify/database/migrations');pool=new Pool({connectionString});svc=commerceService(pool);owner={id:'private-owner',email:'owner@example.invalid',owner:true};await svc.account(owner)});
after(async()=>{await pool?.end();await db?.stop()});
const member=id=>({id,email:id+'@example.invalid',owner:false});
const request=(path,body,origin='https://test.example')=>new Request('https://test.example'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',origin}:{},body:body?JSON.stringify(body):undefined});
const handler=u=>commerceHandler({identify:async()=>u,getService:()=>svc,isEnabled:()=>true});
test('owner is free forever and is not one of the ten slots',async()=>{
 await pool.query("UPDATE talgat_wallets SET expires_at=now()-interval '1 day',image_limit=0,text_limit=0,recording_limit=0,speech_limit=0 WHERE user_id=$1",[owner.id]);
 const w=await svc.account(owner);assert.deepEqual(w.access,{kind:'owner',free:true,slot:null});
 for(const metric of ['image','text','recording','speech'])await svc.finish(await svc.reserve(owner,metric,1),true);
 const r=await pool.query('SELECT count(*)::integer AS n FROM talgat_private_access');assert.equal(r.rows[0].n,10);
 await assert.rejects(svc.setPrivateAccess(owner,1,owner.email),{status:400});
});
test('confirmed member receives all feature types despite expired or zero trial quota',async()=>{
 const u=member('first-private');await svc.account(u);await svc.setPrivateAccess(owner,1,' FIRST-PRIVATE@EXAMPLE.INVALID ');
 await pool.query("UPDATE talgat_wallets SET expires_at=now()-interval '1 day',image_limit=0,text_limit=0,recording_limit=0,speech_limit=0 WHERE user_id=$1",[u.id]);
 const w=await svc.account(u);assert.deepEqual(w.access,{kind:'private',free:true,slot:1});assert.equal(u.owner,false);
 for(const metric of ['image','text','recording','speech'])await svc.finish(await svc.reserve(u,metric,1),true);
 const notInvited=member('ordinary');await svc.account(notInvited);await assert.rejects(svc.reserve(notInvited,'image',1),{status:402});
});
test('reassigning and clearing a slot revoke the previous email immediately',async()=>{
 const previous=member('first-private'),next=member('replacement');await svc.account(next);
 await svc.setPrivateAccess(owner,1,next.email);assert.equal((await svc.account(previous)).access.free,false);await assert.rejects(svc.reserve(previous,'text',1),{status:402});assert.equal((await svc.account(next)).access.free,true);
 await svc.setPrivateAccess(owner,1,null);assert.equal((await svc.account(next)).access.free,false);await assert.rejects(svc.reserve(next,'image',1),{status:402});
});
test('slots are capped at ten and a duplicate email cannot occupy two slots',async()=>{
 await Promise.all(Array.from({length:10},(_,i)=>svc.setPrivateAccess(owner,i+1,`reserved-${i+1}@example.invalid`)));
 await assert.rejects(svc.setPrivateAccess(owner,11,'eleven@example.invalid'),{status:400});
 await assert.rejects(svc.setPrivateAccess(owner,2,'reserved-1@example.invalid'),{status:409});
 const r=await pool.query('SELECT slot,email FROM talgat_private_access ORDER BY slot');assert.equal(r.rowCount,10);assert.equal(r.rows[1].email,'reserved-2@example.invalid');
 await assert.rejects(pool.query('INSERT INTO talgat_private_access(slot) VALUES(11)'));
 await assert.rejects(svc.setPrivateAccess(member('rogue'),1,'rogue@example.invalid'),{status:403});
});
test('private user cannot self-grant or read the owner dashboard, even with forged body flags',async()=>{
 const u=member('non-admin');await svc.account(u);await svc.setPrivateAccess(owner,1,u.email);
 const app=handler(u);assert.equal((await app(request('/api/owner'))).status,403);
 assert.equal((await app(request('/api/owner/access',{slot:2,email:u.email,owner:true,role:'admin'}))).status,403);
 const account=await (await app(request('/api/account'))).json();assert.equal(account.user.owner,false);assert.equal(account.wallet.access.free,true);assert.equal(account.private_access,undefined);
 const noCharge=await app(request('/api/orders',{offer:'basic'}));assert.equal(noCharge.status,409);
});
test('only the owner can manage access and writes require the correct origin',async()=>{
 const app=handler(owner);const dashboard=await (await app(request('/api/owner'))).json();assert.equal(dashboard.private_access.length,10);
 assert.equal((await app(request('/api/owner/access',{slot:3,email:'new@example.invalid'},'https://evil.example'))).status,403);
 assert.equal((await app(request('/api/owner/access',{slot:3,email:'not-an-email'}))).status,400);
 assert.equal((await app(request('/api/owner/access',{slot:3}))).status,400);
 assert.equal((await app(request('/api/owner/access',{slot:3,email:'new@example.invalid'}))).status,200);
 const anonymous=commerceHandler({identify:async()=>{throw new AccessError('Войдите',401)},getService:()=>svc,isEnabled:()=>true});assert.equal((await anonymous(request('/api/owner/access',{slot:3,email:'stolen@example.invalid'}))).status,401);
});
test('blocking a private user still prevents all requests',async()=>{
 const u=member('blocked-private');await svc.account(u);await svc.setPrivateAccess(owner,4,u.email);await pool.query('UPDATE talgat_accounts SET blocked=true WHERE id=$1',[u.id]);
 await assert.rejects(svc.account(u),{status:403});await assert.rejects(svc.reserve(u,'text',1),{status:403});
});
test('a free account is still subject to the global daily service budget',async()=>{
 const u=member('budget-private');await svc.account(u);await svc.setPrivateAccess(owner,5,u.email);
 await pool.query("INSERT INTO talgat_daily(day,metric,units) VALUES((now() AT TIME ZONE 'UTC')::date,'image',50) ON CONFLICT(day,metric) DO UPDATE SET units=50");
 await assert.rejects(svc.reserve(u,'image',1),{status:429});assert.equal((await svc.account(u)).image_used,0);
});
