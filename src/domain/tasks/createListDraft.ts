// What the Add List dialog is holding, and whether it may be submitted.
//
// Pure — no React, no store — because these are the rules the design states
// normatively (§1.5's state machine, §3.13-§3.18's name handling) and they are
// worth pinning somewhere a component cannot quietly disagree with.
//
// The design's §R.8 puts Color, Default View and Folder in later phases; the
// draft carries them from the start anyway, because §1.12 requires a FAILED
// submit to preserve every one of them, and a draft that only learns about a
// field when its picker ships is a draft that loses it on the first error.
import type { List } from "../../types";

/** §3.14/§3.16. The input enforces it too; this is the programmatic guard. */
export const LIST_NAME_MAX_LENGTH = 80;

/** §1.5's S2/S3/S4. S1 (CLOSED) is the absence of a draft, not a value of it. */
export type CreateListStatus = "empty" | "valid" | "submitting";

export interface CreateListDraft {
  /** Exactly what the user typed. NOT trimmed — see `normalizeListName`. */
  name: string;
  /** "" means "no colour of its own", which is the default (§0.7 R0-2). */
  color: string;
  /** "" means "let the Scope registry answer", which is the default. */
  defaultViewKey: string;
  /**
   * The sidebar group the List will be shown in. "" is ungrouped.
   *
   * The design says `folderId`; here that is the SIDEBAR's folder, not the
   * Project ladder's — see §R.7. A List made in this module has no Project,
   * and a domain Folder belongs to one, so there is no Folder of that kind for
   * it to be in. The sidebar's grouping is also what the design's Folder
   * actually DOES: it decides where the List is seen (D18/D19).
   */
  sidebarFolderId: string;
}

/**
 * §1.1/§1.2: `Lists +` opens with no Folder context, a Folder's own entry
 * opens with that Folder already chosen. Nothing else differs between them.
 */
export function emptyCreateListDraft(contextFolderId = ""): CreateListDraft {
  return { name: "", color: "", defaultViewKey: "", sidebarFolderId: contextFolderId };
}

/**
 * The name as it will be STORED (§3.13).
 *
 * Trimming happens here and not while typing, because trimming under the caret
 * moves it. Newlines become spaces rather than being stripped (§3.18): a name
 * pasted from two lines is two words, and joining them into one would be a
 * different name than the one the user pasted.
 *
 * Internal spacing is otherwise left alone — "2026  논문" is what they typed.
 */
export function normalizeListName(raw: string): string {
  return raw.replace(/[\r\n]+/g, " ").trim();
}

/** §3.14. Duplicate names are NOT checked — see `duplicateNamesAreAllowed`. */
export function isListNameValid(raw: string): boolean {
  const name = normalizeListName(raw);
  return name.length >= 1 && name.length <= LIST_NAME_MAX_LENGTH;
}

/**
 * §3.15, stated as code so it cannot be "fixed" by someone who assumes
 * otherwise: two Lists may carry the same name, in the same Folder or in
 * different ones. Identity is the id's job. No error, no automatic numeric
 * suffix, no uniqueness lookup.
 *
 * It takes the existing Lists precisely so a reader looking for the duplicate
 * check finds this instead.
 */
export function duplicateNamesAreAllowed(_existing: List[]): true {
  return true;
}

export function createListStatus(draft: CreateListDraft, submitting: boolean): CreateListStatus {
  if (submitting) return "submitting";
  return isListNameValid(draft.name) ? "valid" : "empty";
}

/**
 * §1.5's S4 and §1.13 INV-04 in one place.
 *
 * The guard against a second submit is the SAME question as "is Add enabled",
 * which is why both callers ask this one function: a disabled button is not a
 * lock, because Enter, a screen reader and a double click all reach past it.
 */
export function canSubmitCreateList(draft: CreateListDraft, submitting: boolean): boolean {
  return createListStatus(draft, submitting) === "valid";
}

export interface CreateListPayload {
  name: string;
  color?: string;
  defaultViewKey?: string;
  sidebarFolderId?: string;
}

/**
 * The draft as the store should receive it.
 *
 * Empty optional fields are absent rather than "": the fields mean "the user
 * chose this", and an empty string is itself a choice when it is read back.
 */
export function createListPayload(draft: CreateListDraft): CreateListPayload {
  const color = draft.color.trim();
  const defaultViewKey = draft.defaultViewKey.trim();
  const sidebarFolderId = draft.sidebarFolderId.trim();
  return {
    name: normalizeListName(draft.name),
    ...(color ? { color } : {}),
    ...(defaultViewKey ? { defaultViewKey } : {}),
    ...(sidebarFolderId ? { sidebarFolderId } : {}),
  };
}
