// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { GoogleCalendarCard } from "./GoogleCalendarCard";
import { publishGoogleTaskSync } from "../../lib/googleTaskSyncState";

/**
 * 연결된 카드가 "어느 캘린더를 읽을지" 를 **그리는가**.
 *
 * 이 한 줄이 끊겨 있었다. 2026-09-10 에 설정의 목록을 지우면서 행을 만드는
 * 유일한 길(`rememberGoogleCalendars`)의 호출자가 사라졌고, 그래서 그 뒤에
 * 연결한 계정은 `google_calendar_sources` 에 행이 하나도 없었다. 인바운드
 * 패스는 `chosen.length === 0` 에서 바로 돌아섰고, 읽기 쪽 700 줄과 테이블
 * 하나가 돌 수 없는 채로 남았다.
 *
 * 그 목록 자체의 동작은 `GoogleCalendarSourceList.test.tsx` 가 본다. 여기서
 * 보는 것은 **고리**다 — 그 컴포넌트가 카드 안에 실제로 걸려 있는가. 옆
 * 파일(`GoogleCalendarCard.test.tsx`)은 이 컴포넌트를 통째로 `() => null` 로
 * 갈아끼우므로, 그 파일에서는 이것이 빠져도 아무것도 무너지지 않는다.
 */

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  token: vi.fn(),
  list: vi.fn(),
  remember: vi.fn(),
  sources: vi.fn(),
  getSession: vi.fn(),
  authListener: vi.fn(),
}));

vi.mock("../../services/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.authListener } },
}));
vi.mock("../../platform", () => ({ platform: { kind: "web", openExternal: vi.fn() } }));
vi.mock("../../lib/googleCalendar", async () => ({
  ...(await vi.importActual<typeof import("../../lib/googleCalendar")>("../../lib/googleCalendar")),
  readConnection: mocks.read,
  currentAccessToken: mocks.token,
}));
vi.mock("../../lib/googleCalendarSources", async () => ({
  ...(await vi.importActual<typeof import("../../lib/googleCalendarSources")>("../../lib/googleCalendarSources")),
  listGoogleCalendars: mocks.list,
  rememberGoogleCalendars: mocks.remember,
  readGoogleSources: mocks.sources,
}));

beforeEach(() => {
  publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null });
  vi.clearAllMocks();
  localStorage.clear();
  history.replaceState(null, "", "/settings");
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user" } } } });
  mocks.authListener.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.read.mockResolvedValue({ calendarId: "focusflow-cal", accountEmail: "person@example.com" });
  mocks.token.mockResolvedValue("access");
  mocks.list.mockResolvedValue([
    { calendarId: "person@example.com", summary: "개인", color: "#123456", writable: true, primary: true },
    { calendarId: "focusflow-cal", summary: "FocusFlow", color: "#4f73ff", writable: true, primary: false },
  ]);
  mocks.remember.mockResolvedValue(undefined);
  mocks.sources.mockResolvedValue([]);
});
afterEach(cleanup);

const mount = () =>
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <GoogleCalendarCard />
      </FloatingLayerProvider>
    </I18nProvider>,
  );

it("연결되면 어느 캘린더를 읽을지 묻고, 고른 것을 기억할 길이 열린다", async () => {
  mount();

  expect(await screen.findByText("Calendars to sync"), "이 줄이 없으면 행을 만들 길이 없다").toBeTruthy();
  expect(await screen.findByLabelText(/개인/), "계정의 캘린더가 체크박스로 나와야 한다").toBeTruthy();

  // 행을 만드는 유일한 함수가 실제로 불렸는가. 이것이 안 불리면
  // `google_calendar_sources` 는 영원히 비어 있고, 인바운드는 돌지 않는다.
  expect(mocks.remember, "목록을 그리는 것만으로는 부족하다 — 기억해야 행이 생긴다").toHaveBeenCalled();
});

it("자기 점검: 연결되지 않았으면 묻지 않는다", async () => {
  // 위 검사가 "언제나 그린다"로도 통과하지 않게 한다. 나열할 것이 없을 때의
  // 비활성 목록은 소음일 뿐이라는 것이 이 컴포넌트를 처음 놓을 때의 규칙이다.
  mocks.read.mockResolvedValue(null);
  mount();

  expect(await screen.findByText(/Not connected/), "연결 안 됨 상태여야 이 검사가 성립한다").toBeTruthy();
  expect(screen.queryByText("Calendars to sync")).toBeNull();
  expect(mocks.list).not.toHaveBeenCalled();
});

it("앱이 만든 전용 캘린더는 고를 수 없다", async () => {
  // 그것을 되읽으면 동기화된 할 일이 두 번 그려진다 — 한 번은 할 일로, 한
  // 번은 외부 일정으로. 에코 가드는 자기가 들고 있는 **일정**을 알지, 그것이
  // 어느 할 일에서 나왔는지는 모른다 (`inboundPlan` §6.3).
  mount();
  await screen.findByText("Calendars to sync");
  expect(screen.queryByLabelText(/FocusFlow/)).toBeNull();
});
