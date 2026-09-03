// @vitest-environment jsdom
//
// One drawing, turned (components/common/Caret.tsx).
//
// The test that matters is not "it renders an svg" — it is that the OPEN and
// SHUT states are the same element with a different transform, because that is
// the whole difference from what was here before: two characters swapped for
// each other, which no transition can tween and which never matched optically.
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";
import { Caret } from "./Caret";

afterEach(cleanup);

describe("the group caret", () => {
  it("draws the same path open and shut", () => {
    const { container: shut } = render(<Caret open={false} />);
    const shutPath = shut.querySelector("path")?.getAttribute("d");
    cleanup();
    const { container: open } = render(<Caret open />);
    const openPath = open.querySelector("path")?.getAttribute("d");

    expect(shutPath).toBeTruthy();
    expect(openPath).toBe(shutPath);
  });

  it("says which state it is in with a class, so the turn is CSS", () => {
    const { container } = render(<Caret open />);
    expect(container.querySelector(".ff-caret")?.className).toContain("is-open");
    cleanup();

    const { container: shut } = render(<Caret open={false} />);
    expect(shut.querySelector(".ff-caret")?.className).not.toContain("is-open");
  });

  it("says nothing to a screen reader", () => {
    // The button around it carries `aria-expanded`; a caret announcing the
    // same state would have it read twice.
    const { container } = render(<Caret open />);
    expect(container.querySelector(".ff-caret")?.getAttribute("aria-hidden")).toBe("true");
  });
});
