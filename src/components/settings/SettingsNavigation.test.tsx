// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import type { SettingsTab } from "../../app/settingsTab";
import { SettingsNavigation } from "./SettingsNavigation";
afterEach(cleanup);
function Harness() {
  const [active, onChange] = useState<SettingsTab>("general");
  return <SettingsNavigation active={active} onChange={onChange} />;
}
it("moves focus and selected destination together with the keyboard", () => {
  render(<I18nProvider lang="en"><Harness /></I18nProvider>);
  fireEvent.keyDown(screen.getByRole("tab", { name: "General" }), { key: "ArrowDown" });
  const next = screen.getByRole("tab", { name: "Notifications" });
  expect(next.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(next);
  fireEvent.keyDown(next, { key: "End" });
  expect(screen.getByRole("tab", { name: "About" }).getAttribute("aria-selected")).toBe("true");
});
it("keeps the compact menu and desktop navigation on the same destination", () => {
  render(<I18nProvider lang="en"><Harness /></I18nProvider>);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "connections" } });
  expect(screen.getByRole("tab", { name: "Connections" }).getAttribute("aria-selected")).toBe("true");
});
