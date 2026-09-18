// 가져오기 앞의 관문.
//
// 가져오기는 이 앱에서 **가장 많이 지우는 동작**이다. 휴지통 비우기는
// 휴지통에 있는 것만, 전체 초기화는 묻고 나서 지우는데, 가져오기는 파일
// 하나로 계정 전체를 대신하면서 아무것도 묻지 않았다. 재보니 이랬다 [실측]:
//
//   `{"hello":"world"}` 를 고른다
//   → 확인 대화상자 없음
//   → 할 일 셋이 전부 사라진다
//   → 화면은 "Import complete." 라고 말한다
//
// `importData` 가 **객체이기만 하면** 받아 정규화하기 때문이다. 이 앱의
// 내보내기가 아닌 JSON 도 통과하고, 없는 키는 빈 값이 되므로 결과는 빈
// 계정이다. 그리고 이것이 자동 백업의 복원 경로이기도 하다
// (`SETTINGS_REVIEW.md` — "복원기를 새로 만들지 않았다"). 백업을 되돌리려고
// 들어온 사람이 파일 하나 잘못 고르면 그 자리에서 전부 잃는다.
//
// Ctrl+Z 로는 돌아온다 — `importData` 가 `setData` 를 거치므로 되돌리기 항목이
// 하나 쌓인다 [실측]. 그것을 이 대화상자에 적지는 않는다. 되돌리기 스택은
// 메모리에만 있어서 새로고침하면 사라지고, 데이터가 사라진 것을 본 사람이
// 가장 먼저 하는 일이 새로고침이다. 지킬 수 없는 약속은 하지 않는다.
//
// 자기 파일이 아닌 것을 **거절하지는** 않는다. 갓 만든 계정의 내보내기도
// 할 일이 0 개이므로, "비어 있으면 가짜"라는 규칙은 진짜 파일을 막는다.
// 대신 숫자를 말한다 — 휴지통 관문이 지우는 개수를 말하는 것과 같은 이유다
// (§16.5). 0 개가 3 개를 대신한다는 문장을 읽고도 누르는 것은 선택이지만,
// 읽지 못한 채 잃는 것은 사고다.
import { ConfirmModal } from "../kit";
import { useT } from "../../i18n";

export interface ImportPreview {
  /** 파일에 든 것. */
  fileTasks: number;
  fileLists: number;
  /** 지금 이 기기에 있는 것. */
  currentTasks: number;
  currentLists: number;
}

export function ImportReplaceGate({
  preview,
  onCancel,
  onConfirm,
}: {
  /** 고른 파일이 없으면 `null` — 관문이 닫혀 있다. */
  preview: ImportPreview | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!preview) return null;

  const empty = preview.fileTasks === 0 && preview.fileLists === 0;

  return (
    <ConfirmModal
      title={t("settings.importGateTitle")}
      body={[
        t("settings.importGateBody", {
          fileTasks: preview.fileTasks,
          fileLists: preview.fileLists,
          currentTasks: preview.currentTasks,
          currentLists: preview.currentLists,
        }),
        // 빈 파일은 대개 이 앱의 것이 아니다. 그 한 문장이 사고와 선택을
        // 가른다.
        empty ? t("settings.importGateEmpty") : "",
      ]
        .filter(Boolean)
        .join(" ")}
      confirmLabel={t("settings.importGateConfirm")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
