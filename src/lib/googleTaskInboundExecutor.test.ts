import { expect, it, vi } from "vitest";
import { runGoogleTaskInbound, type GoogleTaskInboundDeps } from "./googleTaskInboundExecutor";
const request={userId:"user",generation:"gen",accessToken:"access"};
const source=(id:string)=>({id,summary:id,start:{date:"2026-09-09"},end:{date:"2026-09-10"}});
function setup(pages:unknown[], overrides:Record<string,unknown>={}) {
  let journal:unknown=null, serial=0;
  const lease={generation:"gen",calendarId:"cal",syncRevision:0,syncToken:"old",timezone:"Asia/Seoul",fence:1};
  const snapshot={...lease,userId:"user",inboxListId:"inbox",tasks:[],mappings:[],records:[],...overrides};
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>):Promise<unknown>=>{
    if(name==="claim_google_task_sync") return lease;
    if(name==="read_google_task_sync_snapshot") return snapshot;
    if(name==="commit_google_task_inbound") return {syncRevision:1,syncToken:args.p_next_sync_token,tasks:[]};
    return true;
  });
  const fetcher=vi.fn();
  for(const page of pages) fetcher.mockResolvedValueOnce(page instanceof Response?page:new Response(JSON.stringify(page)));
  const deps:GoogleTaskInboundDeps={rpc,fetch:fetcher,uuid:()=>`uuid-${++serial}`,assertCurrent:async()=>{},
    readJournal:async()=>journal,writeJournal:async value=>{journal=structuredClone(value);},exclusive:async work=>work()};
  return {deps,rpc,fetcher,journal:()=>journal,commit:()=>rpc.mock.calls.find(c=>c[0]==="commit_google_task_inbound")?.[1]};
}
it("commits all pages once and clears the durable journal only after the receipt", async()=>{
  const f=setup([{items:[source("a")],nextPageToken:"p2"},{items:[source("b")],nextSyncToken:"next"}]);
  expect(await runGoogleTaskInbound(request,f.deps)).toHaveProperty("syncToken","next");
  expect((f.commit()?.p_entries as unknown[])).toHaveLength(2);
  expect(f.journal()).toBeNull();
  expect(f.rpc.mock.calls.filter(c=>c[0]==="commit_google_task_inbound")).toHaveLength(1);
  expect(new URL(f.fetcher.mock.calls[1][0]).searchParams.get("syncToken")).toBe("old");
  expect(new URL(f.fetcher.mock.calls[1][0]).searchParams.get("pageToken")).toBe("p2");
});
it("restarts a 410 with a full read but keeps the server cursor until commit", async()=>{
  const f=setup([new Response("",{status:410}),{items:[],nextSyncToken:"full"}]);
  await runGoogleTaskInbound(request,f.deps);
  expect(new URL(f.fetcher.mock.calls[1][0]).searchParams.has("syncToken")).toBe(false);
  expect(f.commit()?.p_entries).toEqual([]);
});
it.each([{items:[source("a")]},{items:null,nextSyncToken:"n"},new Response("",{status:500})])("does not commit an incomplete page", async page=>{
  const f=setup([page]);await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow();
  expect(f.commit()).toBeUndefined();expect(f.journal()).toBeNull();
});
it("rejects pagination loops without advancing the cursor",async()=>{
  const f=setup([{nextPageToken:"same"},{nextPageToken:"same"}]);
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow("pagination");expect(f.commit()).toBeUndefined();
});
it("replays a retained pass before any Google read after a lost commit response",async()=>{
  const f=setup([{items:[source("a")],nextSyncToken:"next"}]);
  const original=f.deps.rpc;
  f.deps.rpc=async(name,args)=>{if(name==="commit_google_task_inbound") throw new Error("response lost");return original(name,args);};
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow("response lost");
  const saved=structuredClone(f.journal());expect(saved).not.toBeNull();
  f.deps.rpc=original;
  await runGoogleTaskInbound(request,f.deps);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.commit()).toEqual((saved as {args:unknown}).args);
  expect(f.journal()).toBeNull();
});
it("preserves review and exclusion decisions including legacy reasons",async()=>{
  const review={kind:"review",reason:"ambiguous-mapping",legacyReason:"ownership-unverified",taskIds:["old-task"]};
  const exclusion={kind:"skip",reason:"excluded"};
  const records=[{generation:"gen",calendar_id:"cal",event_id:"a",decision:review,revision:1,source:source("a")},{generation:"gen",calendar_id:"cal",event_id:"b",decision:exclusion,revision:1,source:source("b")}];
  const f=setup([{items:[source("a"),source("b")],nextSyncToken:"n"}],{records});
  await runGoogleTaskInbound(request,f.deps);
  expect((f.commit()?.p_entries as {decision:unknown}[]).map(e=>e.decision)).toEqual([review,exclusion]);
});
it("does not treat legacy task IDs as verified mappings",async()=>{
  const f=setup([{items:[source("a")],nextSyncToken:"n"}],{tasks:[{id:"old",revision:1,data:{title:"old",googleEventId:"a"}}]});
  await runGoogleTaskInbound(request,f.deps);
  expect((f.commit()?.p_entries as {decision:unknown;expected:unknown}[])[0]).toMatchObject({decision:{kind:"review",reason:"ambiguous-mapping"},expected:[]});
});

it("retires a cancelled unmapped review on an empty incremental page without changing legacy tasks or exclusions",async()=>{
  const cancelled={id:"a",status:"cancelled"};
  const records=[{generation:"gen",calendar_id:"cal",event_id:"a",decision:{kind:"review",reason:"ambiguous-mapping",taskIds:["old"]},revision:1,source:cancelled},
    {generation:"gen",calendar_id:"cal",event_id:"b",decision:{kind:"skip",reason:"excluded"},revision:1,source:{id:"b",status:"cancelled"}}];
  const f=setup([{items:[{id:"b",status:"cancelled"}],nextSyncToken:"n"}],{automaticSyncEnabled:true,records,tasks:[{id:"old",revision:1,data:{title:"Keep my task",googleEventId:"a"}}]});
  await runGoogleTaskInbound(request,f.deps);
  expect(f.commit()?.p_entries).toEqual([
    expect.objectContaining({eventId:"b",decision:{kind:"skip",reason:"excluded"},expected:[]}),
    expect.objectContaining({eventId:"a",decision:{kind:"skip",reason:"cancelled-unmapped"},expected:[]}),
  ]);
});
it("does not send a commit when local journal storage fails",async()=>{
  const f=setup([{items:[],nextSyncToken:"n"}]);f.deps.writeJournal=async()=>{throw new Error("quota");};
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow("quota");expect(f.commit()).toBeUndefined();
});
it("drops only a definitively rejected CAS journal so a later pass can replan",async()=>{
  const f=setup([{items:[],nextSyncToken:"n"}]);const original=f.deps.rpc;
  f.deps.rpc=async(name,args)=> {if(name==='commit_google_task_inbound') throw Object.assign(new Error('stale'),{code:'40001'});return original(name,args);};
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow('stale');expect(f.journal()).toBeNull();
});
it("stops on account change before obtaining a lease",async()=>{
  const f=setup([]);f.deps.assertCurrent=async()=>{throw new Error("account changed");};
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow("account changed");expect(f.rpc).not.toHaveBeenCalled();
});
it("does not commit after its lease expires and is reacquired with a new fence",async()=>{
  const f=setup([{items:[],nextSyncToken:"n"}]);let claims=0;
  const original=f.deps.rpc;
  f.deps.rpc=async(name,args)=>{
    const result=await original(name,args);
    if(name==="claim_google_task_sync"&&++claims===3) return {...result as object,fence:2};
    return result;
  };
  await expect(runGoogleTaskInbound(request,f.deps)).rejects.toThrow("lease");expect(f.commit()).toBeUndefined();expect(f.journal()).toBeNull();
});
