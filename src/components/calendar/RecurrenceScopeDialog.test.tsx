// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { RecurrenceScopeDialog } from "./RecurrenceScopeDialog";

function mount(intent: "edit" | "delete" = "edit") {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  render(
    <I18nProvider lang="ko">
      <RecurrenceScopeDialog intent={intent} onChoose={onChoose} onCancel={onCancel} />
    </I18nProvider>,
  );
  return { onChoose, onCancel };
}

afterEach(cleanup);

describe("RecurrenceScopeDialog", () => {
  it("offers all three answers, because the same drag means three writes", () => {
    mount();
    expect(screen.getByLabelText("이번 회차만")).toBeTruthy();
    expect(screen.getByLabelText("이번 회차 및 이후")).toBeTruthy();
    expect(screen.getByLabelText("전체 시리즈")).toBeTruthy();
  });

  it("starts on this occurrence only", () => {
    // Someone who clicked one occurrence out of a series meant that one.
    // Defaulting to the whole series would make the destructive reading the
    // easy one.
    mount();
    expect((screen.getByLabelText("이번 회차만") as HTMLInputElement).checked).toBe(true);
  });

  it("reports the answer that was chosen, not the default", () => {
    const { onChoose } = mount();
    fireEvent.click(screen.getByLabelText("이번 회차 및 이후"));
    fireEvent.click(screen.getByText("확인"));
    expect(onChoose).toHaveBeenCalledWith("following");
  });

  it("writes nothing when it is dismissed", () => {
    const { onChoose, onCancel } = mount();
    fireEvent.click(screen.getByText("취소"));
    expect(onChoose).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("says delete rather than edit when that is what it is", () => {
    mount("delete");
    expect(screen.getByText("반복 작업을 삭제합니다")).toBeTruthy();
  });
});
