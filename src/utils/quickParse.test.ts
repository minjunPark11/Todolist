import { describe, expect, it } from "vitest";
import { parseQuickCapture } from "./quickParse";
import type { Project } from "../types";

// 2026-03-10 is a Tuesday, which keeps the weekday cases easy to read.
const TODAY = "2026-03-10";

function project(id: string, name: string): Project {
  return {
    id,
    name,
    description: "",
    notes: "",
    color: "#0066cc",
    status: "active",
    type: "project",
    dueDate: "",
    pinned: false,
    order: 0,
    createdAt: "",
    updatedAt: "",
  } as Project;
}

const projects = [project("p1", "업무"), project("p2", "사이드"), project("p3", "Study")];

function parse(input: string) {
  return parseQuickCapture(input, { projects, today: TODAY });
}

describe("parseQuickCapture", () => {
  it("leaves plain text alone", () => {
    const result = parse("세금 신고 서류 준비");
    expect(result.title).toBe("세금 신고 서류 준비");
    expect(result.scheduledDate).toBe("");
    expect(result.dueDate).toBe("");
    expect(result.startTime).toBe("");
    expect(result.projectId).toBe("");
    expect(result.priority).toBe("");
  });

  it("reads relative days into scheduledDate", () => {
    expect(parse("오늘 장보기").scheduledDate).toBe(TODAY);
    expect(parse("내일 장보기").scheduledDate).toBe("2026-03-11");
    expect(parse("모레 장보기").scheduledDate).toBe("2026-03-12");
    expect(parse("buy milk tomorrow").scheduledDate).toBe("2026-03-11");
    expect(parse("내일 장보기").title).toBe("장보기");
  });

  it("moves a weekday to its next occurrence, never today", () => {
    // TODAY is a Tuesday.
    expect(parse("수요일 회의").scheduledDate).toBe("2026-03-11");
    expect(parse("월요일 회의").scheduledDate).toBe("2026-03-16");
    // Same weekday as today means the coming one, a week out.
    expect(parse("화요일 회의").scheduledDate).toBe("2026-03-17");
    expect(parse("standup on friday").scheduledDate).toBe("2026-03-13");
  });

  it("reads explicit dates into dueDate", () => {
    expect(parse("보고서 2026-04-02").dueDate).toBe("2026-04-02");
    expect(parse("보고서 4/2").dueDate).toBe("2026-04-02");
    expect(parse("보고서 4월 2일").dueDate).toBe("2026-04-02");
    expect(parse("보고서 4/2").title).toBe("보고서");
  });

  it("rolls a past month/day to next year", () => {
    // 1/5 already passed in 2026.
    expect(parse("정산 1/5").dueDate).toBe("2027-01-05");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parse("정산 2/31").dueDate).toBe("");
    expect(parse("정산 13/40").dueDate).toBe("");
  });

  it("reads explicit times only", () => {
    expect(parse("오후 3시 회의").startTime).toBe("15:00");
    expect(parse("오전 9시 30분 회의").startTime).toBe("09:30");
    expect(parse("회의 15:00").startTime).toBe("15:00");
    expect(parse("meeting 3pm").startTime).toBe("15:00");
    expect(parse("meeting 9:30am").startTime).toBe("09:30");
    // Bare "3시" is ambiguous (03:00 or 15:00?) so it stays in the title.
    expect(parse("3시 회의").startTime).toBe("");
    expect(parse("3시 회의").title).toBe("3시 회의");
  });

  it("handles noon and midnight boundaries", () => {
    expect(parse("오후 12시 점심").startTime).toBe("12:00");
    expect(parse("오전 12시 마감").startTime).toBe("00:00");
    expect(parse("lunch 12pm").startTime).toBe("12:00");
  });

  it("resolves #space by exact then prefix match", () => {
    expect(parse("리뷰 #업무").projectId).toBe("p1");
    expect(parse("리뷰 #사이").projectId).toBe("p2");
    expect(parse("review #study").projectId).toBe("p3");
    expect(parse("리뷰 #업무").title).toBe("리뷰");
  });

  it("leaves an unmatched or ambiguous #tag in the title", () => {
    const unknown = parse("리뷰 #없는스페이스");
    expect(unknown.projectId).toBe("");
    expect(unknown.title).toBe("리뷰 #없는스페이스");

    // "ㅅ" prefixes nothing here, but a duplicate prefix must stay ambiguous.
    const ambiguous = parseQuickCapture("리뷰 #프로", {
      projects: [project("a", "프로젝트A"), project("b", "프로젝트B")],
      today: TODAY,
    });
    expect(ambiguous.projectId).toBe("");
    expect(ambiguous.title).toBe("리뷰 #프로");
  });

  it("reads priority markers", () => {
    expect(parse("배포 !!").priority).toBe("high");
    expect(parse("배포 !높음").priority).toBe("high");
    expect(parse("배포 !보통").priority).toBe("medium");
    expect(parse("deploy !low").priority).toBe("low");
    expect(parse("배포 !!").title).toBe("배포");
  });

  it("reads a standalone ! as one step below !!", () => {
    expect(parse("메일 회신 !").priority).toBe("medium");
    expect(parse("메일 회신 !").title).toBe("메일 회신");
    // The bare form must not cannibalise the word forms.
    expect(parse("deploy !high").priority).toBe("high");
    expect(parse("deploy !high").title).toBe("deploy");
  });

  it("leaves emphasis attached to a word alone", () => {
    // "call mum!" is a title, not a priority — only a whitespace-delimited
    // "!" is a marker, so the punctuation survives.
    expect(parse("call mum!").priority).toBe("");
    expect(parse("call mum!").title).toBe("call mum!");
  });

  it("combines everything and cleans up whitespace", () => {
    const result = parse("내일 오후 3시 #업무 팀 회의 준비 !!");
    expect(result.title).toBe("팀 회의 준비");
    expect(result.scheduledDate).toBe("2026-03-11");
    expect(result.startTime).toBe("15:00");
    expect(result.projectId).toBe("p1");
    expect(result.priority).toBe("high");
  });

  it("does not fire on latin words that merely contain a keyword", () => {
    expect(parse("mondayish plan").scheduledDate).toBe("");
    expect(parse("update the sunroof").scheduledDate).toBe("");
  });

  it("returns an empty title when the input is only tokens", () => {
    const result = parse("내일 !!");
    expect(result.title).toBe("");
    expect(result.scheduledDate).toBe("2026-03-11");
    expect(result.priority).toBe("high");
  });
});
