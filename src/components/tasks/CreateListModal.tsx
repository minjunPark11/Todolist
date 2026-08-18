// The Add List dialog (Add List design §1-§3).
//
// Phase 2 builds the shell and the Name field only. Colour, Default View and
// Folder are §R.8's later phases — and their absence is not a stub: §0.7 R0-2
// says a List needs exactly one decision, and every other field has a working
// default. `Lists + → 이름 → Enter` is the whole flow this file has to serve.
//
// What it deliberately does NOT do: close on an overlay click (§1.8 — this is a
// wide dialog and a stray click must not take the draft with it), touch the URL
// (§0.7 R0-3 — the dialog is UI state, the way the command palette is), or
// decide anything about the List beyond what the user typed.
import { useCallback, useId, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useT } from "../../i18n";
import {
  LIST_NAME_MAX_LENGTH,
  canSubmitCreateList,
  createListStatus,
  emptyCreateListDraft,
  type CreateListDraft,
} from "../../domain/tasks/createListDraft";
import { LIST_COLOR_PRESETS, isCustomListColor, listColorHex } from "../../domain/tasks/listColor";
import { CREATE_LIST_VIEW_CHOICES } from "../../domain/tasks/listView";
import { isRovingKey, rovingNext } from "../../domain/tasks/rovingChoice";
import { FolderSelect } from "./FolderSelect";
import { CreateListPreview } from "./CreateListPreview";
import type { SidebarFolder } from "../../types";

interface CreateListModalProps {
  /** §1.2: the Folder this was started from, or "" from the Lists header. */
  contextFolderId?: string;
  folders: SidebarFolder[];
  /** Answers the new group's id (§6.32). */
  onCreateFolder: (name: string) => Promise<string> | string;
  /** Rejects to signal failure; the draft is kept either way (§1.12). */
  onSubmit: (draft: CreateListDraft) => Promise<void>;
  onClose: () => void;
}

export function CreateListModal({
  contextFolderId = "",
  folders,
  onCreateFolder,
  onSubmit,
  onClose,
}: CreateListModalProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<CreateListDraft>(() => emptyCreateListDraft(contextFolderId));
  const [submitting, setSubmitting] = useState(false);
  // The actual lock (§1.13 INV-04). `submitting` above drives what the dialog
  // LOOKS like; it cannot guard anything, because state does not change inside
  // the tick that set it — three Enter keydowns in one tick all read `false`
  // and all submit. Verified in the running app: it made three Lists.
  const submittingRef = useRef(false);
  // §6.35: a Folder being made means `sidebarFolderId` is not settled yet, and
  // submitting now would file the List somewhere the user did not pick.
  const [folderBusy, setFolderBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const errorId = useId();

  // §9.9/§9.10: a group is ONE tab stop and the arrows choose within it. The
  // values are listed in the order they are drawn, so Home and End mean the
  // ends of what the user can see.
  const colorValues = ["", ...LIST_COLOR_PRESETS.map((preset) => preset.key)];

  function rove(
    event: React.KeyboardEvent,
    values: readonly string[],
    current: string,
    apply: (next: string) => void,
  ) {
    if (!isRovingKey(event.key)) return;
    const next = rovingNext(values, current, event.key);
    if (next === null) return;
    // §9.9's MUST: the arrow belongs to the group, not to the dialog's focus
    // order, and it must not also scroll the panel behind it.
    event.preventDefault();
    apply(next);
    // The ARIA radio pattern moves focus with the selection; without this the
    // ring stays on the swatch the user just left.
    const group = event.currentTarget as HTMLElement;
    group.querySelectorAll<HTMLElement>('[role="radio"]')[values.indexOf(next)]?.focus();
  }

  const status = createListStatus(draft, submitting);
  const canSubmit = canSubmitCreateList(draft, submitting) && !folderBusy;

  // §9.2/§9.3, §9.4 and §9.6 in one hook.
  //
  // The Name field is named explicitly rather than left to DOM order: §9.2
  // requires typing to work the moment the dialog appears, and "the first
  // focusable element" would be whatever markup happens to come first. §9.3
  // also forbids waiting for the open animation — readiness to type is not a
  // visual effect, so this runs on mount and not on a timer.
  const focusName = useCallback(() => nameRef.current, []);
  useFocusTrap(rootRef, { initial: focusName });

  async function submit() {
    // §1.13 INV-04. Asked here rather than trusting the button's disabled
    // attribute, because Enter and assistive technology both reach past it.
    if (submittingRef.current || !canSubmitCreateList(draft, submittingRef.current)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(draft);
    } catch (cause) {
      // §1.12: the draft stays exactly as it is. Retrying must not cost the
      // user the same typing twice.
      submittingRef.current = false;
      setSubmitting(false);
      setError(cause instanceof Error && cause.message ? cause.message : t("tasks.createListFailed"));
    }
  }

  return (
    <div
      className="tm-modal-scrim"
      // §1.8: Cancel and Esc are the only ways out. No onClick here, on
      // purpose — a wide dialog invites a stray click on the way to a field.
      role="presentation"
    >
      <div
        ref={rootRef}
        className="tm-modal has-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          // §3.27. Esc closes from anywhere inside, including the input.
          if (event.key === "Escape") {
            event.stopPropagation();
            if (!submitting) onClose();
          }
        }}
      >
        <div className="tm-modal-settings">
          <header className="tm-modal-head">
            <h2 id={titleId}>{t("tasks.createListTitle")}</h2>
          </header>

          <form
          className="tm-modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="tm-field">
            <span className="tm-field-label">{t("tasks.createListNameLabel")}</span>
            <input
              ref={nameRef}
              type="text"
              className="tm-modal-input"
              value={draft.name}
              // §3.16 caps it here so the value can never exceed the rule the
              // domain also checks.
              maxLength={LIST_NAME_MAX_LENGTH}
              placeholder={t("tasks.createListNamePlaceholder")}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // §1.9/§3.26. The Enter that ends a Korean, Japanese or Chinese
                // composition is the user CHOOSING a candidate, not asking to
                // submit. Without this the first Enter of every composed name
                // creates the List with whatever was half-typed.
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                void submit();
              }}
            />
          </label>

          {/* §1.5's S2 is explicit that these are usable before the name is:
              nothing here reads `name`, so the order the user works in is
              theirs. */}
          <fieldset className="tm-field" disabled={submitting}>
            <legend className="tm-field-label">{t("tasks.createListColorLabel")}</legend>
            <div
              className="tm-swatches"
              role="radiogroup"
              aria-label={t("tasks.createListColorLabel")}
              onKeyDown={(event) =>
                rove(event, colorValues, draft.color, (color) => setDraft((current) => ({ ...current, color })))
              }
            >
              {/* §0.7 R0-2's default, and it is a real choice rather than the
                  absence of one — "none" is what a List has unless asked. */}
              <button
                type="button"
                role="radio"
                aria-checked={draft.color === ""}
                aria-label={t("tasks.createListColorNone")}
                tabIndex={draft.color === "" ? 0 : -1}
                className={`tm-swatch is-none${draft.color === "" ? " is-selected" : ""}`}
                onClick={() => setDraft((current) => ({ ...current, color: "" }))}
              />
              {LIST_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === preset.key}
                  aria-label={t(`tasks.color.${preset.key}`)}
                  tabIndex={draft.color === preset.key ? 0 : -1}
                  className={`tm-swatch${draft.color === preset.key ? " is-selected" : ""}`}
                  style={{ background: preset.hex }}
                  onClick={() => setDraft((current) => ({ ...current, color: preset.key }))}
                />
              ))}
            </div>
            <label className="tm-custom-color">
              <span>{t("tasks.createListColorCustom")}</span>
              <input
                type="text"
                className="tm-modal-input tm-custom-color-input"
                placeholder="#4F7AF8"
                value={isCustomListColor(draft.color) ? draft.color : ""}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  // Only a canonical #RRGGBB is stored (§13.22). Half-typed
                  // input is left on screen without being written, so the
                  // colour never flickers through wrong values on the way.
                  setDraft((current) => ({ ...current, color: isCustomListColor(next) ? next : current.color }));
                }}
              />
              <span
                className="tm-swatch is-preview"
                style={{ background: listColorHex(draft.color) || "transparent" }}
                aria-hidden
              />
            </label>
          </fieldset>

          <div className="tm-field">
            <span className="tm-field-label" id={`${titleId}-folder`}>
              {t("tasks.folderLabel")}
            </span>
            <FolderSelect
              labelledBy={`${titleId}-folder`}
              folders={folders}
              value={draft.sidebarFolderId}
              onChange={(sidebarFolderId) => setDraft((current) => ({ ...current, sidebarFolderId }))}
              onCreateFolder={onCreateFolder}
              onBusyChange={setFolderBusy}
              disabled={submitting}
            />
          </div>

          <fieldset className="tm-field" disabled={submitting}>
            <legend className="tm-field-label">{t("tasks.createListViewLabel")}</legend>
            <div
              className="tm-views"
              role="radiogroup"
              aria-label={t("tasks.createListViewLabel")}
              onKeyDown={(event) =>
                rove(event, CREATE_LIST_VIEW_CHOICES, draft.defaultViewKey || "list", (defaultViewKey) =>
                  setDraft((current) => ({ ...current, defaultViewKey })),
                )
              }
            >
              {/* §13.6 narrowed to what this build can open — offering a View
                  that cannot be opened is a choice that cannot be kept. */}
              {CREATE_LIST_VIEW_CHOICES.map((view) => {
                const selected = draft.defaultViewKey === view || (draft.defaultViewKey === "" && view === "list");
                return (
                  <button
                    key={view}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    className={`tm-view${selected ? " is-current" : ""}`}
                    onClick={() => setDraft((current) => ({ ...current, defaultViewKey: view }))}
                  >
                    {t(`tasks.view.${view}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <p className="tm-state is-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}

          <div className="tm-modal-actions">
            <button type="button" className="tm-modal-cancel" onClick={onClose} disabled={submitting}>
              {t("tasks.createListCancel")}
            </button>
            <button type="submit" className="tm-modal-submit" disabled={!canSubmit}>
              {status === "submitting" ? t("tasks.createListSubmitting") : t("tasks.createListSubmit")}
            </button>
          </div>
          </form>
        </div>

        {/* §8.37: an optional presentation layer. Deleting this line leaves
            every rule above working — which is the test of whether it was
            ever load-bearing. */}
        <CreateListPreview
          name={draft.name}
          color={draft.color}
          view={(draft.defaultViewKey || "list") as never}
        />
      </div>
    </div>
  );
}
