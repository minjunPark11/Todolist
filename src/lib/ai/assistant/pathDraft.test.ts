import { describe, expect, it } from "vitest";
import { looksLikeLearningPathRequest, MAX_PATH_MILESTONES, resolveLearningPathDraft } from "./pathDraft";

describe("looksLikeLearningPathRequest", () => {
  it("fires on explicit path/curriculum requests", () => {
    expect(looksLikeLearningPathRequest("중국어 배우는 학습 경로 만들어줘")).toBe(true);
    expect(looksLikeLearningPathRequest("파이썬 커리큘럼 짜줘")).toBe(true);
    expect(looksLikeLearningPathRequest("이 목표를 단계로 나눠줘")).toBe(true);
    expect(looksLikeLearningPathRequest("HSK4 로드맵 좀 그려줘")).toBe(true);
    expect(looksLikeLearningPathRequest("can you make a learning path for Rust?")).toBe(true);
  });

  it("stays silent on ordinary overwhelm / next-action turns", () => {
    // Plain overwhelm dump — the existing fallback flow must own these.
    expect(looksLikeLearningPathRequest("중국어도 해야 하고 영어도 해야 하고 논문도 해야 하는데 뭐부터 해야 할지 모르겠어")).toBe(false);
    expect(looksLikeLearningPathRequest("뭐부터 해야 해?")).toBe(false);
    // Path noun without a request verb: a complaint, not a request.
    expect(looksLikeLearningPathRequest("앞으로의 경로가 안 보여")).toBe(false);
    // Request verb without a path noun: a normal task ask.
    expect(looksLikeLearningPathRequest("오늘 할 일 정리해줘")).toBe(false);
  });
});

function raw(title: string, doneCriteria = `${title} 노트 1개 작성됨`) {
  return { title, doneCriteria };
}

describe("resolveLearningPathDraft", () => {
  it("builds a draft with ids, empty cardIds, and preserved order", () => {
    const draft = resolveLearningPathDraft("HSK4 수준 중국어", [raw("병음과 성조"), raw("기초 어법"), raw("HSK4 단어 800개")]);
    expect(draft).not.toBeNull();
    expect(draft!.goal).toBe("HSK4 수준 중국어");
    expect(draft!.milestones.map((m) => m.title)).toEqual(["병음과 성조", "기초 어법", "HSK4 단어 800개"]);
    for (const milestone of draft!.milestones) {
      expect(milestone.id).toMatch(/^ms-/);
      expect(milestone.cardIds).toEqual([]);
    }
  });

  it("repairs an unobservable done criteria instead of dropping the milestone", () => {
    const draft = resolveLearningPathDraft("목표", [
      raw("1단계", "열심히 하면 됨"), // vague → repaired
      raw("2단계"),
      raw("3단계"),
    ]);
    expect(draft!.milestones[0].doneCriteria).toBe("「1단계」의 산출물 1개가 남아 있는 상태");
    expect(draft!.milestones[1].doneCriteria).toBe("2단계 노트 1개 작성됨");
  });

  it("dedupes titles and clamps to the milestone cap", () => {
    const many = ["a", "A", "b", "c", "d", "e", "f", "g"].map((title) => raw(title));
    const draft = resolveLearningPathDraft("목표", many);
    expect(draft!.milestones).toHaveLength(MAX_PATH_MILESTONES);
    expect(draft!.milestones.map((m) => m.title)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns null (no proposal) when the goal is empty or too few milestones survive", () => {
    expect(resolveLearningPathDraft("  ", [raw("a"), raw("b"), raw("c")])).toBeNull();
    expect(resolveLearningPathDraft("목표", [raw("a"), raw("b")])).toBeNull();
    expect(resolveLearningPathDraft("목표", [raw("a"), raw("a"), raw("A"), raw(" ")])).toBeNull();
  });
});
