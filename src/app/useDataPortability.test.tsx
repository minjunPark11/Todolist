// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDataPortability } from "./useDataPortability";
import type { PlannerData } from "../types";

/**
 * 파일을 고른 뒤 무슨 일이 일어나는가.
 *
 * 관문 자체는 `e2e/importGate.spec.ts` 가 브라우저에서 본다. 여기서 보는 것은
 * 브라우저로 만들기 어려운 쪽이다 — **읽기가 실패했을 때**.
 *
 * `FileReader` 가 실패하면 `onload` 는 오지 않는다. 전에는 `onerror` 가
 * 없어서 두 가지가 한꺼번에 일어났다: 화면이 아무 말도 하지 않고, 파일
 * 입력이 비워지지 않아 **같은 파일로 다시 시도할 수도 없었다**. 브라우저는
 * 값이 그대로면 두 번째 선택을 `change` 로 보지 않는다.
 */

const NOW = "2026-08-18T00:00:00.000Z";

function account(titles: string[]): PlannerData {
  return {
    tasks: titles.map((title, index) => ({
      id: `t${index}`, title, listId: "l1", status: "todo", order: index, createdAt: NOW, updatedAt: NOW,
    })),
    lists: [{ id: "l1", name: "목록", order: 0, kind: "regular", projectId: "", spaceId: "", createdAt: NOW, updatedAt: NOW }],
  } as unknown as PlannerData;
}

/** 열린 채로 붙잡아 두는 가짜 리더 — 성공도 실패도 검사가 고른다. */
class StubReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  static latest: StubReader | null = null;
  constructor() {
    StubReader.latest = this;
  }
  readAsText() {
    /* 검사가 직접 끝낸다. */
  }
  succeed(text: string) {
    this.result = text;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

const importData = vi.fn();
let input: { files: File[]; value: string };

function pick(contents: string): { target: unknown } {
  input = { files: [new File([contents], "backup.json")], value: "C:\\fakepath\\backup.json" };
  return { target: input };
}

function mount() {
  return renderHook(() =>
    useDataPortability({ today: "2026-08-18", exportData: () => account(["여기 있던 것"]), importData }),
  );
}

beforeEach(() => {
  importData.mockReset().mockReturnValue(true);
  vi.stubGlobal("FileReader", StubReader);
});
afterEach(() => vi.unstubAllGlobals());

describe("파일을 고른 뒤", () => {
  it("읽기가 실패하면 그렇다고 말하고, 같은 파일을 다시 고를 수 있게 비운다", () => {
    const { result } = mount();
    act(() => result.current.handleImport(pick("{}") as never));
    act(() => StubReader.latest!.fail());

    expect(result.current.importMessage, "조용히 지나가면 누른 사람은 눌린 줄도 모른다").toBe("settings.importUnreadable");
    expect(input.value, "비우지 않으면 같은 파일의 두 번째 선택이 `change` 를 내지 않는다").toBe("");
    expect(importData, "읽지도 못한 것을 적용하면 안 된다").not.toHaveBeenCalled();
    expect(result.current.importPreview).toBeNull();
  });

  it("읽히면 관문 앞에 세우고, 그 전에는 적용하지 않는다", () => {
    const { result } = mount();
    act(() => result.current.handleImport(pick('{"tasks":[]}') as never));
    act(() => StubReader.latest!.succeed('{"tasks":[]}'));

    expect(result.current.importPreview, "관문이 열려야 한다").not.toBeNull();
    expect(result.current.importPreview?.currentTasks, "지금 여기 있는 것을 세어 말한다").toBe(1);
    expect(result.current.importPreview?.fileTasks).toBe(0);
    expect(importData, "묻기 전에 대신하면 그것이 이 고침 이전의 모습이다").not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("물러나면 아무 일도 없었던 것이 된다", () => {
    const { result } = mount();
    act(() => result.current.handleImport(pick('{"tasks":[]}') as never));
    act(() => StubReader.latest!.succeed('{"tasks":[]}'));
    act(() => result.current.cancelImport());

    expect(result.current.importPreview).toBeNull();
    expect(importData).not.toHaveBeenCalled();
    // 물러났다는 문장을 남기지 않는다. 그 자리에 남으면 다음 가져오기의
    // 결과처럼 읽힌다.
    expect(result.current.importMessage).toBe("");
  });

  it("확정하면 적용한다 — 그물의 자기 점검", () => {
    // 위 셋은 "가져오기가 아예 안 되는" 구현으로도 통과한다.
    const { result } = mount();
    act(() => result.current.handleImport(pick('{"tasks":[]}') as never));
    act(() => StubReader.latest!.succeed('{"tasks":[]}'));
    act(() => result.current.confirmImport());

    expect(importData).toHaveBeenCalledTimes(1);
    expect(result.current.importMessage).toBe("settings.importDone");
    expect(result.current.importPreview).toBeNull();
  });

  it("JSON 이 아니면 관문을 열지 않는다", () => {
    const { result } = mount();
    act(() => result.current.handleImport(pick("nope") as never));
    act(() => StubReader.latest!.succeed("nope"));

    expect(result.current.importMessage).toBe("settings.importInvalidJson");
    expect(result.current.importPreview).toBeNull();
    expect(importData).not.toHaveBeenCalled();
  });
});
