# 데스크톱 앱 수정 설계: 캘린더 드래그 위로 튐 + macOS 메뉴바 아이콘

> 작성: 2026-07-07 · 상태: 설계 (구현 전)
> 대상 이슈:
> 1. 앱(데스크톱) 버전에서 캘린더 일정을 드래그하면 포인터보다 **더 위쪽**에 놓임
> 2. macOS 메뉴바(상단) 트레이 아이콘이 표시/갱신되지 않음 — Windows 트레이(하단)는 정상

---

## 1. 캘린더 드래그가 위로 튀는 문제

### 1.1 증상

- Day/Week 뷰에서 일정 블록을 드래그(이동/리사이즈/드래그 생성)하면 포인터가 가리키는 시각보다 **이른 시각(위쪽)** 에 배치된다.
- 그리드 상단(06:00)에서는 거의 안 틀리고, **아래로 내려갈수록 오차가 커진다** (24:00 부근에서 최대 ~108분).

### 1.2 원인 (확정)

전역 밀도 축소용 CSS가 원인이다.

```css
/* src/styles/01-base.css:283 */
.app-shell > main { zoom: 0.9; }
```

캘린더 그리드는 이 `zoom: 0.9` 서브트리 안에서 렌더된다. 즉:

- **레이아웃 좌표계**: 1시간 = `SLOT_HEIGHT` = 96px (블록의 `top`/`height`는 이 좌표계로 그림 — `topFor()`/`heightFor()`)
- **화면(비주얼) 좌표계**: 1시간 = 96 × 0.9 = **86.4px** (포인터 이벤트 `clientY`와 `getBoundingClientRect()`가 반환하는 좌표계)

그런데 포인터→시각 변환이 두 좌표계를 섞고 있다:

```ts
// src/components/calendar/WeekView.tsx:247 (minutesFromTimeGridPointerY)
const offsetY = clientY - body.getBoundingClientRect().top; // ← 화면 px
return DAY_START * 60 + (offsetY / SLOT_HEIGHT) * 60;       // ← 96(레이아웃 px)으로 나눔
```

화면에서 그리드 상단으로부터 N px 내려간 지점은 실제로 N/86.4 시간인데, N/96 시간으로 계산되어 **항상 10% 이른(위쪽) 시각**이 나온다. 오차 = 그리드 상단으로부터의 거리에 비례 → 1.1 증상과 정확히 일치.

브라우저/웹뷰 엔진마다 CSS `zoom` 하의 좌표 보고 방식이 다르고 버전에 따라 변해왔기 때문에(Chromium 128의 zoom 표준화, WebView2/WKWebView 버전 차), **웹 브라우저에서는 안 보이던 오차가 앱(Tauri 웹뷰)에서 드러나는** 현상도 설명된다. 따라서 "0.9로 나눠서 보정" 같은 상수 하드코딩은 금물 — 엔진에 따라 이중 보정이 된다.

### 1.3 수정 설계

**원칙: 스케일을 가정하지 말고, 실측한다.** 그리드 본문의 레이아웃 높이는 상수로 알고 있으므로(`(DAY_END - DAY_START) × SLOT_HEIGHT` = 18h × 96 = 1728px), 실제 화면 높이와의 비율이 곧 유효 스케일이다.

```ts
// WeekView.tsx — minutesFromTimeGridPointerY 교체
function minutesFromTimeGridPointerY(clientY: number): number {
  const body = scrollRef.current?.querySelector<HTMLElement>(".gcal-timegrid-body");
  if (body) {
    const rect = body.getBoundingClientRect();
    // zoom/transform이 몇이든, 어떤 엔진이 어떻게 보고하든 실측 비율이 정답.
    const layoutHeight = (DAY_END - DAY_START) * SLOT_HEIGHT;
    const scale = rect.height > 0 ? rect.height / layoutHeight : 1;
    const offsetY = clientY - rect.top;
    return clampMinutes(
      DAY_START * 60 + (offsetY / (SLOT_HEIGHT * scale)) * 60,
      DAY_START * 60,
      DAY_END * 60,
    );
  }
  return minutesFromPointerY(clientY, 0);
}
```

- 수정 지점은 **이 함수 하나**다. 드래그 생성(`handlePointerDown/Move`), 블록 이동(`startMove`의 `grabOffsetMin` 포함), 리사이즈(`startResize`)가 전부 이 함수를 지나므로 한 번에 해결된다.
- 헬퍼는 `src/utils/calendarTime.ts`에 `minutesFromPointerY(clientY, rect)` 형태로 올려 단일 소스로 유지하는 것을 권장 (기존 시그니처 사용처 확인 후 정리).

**부수 수정 (같은 계열 버그):** `finalizeSelection`(WeekView.tsx:304)의 드래프트 팝오버 앵커 계산이 화면 px(`columnRect.top`)에 레이아웃 px(`topFor(startMin)`)를 더하고 있다. 같은 `scale`을 곱해 보정한다:

```ts
const top = columnRect.top + topFor(startMin) * scale;
bottom: top + heightFor(startMin, endMin) * scale,
```

**건드리지 않는 것:**
- `el.scrollTop = topFor(...)` (초기 스크롤) — `scrollTop`은 요소 자체(레이아웃) 좌표계라 현행이 맞음.
- 자동 스크롤 경계(`scrollRect.top + 110` 등) — 양쪽 다 화면 px라 일관됨.
- 올데이 밴드 판정(`clientY <= alldayRect.bottom`) — 동일.
- `zoom: 0.9` 자체 제거는 **기각**: 전 뷰 공통 밀도 노브라 시각 회귀 범위가 너무 넓다.

### 1.4 검증

1. 웹(브라우저) + Tauri dev 양쪽에서: 22:00대 블록을 잡아 드래그 → 놓은 위치 = 포인터 위치인지 (오차가 가장 큰 하단부에서 확인).
2. 블록 중간을 잡았을 때 잡은 지점이 유지되는지 (`grabOffsetMin` 경유 확인).
3. 하단 엣지 리사이즈를 늦은 시간대에서 확인.
4. 빈 슬롯 드래그 생성 시 시작/끝 시각과 팝오버 앵커 위치 확인.
5. OS 배율(Windows 125%/150%, macOS Retina)을 바꿔가며 1~4 재확인 — 실측 방식이므로 배율 무관하게 통과해야 함.

---

## 2. macOS 메뉴바 트레이 아이콘

### 2.1 증상

- Windows: 작업표시줄 트레이(하단)에 아이콘 정상 표시.
- macOS: 메뉴바(상단)에 아이콘이 작게 떠야 하는데 표시되지 않음(또는 갱신 안 됨). 포커스 타이머 시간 텍스트(`set_title`)는 이미 붙여둔 상태(commit 7934185).

### 2.2 현재 구현과 문제점

트레이 아이콘이 런타임에 절차적으로 생성한 **32×32 컬러 비트맵**(파란 원, `main.rs:75 tray_icon_image()`)이다. macOS 메뉴바 기준으로 세 가지가 어긋난다:

| # | 문제 | 영향 |
|---|---|---|
| 1 | **크기**: 메뉴바 아이템 표준은 ~18pt(@2x 36px). 32×32를 크기 힌트 없이 넣으면 24pt 메뉴바보다 커서 잘리거나 아이템이 접힐 수 있음 | 아이콘 미표시/깨짐 |
| 2 | **템플릿 이미지 아님**: macOS 관례는 `isTemplate` 흑백+알파 이미지. 컬러 비트맵은 라이트/다크 메뉴바 자동 적응이 안 되고, 어두운 링(#111827)은 다크 메뉴바에서 사실상 안 보임 | 다크 모드에서 안 보임 |
| 3 | **앱 아이콘과 무관한 임시 그래픽**: "아이콘이 업데이트 안 됐다"는 인상의 근본 원인 — 실제 앱 아이콘(icons/)과 무관한 플레이스홀더 원 | 브랜딩 불일치 |

Windows는 32×32 컬러 트레이 아이콘이 표준이라 그대로 잘 보인다 → "윈도우는 잘 뜨는데 맥만 안 됨"과 일치.

### 2.3 수정 설계

**플랫폼별로 아이콘 소스를 분리한다. Windows는 현행 유지(회귀 방지), macOS만 템플릿 아이콘 도입.**

1. **에셋 추가**: `src-tauri/icons/tray/`
   - `trayTemplate.png` — 18×18, 검정+알파만 사용한 앱 글리프(체크/원 등 앱 아이콘 실루엣)
   - `trayTemplate@2x.png` — 36×36 (Retina)
   - 이름을 `...Template`으로 끝내는 것은 macOS 관례(참고용이며, 실제 템플릿 지정은 코드에서 함).

2. **로딩 방식**: 절차 생성 대신 컴파일 타임 임베드.
   ```rust
   // Cargo.toml — PNG 디코딩 피처 필요 (현재 features = ["tray-icon"]뿐)
   tauri = { version = "2", features = ["tray-icon", "image-png"] }
   ```
   ```rust
   fn tray_icon_image() -> Image<'static> {
       #[cfg(target_os = "macos")]
       {
           // @2x를 임베드 — NSStatusItem이 포인트 크기로 축소 렌더.
           Image::from_bytes(include_bytes!("../icons/tray/trayTemplate@2x.png"))
               .expect("tray template icon must decode")
       }
       #[cfg(not(target_os = "macos"))]
       { /* 기존 32×32 절차 생성 유지 (Windows 정상 동작 보존) */ }
   }
   ```

3. **템플릿 지정** (핵심): `setup`의 빌더에 macOS 한정으로 추가.
   ```rust
   let mut builder = TrayIconBuilder::with_id(TRAY_ID)
       .icon(tray_icon_image())
       .tooltip("FocusFlow")
       .menu(&menu)
       .show_menu_on_left_click(true);
   #[cfg(target_os = "macos")]
   { builder = builder.icon_as_template(true); }
   builder.build(app)?;
   ```
   템플릿 모드에서는 macOS가 메뉴바 상태(라이트/다크/클릭 하이라이트)에 맞춰 자동으로 색을 입힌다.

4. **타이머 텍스트와의 공존**: 기존 `refresh_tray`의 `set_title`(macOS 한정) 로직은 그대로 둔다. 템플릿 아이콘 + 타이틀 텍스트는 NSStatusItem 표준 조합이라 함께 표시된다. 아이콘 자체는 런타임 갱신이 필요 없다(상태 표현은 타이틀/메뉴가 담당).

### 2.4 검증 (macOS 실기기 필요)

1. `npm run tauri:build` 후 메뉴바에 아이콘이 떠 있는지 — 라이트/다크 모드 각각.
2. 포커스 세션 시작 → 아이콘 옆에 `MM:SS` 타이틀 표시, 일시정지 시 `⏸ MM:SS`.
3. 메뉴 클릭(열기/일시정지/종료/Quit) 동작 확인.
4. Windows에서 회귀 없는지(기존 파란 원 그대로) 확인.
5. 안 뜨는 경우 외부 요인 체크리스트: 메뉴바 공간 부족(노치 MacBook에서 항목 많을 때 macOS가 숨김) → 다른 메뉴바 항목 줄이고 재확인. 구버전 앱이면 업데이터로 신버전 수신 여부 확인.

---

## 3. 구현 순서 및 범위

| 순서 | 작업 | 파일 | 규모 |
|---|---|---|---|
| 1 | 포인터→시각 변환에 실측 스케일 반영 | `src/components/calendar/WeekView.tsx` (+`src/utils/calendarTime.ts` 헬퍼 정리) | 소 |
| 2 | 드래프트 앵커 스케일 보정 | `WeekView.tsx` | 소 |
| 3 | 트레이 템플릿 에셋 추가 | `src-tauri/icons/tray/*.png` | 소 |
| 4 | `image-png` 피처 + 플랫폼별 아이콘 + `icon_as_template` | `src-tauri/Cargo.toml`, `src-tauri/src/main.rs` | 소 |

두 이슈는 서로 독립 — 1·2(프런트)와 3·4(Rust)는 별도 커밋으로 나눈다.
