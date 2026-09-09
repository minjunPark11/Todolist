import { expect, it, vi } from "vitest";
import { createGoogleTaskInboundDeps } from "./googleTaskInboundTransport";
it("captures credentials and rejects account switches without following a mutable session",async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response("{}"));
  const currentUser=vi.fn().mockResolvedValue("user");
  const values=new Map<string,string>();
  const input={userId:"user",generation:"gen",jwt:"original",anonKey:"anon",supabaseUrl:"https://db.example",fetch:fetcher,currentUser,
    storage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}},
    locks:{request:vi.fn()} as unknown as LockManager};
  const deps=createGoogleTaskInboundDeps(input);
  input.jwt="replacement";input.userId="other";
  await deps.rpc("read",{});
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer original");
  await deps.writeJournal({version:1});expect(values.has("focusflow.google-inbound.v1:user:gen")).toBe(true);
  currentUser.mockResolvedValue("other");await expect(deps.assertCurrent()).rejects.toThrow("account changed");
});
