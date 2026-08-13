import { ChangeEvent, useState } from "react";
import type { PlannerData } from "../types";

type UseDataPortabilityInput = {
  today: string;
  exportData: () => PlannerData;
  importData: (raw: unknown) => boolean;
};

export function useDataPortability({ today, exportData, importData }: UseDataPortabilityInput) {
  const [importMessage, setImportMessage] = useState("");

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
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const success = importData(parsed);
        setImportMessage(success ? "Import complete." : "Import failed: invalid file.");
      } catch {
        setImportMessage("Import failed: invalid JSON.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  return {
    importMessage,
    exportJson,
    handleImport,
  };
}
