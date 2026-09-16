import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `api/` 에 있는 파일 하나가 곧 공개 주소 하나다.
 *
 * `scripts/buildFunctions.mjs` 는 `src/functions/**` 의 `.ts` 를 그대로
 * `api/**` 의 `.js` 로 옮긴다. 그 디렉터리의 모양이 **라우팅 테이블**이라는
 * 뜻이고, 여기 들어간 것은 배포되면 누구나 부를 수 있다.
 *
 * 이 디렉터리에 처음 검사를 하나 붙였더니 `api/google/start.test.js` 가
 * 같이 생겼다 [실측 — `git status` 에서 봤다]. 다른 디렉터리에서는 소스
 * 옆의 검사 파일이 아무 일도 아니지만 여기서는 `/api/google/start.test` 가
 * 살아 있는 엔드포인트가 된다는 뜻이다.
 *
 * 번들러에서 걸렀고, 그 거름망이 새지 않는지를 **결과물 쪽에서** 본다 —
 * 정규식이 맞는지가 아니라 실제로 무엇이 배포되는지가 이 검사의 질문이다.
 */

const root = resolve(__dirname, "..", "..");
const API = join(root, "api");
const SOURCE = join(root, "src", "functions");

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), next) : [next];
  });
}

describe("배포되는 주소", () => {
  it("검사 파일은 엔드포인트가 되지 않는다", () => {
    const published = walk(API).filter((path) => /\.(test|spec)\.[cm]?js$/.test(path));
    expect(published, `이 파일들이 공개 주소가 된다:\n${published.join("\n")}`).toEqual([]);
  });

  it("핸들러는 하나도 빠짐없이 배포된다 — 그물의 자기 점검", () => {
    // 위 검사는 "아무것도 번들하지 않는" 번들러로도 통과한다. 거름망이
    // 너무 많이 거르지는 않는지를 같이 본다.
    const handlers = walk(SOURCE).filter((path) => path.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(path));
    expect(handlers.length, "핸들러가 하나도 없으면 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(3);

    const missing = handlers.filter((path) => !existsSync(join(API, path.replace(/\.ts$/, ".js"))));
    expect(missing, `소스에는 있는데 배포되지 않는다:\n${missing.join("\n")}`).toEqual([]);
  });
});
