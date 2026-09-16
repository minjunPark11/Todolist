import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
let failPlannerWrite = false;
vi.mock("../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => storage.get(key) ?? null,
      setSync: (key: string, value: string) => {
        if (failPlannerWrite && key === "focusflow.appData.v1") throw new Error("disk full");
        storage.set(key, value);
      },
      removeSync: (key: string) => void storage.delete(key),
    },
  },
}));

import {
  LEGACY_LOCAL_SPACES_KEY,
  LEGACY_LOCAL_SPACES_MIGRATED_KEY,
} from "../../lib/spaces/legacyLocalSpaces";
import type { PlannerData } from "../../types";
import {
  persistPlannerData,
  resetFocusBackupCheckForTests,
  PLANNER_STORAGE_KEY,
  FOCUS_V2_BACKUP_KEY,
  UNREADABLE_RESCUE_KEY,
} from "./persistPlannerData";

function plannerData(): PlannerData {
  return {
    tasks: [],
  focusQueue: [],
    projects: [],
    spaces: [],
    subtasks: [],
    checkItems: [],
    dailyPlans: [],
    tags: [],
    taskTags: [],
    reminders: [],
    taskTemplates: [],
    focusSessions: [],
    activeSessionId: "",
    learningPaths: [],
    folders: [],
    lists: [],
    sidebarFolders: [],
    listSections: [],
    savedFilters: [],
    settings: {} as PlannerData["settings"],
    appSettings: {} as PlannerData["appSettings"],
  };
}

describe("persistPlannerData", () => {
  beforeEach(() => {
    storage.clear();
    failPlannerWrite = false;
    // The legacy look happens once per session, not once per write. Each test
    // here IS a fresh session, and they share one module instance.
    resetFocusBackupCheckForTests();
  });
  it("backs up the exact legacy snapshot only once before rewriting focus data", () => {
    const original = JSON.stringify({focusSessions:[{id:"old",accumulatedSeconds:73}]});
    storage.set(PLANNER_STORAGE_KEY, original);
    persistPlannerData(plannerData());
    expect(storage.get(FOCUS_V2_BACKUP_KEY)).toBe(original);
    persistPlannerData(plannerData());
    expect(storage.get(FOCUS_V2_BACKUP_KEY)).toBe(original);
  });

  // This was written for the legacy GOAL blob, which went with the Goals
  // feature. The ordering it pins is not about which blob: a legacy source is
  // marked migrated only once the snapshot that adopted it is safely written,
  // so a failed write leaves the source available for the next launch.
  it("marks the legacy source only after the planner snapshot is written", () => {
    storage.set(LEGACY_LOCAL_SPACES_KEY, JSON.stringify([]));
    persistPlannerData(plannerData());
    expect(storage.has(PLANNER_STORAGE_KEY)).toBe(true);
    expect(storage.get(LEGACY_LOCAL_SPACES_MIGRATED_KEY)).toBe("1");
  });

  it("leaves the legacy source retryable when the planner write fails", () => {
    storage.set(LEGACY_LOCAL_SPACES_KEY, JSON.stringify([]));
    failPlannerWrite = true;
    expect(() => persistPlannerData(plannerData())).toThrow("disk full");
    expect(storage.has(LEGACY_LOCAL_SPACES_MIGRATED_KEY)).toBe(false);
    expect(storage.has(LEGACY_LOCAL_SPACES_KEY)).toBe(true);
  });
});

/**
 * 읽을 수 없게 된 스냅샷을 덮기 전에 옆으로 치운다.
 *
 * 저장소는 손상된다 — 쿼터에 걸려 쓰기가 중간에 끊기거나, 브라우저가 쓰는 도중에
 * 죽으면 반쪽짜리 JSON 이 남는다. 앱은 그것을 읽지 못하고 빈 상태로 시작하는데,
 * 첫 저장이 그 바이트를 덮으면 사람이 손으로 살릴 수 있었던 것까지 사라진다:
 * 잘린 JSON 에는 보통 할 일 대부분이 그대로 들어 있다.
 */
describe("읽을 수 없는 스냅샷의 구조", () => {
  // 위 블록의 `beforeEach` 는 그 `describe` 안에만 걸린다 — 여기도 같은 초기화가
  // 필요하다. 없으면 앞 테스트가 켜둔 `failPlannerWrite` 를 물려받는다 [실측].
  beforeEach(() => {
    storage.clear();
    failPlannerWrite = false;
    resetFocusBackupCheckForTests();
  });

  it("덮기 전에 한 번 옮긴다", () => {
    const broken = '{"tasks":[{"id":"t1","title":"잘린 할 일';
    storage.set(PLANNER_STORAGE_KEY, broken);

    persistPlannerData(plannerData());

    expect(storage.get(UNREADABLE_RESCUE_KEY), "읽을 수 없던 원본이 남아 있어야 한다").toBe(broken);
    expect(storage.get(PLANNER_STORAGE_KEY), "새 스냅샷은 제자리에 쓰인다").not.toBe(broken);
  });

  it("두 번째 손상이 첫 구조본을 밀어내지 않는다", () => {
    const first = '{"tasks":[{"id":"t1","title":"먼저 잘린 것';
    storage.set(PLANNER_STORAGE_KEY, first);
    persistPlannerData(plannerData());

    const second = '{"tasks":[{"id":"t2","title":"나중에 잘린 것';
    storage.set(PLANNER_STORAGE_KEY, second);
    resetFocusBackupCheckForTests();
    persistPlannerData(plannerData());

    // 더 오래된 사본이 원본에 가깝다. 밀어내면 구조가 아니라 회전이 된다.
    expect(storage.get(UNREADABLE_RESCUE_KEY)).toBe(first);
  });

  it("읽히는 스냅샷은 구조하지 않는다", () => {
    storage.set(PLANNER_STORAGE_KEY, JSON.stringify(plannerData()));

    persistPlannerData(plannerData());

    expect(storage.has(UNREADABLE_RESCUE_KEY), "멀쩡한 저장소에 구조본을 만들면 그것도 쓰레기다").toBe(false);
  });

  it("저장소가 비어 있으면 구조할 것이 없다", () => {
    storage.delete(PLANNER_STORAGE_KEY);

    persistPlannerData(plannerData());

    expect(storage.has(UNREADABLE_RESCUE_KEY)).toBe(false);
  });
});
