// The Context Sidebar's frame: how wide, whether shown, and in which mode
// (Nav Shell spec §3, audit D-05, D-07, D-14).
//
// Everything here is pure so the rules can be tested without a DOM. The React
// state that uses them is `hooks/useContextSidebar.ts`.
//
// The sidebar can also be COLLAPSED, and the rule is that width and visibility
// stay independent — storing "collapsed" as width 0 would lose the number the
// user picked. That rule was briefly moot: the collapse control was removed
// because its button sat on top of the sidebar's first row. The reference's
// handle is at the sidebar's right EDGE and invisible until pointed at, which
// is the objection answered rather than overruled, so collapse is back and so
// is the separation (TIMELINE_REFERENCE_PARITY_DESIGN.md §4.6).
import { pageForPath } from "./pageRoute";

/**
 * 레퍼런스 둘이 이 숫자에서 어긋난다.
 *
 * §3.6이 248을 적었고, 목록 목업은 232이며
 * (POLISHED_REFERENCE_PARITY_DESIGN.md §2.1), 타임라인 목업은 **144**다
 * (TIMELINE_REFERENCE_PARITY_DESIGN.md §2.1). 같은 앱의 두 목업이고
 * 사이드바는 둘이 나눠 쓰는 한 열이라, 둘 다 맞출 수는 없다.
 *
 * 타임라인 쪽을 택한다 — 그 화면이 가로를 가장 아쉬워하고, 사이드바에서
 * 88px을 받으면 그만큼이 곧 날짜다. 목록 화면에서 리스트 이름이 더 자주
 * 잘리는 것이 그 대가이고, 그것이 이 결정의 알려진 비용이다.
 *
 * 손잡이는 그대로고 저장도 그대로다. 폭은 저장되는 사용자 설정이라 첫 화면을
 * 레퍼런스에 맞추는 일이 사람이 끌어놓은 값을 버릴 이유는 되지 않는다 —
 * 이미 232로 쓰던 계정은 232로 남고, 되돌리는 길은 손잡이 더블클릭이다.
 * `--tm-detail-w`와 같은 자리이고 같은 결론이다(§4.7).
 *
 * CSS에서 `!important`로 누르는 방법도 있었다. 실제로 그렇게 했다가 되돌렸다:
 * 저장된 폭까지 같이 눌려서 손잡이가 죽었고, `e2e/navShell.spec.ts`의 CS-01~11이
 * 아홉 개 한꺼번에 그것을 잡았다. 폭을 정하는 곳은 여기다.
 */
/**
 * 144였다. 그 대가가 문서가 적어둔 것보다 컸다 [실측 · 2026-09-15].
 *
 * 위 주석이 "목록 화면에서 리스트 이름이 더 자주 잘리는 것이 그 대가"라고 적고
 * 그것을 알려진 비용으로 받아들였다. 앱을 띄워 재보니 잘리는 정도가 아니었다 —
 * 144에서 트리의 행은 이름에 이만큼만 내준다:
 *
 *   폴더 행    이름에 7px   ("생활"은 24px 필요 → "생." 한 글자)
 *   리스트 행  이름에 15px  ("업무 계획"은 50px 필요)
 *
 * 행의 폭이 어디로 가는지도 셌다. 들여쓴 리스트 행은 115px이고 그중 42px이
 * 들여쓰기(26 + 캐럿 보정 16), 20px이 좌우 패딩, 18px이 두 개의 gap, 16px이
 * 종류 글리프, 14px이 개수다. 폴더 행은 그 위에 접기 캐럿 12px과 `+` 24px을
 * 행 **밖에서** 더 뺀다.
 *
 * 기하를 깎아서는 풀리지 않는다는 것도 재봤다. 들여쓰기를 28로, 사이드바 패딩을
 * 10으로, gap을 6으로 — 셋을 다 적용해도 폴더 이름은 21px이라 두 글자짜리
 * "생활"조차 들어가지 않는다. 폭 말고는 움직일 것이 없다.
 *
 * 200은 목업 셋(248 · 232 · 144) 사이의 타협이다. 타임라인이 56px을 잃지만 그
 * 화면은 가로 스크롤이 있고, 사이드바의 이름은 스크롤로 되찾을 수 없다. 위
 * 주석의 판단을 뒤집는 것이 아니라 그 판단이 적어둔 비용의 크기를 실측으로
 * 갱신한 것이다 — 144를 원하는 사람에게는 손잡이가 그대로 있고, 그것이 최소값이
 * 여전히 144인 이유다.
 */
export const CONTEXT_SIDEBAR_DEFAULT_WIDTH = 200;
/** 바닥은 그대로 144 — 레퍼런스보다 좁아질 이유는 없고, 거기까지 끌 자유는 남긴다. */
export const CONTEXT_SIDEBAR_MIN_WIDTH = 144;
export const CONTEXT_SIDEBAR_MAX_WIDTH = 360;

/**
 * The Context Sidebar's element id (§3.52, P0-11).
 *
 * Collapse and expand are ONE control that happens to be drawn in two places:
 * the collapse button lives inside the sidebar, and the expand button has to
 * live outside it because a collapsed sidebar takes its own button away with
 * it (§3.24). A screen reader can only be told they are the same control by
 * both naming the same region — hence a constant rather than `useId`, which
 * would hand the two components different strings.
 *
 * Whichever sidebar the current mode renders carries this id. They never
 * co-exist, so it stays unique.
 */
export const CONTEXT_SIDEBAR_ID = "context-sidebar";

/** §3.20's arrow-key step, and its Shift multiplier. */
export const CONTEXT_SIDEBAR_STEP = 16;
export const CONTEXT_SIDEBAR_BIG_STEP = 32;

export const WIDTH_STORAGE_KEY = "focusflow-sidebar-width";
/**
 * 접힘 상태 (TIMELINE_REFERENCE_PARITY_DESIGN.md §4.6).
 *
 * 폭과 따로 저장한다. 접힘을 폭 0으로 적으면 사람이 고른 숫자를 잃는다 —
 * 이 파일의 머리주석이 그 이유를 적어놨고, 접기가 돌아왔으므로 그 문장도
 * 다시 유효하다.
 */
export const COLLAPSED_STORAGE_KEY = "focusflow-sidebar-collapsed";

/**
 * D-14 added a third, `space`, for the Space/Project tree that stood in this
 * slot on SpaceHub. SPACE_REMOVAL_IA stage 6 removed the tree, and the member
 * went with it: a mode nothing returns is a branch every reader has to check
 * and no screen can reach.
 */
export type ContextSidebarMode = "tasks" | "none";

export interface ContextSidebarRuntime {
  mode: ContextSidebarMode;
  width: number;
}

/** §3.7. Dragging past the minimum stops there; it is not a way to hide it. */
export function clampContextSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(CONTEXT_SIDEBAR_MAX_WIDTH, Math.max(CONTEXT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Which sidebar the current address wants (§3.3).
 *
 * Back to the two the spec asked for. D-14 made this a three-way choice so
 * SpaceHub could put the Space/Project tree in the same slot; stage 6 removed
 * the tree, and Projects and Goals are pages behind the Tasks sidebar's own
 * doors — so they show the sidebar they were opened from. The question left
 * is only whether a page has a sidebar at all.
 */
export function contextSidebarModeFor(path: string): ContextSidebarMode {
  switch (pageForPath(path)) {
    // §2.16: a Global Module owns its whole width. Matrix joins them under
    // D-19 — it crosses every Space, so no one Scope's sidebar describes it,
    // and it carries its own scope selector in the page instead.
    case "board":
    case "calendar":
    case "focus":
    case "settings":
      return "none";
    default:
      return "tasks";
  }
}

/** §3.30. The number the layout actually uses. */
export function effectiveContextSidebarWidth({ mode, width }: ContextSidebarRuntime): number {
  if (mode === "none") return 0;
  return clampContextSidebarWidth(width);
}

/**
 * §3.58: a stored width that is missing, corrupt or out of range recovers to
 * the default rather than to whatever `parseInt` made of it. A sidebar stuck
 * at 4px cannot be dragged back, so this is a real trap and not just tidiness.
 */
export function readStoredWidth(raw: string | null): number {
  if (raw === null || raw.trim() === "") return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  // Out of range means a value this app never wrote — treat it as absent
  // rather than clamping it, which would silently accept 4000 as 360.
  if (parsed < CONTEXT_SIDEBAR_MIN_WIDTH || parsed > CONTEXT_SIDEBAR_MAX_WIDTH) {
    return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.round(parsed);
}

/** §3.20's key table, as a pure step. Returns the new width, already clamped. */
export function widthAfterKey(
  width: number,
  key: string,
  shift: boolean,
): number | null {
  const step = shift ? CONTEXT_SIDEBAR_BIG_STEP : CONTEXT_SIDEBAR_STEP;
  switch (key) {
    case "ArrowLeft":
      return clampContextSidebarWidth(width - step);
    case "ArrowRight":
      return clampContextSidebarWidth(width + step);
    case "Home":
      return CONTEXT_SIDEBAR_MIN_WIDTH;
    case "End":
      return CONTEXT_SIDEBAR_MAX_WIDTH;
    default:
      return null;
  }
}
