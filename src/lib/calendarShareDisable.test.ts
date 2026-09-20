// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), upsert: vi.fn() }));
vi.mock("../services/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      update: (payload: unknown) => { mocks.update(payload); return { eq: async () => ({ error: null }) }; },
      upsert: async (payload: unknown) => { mocks.upsert(payload); return { error: null }; },
    }),
  },
}));

import { disableCalendarShare, publishCalendarShare } from "./calendarShare";

const SNAPSHOT = {
  version: 1 as const,
  generatedAt: "2026-09-01T00:00:00.000Z",
  events: [{ uid: "a", title: "병원 예약", date: "2026-09-02" }],
};

beforeEach(() => { vi.clearAllMocks(); });

describe("공유를 끄는 것", () => {
  it("올렸던 스냅샷을 행에 남겨두지 않는다", async () => {
    await disableCalendarShare("a".repeat(48));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mock.calls[0][0] as { enabled: boolean; data: unknown };
    expect(payload.enabled).toBe(false);
    expect(payload.data).toEqual({});
  });

  it("자기 점검: 켤 때는 그 스냅샷이 실제로 올라간다", async () => {
    // 이게 없으면 위의 검사는 '아무것도 안 올린다'와 구별되지 않는다.
    await publishCalendarShare({ token: "b".repeat(48), enabled: true, snapshot: SNAPSHOT });
    const payload = mocks.upsert.mock.calls[0][0] as { data: typeof SNAPSHOT };
    expect(payload.data.events).toHaveLength(1);
    expect(payload.data.events[0].title).toBe("병원 예약");
  });
});
