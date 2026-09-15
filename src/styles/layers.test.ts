// 겹치는 순서에도 자가 있다 (22-floating.css §19.5).
//
// 그 파일이 여덟 단을 토큰으로 적어뒀다 — `--z-base: 0` · `--z-sticky: 20` ·
// `--z-tooltip: 80` · `--z-popover: 100` · `--z-menu: 120` · `--z-overlay: 200` ·
// `--z-modal: 300` · `--z-toast: 400`. 세어보면 그 토큰을 부르는 자리는 셋이고,
// 리터럴로 적힌 `z-index`는 쉰여덟이다. 척도가 있는데 화면은 그 밖에서 돈다.
//
// 그것이 실제로 무엇을 만드는지는 이번에 겪었다. 폰의 아래쪽 막대에 `60`을
// 적었는데, 20~70 구간에 25·26·30·35·40·45·50·60·70이 이미 흩어져 있어서 고를
// 근거가 없었다. 60은 전체 화면 상세(50) 위였고, §15.13이 "전체 화면 상세가
// 화면을 가진다"고 적어둔 자리를 막대가 덮었다 — `focusObscured`가 서랍 안의
// 컨트롤이 가려졌다고 잡고서야 드러났다.
//
// 이 파일은 그 드리프트를 멈추는 쪽이다. `scale.test.ts`의 CEILING과 같은
// 장치이고 같은 규칙이다: 늘면 잡고, 줄면 숫자를 내리라고 잡는다. 쉰여덟을 한
// 번에 옮기는 것은 이 테스트의 일이 아니다 — 겹침의 순서는 눈으로 확인해야 하는
// 것이고, 한 번에 옮기면 무엇이 무엇 위에 있어야 하는지를 아무도 다시 읽지
// 않는다. 파일 하나씩 0으로 만드는 길을 열어두는 것이 이 표의 일이다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

/** §19.5의 여덟 단. 이 값들만 리터럴로 적혀도 자 위에 있다. */
const SCALE = new Set([0, 20, 80, 100, 120, 200, 300, 400]);

/**
 * 한 자리 숫자는 자가 다스리지 않는다.
 *
 * `z-index: 1`이 열한 곳, `2`가 세 곳에 있는데 그것들은 앱의 층이 아니라 한
 * 컴포넌트 안에서 두 요소의 앞뒤를 정하는 값이다 — 표의 머리가 셀 위에 오고,
 * 막대의 끝 표시가 막대 위에 오는 식이다. 그런 자리에 `--z-sticky`를 부르면
 * 20이라는 앱 층위를 컴포넌트 내부의 순서로 쓰게 되고, 그것이 오히려 척도를
 * 흐린다.
 *
 * 경계를 10에 두는 것은 관찰이다: 10 미만은 전부 그런 국소 순서였고, 20 이상은
 * 전부 화면 위에 무엇이 오느냐의 문제였다 [실측].
 */
const LOCAL_CEILING = 10;

/**
 * 아직 0이 아닌 파일과, 그 숫자.
 *
 * `scale.test.ts`가 적어둔 그대로다 — 새 위반이 들어오면 여기 숫자를 올리는 것이
 * 아니라, 고치거나 왜 이 값이어야 하는지를 주석으로 남기는 것이 답이다.
 */
const CEILING: Record<string, number> = {
  // 1000번대는 비었다. `domain/floating/zIndex.ts` 머리말이 1200·1300·1400·1500·
  // 1600 을 "척도가 아니라 논쟁의 기록"이라 부르며 척도를 들여왔는데, 스타일시트
  // 쪽 이주가 끝나지 않아 그 숫자들이 남아 있었다 — 그리고 예고된 실패가 그대로
  // 일어났다. 아래 남은 것들은 20~70 과 180~220 의 두 띠다.
  "02-calendar.css": 5,
  "03-planning.css": 3,
  "05-spaces.css": 2,
  "06-space-detail.css": 1,
  "08-calendar-categories.css": 2,
  "10-calendar-apple.css": 1,
  "17-tasks-module.css": 8,
  "19-app-shell.css": 4,
  "21-components.css": 1,
  "26-timeline.css": 1,
};

interface Offender {
  line: number;
  value: number;
  selector: string;
}

/**
 * 리터럴로 적힌 `z-index`만 센다.
 *
 * `var(--z-…)`는 자를 부르는 자리이므로 통과다. 주석은 지우되 줄 수는 남긴다 —
 * 줄번호가 있어야 고칠 곳을 짚어준다.
 */
function scan(css: string): Offender[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length));
  const found: Offender[] = [];
  let selector = "";

  source.split("\n").forEach((line, index) => {
    if (line.includes("{")) selector = line.slice(0, line.indexOf("{")).trim() || selector;
    const hit = /(?<![-\w])z-index\s*:\s*([^;{}]+)/.exec(line);
    if (!hit) return;
    const value = hit[1].trim();
    if (value.startsWith("var(")) return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    if (Math.abs(number) < LOCAL_CEILING) return;
    if (SCALE.has(number)) return;
    found.push({ line: index + 1, value: number, selector });
  });

  return found;
}

function filesInBarrel(): string[] {
  const barrel = readFileSync(join(HERE, "..", "styles.css"), "utf8");
  return [...barrel.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
}

describe("겹침의 자 (22-floating.css §19.5)", () => {
  const listed = Object.keys(CEILING).sort();

  it.skipIf(listed.length === 0).each(listed)("%s — 자 밖의 z-index가 늘지 않는다", (name) => {
    const offenders = scan(readFileSync(join(HERE, name), "utf8"));
    const ceiling = CEILING[name];

    if (offenders.length > ceiling) {
      const added = offenders
        .slice(ceiling)
        .map((o) => `  ${name}:${o.line}  z-index: ${o.value}  (${o.selector})`)
        .join("\n");
      throw new Error(
        `${name}: 자 밖의 z-index ${offenders.length}곳 (천장 ${ceiling}).\n` +
          `여덟 단(0 · 20 · 80 · 100 · 120 · 200 · 300 · 400) 중 하나를 \`var(--z-…)\`로\n` +
          `부르거나, 이 값이어야 하는 이유를 주석으로 남기고 CEILING을 올려라.\n${added}`,
      );
    }

    if (offenders.length < ceiling) {
      throw new Error(
        `${name}: ${ceiling} → ${offenders.length}로 줄었다. layers.test.ts의 CEILING을\n` +
          `  "${name}": ${offenders.length},\n로 내려라 — 그래야 이 자리가 다시 늘 때 잡힌다.`,
      );
    }
  });

  it("목록에 없는 CSS 파일은 0이다", () => {
    const unlisted = filesInBarrel()
      .filter((name) => !(name in CEILING))
      .map((name) => [name, scan(readFileSync(join(HERE, name), "utf8")).length] as const)
      .filter(([, count]) => count > 0);

    expect(unlisted).toEqual([]);
  });
});
