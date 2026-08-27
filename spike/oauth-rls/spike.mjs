// Validation Spike — 검증 1~4.
//
//   1. 실제 OAuth 토큰에 client_id 클레임이 들어오는가              (설계 §6.5 / Q1)
//   2. OAuth 토큰은 SELECT만 되고 INSERT/UPDATE/DELETE는 막히는가   (설계 §6.5)
//   3. 일반 로그인 세션의 기존 CRUD는 그대로 동작하는가             (회귀)
//   4. User A 토큰으로 User B 데이터에 접근할 수 없는가             (설계 §14)
//
// 실행 방법은 README.md 참조. 이 스크립트는 사용자가 직접 자격증명을 넣어 실행한다.
//
// 데이터 영향: `tasks` 테이블에 id가 "spike-"로 시작하는 임시 행을 만들고
// 끝에 반드시 지운다. 실패로 중단되어도 남은 행을 지우도록 finally를 쓴다.
// 그래도 남는다면 SQL로: delete from public.tasks where id like 'spike-%';

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// ---------------------------------------------------------------- 환경
const env = (name, required = true) => {
  const value = (process.env[name] || "").trim();
  if (!value && required) {
    console.error(`환경변수 ${name} 가 필요합니다. README.md 참조.`);
    process.exit(2);
  }
  return value;
};

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = env("SUPABASE_ANON_KEY");
const USER_A_EMAIL = env("USER_A_EMAIL");
const USER_A_PASSWORD = env("USER_A_PASSWORD");
const USER_B_EMAIL = env("USER_B_EMAIL");
const USER_B_PASSWORD = env("USER_B_PASSWORD");
const MANUAL_CLIENT_ID = env("OAUTH_CLIENT_ID", false);
const REDIRECT_URI = env("OAUTH_REDIRECT_URI", false) || "http://localhost:54321/spike-callback";

// ---------------------------------------------------------------- 결과 수집
const checks = [];
function check(id, name, verdict, detail) {
  checks.push({ id, name, verdict, detail });
  console.log(`[${verdict}] ${id} ${name}\n       ${detail}\n`);
}
function info(message) {
  console.log(`       · ${message}`);
}

// ---------------------------------------------------------------- 유틸
function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtPayload(token) {
  const part = token.split(".")[1];
  if (!part) return null;
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// PostgREST 직접 호출. supabase-js를 쓰지 않는 이유: 정확한 HTTP 상태 코드가 필요하다.
async function rest(method, path, { token, body, prefer } = {}) {
  const headers = {
    apikey: ANON_KEY,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 비-JSON 오류 본문 */
  }
  return { status: response.status, ok: response.ok, json, text: text.slice(0, 400) };
}

function taskRow(userId, id, title) {
  return {
    id,
    user_id: userId,
    data: {
      id,
      title,
      description: "",
      status: "open",
      priority: "none",
      dueDate: "",
      startDate: "",
      startTime: "",
      endTime: "",
      projectId: "",
      categoryId: "",
      parentTaskId: "",
      tags: [],
      notes: "",
      estimatedMinutes: 0,
      actualSeconds: 0,
      activeSessionId: "",
      lastFocusedAt: "",
      isSomeday: false,
      waitingReason: "",
      waitingFollowUpDate: "",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: "",
      blockedByTaskId: "",
      repeatType: "none",
      repeatInterval: 1,
      repeatDays: [],
      repeatEndDate: "",
    },
  };
}

// ---------------------------------------------------------------- 실행
const cleanup = [];

async function main() {
  console.log(`\n=== FocusFlow OAuth / RLS Validation Spike ===`);
  console.log(`대상: ${SUPABASE_URL}\n`);

  // ---- 메타데이터 -------------------------------------------------
  let metadata = null;
  for (const candidate of [
    `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`,
    `${SUPABASE_URL}/auth/v1/.well-known/oauth-authorization-server`,
  ]) {
    const response = await fetch(candidate, { headers: { accept: "application/json" } });
    if (response.ok) {
      metadata = await response.json().catch(() => null);
      if (metadata?.authorization_endpoint) break;
      metadata = null;
    }
  }
  if (!metadata) {
    console.error("OAuth 2.1 메타데이터를 찾지 못했습니다. 먼저 probe.mjs 를 실행하세요.");
    process.exit(1);
  }
  const authorizeEndpoint = metadata.authorization_endpoint;
  const tokenEndpoint = metadata.token_endpoint;
  const registrationEndpoint = metadata.registration_endpoint;

  // ---- 로그인 (A, B) ---------------------------------------------
  const clientA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signInA = await clientA.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: USER_A_PASSWORD,
  });
  if (signInA.error) {
    console.error(`User A 로그인 실패: ${signInA.error.message}`);
    process.exit(1);
  }
  const sessionA = signInA.data.session;
  const userA = signInA.data.user;

  const signInB = await clientB.auth.signInWithPassword({
    email: USER_B_EMAIL,
    password: USER_B_PASSWORD,
  });
  if (signInB.error) {
    console.error(`User B 로그인 실패: ${signInB.error.message}`);
    process.exit(1);
  }
  const sessionB = signInB.data.session;
  const userB = signInB.data.user;

  if (userA.id === userB.id) {
    console.error("User A와 User B가 같은 계정입니다. 검증 4가 무의미합니다.");
    process.exit(1);
  }
  console.log(`User A: ${userA.id}\nUser B: ${userB.id}\n`);

  // ---- OAuth 클라이언트 확보 (DCR 또는 수동) ----------------------
  let clientId = MANUAL_CLIENT_ID;
  if (!clientId) {
    if (!registrationEndpoint) {
      console.error(
        "registration_endpoint가 없고 OAUTH_CLIENT_ID도 주지 않았습니다.\n" +
          "대시보드에서 OAuth 클라이언트를 만들고 OAUTH_CLIENT_ID / OAUTH_REDIRECT_URI를 넘겨주세요.",
      );
      process.exit(1);
    }
    const registration = await fetch(registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({
        client_name: "FocusFlow Spike Client",
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const registered = await registration.json().catch(() => null);
    if (!registration.ok || !registered?.client_id) {
      console.error(`DCR 실패 (HTTP ${registration.status}): ${JSON.stringify(registered)}`);
      process.exit(1);
    }
    clientId = registered.client_id;
    console.log(`DCR로 클라이언트 등록됨: ${clientId}\n`);
  } else {
    console.log(`수동 클라이언트 사용: ${clientId}\n`);
  }

  // ---- PKCE authorize → approve → code → token --------------------
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = randomUUID();

  const authorizeUrl =
    `${authorizeEndpoint}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  const authorizeResponse = await fetch(authorizeUrl, {
    redirect: "manual",
    headers: { apikey: ANON_KEY },
  });
  const location = authorizeResponse.headers.get("location") || "";
  const authorizationId = location ? new URL(location, SUPABASE_URL).searchParams.get("authorization_id") : null;

  if (!authorizationId) {
    console.error(
      `authorize가 authorization_id를 주지 않았습니다.\n` +
        `  HTTP ${authorizeResponse.status}\n  Location: ${location || "(없음)"}\n` +
        `  → 대시보드의 Site URL / authorization path 설정과 redirect_uri 등록을 확인하세요.`,
    );
    process.exit(1);
  }
  info(`authorization_id 획득: ${authorizationId}`);

  const details = await clientA.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) {
    console.error(`getAuthorizationDetails 실패: ${details.error.message}`);
    process.exit(1);
  }
  info(`동의 대상 클라이언트: ${details.data?.client?.name ?? "(이름 없음)"} / scope: ${details.data?.scope ?? "-"}`);

  const approval = await clientA.auth.oauth.approveAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (approval.error || !approval.data?.redirect_url) {
    console.error(`approveAuthorization 실패: ${approval.error?.message ?? "redirect_url 없음"}`);
    process.exit(1);
  }
  const code = new URL(approval.data.redirect_url).searchParams.get("code");
  if (!code) {
    console.error(`redirect_url에 code가 없습니다: ${approval.data.redirect_url}`);
    process.exit(1);
  }
  info(`authorization code 획득`);

  const tokenResponse = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", apikey: ANON_KEY },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const tokenJson = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenJson?.access_token) {
    console.error(`토큰 교환 실패 (HTTP ${tokenResponse.status}): ${JSON.stringify(tokenJson)}`);
    process.exit(1);
  }
  const oauthToken = tokenJson.access_token;
  console.log(`\nOAuth access token 획득 (expires_in=${tokenJson.expires_in})\n`);

  // ================================================================
  // 검증 1 — client_id 클레임
  // ================================================================
  const oauthClaims = decodeJwtPayload(oauthToken) || {};
  const sessionClaims = decodeJwtPayload(sessionA.access_token) || {};

  console.log("OAuth 토큰 클레임 키:   " + Object.keys(oauthClaims).sort().join(", "));
  console.log("세션 토큰 클레임 키:    " + Object.keys(sessionClaims).sort().join(", ") + "\n");

  const hasClientId = typeof oauthClaims.client_id === "string" && oauthClaims.client_id.length > 0;
  const sessionHasClientId = typeof sessionClaims.client_id === "string" && sessionClaims.client_id.length > 0;

  check(
    "1.",
    "OAuth 토큰의 client_id 클레임",
    hasClientId && !sessionHasClientId ? "PASS" : "FAIL",
    hasClientId
      ? sessionHasClientId
        ? `양쪽 토큰 모두 client_id를 가집니다 — 구분자로 쓸 수 없습니다. 설계 §6.5 재검토 필요.`
        : `OAuth 토큰에만 client_id="${oauthClaims.client_id}" 존재. 세션 토큰에는 없음 → RLS 구분자로 사용 가능.`
      : `OAuth 토큰에 client_id가 없습니다. §6.5의 RLS 차단을 이 클레임으로 할 수 없습니다 → ` +
          `Custom Access Token Hook으로 클레임을 심거나, 애플리케이션 층 단독 의존으로 후퇴해야 합니다.`,
  );

  if (hasClientId) {
    info(`sub=${oauthClaims.sub} role=${oauthClaims.role} aud=${oauthClaims.aud} iss=${oauthClaims.iss}`);
  }

  // ================================================================
  // 검증 3 (먼저 실행) — 일반 세션의 기존 CRUD 회귀
  //   순서를 앞당긴 이유: 여기가 실패하면 2·4의 결과를 해석할 수 없다.
  // ================================================================
  const sessionRowId = `spike-session-${randomUUID().slice(0, 8)}`;
  cleanup.push({ token: sessionA.access_token, id: sessionRowId });

  const insertSession = await rest("POST", "tasks", {
    token: sessionA.access_token,
    body: taskRow(userA.id, sessionRowId, "spike: session CRUD"),
    prefer: "return=representation",
  });
  const updateSession = await rest(
    "PATCH",
    `tasks?id=eq.${sessionRowId}&user_id=eq.${userA.id}`,
    {
      token: sessionA.access_token,
      body: { data: { ...taskRow(userA.id, sessionRowId, "spike: session CRUD (updated)").data } },
      prefer: "return=representation",
    },
  );
  const selectSession = await rest("GET", `tasks?id=eq.${sessionRowId}&select=id`, {
    token: sessionA.access_token,
  });
  const deleteSession = await rest("DELETE", `tasks?id=eq.${sessionRowId}&user_id=eq.${userA.id}`, {
    token: sessionA.access_token,
  });

  const sessionCrudOk =
    insertSession.ok && updateSession.ok && selectSession.ok && deleteSession.ok && selectSession.json?.length === 1;
  if (deleteSession.ok) cleanup.pop();

  check(
    "3.",
    "일반 로그인 세션의 CRUD 회귀",
    sessionCrudOk ? "PASS" : "FAIL",
    `INSERT ${insertSession.status} / SELECT ${selectSession.status}(${selectSession.json?.length ?? 0}건) / ` +
      `UPDATE ${updateSession.status} / DELETE ${deleteSession.status}` +
      (sessionCrudOk ? "" : `\n       실패 본문: ${[insertSession, updateSession, deleteSession].find((r) => !r.ok)?.text}`),
  );

  // ================================================================
  // 검증 2 — OAuth 토큰: SELECT만 허용, 쓰기는 차단
  // ================================================================
  const oauthSelect = await rest("GET", "tasks?select=id&limit=1", { token: oauthToken });

  const oauthRowId = `spike-oauth-${randomUUID().slice(0, 8)}`;
  const oauthInsert = await rest("POST", "tasks", {
    token: oauthToken,
    body: taskRow(userA.id, oauthRowId, "spike: oauth write attempt"),
    prefer: "return=representation",
  });
  if (oauthInsert.ok) cleanup.push({ token: sessionA.access_token, id: oauthRowId });

  // UPDATE/DELETE 대상은 세션으로 미리 만들어 둔다 (없는 행에 대한 0건 응답과 구분하기 위해).
  const targetRowId = `spike-target-${randomUUID().slice(0, 8)}`;
  cleanup.push({ token: sessionA.access_token, id: targetRowId });
  const seed = await rest("POST", "tasks", {
    token: sessionA.access_token,
    body: taskRow(userA.id, targetRowId, "spike: write target"),
    prefer: "return=representation",
  });

  const oauthUpdate = await rest("PATCH", `tasks?id=eq.${targetRowId}`, {
    token: oauthToken,
    body: { data: { ...taskRow(userA.id, targetRowId, "spike: MUTATED BY OAUTH").data } },
    prefer: "return=representation",
  });
  const oauthDelete = await rest("DELETE", `tasks?id=eq.${targetRowId}`, {
    token: oauthToken,
    prefer: "return=representation",
  });

  // 실제로 바뀌었는지 세션 토큰으로 확인한다. PostgREST는 RLS로 0건이 되어도
  // 200을 돌려줄 수 있으므로, 상태 코드가 아니라 "행이 남아 있는가"로 판정한다.
  const afterWrites = await rest("GET", `tasks?id=eq.${targetRowId}&select=id,data`, {
    token: sessionA.access_token,
  });
  const targetSurvived = (afterWrites.json?.length ?? 0) === 1;
  const targetTitle = afterWrites.json?.[0]?.data?.title ?? "";
  const targetMutated = targetTitle.includes("MUTATED BY OAUTH");

  const writesBlocked = !oauthInsert.ok && targetSurvived && !targetMutated;

  check(
    "2.",
    "OAuth 토큰: SELECT 허용 / 쓰기 차단",
    oauthSelect.ok && writesBlocked ? "PASS" : "FAIL",
    `SELECT ${oauthSelect.status} (${oauthSelect.ok ? "허용 — 기대대로" : "거부 — 읽기까지 막혔습니다"})\n` +
      `       INSERT ${oauthInsert.status} (${oauthInsert.ok ? "★ 성공 — 차단되지 않음" : "거부"})\n` +
      `       UPDATE ${oauthUpdate.status} → 대상 행 변조됨? ${targetMutated ? "★ 예" : "아니오"}\n` +
      `       DELETE ${oauthDelete.status} → 대상 행 생존? ${targetSurvived ? "예" : "★ 아니오(삭제됨)"}\n` +
      (writesBlocked
        ? `       → §6.5의 RLS 정책이 동작합니다.`
        : `       → 쓰기가 막히지 않았습니다. policy.sql 을 적용했는지 확인하고 다시 실행하세요.\n` +
          `          (미적용 상태라면 이 FAIL은 정상이며, 정책의 필요성을 실증한 것입니다.)`),
  );

  // ================================================================
  // 검증 4 — A 토큰으로 B 데이터 접근 차단
  // ================================================================
  const bRowId = `spike-userb-${randomUUID().slice(0, 8)}`;
  cleanup.push({ token: sessionB.access_token, id: bRowId });
  const bSeed = await rest("POST", "tasks", {
    token: sessionB.access_token,
    body: taskRow(userB.id, bRowId, "spike: user B private row"),
    prefer: "return=representation",
  });
  if (!bSeed.ok) {
    check("4.", "교차 사용자 격리", "FAIL", `User B의 시드 행 생성 실패: ${bSeed.status} ${bSeed.text}`);
  } else {
    // A의 세션 토큰으로 (일반 로그인 경로)
    const aReadsB = await rest("GET", `tasks?id=eq.${bRowId}&select=id`, { token: sessionA.access_token });
    const aUpdatesB = await rest("PATCH", `tasks?id=eq.${bRowId}`, {
      token: sessionA.access_token,
      body: { data: { ...taskRow(userB.id, bRowId, "spike: STOLEN BY A").data } },
      prefer: "return=representation",
    });
    const aDeletesB = await rest("DELETE", `tasks?id=eq.${bRowId}`, { token: sessionA.access_token });

    // A의 OAuth 토큰으로 (MCP 경로 — 실제 위협 모델)
    const aOauthReadsB = await rest("GET", `tasks?id=eq.${bRowId}&select=id`, { token: oauthToken });

    // B의 시선으로 실제 피해 확인
    const bChecks = await rest("GET", `tasks?id=eq.${bRowId}&select=id,data`, { token: sessionB.access_token });
    const bRowSurvived = (bChecks.json?.length ?? 0) === 1;
    const bRowStolen = (bChecks.json?.[0]?.data?.title ?? "").includes("STOLEN BY A");

    const isolated =
      (aReadsB.json?.length ?? 0) === 0 &&
      (aOauthReadsB.json?.length ?? 0) === 0 &&
      bRowSurvived &&
      !bRowStolen;

    check(
      "4.",
      "교차 사용자 격리 (A → B)",
      isolated ? "PASS" : "FAIL",
      `A 세션 토큰 SELECT: ${aReadsB.status} (${aReadsB.json?.length ?? 0}건)\n` +
        `       A OAuth 토큰 SELECT: ${aOauthReadsB.status} (${aOauthReadsB.json?.length ?? 0}건)\n` +
        `       A의 UPDATE 시도 후 B의 행 변조됨? ${bRowStolen ? "★ 예" : "아니오"}\n` +
        `       A의 DELETE 시도 후 B의 행 생존? ${bRowSurvived ? "예" : "★ 아니오"}\n` +
        (isolated
          ? `       → RLS가 최종 경계로 동작합니다. B의 id를 알아도 접근 불가.`
          : `       → ★★ 격리 실패. 즉시 원인 규명 필요. ★★`),
    );
  }

  // ---- 요약 -------------------------------------------------------
  console.log("=== 요약 ===");
  for (const item of checks) console.log(`  [${item.verdict}] ${item.id} ${item.name}`);
  const failed = checks.filter((item) => item.verdict === "FAIL");
  console.log(
    failed.length === 0
      ? "\n전부 통과했습니다.\n"
      : `\n${failed.length}건 실패: ${failed.map((item) => item.id).join(" ")}\n`,
  );
}

// ---- 정리 ---------------------------------------------------------
async function runCleanup() {
  if (cleanup.length === 0) return;
  console.log("임시 행 정리 중...");
  for (const { token, id } of cleanup) {
    const result = await rest("DELETE", `tasks?id=eq.${id}`, { token });
    console.log(`  ${id}: ${result.status}`);
  }
  console.log(
    "정리 완료. 남은 것이 있으면 SQL로: delete from public.tasks where id like 'spike-%';\n",
  );
}

main()
  .catch((error) => {
    console.error("\n예외 발생:", error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(runCleanup);
