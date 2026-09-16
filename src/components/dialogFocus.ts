// 대화상자가 포커스를 다루는 방식 — §19.34 의 가둠과 §19.32 의 복원.
//
// `Popover` 는 둘 다 오래전부터 갖고 있었고(§19.32 주석이 그 파일에 있다),
// `ConfirmModal`/`Modal` 은 갖고 있지 않았다. 셋 중 둘이 빠진 것이 우연이
// 아닌 이유는 §19.33 과 §19.34 가 서로 반대를 요구하기 때문이다: 팝오버는
// 가두면 안 되고(Tab 으로 자연스럽게 빠져나가야 한다), 대화상자는 가둬야
// 한다. 팝오버 쪽만 구현되면서 반대쪽은 비어 있었다.
//
// 비어 있던 것은 주석에서만 안 보였다. `kit.tsx` 의 §19.34 주석은 "it traps
// focus" 라고 적고 있었고, `ConfirmModal` 의 주석은 "Tab still moves to
// Cancel" 이라고 적고 있었다. 측정해 보면 확인 버튼에서 Tab 한 번에 배경의
// 사이드바 접기 버튼으로 나갔다 — 취소 버튼이 DOM 에서 앞에 있으므로 앞으로
// 가는 Tab 은 대화상자를 벗어나는 방향이다. 되돌아올 길도 없었다: 닫은 뒤
// 포커스는 마지막으로 Tab 이 닿은 배경 어딘가, 아무 데도 안 닿았으면
// `body` 였다.
//
// 배경을 `inert` 로 만들지는 않는다. 포인터는 `.ff-modal-backdrop` 이
// `position: fixed; inset: 0` 으로 이미 막고, 보조기술은 `aria-modal="true"`
// 가 이미 가린다. 실제로 새던 통로는 Tab 하나뿐이었다.
import { useEffect, useState, type RefObject } from "react";

/**
 * 순서가 있는 것만 — `tabindex="-1"` 은 프로그램이 주는 포커스지 Tab 이
 * 닿는 자리가 아니다.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 떠 있는 층이 나가는 곳. 대화상자 안에서 연 팝오버(달력 분류 설정의 색
 * 고르기가 그렇다)는 `body` 밑 이 노드로 포털되므로 대화상자의 자손이
 * 아니다. 가둠이 대화상자만 셌다면 그 팝오버는 Tab 으로 닿을 수 없는
 * 자리가 됐을 것이다 — 그래서 고리에 같이 넣는다.
 */
const PORTAL_ROOT_ID = "floating-layer-root";

function visible(el: HTMLElement): boolean {
  // `offsetParent` 는 `position: fixed` 에서 null 이라 그것만으로는 못 센다.
  if (el.hasAttribute("inert") || el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function focusables(surface: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [surface];
  const portal = document.getElementById(PORTAL_ROOT_ID);
  if (portal && portal.childElementCount > 0) roots.push(portal);
  return roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible));
}

/**
 * §19.32 가 말하는 "stable fallback": 연 것이 사라졌을 때 갈 자리.
 *
 * 연 것이 사라지는 일은 드물지 않고 오히려 흔하다 — "휴지통 비우기" 를
 * 확정하면 휴지통이 비고 그 버튼도 같이 사라진다. 그 자리를 안 정해두면
 * 되돌릴 수 없는 일을 방금 실행한 사람이 `body` 에 서서 처음부터 Tab 을
 * 다시 밟는다.
 */
function stableFallback(): HTMLElement | null {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return null;
  // 랜드마크는 원래 Tab 순서에 없다. 프로그램이 주는 포커스만 받게 한다.
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  return main;
}

/**
 * 대화상자 표면에 Tab 을 가두고, 닫힐 때 포커스를 연 자리로 돌려준다.
 *
 * @param surface `role="dialog"` 가 붙은 요소. 열려 있는 동안만 살아 있는
 *   컴포넌트에서 부르는 것을 전제로 한다 — 복원은 unmount 에서 일어난다.
 */
export function useDialogFocus(surface: RefObject<HTMLElement | null>): void {
  // 첫 렌더의 lazy initializer 에서 읽는다. effect 에서 읽으면 늦다:
  // `ConfirmModal` 은 확인 버튼에, `Modal` 의 내용물은 첫 입력칸에 이미
  // 포커스를 가져간 뒤다. 렌더 중에 읽는 유일한 시점이 연 사람이 아직
  // 서 있는 시점이다.
  const [opener] = useState<HTMLElement | null>(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  });

  useEffect(() => {
    const node = surface.current;
    if (!node) return;

    // 포커스를 안으로 들여놓는다. 가둠이 표면의 keydown 으로 걸리므로 밖에
    // 서 있으면 걸릴 기회 자체가 없다 — 설정의 분류 색 대화상자가 정확히
    // 그랬다: `aria-modal` 대화상자가 열린 채로 Tab 이 뒤의 설정 페이지를
    // 열네 칸 걸어다녔다. `ConfirmModal` 은 확인 버튼을 스스로 잡고
    // `InboxColumnDialog` 는 `useAutoFocus` 로 첫 칸을 잡지만, `Modal`
    // 자체는 아무것도 하지 않았다.
    //
    // 이미 안에 있으면 건드리지 않는다. 내용물이 고른 자리가 우리가 고른
    // 자리보다 언제나 낫다.
    if (!node.contains(document.activeElement)) {
      const first = focusables(node)[0];
      if (first) first.focus();
      else {
        // 누를 것이 하나도 없는 대화상자(읽기 전용 알림)도 제목은 읽혀야
        // 한다. 표면 자체를 프로그램 포커스로 받게 한다.
        if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
        node.focus();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const items = focusables(node!);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // 고리의 양 끝에서만 개입한다. 가운데서는 브라우저가 알아서 하는 것이
      // 언제나 더 낫다 — 우리 목록이 모르는 순서(`tabindex` 를 손으로 준
      // 것, 라디오 그룹)를 브라우저는 안다.
      if (event.shiftKey ? active === first : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      // 어쩌다 밖에 서 있다면(대화상자가 열릴 때 아무 곳에도 포커스를 두지
      // 않은 경우) 첫 자리로 끌어온다.
      if (!items.includes(active as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    // 캡처 단계에서 듣는다. 내용물이 Tab 을 자기 것으로 쓰는 경우
    // (체크리스트의 줄 이동 §11.26)에는 그쪽이 `preventDefault` 하므로
    // 버블 단계까지 오지 않아 우리가 끝을 판정할 기회 자체가 없다.
    node.addEventListener("keydown", onKeyDown, true);
    return () => {
      node.removeEventListener("keydown", onKeyDown, true);
      // 포커스가 아직 대화상자 안(또는 아무 데도 아닌 곳)에 있을 때만
      // 돌려준다. 사용자가 그 사이 다른 곳을 눌렀다면 방금 놓은 캐럿을
      // 빼앗는 꼴이 된다 — `Popover.restoreFocus` 가 같은 이유로 같은
      // 조건을 건다.
      const active = document.activeElement;
      const loose = active === null || active === document.body;
      if (!loose && !node.contains(active) && !document.getElementById(PORTAL_ROOT_ID)?.contains(active)) return;
      if (opener?.isConnected) {
        opener.focus();
        return;
      }
      stableFallback()?.focus();
    };
  }, [opener, surface]);
}
