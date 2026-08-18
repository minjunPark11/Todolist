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
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../../i18n";
import {
  LIST_NAME_MAX_LENGTH,
  canSubmitCreateList,
  createListStatus,
  emptyCreateListDraft,
  type CreateListDraft,
} from "../../domain/tasks/createListDraft";

interface CreateListModalProps {
  /** §1.2: the Folder this was started from, or "" from the Lists header. */
  contextFolderId?: string;
  /** Rejects to signal failure; the draft is kept either way (§1.12). */
  onSubmit: (draft: CreateListDraft) => Promise<void>;
  onClose: () => void;
}

export function CreateListModal({ contextFolderId = "", onSubmit, onClose }: CreateListModalProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<CreateListDraft>(() => emptyCreateListDraft(contextFolderId));
  const [submitting, setSubmitting] = useState(false);
  // The actual lock (§1.13 INV-04). `submitting` above drives what the dialog
  // LOOKS like; it cannot guard anything, because state does not change inside
  // the tick that set it — three Enter keydowns in one tick all read `false`
  // and all submit. Verified in the running app: it made three Lists.
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const errorId = useId();

  const status = createListStatus(draft, submitting);
  const canSubmit = canSubmitCreateList(draft, submitting);

  // §1.14 AC-F03. The dialog exists to receive a name, so it asks for one
  // immediately rather than making the user click into the only field.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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
        className="tm-modal"
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
    </div>
  );
}
