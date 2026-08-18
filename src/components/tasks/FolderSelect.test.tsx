// @vitest-environment jsdom
//
// §6's rules that only exist once there is an event loop: the lock while a
// Folder is being made, what survives a failure, and the group that vanishes
// while the dialog is open. The same lesson as Phase 2 — a pure test cannot
// see a guard that reads stale state.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { SidebarFolder } from "../../types";
import { I18nProvider } from "../../i18n";
import { FOLDER_SEARCH_THRESHOLD, FolderSelect } from "./FolderSelect";

const NOW = "2026-08-18T00:00:00.000Z";

const folder = (id: string, name: string, sortKey = 0): SidebarFolder =>
  ({ id, name, sortKey, createdAt: NOW, updatedAt: NOW }) as SidebarFolder;

function open(
  props: Partial<React.ComponentProps<typeof FolderSelect>> = {},
) {
  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  const onCreateFolder = vi.fn().mockResolvedValue("sf-new");
  const result = render(
    <I18nProvider lang="en">
      <FolderSelect
        labelledBy="folder-label"
        folders={[]}
        value=""
        onChange={onChange}
        onCreateFolder={onCreateFolder}
        onBusyChange={onBusyChange}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...result, onChange, onBusyChange, onCreateFolder };
}

/** fireEvent, not node.click(): it wraps in act, so the re-render has landed
    before the next line looks for what it produced. */
const click = (node: Element | null) => fireEvent.click(node as HTMLElement);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function typeInto(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

afterEach(cleanup);

describe("FolderSelect", () => {
  it("shows no search box below the threshold and one at it (§6.24)", () => {
    const few = Array.from({ length: FOLDER_SEARCH_THRESHOLD - 1 }, (_, i) => folder(`f${i}`, `Folder ${i}`, i));
    const many = Array.from({ length: FOLDER_SEARCH_THRESHOLD }, (_, i) => folder(`f${i}`, `Folder ${i}`, i));

    const small = open({ folders: few });
    click(small.container.querySelector(".tm-folder-trigger"));
    expect(small.container.querySelector(".tm-folder-search")).toBeNull();
    cleanup();

    const big = open({ folders: many });
    click(big.container.querySelector(".tm-folder-trigger"));
    expect(big.container.querySelector(".tm-folder-search")).not.toBeNull();
  });

  it("keeps None reachable while searching (§6.27)", () => {
    const many = Array.from({ length: FOLDER_SEARCH_THRESHOLD }, (_, i) => folder(`f${i}`, `Folder ${i}`, i));
    const { container } = open({ folders: many });
    click(container.querySelector(".tm-folder-trigger"));

    typeInto(container.querySelector<HTMLInputElement>(".tm-folder-search")!, "zzz");

    const options = [...container.querySelectorAll(".tm-folder-option")].map((node) => node.textContent);
    expect(options).toEqual(["None"]);
    expect(container.querySelector(".tm-state")?.textContent).toBeTruthy();
  });

  // §6.35. Submitting the List while its Folder is still being made would file
  // it somewhere the user did not pick.
  it("reports busy while a Folder is being made, and stops when it settles", async () => {
    let release: (id: string) => void = () => {};
    const onCreateFolder = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const { container, onBusyChange } = open({ onCreateFolder });

    click(container.querySelector(".tm-folder-trigger"));
    click(container.querySelector(".tm-folder-new"));
    typeInto(container.querySelector<HTMLInputElement>(".tm-folder-create input")!, "대학원");
    click(container.querySelector(".tm-folder-create-actions button:last-child"));

    expect(onBusyChange).toHaveBeenLastCalledWith(true);

    release("sf-new");
    await settle();

    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("makes one Folder however many times Create is clicked", async () => {
    const onCreateFolder = vi.fn(() => new Promise<string>(() => {}));
    const { container } = open({ onCreateFolder });

    click(container.querySelector(".tm-folder-trigger"));
    click(container.querySelector(".tm-folder-new"));
    typeInto(container.querySelector<HTMLInputElement>(".tm-folder-create input")!, "대학원");
    const create = container.querySelector(".tm-folder-create-actions button:last-child");
    click(create);
    click(create);
    click(create);

    expect(onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it("selects the Folder it just made (§6.32)", async () => {
    const { container, onChange } = open();

    click(container.querySelector(".tm-folder-trigger"));
    click(container.querySelector(".tm-folder-new"));
    typeInto(container.querySelector<HTMLInputElement>(".tm-folder-create input")!, "대학원");
    click(container.querySelector(".tm-folder-create-actions button:last-child"));
    await settle();

    expect(onChange).toHaveBeenCalledWith("sf-new");
    expect(container.querySelector(".tm-folder-dropdown")).toBeNull();
  });

  it("keeps the editor and the typed name when creation fails (§6.33)", async () => {
    const onCreateFolder = vi.fn().mockRejectedValue(new Error("offline"));
    const { container, onChange } = open({ onCreateFolder });

    click(container.querySelector(".tm-folder-trigger"));
    click(container.querySelector(".tm-folder-new"));
    typeInto(container.querySelector<HTMLInputElement>(".tm-folder-create input")!, "대학원");
    click(container.querySelector(".tm-folder-create-actions button:last-child"));
    await settle();

    expect(container.querySelector<HTMLInputElement>(".tm-folder-create input")!.value).toBe("대학원");
    expect(container.querySelector(".tm-state.is-error")?.textContent).toBe("offline");
    // Nothing was chosen, so the List draft is untouched.
    expect(onChange).not.toHaveBeenCalled();
  });

  // §6.45. Another device, another tab: the group can go while this is open.
  it("falls back to None when the chosen Folder disappears", () => {
    const { onChange } = open({ folders: [], value: "sf-gone" });

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not fall back while the chosen Folder is still there", () => {
    const { onChange } = open({ folders: [folder("sf1", "대학원")], value: "sf1" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is named by its label, not by the folder it is showing (§6.40)", () => {
    const { container } = open({ folders: [folder("sf1", "대학원")], value: "sf1" });
    const trigger = container.querySelector(".tm-folder-trigger")!;

    // A combobox's contents are its VALUE; the name has to come from the label.
    expect(trigger.getAttribute("aria-labelledby")).toBe("folder-label");
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.textContent).toBe("대학원");
  });
});
