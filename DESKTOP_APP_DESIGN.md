# FocusFlow 데스크톱 앱 설계 (Tauri 2)

> 작성: 2026-07-04 · 상태: 설계 확정, 구현 전
> 결정 사항: 배포 = 지인 공유(GitHub Releases, 코드 서명 없음) · 오프라인 = 후순위 · 네이티브 기능 = 트레이 미니 타이머 + 시스템 알림

## 0. 목표와 제약

- 현재 웹앱(React 18 + Vite 6 + TS, Vercel 배포, Supabase, 로컬/원격 Ollama AI)을 **코드베이스 하나로** Windows 데스크톱 앱화.
- **모바일 가능성을 열어둔다** — 코어를 플랫폼 중립으로 유지하고, 셸(웹/데스크톱/모바일)만 갈아끼우는 구조.
- 웹(Vercel) 배포는 그대로 유지. 데스크톱은 추가 타깃이지 대체가 아님.

## 1. 기술 선택: Tauri 2

| 근거 | 설명 |
|---|---|
| 기존 개발 흐름 유지 | Vite dev 서버를 그대로 webview에 물림. `npm run tauri dev` 하나 추가 |
| 모바일 확장 | Tauri 2는 iOS/Android 타깃 지원 → 셸 아키텍처 재사용 |
| 로컬 Ollama | 데스크톱에서 `localhost:11434` 직결 (웹의 CORS 우회 불필요). tauri-plugin-http 사용 |
| 가벼움 | OS WebView2 사용, 설치본 ~10MB (Electron ~150MB) |
| 리스크 | Rust 툴체인 필요(MSVC Build Tools, 1회 설치). Rust 코드는 설정 수준만 작성 |

Electron은 모바일이 막혀서 탈락. PWA는 트레이/알림 제약으로 보조 수단(추후 모바일 1차 커버)으로만.

## 2. 아키텍처: 플랫폼 어댑터 계층

**원칙: 코어(`src/`)는 플랫폼 API를 직접 호출하지 않는다.**

```
src/
├─ platform/
│  ├─ types.ts        # PlatformAdapter 인터페이스 (계약)
│  ├─ index.ts        # 환경 감지 → 어댑터 선택 (window.__TAURI__ 유무)
│  ├─ web.ts          # 현행 동작: localStorage, Notification API, fetch
│  └─ tauri.ts        # 데스크톱: 네이티브 알림, CORS-free http, 트레이 연동
├─ (기존 components/, hooks/, lib/ — 변경 없음, 어댑터 경유로 점진 전환)
src-tauri/             # 데스크톱 셸: tauri.conf.json, 아이콘, main.rs(생성 코드 수준)
```

### PlatformAdapter 인터페이스 (초안)

```ts
interface PlatformAdapter {
  kind: "web" | "desktop";           // 추후 "mobile"
  storage: {                          // 지금은 localStorage 위임으로 시작
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  notify(opts: { title: string; body?: string }): Promise<void>;
  aiFetch: typeof fetch;              // 데스크톱=플러그인 http(CORS 없음), 웹=fetch
  focusBadge?: {                      // 트레이 미니 타이머 (데스크톱만)
    update(remainingSec: number, label: string): void;
    clear(): void;
  };
  openExternal(url: string): void;
}
```

- 웹 구현이 기본값. 데스크톱 전용 기능은 optional 필드 → 코어는 `adapter.focusBadge?.update(...)` 식으로 호출.
- **1단계에서는 인터페이스만 도입하고 web.ts가 현행과 100% 동일하게 동작**해야 함 (기능 변화 0인 리팩토링).

## 3. 데이터 전략

- **1단계(출시)**: 현행 유지 — Supabase + 로컬 저장. 데스크톱도 동일 동작.
- **후순위(확정)**: 오프라인 우선 전환 시 로컬을 원본으로, `updatedAt` 기반 last-write-wins로 Supabase 동기화. 동기화 로직은 코어 도메인 계층에 배치(모바일 재사용).

## 4. 데스크톱 통합 기능 (확정 범위)

1. **시스템 알림**: 포커스 세션 종료, 일정 리마인더 → OS 알림. `notify()` 어댑터 경유.
2. **트레이 미니 타이머**: 포커스 세션 중 트레이 아이콘 tooltip/메뉴에 남은 시간 표시. 창 닫기 = 트레이로 최소화(세션 유지), 트레이 메뉴에서 완전 종료.

   > **macOS 보정 (2026-08-27).** 위 규칙이 mac에서만 새고 있었다. 구현은 `force_quit`
   > 플래그로 "닫기"와 "진짜 종료"를 가르는데, **그 플래그를 `CloseRequested`에서만 읽었다.**
   > macOS에는 그 경로를 안 거치는 종료가 있다 — **⌘Q · 앱 메뉴 Quit · Dock→종료는
   > `RunEvent::ExitRequested`로 온다.** 그 이벤트에 처리기가 없어서 곧장 프로세스가
   > 죽었고, 돌던 포커스 세션이 같이 사라졌다. Windows엔 ⌘Q가 없어서 mac에서만 보였다.
   >
   > `ExitRequested`도 같은 플래그를 보게 하고, 사람이 누른 경우엔 메인 창을 숨긴다 —
   > 종료를 막기만 하고 창을 남기면 키를 눌렀는데 아무 일도 안 일어난 것처럼 읽힌다.
   > `code`가 `Some`이면 손대지 않는다: 트레이의 `app.exit(0)`과 업데이터의 재시작이
   > 그 모양으로 오고, 그 둘은 되물을 대상이 아니다.
   >
   > **macOS 한정으로 건다.** Windows에서 이 이벤트는 종료·로그오프를 뜻할 수도 있고,
   > 거기서 막으면 OS의 로그오프와 다투는 앱이 된다. 구멍이 있는 플랫폼만 고친다.
   >
   > 대가는 알고 고른 것이다 — 맥에서 ⌘Q가 종료하지 않는다. 이 앱의 값어치가 창을
   > 닫은 뒤에도 도는 타이머와 알림에 있으므로, 위에 적힌 규칙을 mac에도 적용하는 쪽을
   > 골랐다. 진짜 종료는 트레이 메뉴의 Quit이다.
3. **로컬 Ollama 직결**: `aiFetch`로 localhost 직접 호출. 미설치/미실행 감지 시 기존 remote provider 폴백(현행 로직 재사용).

제외(추후 필요 시): 전역 단축키, 부팅 자동 시작, 오프라인 동기화.

## 5. 배포·업데이트 (지인 공유 기준)

- GitHub Releases에 `.msi`(NSIS `.exe`도 가능) 업로드. GitHub Actions로 태그 푸시 시 자동 빌드 권장.
- 코드 서명 없음 → 설치 시 SmartScreen "추가 정보 → 실행" 안내 필요 (README에 명시).
- tauri-plugin-updater + GitHub Releases로 자동 업데이트 (서명 키는 Tauri 자체 업데이트 서명 사용, 무료).

## 6. 모바일 경로 (추후)

1. 반응형/터치 UI 정비 (기존 모바일 CSS 확장) → **PWA로 1차 커버** (설치 배너, 아이콘)
2. 스토어 배포가 필요해지면 그 시점에 Tauri mobile vs Capacitor 재비교 (2026-07 현재 Tauri mobile은 데스크톱 대비 성숙도 낮음)
3. 코어가 어댑터 패턴을 지키면 어느 쪽이든 셸 추가 비용만 발생

## 7. 구현 로드맵

| 단계 | 작업 | 완료 기준 |
|---|---|---|
| 1 | `src/platform/` 어댑터 도입, 코어의 직접 호출 치환 | 웹 동작/빌드 회귀 0 |
| 2 | `src-tauri/` 셸 추가, 개발·빌드 파이프라인 | `npm run tauri dev` 동작, `.msi` 생성 |
| 3 | 시스템 알림 + 트레이 미니 타이머 + Ollama 직결 | 포커스 세션 E2E (창 닫아도 유지) |
| 4 | GitHub Actions 빌드 + updater | 태그 푸시 → Release → 자동 업데이트 확인 |

## 8. 사전 준비물 (사용자 액션)

- [ ] Rust 설치: `winget install Rustlang.Rustup` 후 `rustup default stable-msvc`
- [ ] MSVC Build Tools (Visual Studio Installer → "C++ 빌드 도구")
- [ ] WebView2는 Win11 기본 탑재 — 별도 설치 불필요
