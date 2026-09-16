import { useEffect, useState } from "react";
import { todayValue } from "../utils/date";

/**
 * 오늘 날짜를, 날이 바뀌면 따라오는 값으로.
 *
 * `todayValue()` 는 부를 때마다 새로 읽는다. 문제는 **부를 일이 없다는 것**이었다:
 * 자정에 다시 그리게 만드는 것이 앱에 없어서, 켜둔 채 밤을 넘기면 아침에 "Today"
 * 가 어제를 보여줬다. 오늘 마감인 할 일은 목록에 없고 어제 것이 남아 있다 —
 * 읽는 사람은 그것을 오늘의 목록으로 읽는다.
 *
 * 5분이 지나도 `Today 1` 이었고, 화면을 한 번 오가면 `Today 2` 가 됐다 [실측 ·
 * 23:59:30 에 열고 시계를 넘겨서]. 즉 값은 맞는데 아무도 다시 묻지 않았다.
 *
 * 다음 자정까지의 시간을 재서 `setTimeout` 을 거는 방법도 있지만 쓰지 않는다.
 * 브라우저는 배경 탭의 타이머를 늦추고, 기기가 자면 몇 시간짜리 타이머는 언제
 * 깨어날지 모른다. 대신 **일 분마다 날짜만 비교한다** — 바뀌었을 때만 상태를
 * 건드리므로 그 사이의 렌더는 없고, 최악의 늦음이 일 분이다.
 *
 * 탭으로 돌아오는 순간에도 한 번 본다. 사람이 화면을 다시 보는 그때가 틀린 날짜를
 * 읽게 되는 그때이기 때문이다.
 */
export function useDayRollover(): string {
  const [day, setDay] = useState(todayValue);

  useEffect(() => {
    const check = () => {
      const now = todayValue();
      setDay((current) => (current === now ? current : now));
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return day;
}
