// 구독할 수 있는 공유 캘린더 한 장 (§ 캘린더 공유).
//
// 토큰만 있으면 누구나 부를 수 있는 공개 주소다. 인증은 토큰 자체이고,
// 그래서 이 파일이 하는 일은 셋뿐이다: 토큰의 **모양**을 확인하고, 켜져
// 있는 공유를 찾아, 그 스냅샷을 ICS 로 내놓는다.
//
// `api/calendar/[token].js` 에 손으로 쓴 채 오래 있었다. 손으로 쓴 `api/**`
// 는 번들러가 건드리지 않으므로 타입도 검사도 닿지 않았고, 그 안에 든
// ICS 생성기에 세 가지가 어긋나 있었다 (`lib/ics/publish.ts` 의 주석이
// 각각을 적는다). 여기로 옮기면 `tsc` 와 `vitest` 가 닿고,
// `src/functions/publishedRoutes.test.ts` 의 그물에도 들어온다.
import { createIcs } from "../../lib/ics/publish";
import type { CalendarShareSnapshot } from "../../lib/calendarShare";

interface AdapterRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

/**
 * Vercel 에 붙여 넣은 값에는 줄바꿈이 딸려 오는 일이 잦고, Supabase 는 그것을
 * "Invalid API key" 로 거절한다.
 *
 * 사람들이 실제로 붙여 넣는 것들을 받아 `https://<ref>.supabase.co` 로
 * 줄인다 — 맨 URL, `/rest/v1` 같은 군더더기 경로가 붙은 것("Invalid path
 * specified in request URL" 이 된다), 대시보드 링크.
 */
export function resolveSupabaseUrl(raw: string | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const dashboard = url.pathname.match(/\/dashboard\/project\/([a-z0-9-]+)/i);
    if (dashboard && /(^|\.)supabase\.com$/i.test(url.hostname)) {
      return `https://${dashboard[1]}.supabase.co`;
    }
    return url.origin;
  } catch {
    return value;
  }
}

/** 토큰은 48 자리 16진수다. 그 밖의 것은 찾아볼 것도 없다. */
export const SHARE_TOKEN = /^[a-f0-9]{48}$/i;

const supabaseUrl = resolveSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: AdapterRequest, res: AdapterResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  const token = String(first(req.query?.token) || "").replace(/\.ics$/i, "");
  if (!SHARE_TOKEN.test(token)) {
    res.status(404).end("Calendar not found");
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    const missing = [!supabaseUrl && "SUPABASE_URL", !supabaseKey && "SUPABASE_SERVICE_ROLE_KEY"]
      .filter(Boolean)
      .join(", ");
    res.status(500).end(`Calendar sharing is not configured (missing env: ${missing})`);
    return;
  }

  // PostgREST 를 직접 부른다. 서버 쪽이 이미 이렇게 한다
  // (`integrations/google/store.ts`). SDK 를 들이면 이 함수 하나가 823 kB 로
  // 번들되는데, 하는 일은 행 하나를 읽는 것뿐이다 [실측 — 옮기면서 한 번
  // 그렇게 만들어 봤다].
  //
  // 토큰은 위에서 48 자리 16진수로 확인했으므로 질의에 그대로 실어도
  // 되지만, 그 확인이 언젠가 느슨해질 것을 전제로 감싼다.
  const query =
    `${supabaseUrl}/rest/v1/calendar_shares` +
    `?select=data,updated_at&enabled=is.true&limit=1` +
    `&token=eq.${encodeURIComponent(token)}`;

  type ShareRow = { data?: unknown; updated_at?: unknown };
  let rows: ShareRow[] = [];
  try {
    const response = await fetch(query, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: "application/json" },
    });
    if (!response.ok) {
      // 상태 코드만 말한다. 이 주소는 누구나 부를 수 있고, 데이터베이스가
      // 돌려준 문장은 부르는 사람이 알 필요가 없는 것까지 담는다.
      res.status(500).end(`Calendar lookup failed (${response.status})`);
      return;
    }
    const body = (await response.json()) as unknown;
    rows = Array.isArray(body) ? (body as ShareRow[]) : [];
  } catch {
    res.status(500).end("Calendar lookup failed");
    return;
  }

  const row = rows[0];
  if (!row) {
    res.status(404).end("Calendar not found");
    return;
  }

  const ics = createIcs(
    (row.data ?? null) as CalendarShareSnapshot | null,
    typeof row.updated_at === "string" && row.updated_at ? row.updated_at : new Date().toISOString(),
  );
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).end(req.method === "HEAD" ? "" : ics);
}
