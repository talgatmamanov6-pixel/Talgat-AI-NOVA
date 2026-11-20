// SDK tokens remain inside the SDK. Callers only receive a boolean result.
export function createSessionRefresher({getUser,refreshSession,timeoutMs=9000}){
 let pending=null;
 return async expected=>{
  if(!expected)return false;
  if(!pending){
   let timer;
   const refresh=(async()=>{try{const before=await getUser();if(before?.id!==expected||!before.confirmedAt)return null;if(!await refreshSession())return null;const after=await getUser();return after?.confirmedAt?after.id:null}catch{return null}})();
   pending=Promise.race([refresh,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs)})]).finally(()=>{clearTimeout(timer);pending=null});
  }
  return (await pending)===expected;
 };
}
