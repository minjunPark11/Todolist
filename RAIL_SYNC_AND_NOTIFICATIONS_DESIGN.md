# 레일 아래의 두 버튼 — 지금 맞추기와, 놓친 것 보기

> 상태: **구현됨** · 2026-09-04 (F1 = B · F2 = A · F3 = A · F4 = B · F5 = A · F6 = 그대로, 사용자 승인 — §10.1은 구현하며 알게 된 것)
> (사용자가 두 장을 주었다: ① 참조 앱 레일 하단의 세 아이콘 — 동기화·종·물음표
> ② 종을 눌러 열린 패널 — `Notifications` / `Activities` 탭, 카드 한 장, 아래에 `Trash`.)
> 요청: "좌측 하단에 동기화·알림 버튼을 만들고, 동기화를 누르면 자동으로 동기화되고,
> 알림을 누르면 알림이 뜨게."
> 대상: `components/shell/GlobalRail.tsx` · `styles/19-app-shell.css` · `App.tsx` ·
> `hooks/usePlannerData.ts` · `domain/notifications/*`(신규) · `domain/tasks/activity.ts`
> 선행 문서: `TICKTICK_COMPONENT_08_GLOBAL_RAIL.md`(레일 실측 — 하단 그룹은 조사되지 않았다) ·
> `TICKTICK_NAV_SHELL_REDESIGN_SPEC.md` §1.5(레일에 들어올 수 없는 것) ·
> `CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md`(직전 — `Popover` 재사용 선례)

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **관찰** | 스크린샷 2장 (위) | [관찰] |
| **실측** | 코드에서 잰 것 — `refreshSupabaseData`가 이미 export돼 있다 · `syncStatus`/`syncError`가 Settings에서만 그려진다 · 알림을 **보관하는 곳이 없다** · `taskActivity`가 태스크 하나짜리다 · `--rail-item 40px` / 10px 간격 | [실측] |
| **결정** | 사용자 — 버튼 둘, 동기화는 눌러서, 알림은 패널로 | [결정] |
| **추론** | 참조의 `Activities` 탭이 무엇을 담는가 · 물음표 버튼의 내용 | [추론] |

---

## 1. 먼저 사실 하나 — 알림은 지금 아무 데도 남지 않는다 [실측]

패널을 그리기 전에 이것부터다. **이 앱이 내는 알림은 전부 그 자리에서 사라진다.**

| 무엇 | 어디서 | 남는가 |
|---|---|---|
| 일정 리마인더 | `useReminders` → `platform.notify` | ❌ OS로 던지고 끝 |
| 집중 세션 완료 | `App.tsx:786 notifyFocusCompleted` | ❌ 같음 |
| 앱 업데이트 | `UpdateChecker` | ❌ 배너 하나, 닫으면 끝 |
| 동기화 실패 | `syncError` | ❌ Settings 페이지에만 문장으로 |
| 외부 캘린더 동기화 실패 | `calendar.syncStatus === "failed"` | ❌ 그 캘린더 행에만 |
| 토스트 전반 | `App.tsx:768 showToast` | ❌ 몇 초 뒤 사라짐 |

즉 **종을 눌렀을 때 보여줄 목록이 존재하지 않는다.** 이 설계의 진짜 일은 패널이
아니라 **알림을 기록하는 저장소를 만드는 것**이고, 패널은 그 위에 얹는 얇은 화면이다.

이게 왜 중요한가: 리마인더는 앱이 켜져 있을 때만 발화한다(`useReminders`의 주석이
"foreground poll"이라고 스스로 밝힌다). 앱을 닫아 둔 사이에 지나간 알림은 OS 알림도
못 받고 앱 안에도 안 남는다. **놓친 것을 볼 방법이 지금 하나도 없다** — 종 버튼이
실제로 해결하는 문제가 이것이다.

---

## 2. 동기화 버튼

### 2.1 절반은 이미 있다 [실측]

```ts
// hooks/usePlannerData.ts:2201 — 이미 export돼 있고,
refreshSupabaseData: loadSupabaseData,
// App.tsx:1521 — Settings의 계정 절에서만 쓰인다.
onRefresh={planner.refreshSupabaseData}
```

`syncStatus`도 이미 있고 다섯 상태를 만든다:
`sync.ready` · `sync.syncing` · `sync.synced` · `sync.syncFailed` · `sync.retrying`
(+ 로그인하지 않았을 때 `sync.localMode`). 지금은 Settings 페이지에 문장 한 줄로만
나온다 — 앱을 쓰는 동안 동기화가 어떤 상태인지 볼 방법이 없다.

### 2.2 그런데 "동기화"는 방향이 둘이다

| 방향 | 무엇이 한다 | 언제 |
|---|---|---|
| 올리기 | `saveQueueRef`의 저장 큐 | 편집할 때마다 자동, 실패하면 재시도 |
| 내려받기 | `loadSupabaseData` | 로그인 직후 한 번 |

**누른 뒤 "동기화됐다"고 말하려면 둘 다 끝나야 한다.** 올릴 것이 큐에 남아 있는데
내려받기만 하면, 방금 한 편집을 서버 상태로 덮어쓸 위험이 있다(`reapplyLocalEdits`가
그 경우를 위해 존재하지만, 사용자가 버튼을 눌러 스스로 만든 경합을 그 장치에 맡길
이유는 없다).

**결정 F1 — 버튼이 하는 일**

| 안 | 무엇 |
|---|---|
| **A** | 내려받기만 (`refreshSupabaseData`) |
| **B** | 큐를 비운 뒤 내려받기 |
| **C** | 큐를 비운 뒤 내려받고, 끝나면 토스트 |

> **권장 B.** A는 "동기화"라는 말이 절반만 참이 된다. C의 토스트는 버튼 자신이 상태를
> 그릴 수 있으므로(§2.3) 군더더기다 — 성공을 두 번 말하는 셈이다. 실패는 다르다:
> 실패는 버튼의 아이콘만으로 이유를 말할 수 없으므로 토스트로 문장을 준다.
>
> 큐를 비우는 API가 지금 없다. `saveQueue`에 `drain(): Promise<void>` 하나를 더한다.

### 2.3 버튼의 상태

| 상태 | 조건 | 그림 |
|---|---|---|
| 쉬는 중 | `sync.synced` · `sync.ready` | 정지한 순환 화살표 |
| 도는 중 | `sync.syncing` | 회전 (`prefers-reduced-motion`이면 회전 없이 흐리게) |
| 실패 | `sync.syncFailed` | 아이콘 모서리에 `--danger` 점 |
| 재시도 대기 | `sync.retrying` | 실패와 같은 점, 툴팁 문구만 다름 |
| 로컬 모드 | 로그인 안 함 | **버튼을 그리지 않는다** (F2) |

**결정 F2 — 로그인하지 않았을 때**

> **권장: 버튼을 그리지 않는다.** 동기화할 계정이 없는데 동기화 버튼이 있으면, 누른
> 사람은 "왜 아무 일도 안 일어나지"를 묻게 된다. `auth.isConfigured && isSignedIn`일
> 때만 그린다. 로그인 유도는 Settings의 계정 절이 이미 한다.
> (대안은 회색으로 비활성화하고 툴팁에 "로그인하면 동기화됩니다"를 다는 것. 레일은
> 아이콘만 있는 좁은 열이라 비활성 아이콘이 무엇을 뜻하는지 읽히지 않는다.)

---

## 3. 알림 — 무엇을 기록할 것인가

### 3.1 새 저장소

```ts
// domain/notifications/model.ts
export type NotificationKind =
  | "reminder"        // 일정 알림이 발화했다
  | "focusCompleted"  // 집중 세션이 끝났다
  | "syncFailed"      // 계정 동기화가 실패했다
  | "calendarFailed"  // 구독 캘린더를 못 읽었다
  | "updateAvailable";// 새 버전이 있다

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;          // ISO
  readAt: string;      // "" = 안 읽음
  /** 눌렀을 때 갈 곳. 태스크 id 등, 종류에 따라. */
  targetId?: string;
}
```

**어디에 저장하나 — 결정 F3**

| 안 | 어디 | 대가 |
|---|---|---|
| **A** | localStorage 전용 스토어 (`calendarCategories`와 같은 꼴) | 기기마다 다르다. 폰에서 놓친 알림이 PC에 없다 |
| **B** | `PlannerData`에 컬렉션 추가 → Supabase 동기화 | 기기 간에 따라온다. 동기화할 테이블이 하나 늘고, 알림이 계정 용량을 먹는다 |

> **권장 A.** 알림은 **이 기기가 이 사용자에게 못 보여준 것**의 기록이다. PC에서 이미
> 읽은 알림이 폰에서 안 읽음으로 뜨는 것보다, 각 기기가 자기가 놓친 것만 아는 편이
> 덜 틀린다. 그리고 §1이 말하듯 리마인더는 앱이 켜져 있는 기기에서만 발화하므로,
> 애초에 알림 자체가 기기별 사건이다.
>
> 상한을 둔다: 최근 **200개** 또는 **30일**, 넘으면 오래된 것부터 버린다. 저장소가
> 무한히 자라는 것을 막는 것은 이 종류의 목록에서 늘 필요한 일이다.

### 3.2 누가 기록하나

각 발화 지점이 지금 하는 일에 한 줄을 더한다. **새 발화를 만들지 않는다** — 지금
알림을 내는 곳이 그대로 기록도 남긴다.

```ts
// hooks/useReminders.ts:106 — 지금
void platform.notify({ title, body }).then((sent) => { … });
// 더할 것
recordNotification({ kind: "reminder", title, body, targetId: task.id });
```

`notifyFocusCompleted`(App.tsx:786) · 외부 캘린더 실패(App.tsx:902) ·
`saveQueue.onSettled`의 실패 분기 · `UpdateChecker`의 `available`도 같다.

**토스트는 기록하지 않는다.** 토스트는 "방금 네가 한 일"의 확인이고(실행취소 안내가
대표적이다), 알림은 "네가 못 본 일"이다. 둘을 한 목록에 섞으면 목록이 조작 로그가 된다.

### 3.3 읽음과 배지

- 패널을 **연 순간** 목록 전체가 읽음이 된다. 항목별 읽음 표시는 두지 않는다 — 이
  목록은 훑는 것이지 관리하는 것이 아니다.
- 종 아이콘의 배지는 **안 읽은 수**. 9를 넘으면 `9+`.
- 읽음 상태는 §3.1의 스토어에 남으므로 앱을 다시 켜도 유지된다.

---

## 4. 패널

### 4.1 무엇으로 만드나

`Popover` / `PopoverTrigger` / `PopoverContent`를 쓴다 [실측] — 이미 있고, 직전
작업의 View Options 패널이 같은 방식으로 붙었다. `placement="right-end"`(레일이
왼쪽 끝이고 버튼이 아래에 있으므로), `type="popover"`.

Escape 닫기·바깥 클릭 닫기·초점 복원(§19.32)이 전부 따라온다.

### 4.2 두 탭 — 결정 F4

[관찰] ②는 `Notifications` / `Activities` 두 탭이다. `Activities`가 무엇인지는
스크린샷에 나오지 않았다 [추론].

우리에게는 **재료가 이미 있다**. `domain/tasks/activity.ts`의 `taskActivity`가
태스크 하나의 이력을 만든다 — `created` · `completed` · `wontDo` · `trashed` ·
`pinned` · `focus` · `checkItem`. 계정 전체 피드는 그것을 모든 태스크에 돌려 시간순으로
합치면 된다. **새 저장소가 필요 없다** — 전부 이미 있는 타임스탬프에서 파생된다.

| 안 | 무엇 |
|---|---|
| **A** | 이번엔 `Notifications`만. 탭 없음 |
| **B** | 두 탭. `Activities`는 `taskActivity`를 계정 전체로 돌려 파생 |

> **권장 B.** 비용이 작기 때문이다 — 파생 함수 하나(`accountActivity`)와 탭 두 개이고,
> 저장할 것이 없다. 그리고 §1의 문제("놓친 것을 볼 방법이 없다")의 나머지 절반을
> 이것이 답한다: 알림은 앱이 켜져 있어야 생기지만, 활동은 **언제 일어났든 타임스탬프에
> 남아 있으므로** 앱이 꺼져 있던 동안의 것도 보인다.
>
> 성능: 태스크 전체를 훑으므로 O(n). 패널을 열 때만 계산하고 `useMemo`로 잡는다.
> 최근 100건에서 자른다.

### 4.3 빈 상태

두 탭 모두 빈 화면이 흔하다(새 계정, 조용한 하루). 문장 하나와 아이콘 하나를 둔다.
"알림 없음 / 지나간 알림이 여기 모입니다"처럼, **왜 비어 있는지**를 말한다.

### 4.4 [관찰] ②의 `Trash`는 가져오지 않는다

패널 아래에 `Trash` 행이 있지만 그것은 참조 앱의 사이드바가 겹쳐 보인 것이고, 우리
휴지통은 Tasks 안에 이미 자리가 있다. 알림 패널에 넣을 이유가 없다.

---

## 5. 레일 하단의 배치

지금 하단(`.rail-utilities`)에는 **Settings 하나**뿐이다 [실측]. 항목 40px, 간격 10px.

**결정 F5 — 순서와, 물음표를 만드나**

[관찰] ①의 순서는 위에서 아래로 **동기화 · 종 · 물음표**다.

| 안 | 하단 순서 |
|---|---|
| **A** | 동기화 · 종 · 설정 (물음표 없음) |
| **B** | 동기화 · 종 · 물음표 · 설정 |

> **권장 A.** 물음표 뒤에 넣을 도움말이 이 앱에 없다 — 만들면 빈 문서로 가는 버튼이
> 된다. 참조를 따라 자리만 만드는 것은 §1.5가 레일에 대해 경고하는 바로 그것("화면마다
> 항목이 하나씩 느는 레일")이다. 도움말이 생기는 날 넣는다.
>
> 설정이 맨 아래에 남는 이유: 지금 거기 있고, 사용자가 그 위치를 이미 익혔다. 새 버튼
> 둘은 그 위로 들어간다.

레일이 세 항목이 되어도 세로 공간은 충분하다 — 3 × 40 + 2 × 10 = 140px이고, 하단
그룹은 `.rail-spacer`가 밀어내는 자리에 있다.

---

## 6. 접근성

- 두 버튼 모두 `RailButton`을 그대로 쓴다 — 툴팁·`aria-label`·초점 링이 따라온다.
- 종은 `aria-haspopup="dialog"`와 `aria-expanded`를 갖는다(§2.33의 규칙, Search가 이미 그렇다).
- 배지는 장식이 아니라 정보이므로 이름에 들어간다: `aria-label="알림 (안 읽음 3)"`.
- 동기화 버튼의 상태는 색과 회전만으로 말하지 않는다 — `aria-label`이 상태를 포함하고,
  진행 중에는 `aria-busy="true"`.
- 회전은 `prefers-reduced-motion`에서 멈춘다(`useMotionEnabled()`가 이미 있다).
- 패널의 탭은 `role="tablist"` / `role="tab"` / `role="tabpanel"`, 좌우 화살표 이동.

---

## 7. 새 문자열

| 키 | 한국어 | English |
|---|---|---|
| `rail.sync` | "지금 동기화" | "Sync now" |
| `rail.syncing` | "동기화 중…" | "Syncing…" |
| `rail.syncFailed` | "동기화 실패 — 다시 시도" | "Sync failed — try again" |
| `rail.notifications` | "알림" | "Notifications" |
| `rail.notificationsUnread` | "알림 (안 읽음 {{count}})" | "Notifications ({{count}} unread)" |
| `notifications.tabNotifications` | "알림" | "Notifications" |
| `notifications.tabActivities` | "활동" | "Activities" |
| `notifications.empty` | "알림 없음" | "No notifications" |
| `notifications.emptyBody` | "지나간 알림이 여기 모입니다." | "Notifications you missed collect here." |
| `notifications.activitiesEmpty` | "아직 기록이 없어요" | "Nothing yet" |
| `notifications.syncDone` | "동기화 완료" | "Synced" |
| `notifications.syncFailedToast` | "동기화 실패 — {{reason}}" | "Sync failed — {{reason}}" |

---

## 8. 무엇을 테스트하는가

**단위 (vitest)**
- 알림 스토어: 상한(200개/30일)을 넘으면 오래된 것부터 버린다
- 읽음: 패널을 열면 전부 읽음이 되고, 안 읽은 수가 0이 된다
- `accountActivity`: 여러 태스크의 이력이 시간 내림차순으로 합쳐진다 · 100건에서 잘린다
- `saveQueue.drain()`: 큐가 빈 뒤에 resolve한다 · 실패해도 매달리지 않는다

**E2E (playwright)**
- 로그인하지 않았을 때 동기화 버튼이 없다 (F2)
- 종에 안 읽은 수가 배지로 뜨고, 패널을 열면 사라진다
- 패널이 Escape로 닫히고 초점이 종으로 돌아온다
- 탭을 좌우 화살표로 옮길 수 있다
- 알림이 없을 때 빈 상태 문장이 보인다

---

## 9. 구현 순서

1. **알림 스토어** (§3.1) — 모델 · localStorage · 상한 · 읽음. 화면 없음, 단위 테스트만.
2. **기록 지점 배선** (§3.2) — 다섯 곳에 한 줄씩. 아직 볼 수는 없지만 쌓이기 시작한다.
3. **레일 버튼 둘** (§5) — 종은 배지만, 누르면 아직 아무것도 안 열림. 동기화는 F1-B로 동작.
4. **패널 + Notifications 탭** (§4) — 여기서 처음 화면이 완성된다.
5. **Activities 탭** (§4.2) — `accountActivity` 파생 + 탭.

1~3만 해도 "동기화 버튼을 누르면 동기화된다"는 요청의 절반이 끝난다.

---

## 10. 결정 목록

| | 질문 | 안 | 권장 |
|---|---|---|---|
| **F1** | 동기화 버튼이 하는 일 | A 내려받기만 / B 큐 비우고 내려받기 / C B+토스트 | **B** |
| **F2** | 로그인 안 했을 때 | A 버튼 없음 / B 비활성 | **A** |
| **F3** | 알림 저장 위치 | A localStorage(기기별) / B 계정 동기화 | **A** |
| **F4** | Activities 탭 | A 이번엔 안 함 / B 파생으로 함께 | **B** |
| **F5** | 물음표 버튼 | A 안 만듦 / B 만듦 | **A** |
| **F6** | 알림 상한 | 200개 / 30일 — 조정할까 | **그대로** |

### 10.1 실제로 만들어진 것

| 무엇 | 어디 |
|---|---|
| 알림 모델 (상한·읽음·복원) | `domain/notifications/model.ts` + 테스트 11개 |
| 저장소 (localStorage + 구독) | `lib/notificationStore.ts` |
| 활동 파생 | `domain/notifications/accountActivity.ts` + 테스트 5개 |
| 업로드 큐 비우기 | `domain/sync/saveQueue.ts`의 `drain()` + 테스트 6개 |
| 수동 동기화 | `usePlannerData`의 `syncNow` |
| 레일 버튼 둘 | `components/shell/GlobalRail.tsx`(`sync`, `notificationSlot`) |
| 패널 | `components/shell/NotificationCenter.tsx` |
| 회귀 방지 | `e2e/railNotifications.spec.ts` 8개 |

기록 지점은 설계대로 다섯이다: `useReminders`(리마인더) · `App.tsx`의
`notifyFocusCompleted`(집중 종료)와 외부 캘린더 실패 · `usePlannerData`의 저장 실패 ·
`UpdateChecker`(업데이트).

### 10.2 구현하며 알게 된 것 — 종은 레일이 그리지 않는다

설계는 종을 `RailButton`으로 그린다고 가정했다. `PopoverTrigger`가 **자기 `<button>`을
직접 그리고** `aria-expanded`·`aria-controls`를 그 버튼에 매다는 구조라, 레일이 그
버튼을 대신 만들면 팝오버가 매달 대상이 없어진다.

그래서 레일은 자리(`notificationSlot`)만 내주고 `RailIcon`을 export한다 —
`NotificationCenter`가 트리거를 그리되 레일 항목처럼 보이게. 대안은 `Popover`에
"트리거를 렌더 프롭으로 받는" 길을 새로 내는 것이었고, 그건 이 화면 하나를 위해
공용 프리미티브를 넓히는 일이라 택하지 않았다.

### 10.3 확인하지 못한 것

**로그인 상태의 동기화 버튼은 E2E로 검증하지 못했다.** 계정이 필요하고 테스트 환경에
Supabase가 없다. E2E가 확인한 것은 F2의 반대편 — *로그인하지 않았을 때 버튼이 없다* —
이고, 눌렀을 때의 동작(`drain()` 후 내려받기)은 `saveQueue.test.ts`가 큐 쪽만 단위로
덮는다. 실제 계정에서 한 번 눌러 봐야 한다.
