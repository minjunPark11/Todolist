// Validation Spike — step 0: 자격증명 없이 확인할 수 있는 것만 확인한다.
//
// 알아내는 것:
//   - Supabase 프로젝트에서 OAuth 2.1 server가 실제로 켜져 있는가        (Q9)
//   - RFC 8414 authorization-server 메타데이터를 게시하는가              (MCP discovery)
//   - Dynamic Client Registration이 켜져 있는가                          (§6.3)
//   - JWT 서명이 대칭(HS256)인가 비대칭(RS256/ES256)인가                 (SEC-1)
//
// 실행:  SUPABASE_URL=https://<ref>.supabase.co node spike/oauth-rls/probe.mjs
//
// GET만 한다. 익명 요청이므로 키가 필요 없다.
//
// ⚠ 이 스크립트의 초판은 OIDC discovery 문서가 응답한다는 사실만으로 "OAuth 켜짐"을
//   판정했다가 틀렸다. GoTrue는 OAuth 2.1 server가 꺼져 있어도
//   /.well-known/openid-configuration 을 게시하고, 그 문서에 oauth/authorize·oauth/token
//   경로를 적어 둔다. 실제 판정은 authorize 엔드포인트를 눌러 봐야 나온다(§2).

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
if (!SUPABASE_URL) {
  console.error("SUPABASE_URL 환경변수가 필요합니다. 예:");
  console.error("  SUPABASE_URL=https://abcdefgh.supabase.co node spike/oauth-rls/probe.mjs");
  process.exit(2);
}

const results = [];
function record(name, verdict, detail) {
  results.push({ name, verdict });
  console.log(`[${verdict}] ${name}\n       ${detail}\n`);
}

async function get(url) {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 비-JSON */
    }
    return { status: response.status, json, text: text.slice(0, 300) };
  } catch (error) {
    return { status: 0, json: null, text: String(error?.message ?? error) };
  }
}

console.log(`\n=== FocusFlow OAuth Validation Spike — probe ===`);
console.log(`대상: ${SUPABASE_URL}\n`);

// ============================================================
// 1. 메타데이터 — RFC 8414 와 OIDC 를 구분해서 본다
// ============================================================
const rfc8414Paths = [
  `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`,
  `${SUPABASE_URL}/auth/v1/.well-known/oauth-authorization-server`,
  `${SUPABASE_URL}/.well-known/oauth-authorization-server`,
];

let rfc8414 = null;
let rfc8414Url = "";
for (const candidate of rfc8414Paths) {
  const response = await get(candidate);
  if (response.status === 200 && response.json?.authorization_endpoint) {
    rfc8414 = response.json;
    rfc8414Url = candidate;
    break;
  }
}

const oidcUrl = `${SUPABASE_URL}/auth/v1/.well-known/openid-configuration`;
const oidcResponse = await get(oidcUrl);
const oidc = oidcResponse.status === 200 ? oidcResponse.json : null;
const metadata = rfc8414 ?? oidc;

record(
  "MCP discovery — RFC 8414 authorization-server 메타데이터",
  rfc8414 ? "PASS" : "WARN",
  rfc8414
    ? `게시됨: ${rfc8414Url}`
    : `세 경로 모두 404.\n       ${rfc8414Paths.join("\n       ")}\n` +
        `       → MCP 클라이언트가 RFC 8414을 먼저 찾고 OIDC로 폴백하지 않으면 discovery가 실패한다.\n` +
        `       OAuth server를 켜면 함께 게시될 수 있으므로 §2 이후 다시 확인할 것.`,
);

if (oidc) {
  console.log(`OIDC discovery는 응답함: ${oidcUrl}`);
  for (const key of ["issuer", "authorization_endpoint", "token_endpoint", "registration_endpoint", "jwks_uri"]) {
    if (oidc[key]) console.log(`  ${key.padEnd(24)} ${oidc[key]}`);
  }
  if (oidc.scopes_supported) console.log(`  scopes_supported         ${oidc.scopes_supported.join(", ")}`);
  if (oidc.token_endpoint_auth_methods_supported)
    console.log(`  token_auth_methods       ${oidc.token_endpoint_auth_methods_supported.join(", ")}`);
  console.log(
    `\n  ⚠ 이 문서만으로는 활성화를 판정할 수 없다 — GoTrue는 꺼져 있어도 게시한다.` +
      `\n    실제 판정은 아래 Q9(authorize 직접 호출).\n`,
  );
}

if (!metadata) {
  record("Q9 — OAuth 2.1 server 활성화", "FAIL", "메타데이터를 전혀 찾지 못했습니다.");
  process.exit(1);
}

// ============================================================
// 2. ★ 실제 판정 — authorize 엔드포인트를 눌러 본다
//    파라미터 없이 부르므로 아무 것도 만들지 않는다.
//      feature_disabled  → 꺼짐
//      400/302 등        → 켜짐 (파라미터가 없다고 불평하는 것)
// ============================================================
const authorizeEndpoint = metadata.authorization_endpoint || `${SUPABASE_URL}/auth/v1/oauth/authorize`;
const authorizeProbe = await get(authorizeEndpoint);
const disabled =
  authorizeProbe.json?.error_code === "feature_disabled" ||
  /oauth server is disabled/i.test(authorizeProbe.json?.msg ?? authorizeProbe.text ?? "");

record(
  "Q9 — OAuth 2.1 server 활성화",
  disabled ? "FAIL" : "PASS",
  disabled
    ? `authorize 응답: HTTP ${authorizeProbe.status} ${JSON.stringify(authorizeProbe.json)}\n` +
      `       → 대시보드 Authentication > OAuth Server 에서 활성화가 필요합니다.\n` +
      `         함께 설정할 것: authorization URL path(예: /oauth/consent), Site URL,\n` +
      `         그리고 Dynamic Client Registration 토글.`
    : `authorize가 응답합니다 (HTTP ${authorizeProbe.status}). 파라미터 없이 불렀으므로 400/302가 정상입니다.`,
);

// ============================================================
// 3. DCR
// ============================================================
if (disabled) {
  record("DCR — 동적 클라이언트 등록", "SKIP", "OAuth server가 꺼져 있어 판정 불가.");
} else if (metadata.registration_endpoint) {
  record("DCR — 동적 클라이언트 등록", "PASS", `registration_endpoint: ${metadata.registration_endpoint}`);
} else {
  const registerProbe = await get(`${SUPABASE_URL}/auth/v1/oauth/register`);
  record(
    "DCR — 동적 클라이언트 등록",
    "WARN",
    `메타데이터에 registration_endpoint가 없습니다. /auth/v1/oauth/register 직접 호출: HTTP ${registerProbe.status}\n` +
      `       → DCR 토글이 꺼진 것으로 보입니다. 수동으로 OAuth 클라이언트를 만들고\n` +
      `         OAUTH_CLIENT_ID / OAUTH_REDIRECT_URI 를 spike.mjs 에 넘기면 검증 1~4는 그대로 가능합니다.`,
  );
}

// ============================================================
// 4. JWT 서명 방식 (SEC-1 — blocker 아님)
// ============================================================
const jwks = await get(metadata.jwks_uri || `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
const keys = Array.isArray(jwks.json?.keys) ? jwks.json.keys : [];
if (keys.length > 0) {
  const algs = [...new Set(keys.map((key) => key.alg || key.kty))];
  record(
    "SEC-1 — JWT 서명 방식",
    "INFO",
    `비대칭 서명 키 ${keys.length}개 (${algs.join(", ")}), kid=${keys.map((k) => k.kid).join(", ")}.\n` +
      `       → 토큰 검증을 JWKS로 로컬 처리할 수 있습니다. 다만 이 키가 실제로 서명에\n` +
      `         쓰이는지는 발급된 토큰의 헤더(alg/kid)를 봐야 확정됩니다 — spike.mjs 가 확인합니다.`,
  );
} else {
  record(
    "SEC-1 — JWT 서명 방식",
    "INFO",
    `JWKS에 키가 없습니다 (HTTP ${jwks.status}). legacy HS256 대칭 서명으로 보입니다.\n` +
      `       getClaims()가 원격 검증으로 동작하므로 MCP는 그대로 가능합니다(설계 §6.6).`,
  );
}

// ============================================================
console.log("=== 요약 ===");
for (const item of results) console.log(`  [${item.verdict}] ${item.name}`);
console.log(
  disabled
    ? "\n다음 단계: 대시보드에서 OAuth server를 켠 뒤 probe를 다시 실행하세요.\n" +
        "검증 1~4(spike.mjs)는 그 전에는 진행할 수 없습니다.\n"
    : "\n다음 단계: node spike/oauth-rls/spike.mjs (사용자 자격증명 필요 — README 참조)\n",
);
