import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "../../i18n";
export function CalendarServicesDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(); const { t } = useT();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="ff-services-dialog" aria-labelledby={titleId} onCancel={onClose}>
    <header className="ff-modal-head"><h2 id={titleId}>{title}</h2><button className="ff-btn" type="button" onClick={onClose}>{t("kit.close")}</button></header>
    <div className="ff-services-body">{children}</div>
  </dialog>;
}
