// 폰의 아래쪽 내비게이션 (Nav Shell spec §2.39).
//
// §2.39는 두 가지를 적어뒀다: "향후 완전한 mobile navigation(bottom navigation
// 등)이 필요하면 **별도 설계한다**"와 "P0 Desktop/Web Rail을 억지로 bottom bar로
// 변환하지 않는다". 이 파일이 그 별도 설계이고, 레일을 눕힌 것이 아니라 제
// 컴포넌트다 — 레일은 세로 56px에 라벨을 감추고 툴팁으로 갚는 물건이고, 이것은
// 그 갚음이 불가능한 곳(손가락에는 hover가 없다)을 위한 것이라 결론이 다르다.
//
// 필요하다는 판단의 근거는 실측이다. 767px 아래에서 레일은 `display: none`이고
// (19-app-shell.css §2.39), Tasks 드로어가 그리는 것은 Tasks의 Scope뿐이다 —
// 오늘 · 다음 7일 · 기본함 · 리스트 · 태그 · 필터 · 완료 · 휴지통. 캘린더 ·
// 매트릭스 · 집중 · 설정으로 가는 링크는 **화면 어디에도 없다.** 레거시 셸의
// 햄버거는 `contextSidebar.mode`가 `none`인 페이지에서 아무것도 열지 않는다.
// 즉 불편한 것이 아니라 네 곳이 주소창 말고는 닿을 길이 없었다.
//
// 검색이 여기 없는 것은 자리가 모자라서가 아니다. §2.14가 검색은 이동이 아니라
// 대화상자를 여는 것이므로 활성 상태를 갖지 않는다고 적어뒀고, 그러면 그것은
// 장소가 아니다. 이 막대는 장소를 담는다 — 그래서 `RailNavItem`(레일 항목에서
// 검색을 뺀 타입)이 그대로 이 막대의 목록이다. 폰에서 검색으로 가는 길은 아직
// 없고, 그것은 이 파일이 아니라 헤더가 답할 질문이다.
//
// 라벨이 보이는 것도 같은 이유다. 레일은 §2.2로 라벨을 감추고 §2.28의 툴팁으로
// 갚는데, 그 툴팁은 hover와 키보드 포커스로 열린다 — 폰에는 둘 다 없다. 아이콘만
// 남기면 영영 이름 없는 다섯 칸이 된다.
import type { RailNavItem } from "../../app/railNav";
import { RAIL_NAV_ITEMS } from "../../app/railNav";
import { RailIcon } from "./GlobalRail";
import { useT } from "../../i18n";

const LABEL_KEY: Record<RailNavItem, string> = {
  tasks: "rail.tasks",
  matrix: "rail.matrix",
  calendar: "sidebar.calendar",
  focus: "sidebar.focus",
  settings: "sidebar.settings",
};

export function MobileNav({
  active,
  onNavigate,
}: {
  active: RailNavItem;
  onNavigate: (item: RailNavItem) => void;
}) {
  const { t } = useT();
  return (
    <nav className="mobile-nav" aria-label={t("rail.label")}>
      {RAIL_NAV_ITEMS.map((item) => {
        const current = item === active;
        return (
          <button
            key={item}
            type="button"
            className={`mobile-nav-item${current ? " is-active" : ""}`}
            // 레일과 같은 표시다(§2.19) — 주소에서 파생된 활성 항목이므로 뒤로
            // 가기와 새로고침과 딥링크가 같은 칸을 켠다.
            aria-current={current ? "page" : undefined}
            onClick={() => onNavigate(item)}
          >
            <RailIcon name={item} />
            <span className="mobile-nav-label">{t(LABEL_KEY[item])}</span>
          </button>
        );
      })}
    </nav>
  );
}
