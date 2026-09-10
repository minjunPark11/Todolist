import type { TaskInboundEntry, TaskInboundSnapshot, TaskInboundScope } from "../domain/calendar/googleSync/taskInboundPlan";
import type { TaskInboundFields } from "../domain/calendar/googleSync/taskInboundShape";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Google task sync snapshot.");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Missing Google task sync identity.");
  return value;
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value)<0) throw new Error("Invalid sync revision.");
  return Number(value);
}
function fields(value: unknown, strict=false): TaskInboundFields {
  const data=object(value);
  const result = {} as TaskInboundFields;
  for (const key of ["title","description","startDate","dueDate","startTime","endTime"] as const) {
    if(strict && typeof data[key]!=="string") throw new Error("Incomplete mapping base.");
    const v=data[key] ?? "";
    if (typeof v!=="string") throw new Error("Invalid task shared fields.");
    result[key]=v;
  }
  return result;
}
export function parseGoogleTaskSnapshot(raw: unknown, userId: string, generation: string) {
  const data=object(raw);
  if(data.userId!==userId || data.generation!==generation) throw new Error("Google task sync account changed.");
  const scope: TaskInboundScope={userId,connectionGeneration:generation,calendarId:text(data.calendarId),syncRevision:revision(data.syncRevision)};
  const timezone=text(data.timezone); new Intl.DateTimeFormat("en",{timeZone:timezone}).format(0);
  const inboxListId=text(data.inboxListId);
  const syncToken=data.syncToken===null ? null : text(data.syncToken);
  if(!Array.isArray(data.tasks)||!Array.isArray(data.mappings)||!Array.isArray(data.records)) throw new Error("Incomplete sync snapshot.");
  const tasks=new Map<string,{revision:number;data:Record<string,unknown>}>();
  for(const item of data.tasks) {
    const row=object(item), id=text(row.id), rev=revision(row.revision);
    if(!rev || tasks.has(id)) throw new Error("Duplicate or invalid task row.");
    tasks.set(id,{revision:rev,data:object(row.data)});
  }
  const snapshots:TaskInboundSnapshot[]=[];
  const mappedTasks=new Set<string>(), eventIds=new Set<string>(), liveTasks=new Set<string>();
  for(const item of data.mappings) {
    const m=object(item), eventId=text(m.event_id), taskId=text(m.task_id);
    if(m.generation!==generation||m.calendar_id!==scope.calendarId||eventIds.has(eventId)||
      !["active","trashed","deleted"].includes(String(m.state))) throw new Error("Invalid mapping scope.");
    eventIds.add(eventId); mappedTasks.add(taskId);
    if(m.state!=="deleted") {
      if(liveTasks.has(taskId)) throw new Error("Ambiguous live mapping.");
      liveTasks.add(taskId);
    }
    const row=tasks.get(taskId);
    if(!row && m.state!=="deleted") throw new Error("Mapping task missing; repair required.");
    snapshots.push({eventId,taskId,revision:row?.revision??0,state:m.state as TaskInboundSnapshot["state"],
      fields:fields(row?.data??{}),...(typeof m.remote_deleted==='boolean'?{remoteDeleted:m.remote_deleted}:{}),
      ...(m.state==='trashed'&&row&&!row.data.deletedAt?{locallyRestored:true}:{}),
      ...(m.base===null||m.base===undefined?{}:{base:fields(m.base,true)})});
  }
  const unverified=new Map<string,string[]>();
  for(const [taskId,row] of tasks) if(!mappedTasks.has(taskId)) {
    snapshots.push({eventId:"",taskId,revision:row.revision,state:row.data.deletedAt?"trashed":"active",fields:fields(row.data)});
    if(typeof row.data.googleEventId==="string" && row.data.googleEventId) {
      const ids=unverified.get(row.data.googleEventId)??[]; ids.push(taskId); unverified.set(row.data.googleEventId,ids);
    }
  }
  const holds=new Map<string,TaskInboundEntry["decision"]>();
  const seenRecords=new Set<string>();
  for(const item of data.records) {
    const r=object(item), id=text(r.event_id), decision=object(r.decision);
    if(r.generation!==generation||r.calendar_id!==scope.calendarId||seenRecords.has(id)) throw new Error("Invalid record scope.");
    seenRecords.add(id);
    if(decision.kind==="review" || (decision.kind==="skip"&&decision.reason==="excluded")) {
      if(typeof decision.reason!=="string" || (decision.kind==="review"&&(!Array.isArray(decision.taskIds)||!decision.taskIds.every(x=>typeof x==="string")))) throw new Error("Invalid review record.");
      holds.set(id,decision as unknown as TaskInboundEntry["decision"]);
    }
  }
  return {scope,timezone,inboxListId,syncToken,snapshots,holds,unverified,tasks,
    automaticSyncEnabled: data.automaticSyncEnabled === true,
    repeatBases: new Map(data.mappings.map(item => { const m = object(item); return [text(m.event_id), m.repeat_base ? object(m.repeat_base) : null] as const; })),
    occurrenceSyncEnabled: data.occurrenceSyncEnabled === true,
    seriesSources: new Map(data.mappings.map(item => { const m = object(item); return [text(m.event_id), object(m.source ?? {})] as const; })),
    occurrenceReceipts: Array.isArray(data.occurrenceReceipts) ? data.occurrenceReceipts.map(object) : [],
    records:data.records.map(item=>{const r=object(item);return {eventId:text(r.event_id),revision:revision(r.revision),source:object(r.source),decision:object(r.decision)};}),
    operations:Array.isArray(data.operations)?data.operations.map(object):[],
    historicalTaskIds:new Set(Array.isArray(data.historicalTaskIds)?data.historicalTaskIds.map(text):[])};
}
