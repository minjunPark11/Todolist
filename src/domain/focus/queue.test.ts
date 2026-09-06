// 큐가 지켜야 하는 것들 (FOCUS_LAYOUT_DESIGN.md Phase 2의 결정 7·8·9·10).
import { describe, expect, it } from "vitest";
import { addToQueue, compactQueue, moveInQueue, removeFromQueue, visibleQueue } from "./queue";

const task = (id: string, extra: Record<string, string> = {}) => ({ id, ...extra });
const live = [task("a"), task("b"), task("c"), task("d")];

describe("집중 큐", () => {
  it("같은 Task는 한 번만 들어간다 (결정 7)", () => {
    const once = addToQueue([], "a", live);
    expect(addToQueue(once, "a", live)).toEqual(["a"]);
  });

  it("이미 있는 것을 다시 넣어도 자리가 바뀌지 않는다", () => {
    // 다시 넣기가 맨 뒤로 보내는 동작이면, 실수로 두 번 누른 사람이 자기가
    // 만든 순서를 잃는다. 순서를 바꾸는 것은 드래그의 일이다.
    expect(addToQueue(["a", "b", "c"], "a", live)).toEqual(["a", "b", "c"]);
  });

  it("큐에서 빼도 Task는 남는다 (결정 8)", () => {
    const next = removeFromQueue(["a", "b"], "a", live);
    expect(next).toEqual(["b"]);
    expect(live.some((t) => t.id === "a")).toBe(true);
  });

  it("완료되거나 지워진 것은 보이지도 저장되지도 않는다 (결정 9)", () => {
    const tasks = [
      task("a"),
      task("b", { status: "completed" }),
      task("c", { deletedAt: "2026-09-06T00:00:00.000Z" }),
      task("d", { completedAt: "2026-09-06T00:00:00.000Z" }),
    ];
    const queue = ["a", "b", "c", "d", "없는id"];
    expect(visibleQueue(queue, tasks).map((t) => t.id)).toEqual(["a"]);
    expect(compactQueue(queue, tasks)).toEqual(["a"]);
  });

  it("저장된 순서를 그대로 읽는다 — Task 배열의 순서가 아니라", () => {
    // 결정 2: 큐는 Task 원래 정렬과 독립이다. 이 단언이 그것을 지킨다.
    expect(visibleQueue(["d", "b", "a"], live).map((t) => t.id)).toEqual(["d", "b", "a"]);
  });

  describe("드래그로 옮기기 (결정 10)", () => {
    it("아래로 내린다", () => {
      expect(moveInQueue(["a", "b", "c", "d"], "a", 2, live)).toEqual(["b", "c", "a", "d"]);
    });

    it("위로 올린다", () => {
      expect(moveInQueue(["a", "b", "c", "d"], "d", 0, live)).toEqual(["d", "a", "b", "c"]);
    });

    it("끝을 넘겨 놓아도 끝에 붙는다", () => {
      expect(moveInQueue(["a", "b", "c"], "a", 99, live)).toEqual(["b", "c", "a"]);
    });

    it("제자리에 놓으면 그대로다", () => {
      expect(moveInQueue(["a", "b", "c"], "b", 1, live)).toEqual(["a", "b", "c"]);
    });

    it("큐에 없는 것은 옮기지 않는다", () => {
      expect(moveInQueue(["a", "b"], "c", 0, live)).toEqual(["a", "b"]);
    });
  });

  it("중복이 이미 저장돼 있어도 한 번만 살아남는다", () => {
    // 저장된 데이터는 이 코드가 쓴 것만이 아니다 — 동기화나 손으로 고친 것이
    // 들어올 수 있고, 그때 화면이 같은 줄을 두 번 그리면 안 된다.
    expect(compactQueue(["a", "b", "a"], live)).toEqual(["a", "b"]);
    expect(visibleQueue(["a", "b", "a"], live).map((t) => t.id)).toEqual(["a", "b"]);
  });
});
