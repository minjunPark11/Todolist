// 집중 바는 집중 화면 밖에서 살아야 한다.
//
// 그것이 전역인 이유는 하나다: 세션이 도는 동안 다른 화면에 가 있어도 상태를
// 보고 멈출 수 있어야 한다. 그런데 `App.tsx`의 두 렌더 분기 중 Tasks 모듈이
// `/today` · `/list/*` · 검색을 가져가는 쪽에만 이 바가 없어서, 정확히 그
// 화면들에서 사라지고 있었다 [실측].
//
// jsdom이 아니라 E2E인 이유는 버그가 컴포넌트에 없었기 때문이다 —
// `GlobalFocusBar`는 처음부터 세션을 받으면 그렸다. 틀린 것은 어느 분기가 그것을
// 그리느냐였고, 그 질문은 조립된 앱만 답할 수 있다 (focusDetail.spec.ts와 같은
// 이유, 같은 모양).
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

test.describe("the global focus bar", () => {
  test("survives leaving the Focus page", async ({ page }) => {
    await openApp(page);

    await page.goto("/focus");
    await page.getByRole("button", { name: "Start focus" }).click();

    // 세션이 실제로 돌기 전에 옮겨 가면 이 테스트는 아무것도 증명하지 않는다.
    await expect(page.locator(".focus-time")).not.toHaveText("00:00");

    // Tasks 모듈의 분기로. 이 이동이 위 주석의 그 분기 경계를 넘는다.
    await page.goto("/today");
    await expect(page.locator(".foc-global-bar")).toBeVisible();

    // 살아 있기만 한 것이 아니라 조작할 수 있어야 한다 — 그것이 이 바의 일이다.
    await expect(page.locator(".foc-global-bar button")).not.toHaveCount(0);
  });
});
