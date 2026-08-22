// @vitest-environment jsdom
//
// The reset dialog is the one screen in the app with no undo behind it, so the
// sentence on it has to be true. It said "on this device"; while signed in,
// resetting empties the store, and the next save diffs that empty state against
// the account and deletes every row it holds — on every device.
//
// The signed-out copy is verifiable in the running app; this one is not without
// someone's account, so it is pinned here instead.
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { AppModals } from "./AppModals";
import { I18nProvider } from "../i18n";
import type { Language } from "../types";

function renderReset(resetReachesAccount: string, lang: Language = "en") {
  return render(
    <I18nProvider lang={lang}>
      <AppModals
        pendingDeleteTaskId=""
        pendingResetAllData
        resetReachesAccount={resetReachesAccount}
        toasts={[]}
        onCancelDeleteTask={() => {}}
        onConfirmDeleteTask={() => {}}
        onCancelResetAllData={() => {}}
        onConfirmResetAllData={() => {}}
        onDismissToast={() => {}}
      />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("the reset-all-data confirmation", () => {
  it("says the account and every device when signed in", () => {
    const { container } = renderReset("someone@example.com");
    const text = container.textContent ?? "";

    expect(text).toContain("someone@example.com");
    expect(text).toMatch(/every signed-in device/i);
    // The promise it used to make, and could not keep.
    expect(text).not.toMatch(/on this device/i);
  });

  it("still says this device when there is no account to reach", () => {
    const { container } = renderReset("");
    const text = container.textContent ?? "";

    expect(text).toMatch(/on this device/i);
    expect(text).not.toMatch(/every signed-in device/i);
  });

  it("names the account in Korean too", () => {
    const { container } = renderReset("someone@example.com", "ko");
    const text = container.textContent ?? "";

    expect(text).toContain("someone@example.com");
    expect(text).toContain("모든 기기");
    expect(text).not.toContain("이 기기의 모든 사용자 데이터");
  });
});
