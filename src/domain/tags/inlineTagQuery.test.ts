// The caret's `#…`, which decides everything above it
// (TASK_DETAIL_TAG_INPUT_DESIGN.md §3.5).
import { describe, expect, it } from "vitest";
import { inlineTagQuery, withoutTagToken } from "./inlineTagQuery";

describe("inlineTagQuery", () => {
  it("reads the token the caret is standing in", () => {
    // 본(0) 문(1) 공백(2) #(3) 학(4) — 캐럿 5는 학 뒤다.
    expect(inlineTagQuery("본문 #학", 5)).toEqual({ query: "학", from: 3, to: 5 });
  });

  it("opens on the `#` itself, before anything is typed", () => {
    expect(inlineTagQuery("aa #", 4)).toEqual({ query: "", from: 3, to: 4 });
  });

  it("opens at the start of the text", () => {
    expect(inlineTagQuery("#work", 5)).toEqual({ query: "work", from: 0, to: 5 });
  });

  it("says nothing where the `#` does not start a word", () => {
    // Otherwise every mention of C# opens a tag menu.
    expect(inlineTagQuery("C#", 2)).toBeNull();
  });

  it("says nothing once a space has ended the token", () => {
    expect(inlineTagQuery("#work done", 10)).toBeNull();
  });

  it("says nothing where there is no `#` behind the caret", () => {
    expect(inlineTagQuery("plain text", 5)).toBeNull();
  });

  it("does not offer a legacy marker as a tag", () => {
    expect(inlineTagQuery("#space:8f2a", 11)).toBeNull();
  });

  it("reads the token the caret is in, not the last one in the text", () => {
    //                              ↓ caret
    expect(inlineTagQuery("#a #b", 2)).toEqual({ query: "a", from: 0, to: 2 });
  });
});

describe("withoutTagToken", () => {
  it("takes out the token and leaves the typing around it", () => {
    const text = "본문 #학";
    const token = inlineTagQuery(text, 5)!;
    expect(withoutTagToken(text, token)).toBe("본문 ");
  });

  it("leaves what follows the token alone", () => {
    const text = "#a 뒤에 더";
    const token = inlineTagQuery(text, 2)!;
    expect(withoutTagToken(text, token)).toBe(" 뒤에 더");
  });
});
