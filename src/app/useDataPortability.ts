import { ChangeEvent, useCallback, useState } from "react";
import type { PlannerData } from "../types";
import { normalizeData } from "../domain/plannerData/normalize";
import type { ImportPreview } from "../components/settings/ImportReplaceGate";

type UseDataPortabilityInput = {
  today: string;
  exportData: () => PlannerData;
  importData: (raw: unknown) => boolean;
};

/**
 * 고른 파일이 무엇을 들고 있는지, 그리고 지금 여기에 무엇이 있는지.
 *
 * 관문이 숫자를 말하려면 **적용하기 전에** 세야 한다. `normalizeData` 로
 * 같은 렌즈를 통과시켜 세는 것은 가져오기가 실제로 적용할 모양이 그것이기
 * 때문이다 — 파일의 원문을 세면 "3 개가 있다"고 말해 놓고 0 개를 넣을 수
 * 있다.
 */
function previewOf(parsed: unknown, current: PlannerData): ImportPreview {
  const incoming = normalizeData((parsed ?? {}) as Partial<PlannerData>);
  return {
    fileTasks: incoming.tasks.length,
    fileLists: incoming.lists.length,
    currentTasks: current.tasks.length,
    currentLists: current.lists.length,
  };
}

export function useDataPortability({ today, exportData, importData }: UseDataPortabilityInput) {
  const [importMessage, setImportMessage] = useState("");
  // 관문이 열려 있는 동안 붙잡고 있는 것. 파일은 이미 읽혔고 파싱도 끝났다 —
  // 남은 것은 사람의 대답뿐이다.
  const [pending, setPending] = useState<{ parsed: unknown; preview: ImportPreview } | null>(null);

  function exportJson() {
    const payload = JSON.stringify(exportData(), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-planner-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    // 같은 파일을 다시 고를 수 있어야 한다. 값을 비우지 않으면 브라우저는
    // 두 번째 선택을 "바뀐 것이 없다"로 보고 `change` 를 내지 않는다 —
    // 읽기에 실패한 사람이 **같은 파일로 다시 시도할 수 없게** 된다.
    const release = () => {
      input.value = "";
    };

    reader.onload = () => {
      release();
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        setImportMessage("settings.importInvalidJson");
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        setImportMessage("settings.importInvalidFile");
        return;
      }
      // 여기서 적용하지 않는다. 가져오기는 계정 전체를 대신하므로 관문을
      // 먼저 연다 (`ImportReplaceGate`).
      setImportMessage("");
      setPending({ parsed, preview: previewOf(parsed, exportData()) });
    };

    // 읽기가 실패하면 `onload` 는 오지 않는다. 이것이 없으면 화면은 아무
    // 말도 하지 않고, 파일 입력도 비워지지 않아 같은 파일로는 다시 시도할
    // 수도 없다.
    reader.onerror = () => {
      release();
      setImportMessage("settings.importUnreadable");
    };

    reader.readAsText(file);
  }

  const confirmImport = useCallback(() => {
    setPending((current) => {
      if (!current) return null;
      setImportMessage(importData(current.parsed) ? "settings.importDone" : "settings.importInvalidFile");
      return null;
    });
  }, [importData]);

  const cancelImport = useCallback(() => {
    // 물러났다는 말은 하지 않는다. 아무 일도 일어나지 않은 것이 곧 답이고,
    // 그 자리에 남는 문장은 다음 가져오기의 결과처럼 읽힌다.
    setPending(null);
    setImportMessage("");
  }, []);

  return {
    /** i18n 키다. 화면이 그릴 때 번역한다. */
    importMessage,
    exportJson,
    handleImport,
    importPreview: pending?.preview ?? null,
    confirmImport,
    cancelImport,
  };
}
