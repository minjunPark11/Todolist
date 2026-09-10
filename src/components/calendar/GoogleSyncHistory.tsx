import { useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { useT } from "../../i18n";
import { readGoogleTaskSyncState } from "../../lib/googleTaskSyncState";
import { ConfirmModal } from "../kit";
type Version = { id: string; task_id: string; data: Record<string, unknown>; created_at: string };
export function GoogleSyncHistory() {
  const { t } = useT();
  const [versions, setVersions] = useState<Version[]>([]), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Version | null>(null);
  const [pending, setPending] = useState<{ id: string; revision: number; writeId: string } | null>(null);
  async function load() {
    if (!supabase) return;
    setBusy(true); setError(false);
    try {
      const { data, error: failure } = await supabase.from("google_task_versions").select("id,task_id,data,created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(30);
      if (failure) throw failure;
      setVersions((data ?? []) as Version[]);
    } catch { setError(true); } finally { setBusy(false); }
  }
  async function restore(version: Version) {
    if (!supabase || busy) return;
    setBusy(true); setError(false);
    try {
      let request = pending;
      if (!request || request.id !== version.id) {
        const { data, error: failure } = await supabase.from("tasks").select("revision").eq("id", version.task_id).single();
        if (failure || !data) throw failure;
        request = { id: version.id, revision: data.revision, writeId: crypto.randomUUID() }; setPending(request);
      }
      const { error: failure } = await supabase.rpc("restore_google_task_version", { p_version_id: request.id, p_expected_revision: request.revision, p_write_id: request.writeId });
      if (failure) { if (failure.code === "40001") setPending(null); throw failure; }
      setPending(null); setSelected(null);
      await readGoogleTaskSyncState().run?.();
      await load();
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <details className="ff-settings-details" onToggle={e => { if (e.target === e.currentTarget && e.currentTarget.open) void load(); }}>
    <summary>{t("settings.google.history")}</summary>
    <p>{t("settings.google.historyNote")}</p>
    {error && <><p role="alert">{t("settings.google.historyFailed")}</p><button type="button" className="ff-btn" disabled={busy} onClick={() => void load()}>{t("storage.retry")}</button></>}
    {!busy && !error && !versions.length && <p>{t("settings.google.historyEmpty")}</p>}
    {versions.map(v => <details key={v.id}><summary>{String(v.data.title ?? "")} · {new Date(v.created_at).toLocaleString()}</summary>
      <p>{[v.data.dueDate, v.data.startTime, v.data.endTime].filter(Boolean).join(" · ")}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(v.data.description ?? "")}</p>
      <button type="button" className="ff-btn" disabled={busy} onClick={() => setSelected(v)}>{t("settings.google.restoreVersion")}</button>
    </details>)}
    {selected && <ConfirmModal title={t("settings.google.restoreVersion")} body={String(selected.data.title ?? "")} confirmLabel={t("settings.google.restoreVersion")}
      onCancel={() => setSelected(null)} onConfirm={() => void restore(selected)} />}
  </details>;
}
