// 레일 동기화 버튼의 얼굴 (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §11).
import { describe, expect, it } from "vitest";
import { railSyncState } from "./railSync";

const cal = (enabled: boolean, syncStatus?: string) => ({ enabled, syncStatus });
const account = (accountStatus: string) => ({ signedIn: true, accountStatus, calendars: [] });

describe("레일 동기화 버튼", () => {
  it("맞출 것이 없으면 그리지 않는다 (F2)", () => {
    expect(railSyncState({ signedIn: false, accountStatus: "sync.localMode", calendars: [] })).toBeNull();
  });

  it("꺼둔 구독만 있으면 그리지 않는다", () => {
    // 버튼이 건너뛸 것의 상태를 그리면 안 된다 — `syncAllExternalCalendars`도
    // enabled만 돈다.
    expect(railSyncState({ signedIn: false, accountStatus: "sync.localMode", calendars: [cal(false)] })).toBeNull();
  });

  it("계정이 없어도 켜진 구독이 있으면 그린다 (§11의 F2 재해석)", () => {
    expect(railSyncState({ signedIn: false, accountStatus: "sync.localMode", calendars: [cal(true)] })).toBe("idle");
  });

  it("계정 상태를 그대로 읽는다", () => {
    expect(railSyncState(account("sync.syncing"))).toBe("syncing");
    expect(railSyncState(account("sync.syncFailed"))).toBe("failed");
    expect(railSyncState(account("sync.retrying"))).toBe("failed");
    expect(railSyncState(account("sync.synced"))).toBe("idle");
    expect(railSyncState(account("sync.ready"))).toBe("idle");
  });

  it("로그인하지 않았으면 계정 상태를 읽지 않는다", () => {
    // 로그아웃 직전의 `syncFailed`가 로컬 모드까지 따라오면, 고칠 수 없는
    // 실패를 계속 보여주게 된다.
    expect(railSyncState({ signedIn: false, accountStatus: "sync.syncFailed", calendars: [cal(true)] })).toBe("idle");
  });

  it("캘린더 하나가 돌면 버튼도 돈다", () => {
    expect(railSyncState({ signedIn: true, accountStatus: "sync.synced", calendars: [cal(true, "syncing")] })).toBe("syncing");
  });

  it("캘린더 하나가 실패하면 버튼도 실패다", () => {
    expect(railSyncState({ signedIn: true, accountStatus: "sync.synced", calendars: [cal(true, "failed")] })).toBe("failed");
  });

  it("도는 중이 실패보다 앞선다", () => {
    const state = railSyncState({
      signedIn: true,
      accountStatus: "sync.syncFailed",
      calendars: [cal(true, "syncing")],
    });
    expect(state).toBe("syncing");
  });

  it("성공과 숨김은 쉬는 중이다", () => {
    // "hidden"은 보이지 않는 캘린더의 성공이다 — 실패가 아니다.
    const calendars = [cal(true, "success"), cal(true, "hidden"), cal(true, "idle")];
    expect(railSyncState({ signedIn: true, accountStatus: "sync.synced", calendars })).toBe("idle");
  });
});
