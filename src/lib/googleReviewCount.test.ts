import { describe, expect, it } from "vitest";
import { googleReviewCount, googleReviewGroups } from "./googleReviewCount";
import { parseGoogleTaskSnapshot } from "./googleTaskInboundSnapshot";
import type { GoogleTaskSyncState } from "./googleTaskSyncState";

/**
 * 세는 쪽과 그리는 쪽이 같은 것을 봐야 한다.
 *
 * 이 숫자는 장식이 아니다. 설정 카드는 `googleReviewCount(...) > 0` 일 때만
 * 검토 패널을 여는 버튼을 그리므로, 이 수가 0 이면 패널 안의 줄에 닿을 길이
 * 없다. 그래서 "패널이 그리는 줄의 수"와 "이 수"가 어긋나면 그냥 숫자가 틀린
 * 것이 아니라 **닿을 수 없는 화면**이 생긴다.
 *
 * 실제로 그랬다 [실측]. 제외해 둔 일정 하나만 남았을 때:
 *
 *   googleReviewCount = 0
 *   패널에 그려진 줄  = 1  ("Import as a separate task" 버튼이 달린 줄)
 *   패널 머리글       = "Google sync review (0)"
 *   카드의 패널 열기 버튼 = 없음
 *
 * `excluded` 는 `kind` 가 `"skip"` 이라 `["conflict","review"]` 에 안 걸리고,
 * 건너뛴 목록은 `"excluded"` 를 빼고 세기 때문이다. 패널은 그 줄을 위해
 * 이름을 따로 붙이고("Excluded") 제외 버튼까지 숨겨 두는데 — 되돌릴 수
 * 있어야 한다는 뜻이다 — 정작 그 문이 닫혀 있었다.
 */

const fields = { title: "제목", description: "", startDate: "", dueDate: "2026-09-09", startTime: "", endTime: "" };

function snapshotOf(records: unknown[], extras: Record<string, unknown> = {}) {
  return parseGoogleTaskSnapshot(
    {
      userId: "u",
      generation: "g",
      calendarId: "c",
      syncRevision: 1,
      timezone: "Asia/Seoul",
      inboxListId: "inbox",
      syncToken: "tok",
      tasks: [],
      mappings: [],
      records,
      ...extras,
    },
    "u",
    "g",
  );
}

function stateOf(snapshot: ReturnType<typeof snapshotOf>): GoogleTaskSyncState {
  return { enabled: true, busy: false, pending: false, error: "", snapshot };
}

const source = (id: string) => ({ id, etag: "e", summary: id, start: { date: "2026-09-09" }, end: { date: "2026-09-10" } });
const record = (id: string, decision: unknown) => ({ generation: "g", calendar_id: "c", event_id: id, revision: 1, source: source(id), decision });

describe("검토 수", () => {
  it("제외해 둔 일정도 센다 — 패널이 그것을 줄로 그리기 때문이다", () => {
    const snapshot = snapshotOf([record("ev", { kind: "skip", reason: "excluded" })]);
    const groups = googleReviewGroups(snapshot);

    expect(groups.reviews, "패널은 이것을 검토 줄로 그린다").toHaveLength(1);
    expect(groups.skips, "건너뛴 목록에 또 넣으면 두 번 세는 것이 된다").toHaveLength(0);
    expect(
      googleReviewCount(stateOf(snapshot)),
      "0 이면 설정 카드가 패널을 여는 버튼을 그리지 않아, 저 줄의 되돌리기 버튼에 닿을 수 없다",
    ).toBe(1);
  });

  it("말없이 넘어가는 이유들은 세지 않는다 — 그물의 자기 점검", () => {
    // 위 검사가 "전부 세면 통과"라면 아무거나 세는 구현도 통과한다.
    // 패널이 **그리지 않는** 것은 숫자에도 없어야 한다.
    const quiet = ["already-trashed", "cancelled-unmapped", "deleted", "recurring-instance"];
    const snapshot = snapshotOf(quiet.map((reason, index) => record(`ev${index}`, { kind: "skip", reason })));
    const groups = googleReviewGroups(snapshot);

    expect(groups.reviews).toHaveLength(0);
    expect(groups.skips).toHaveLength(0);
    expect(googleReviewCount(stateOf(snapshot)), "사람이 할 일이 없는 것을 세면 지워지지 않는 배지가 된다").toBe(0);
  });

  it("모양 때문에 못 들여온 것은 건너뛴 목록으로 세고, 검토 줄로는 안 센다", () => {
    const snapshot = snapshotOf([
      record("a", { kind: "skip", reason: "unsupported-schedule" }),
      record("b", { kind: "skip", reason: "invalid-event" }),
    ]);
    const groups = googleReviewGroups(snapshot);

    expect(groups.skips).toHaveLength(2);
    expect(groups.reviews).toHaveLength(0);
    expect(googleReviewCount(stateOf(snapshot))).toBe(2);
  });

  it("스냅샷이 없으면 남은 것은 못 보낸 반복 일정뿐이다", () => {
    const state: GoogleTaskSyncState = {
      enabled: true,
      busy: false,
      pending: false,
      error: "",
      snapshot: null,
      occurrenceConflicts: [{ title: "주간 회의", date: "2026-09-16" }],
    };
    expect(googleReviewCount(state)).toBe(1);
    expect(googleReviewGroups(null).reviews, "스냅샷 없이 묶을 것은 없다").toHaveLength(0);
  });
});
