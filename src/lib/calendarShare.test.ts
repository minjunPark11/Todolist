import { describe, expect, it } from "vitest";
import { buildCalendarShareSnapshot } from "./calendarShare";
import type { List, Task } from "../types";

/**
 * 이 기기를 떠나는 것.
 *
 * 공유 링크는 토큰만 있으면 누구나 부를 수 있는 주소다. 그러므로 이 함수가
 * 통과시키는 것이 곧 **모르는 사람이 볼 수 있는 것**이고, 그 목록은 코드를
 * 읽어서가 아니라 검사로 적혀 있어야 한다.
 *
 * 검사가 하나도 없었다. 그리고 규칙이 두 군데로 갈라져 있었다: 이 함수는
 * `isTaskAlive`(할 일 자신의 상태만) 를 쓰고, 부르는 쪽은 `isTaskActive`
 * (목록의 상태까지) 로 한 번 거른 목록을 넘겼다. 그래서 이 함수만 놓고 보면
 * **휴지통에 버린 목록과 보관한 목록의 할 일이 그대로 나갔다** [실측].
 * 실제로 새지는 않았지만, 맞는 규칙이 부르는 쪽에만 있는 상태였다.
 */

const NOW = "2026-08-18T00:00:00.000Z";

const LISTS: List[] = [
  { id: "live", name: "살아 있는 목록", kind: "regular", projectId: "", spaceId: "", createdAt: NOW, updatedAt: NOW },
  { id: "binned", name: "버린 목록", kind: "regular", projectId: "", spaceId: "", deletedAt: NOW, createdAt: NOW, updatedAt: NOW },
  { id: "archived", name: "보관한 목록", kind: "regular", projectId: "", spaceId: "", archivedAt: NOW, createdAt: NOW, updatedAt: NOW },
] as unknown as List[];

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "제목",
    listId: "live",
    status: "todo",
    order: 0,
    dueDate: "2026-08-20",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Task;
}

function shared(tasks: Task[]): string[] {
  return buildCalendarShareSnapshot({ tasks, lists: LISTS }).events.map((event) => event.title);
}

describe("공유 링크로 나가는 것", () => {
  it("버린 목록과 보관한 목록의 할 일은 나가지 않는다", () => {
    // 목록을 버리는 것은 그 안의 할 일에 아무것도 쓰지 않는다 (§6.56).
    // 그래서 할 일만 봐서는 알 수 없고, 목록을 같이 봐야 한다.
    expect(
      shared([
        task({ id: "a", title: "살아 있는 것", listId: "live" }),
        task({ id: "b", title: "버린 목록의 것", listId: "binned" }),
        task({ id: "c", title: "보관한 목록의 것", listId: "archived" }),
      ]),
    ).toEqual(["살아 있는 것"]);
  });

  it("휴지통과 '안 함'은 나가지 않는다", () => {
    expect(
      shared([
        task({ id: "d", title: "휴지통", deletedAt: NOW }),
        task({ id: "e", title: "안 함", status: "wont_do" }),
      ]),
    ).toEqual([]);
  });

  it("완료한 것은 나간다 — 그날 있었던 일이다", () => {
    // 이것이 "전부 막는" 구현을 걸러낸다. 달력은 끝난 일도 적는 물건이다.
    expect(shared([task({ id: "f", title: "끝낸 일", status: "completed" })])).toEqual(["끝낸 일"]);
  });

  it("날짜가 없으면 나갈 자리가 없다", () => {
    expect(shared([task({ id: "g", title: "언젠가", dueDate: undefined })])).toEqual([]);
    // 제목이 없는 것도 마찬가지다 — 달력에 그릴 것이 없다.
    expect(shared([task({ id: "h", title: "" })])).toEqual([]);
  });

  it("제목·날짜·시각만 실린다 — 설명도 태그도 목록 이름도 아니다", () => {
    const snapshot = buildCalendarShareSnapshot({
      tasks: [
        task({
          id: "i",
          title: "회의",
          description: "아무에게도 보이면 안 되는 메모",
          startTime: "09:00",
          endTime: "10:00",
          tags: ["비공개"],
        } as Partial<Task>),
      ],
      lists: LISTS,
    });

    expect(Object.keys(snapshot.events[0]).sort()).toEqual(["date", "endTime", "startTime", "title", "uid"]);
    const wire = JSON.stringify(snapshot);
    expect(wire, "설명이 밖으로 나가면 링크를 받은 사람이 읽는다").not.toContain("보이면 안 되는");
    expect(wire, "태그도 나가지 않는다").not.toContain("비공개");
    expect(wire, "어느 목록에 있는지도 나가지 않는다").not.toContain("살아 있는 목록");
  });

  it("한 할 일은 한 번만 나간다", () => {
    // 전에는 시각이 있는 블록과 마감 표시를 따로 내보내 구독자의 달력에
    // 같은 날 같은 제목이 둘 들어갔다.
    const snapshot = buildCalendarShareSnapshot({
      tasks: [task({ id: "j", title: "하나뿐", startTime: "13:00", endTime: "14:00" })],
      lists: LISTS,
    });
    expect(snapshot.events).toHaveLength(1);
  });
});
