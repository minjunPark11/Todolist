import type { GoogleEventResource } from "../domain/calendar/googleSync/inboundShape";
import { planTaskInbound } from "../domain/calendar/googleSync/taskInboundPlan";
import { object, parseGoogleTaskSnapshot, revision, text } from "./googleTaskInboundSnapshot";

export interface GoogleTaskInboundDeps {
  /** Must use an immutable captured user JWT, never the client's mutable current session. */
  rpc(name:string,args:Record<string,unknown>):Promise<unknown>;
  fetch:typeof fetch;
  uuid():string;
  assertCurrent():Promise<void>;
  readJournal():Promise<unknown>;
  writeJournal(value:unknown|null):Promise<void>;
  /** One local journal writer across tabs/windows. The server lease handles other devices. */
  exclusive<T>(work:()=>Promise<T>):Promise<T>;
}
export interface GoogleTaskInboundRequest { userId:string; generation:string; accessToken:string }
export interface GoogleTaskInboundResult { syncRevision:number; syncToken:string; tasks:unknown[] }
function resultOf(raw:unknown, args:Record<string,unknown>):GoogleTaskInboundResult {
  const value=object(raw);
  if(value.syncRevision!==Number(args.p_sync_revision)+1||value.syncToken!==args.p_next_sync_token||!Array.isArray(value.tasks)) throw new Error("Invalid inbound commit receipt.");
  for(const rawRow of value.tasks) {
    const row=object(rawRow);
    if(!revision(row.revision)||text(row.id)!==object(row.data).id) throw new Error("Invalid committed task row.");
  }
  return {syncRevision:revision(value.syncRevision),syncToken:text(value.syncToken),tasks:value.tasks};
}
function pendingArgs(raw:unknown, request:GoogleTaskInboundRequest):Record<string,unknown> {
  const journal=object(raw), args=object(journal.args);
  if(journal.version!==1||journal.userId!==request.userId||args.p_generation!==request.generation) throw new Error("Inbound journal scope changed.");
  for(const key of ["p_generation","p_calendar_id","p_owner","p_pass_id","p_next_sync_token"]) text(args[key]);
  revision(args.p_sync_revision); if(!revision(args.p_fence)||!Array.isArray(args.p_entries)) throw new Error("Invalid inbound journal.");
  for(const rawEntry of args.p_entries) {
    const entry=object(rawEntry);
    if(text(entry.eventId)!==object(entry.source).id||!Array.isArray(entry.expected)) throw new Error("Invalid inbound journal entry.");
    if(!["create","update","merge","acknowledge","keep-local","trash","conflict","review","skip"].includes(text(object(entry.decision).kind))) throw new Error("Invalid journal decision.");
    for(const expected of entry.expected) {const row=object(expected);text(row.taskId);revision(row.revision);}
  }
  return args;
}

/** Runs under the v2 coordinator; each page's changes and cursor commit atomically. */
export async function runGoogleTaskInbound(request:GoogleTaskInboundRequest,deps:GoogleTaskInboundDeps):Promise<GoogleTaskInboundResult> {
  return deps.exclusive(async()=> {
    const call=async(name:string,args:Record<string,unknown>)=>{await deps.assertCurrent();return deps.rpc(name,args);};
    const commit=async(args:Record<string,unknown>)=> {
      let raw:unknown;
      try { raw=await call("commit_google_task_inbound",args); }
      catch(error) {
        // The RPC checks its receipt first. A definitive CAS rejection means this pass was not applied.
        if((error as {code?:string})?.code==='40001') {await deps.assertCurrent();await deps.writeJournal(null);}
        throw error;
      }
      const result=resultOf(raw,args);
      await deps.assertCurrent(); await deps.writeJournal(null); return result;
    };
    await deps.assertCurrent();
    const pending=await deps.readJournal();
    // Replay the exact pass first, even after its lease expired. The DB receipt decides.
    if(pending!==null) return commit(pendingArgs(pending,request));
    const owner=deps.uuid(), claimArgs={p_generation:request.generation,p_owner:owner};
    const lease=object(await call("claim_google_task_sync",claimArgs));
    const fence=revision(lease.fence);
    try {
      const snapshot=parseGoogleTaskSnapshot(await call("read_google_task_sync_snapshot",{p_generation:request.generation}),request.userId,request.generation);
      const checkLease=(raw:unknown)=> {
        const value=object(raw);
        if(!fence||value.fence!==fence||value.generation!==request.generation||value.calendarId!==snapshot.scope.calendarId||
          value.syncRevision!==snapshot.scope.syncRevision||value.timezone!==snapshot.timezone||value.syncToken!==snapshot.syncToken) throw new Error("Inbound lease or scope changed.");
      };
      checkLease(lease);
      let syncToken=snapshot.syncToken, pageToken:string|undefined, reset=false, nextToken:string|undefined;
      const items:GoogleEventResource[]=[], seenPages=new Set<string>();
      for(let page=0;page<40;page++) {
        checkLease(await call("claim_google_task_sync",claimArgs));
        const params=new URLSearchParams({maxResults:"250",showDeleted:"true",singleEvents:"false"});
        if(syncToken) params.set("syncToken",syncToken);
        if(pageToken) params.set("pageToken",pageToken);
        await deps.assertCurrent();
        const response=await deps.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(snapshot.scope.calendarId)}/events?${params}`,{
          headers:{Authorization:`Bearer ${request.accessToken}`},redirect:"error",
        });
        if(response.status===410 && syncToken && !reset) {
          reset=true;syncToken=null;pageToken=undefined;items.length=0;seenPages.clear();continue;
        }
        if(!response.ok) throw new Error(`Google inbound read failed (${response.status}).`);
        const body=object(await response.json());
        if(body.items!==undefined&&!Array.isArray(body.items)) throw new Error("Invalid Google event page.");
        for(const raw of (body.items??[]) as unknown[]) items.push(object(raw) as GoogleEventResource);
        if(body.nextPageToken!==undefined) {
          pageToken=text(body.nextPageToken);
          if(body.nextSyncToken!==undefined||seenPages.has(pageToken)) throw new Error("Invalid Google pagination.");
          seenPages.add(pageToken);continue;
        }
        nextToken=text(body.nextSyncToken);break;
      }
      if(!nextToken) throw new Error("Inbound page limit reached; cursor retained.");
      // A local edit or upgraded merge policy can resolve a persisted conflict
      // even when Google has not emitted that event in this incremental page.
      const received = new Set(items.map(item => item.id));
      for (const record of snapshot.records) {
        if (!received.has(record.eventId) && (["conflict", "keep-local"].includes(String(record.decision.kind)) ||
          (snapshot.automaticSyncEnabled && record.decision.kind === "review" && record.source.status === "cancelled"))) {
          items.push(record.source as GoogleEventResource);
        }
      }
      const plan=planTaskInbound({...snapshot,scope:snapshot.scope,items});
      if(!plan.ok) throw new Error(`Invalid inbound plan: ${plan.reason}`);
      for(const entry of plan.entries) {
        if (entry.decision.kind === "merge" && !snapshot.automaticSyncEnabled) {
          const mapped = snapshot.snapshots.find(s => s.eventId === entry.eventId)!;
          entry.decision = { kind: "conflict", local: mapped.fields, remote: entry.decision.remote, base: mapped.base };
        }
        const hold=snapshot.holds.get(entry.eventId);
        const legacy=snapshot.unverified.get(entry.eventId);
        // No verified mapping means cancellation cannot delete or alter a task.
        // Retire its obsolete review while preserving explicit exclusions.
        if (snapshot.automaticSyncEnabled && entry.decision.kind === "skip" && entry.decision.reason === "cancelled-unmapped" &&
          !(hold?.kind === "skip" && hold.reason === "excluded")) continue;
        if(hold && !(entry.expected.length && entry.source.status==='cancelled' && entry.source.recurringEventId===undefined && entry.source.originalStartTime===undefined)) entry.decision=hold;
        else if(legacy?.length && !entry.expected.length) entry.decision={kind:"review",reason:"ambiguous-mapping",taskIds:[...new Set(legacy)]};
      }
      checkLease(await call("claim_google_task_sync",claimArgs));
      const args={p_generation:request.generation,p_calendar_id:snapshot.scope.calendarId,p_sync_revision:snapshot.scope.syncRevision,
        p_owner:owner,p_fence:fence,p_pass_id:deps.uuid(),p_next_sync_token:nextToken,p_entries:plan.entries};
      await deps.assertCurrent();
      await deps.writeJournal({version:1,userId:request.userId,args});
      return await commit(args);
    } finally {
      try { await call("release_google_task_sync",{...claimArgs,p_fence:fence}); } catch { /* Server lease expires; never mask pass/journal outcome. */ }
    }
  });
}
