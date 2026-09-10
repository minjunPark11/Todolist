import type { GoogleTaskInboundDeps } from "./googleTaskInboundExecutor";

export function createGoogleTaskInboundDeps(input:{userId:string;generation:string;jwt:string;supabaseUrl:string;anonKey:string;
  fetch:typeof fetch;storage:Pick<Storage,"getItem"|"setItem"|"removeItem">;locks:LockManager;
  currentUser:()=>Promise<string|null>}):GoogleTaskInboundDeps {
  const {userId,generation,jwt,supabaseUrl,anonKey,fetch:fetchImpl,storage,locks,currentUser}=input;
  const key=`focusflow.google-inbound.v1:${userId}:${generation}`;
  return {
    fetch:fetchImpl,uuid:()=>crypto.randomUUID(),
    assertCurrent:async()=>{if(await currentUser()!==userId) throw new Error("Google sync account changed.");},
    rpc:async(name,args)=> {
      const response=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",
        headers:{Authorization:`Bearer ${jwt}`,apikey:anonKey,"Content-Type":"application/json"},body:JSON.stringify(args)});
      if(!response.ok) {
        const body=await response.json().catch(()=>null);
        const detail = typeof body?.message === "string" ? body.message.slice(0, 300) : "Request failed";
        throw Object.assign(new Error(`${name}: ${detail} (${body?.code ?? response.status})`),{code:body?.code});
      }
      return response.json();
    },
    readJournal:async()=>{const raw=storage.getItem(key);return raw===null?null:JSON.parse(raw);},
    writeJournal:async(value)=>{if(value===null) storage.removeItem(key);else storage.setItem(key,JSON.stringify(value));},
    exclusive:async work=> {
      if(!locks) throw new Error("Web Locks are required for Google task sync.");
      return locks.request(key,{ifAvailable:true},async lock=>{if(!lock) throw new Error("Google task sync is running in another window.");return work();});
    },
  };
}
