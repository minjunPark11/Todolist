// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePlannerData } from "./usePlannerData";
import { popUndo, undoDepth } from "../lib/undoStack";

/**
 * 배경에서 내려온 구글 동기화 결과는 Ctrl+Z 로 벗겨지면 안 된다.
 *
 * `applyGoogleSync` 는 `useGoogleOutboundSync` 가 배경에서 부른다 — 사용자가
 * 한 편집이 아니다. 그런데 `setData` 를 쓰고 있었고, `setData` 는 되돌리기
 * 항목을 만든다. `pushUndo` 가 150ms 안의 연속 푸시를 한 묶음으로 묶으므로
 * 사용자의 편집 바로 뒤에 동기화가 내려오면 **같은 항목에 합쳐졌다** [실측]:
 *
 *   되돌리기 깊이 : 편집 뒤 1 → 구글 동기화 뒤 1
 *   googleEventId : 동기화 뒤 "ev-1" → Ctrl+Z 뒤 undefined
 *
 * 자기 편집을 물리려고 누른 한 번이 구글 연결까지 벗겼고, 둘을 갈라 물릴
 * 방법이 없었다. 그리고 `applyGoogleSync` 안의 주석이 그 다음을 적어뒀다 —
 * 연결이 없고 자격이 되면 다음 패스가 다시 만든다. 사용자의 캘린더에 같은
 * 일정이 하나 더 생긴다.
 */

const mocks = vi.hoisted(() => ({ storage: new Map<string, string>() }));
vi.mock("../platform", () => ({
  platform: {
    kind: "web",
    storage: {
      getSync: (key: string) => mocks.storage.get(key) ?? null,
      setSync: (key: string, value: string) => { mocks.storage.set(key, value); },
    },
  },
}));
vi.mock("../lib/notificationStore", () => ({ recordNotification: vi.fn() }));
vi.mock("../lib/focusHost", () => ({
  connectFocusHost: ({ ready }: { ready: () => void }) => {
    ready();
    return { owned: true, close: vi.fn(), send: vi.fn() };
  },
}));
vi.mock("../services/supabaseClient", () => ({ isSupabaseConfigured: false, supabase: null }));

beforeEach(() => {
  mocks.storage.clear();
  while (popUndo()) { /* 앞 검사가 남긴 것을 비운다 */ }
  cleanup();
});

it("사용자의 Ctrl+Z 가 배경 구글 동기화까지 벗기지 않는다", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.lists.length).toBeGreaterThan(0));

  let id = "";
  act(() => { id = result.current.addTask({ title: "사용자가 만든 것" }); });

  // 자기 점검 ①: 되돌릴 것이 실제로 줄 서 있어야 아래가 무언가를 잰다.
  expect(undoDepth(), "사용자 편집은 되돌리기 항목을 만든다").toBeGreaterThan(0);

  act(() => {
    result.current.applyGoogleSync({
      mapped: [{ taskId: id, googleEventId: "ev-1", googleEtag: "etag-1", googleSyncedAt: "2026-09-19T00:00:00.000Z" }],
    });
  });

  // 자기 점검 ②: 동기화가 실제로 연결을 붙였어야 한다.
  expect(result.current.tasks.find((t) => t.id === id)?.googleEventId, "동기화가 연결을 붙였어야 한다").toBe("ev-1");

  // 거절돼야 한다 — 저장소를 시스템 경로가 갈아끼웠으므로. 거절은 조용하지
  // 않다: 부르는 쪽이 `undoDepth` 로 세어 토스트를 띄운다.
  let applied = true;
  act(() => { applied = popUndo(); });

  expect(applied, "시스템 경로가 갈아끼운 저장소 위에서 되돌리기는 거절된다").toBe(false);
  expect(
    result.current.tasks.find((t) => t.id === id)?.googleEventId,
    "Ctrl+Z 가 구글 연결을 벗기면 다음 패스가 같은 일정을 하나 더 만든다",
  ).toBe("ev-1");
});
