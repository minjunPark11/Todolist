import { useState } from "react";
import type { Project, Task } from "../../types";
import { Modal } from "../kit";
import { useT } from "../../i18n";

interface InboxTriageCardProps {
  items: Task[];
  onSortNow: () => void;
}

export function InboxTriageCard({ items, onSortNow }: InboxTriageCardProps) {
  const { t } = useT();
  const preview = items.slice(0, 3);
  const rest = items.length - preview.length;

  return (
    <section className="tdy-card tdy-triage">
      <header className="tdy-card-head">
        <span className="tdy-card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 13l2.4-7h11.2L20 13" />
            <path d="M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5" />
            <path d="M4 13h4l1.5 2.5h5L16 13h4" />
          </svg>
        </span>
        <h2>{t("todayv.inboxTriage")}</h2>
        {items.length > 0 ? <span className="tdy-bucket-count">{items.length}</span> : null}
        <button
          type="button"
          className="tdy-btn tdy-btn-light tdy-btn-sm"
          aria-label={t("todayv.sortNowAria")}
          onClick={onSortNow}
          disabled={items.length === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h10M4 12h7M4 17h4M16 6v12M16 18l-3-3M16 18l3-3" />
          </svg>
          {t("todayv.sortNow")}
        </button>
      </header>

      {items.length === 0 ? (
        <p className="tdy-rail-empty">{t("todayv.inboxEmpty")}</p>
      ) : (
        <div className="tdy-chip-list">
          {preview.map((item) => (
            <button key={item.id} type="button" className="tdy-chip" onClick={onSortNow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>{item.title}</span>
            </button>
          ))}
          {rest > 0 ? <span className="tdy-chip-more">+{rest}</span> : null}
        </div>
      )}
    </section>
  );
}

export type TriageAction =
  | { type: "assign"; projectId: string }
  | { type: "addToToday" }
  | { type: "archive" }
  | { type: "keep" };

interface InboxTriageDrawerProps {
  items: Task[];
  projects: Project[];
  onTriage: (taskId: string, action: TriageAction) => void;
  onClose: () => void;
}

export function InboxTriageDrawer({ items, projects, onTriage, onClose }: InboxTriageDrawerProps) {
  const { t, lang } = useT();

  return (
    <Modal title={t("todayv.triageTitle")} onClose={onClose} wide>
      {items.length === 0 ? (
        <p className="tdy-rail-empty">{t("todayv.inboxEmpty")}</p>
      ) : (
        <div className="tdy-triage-list">
          {items.map((item) => (
            <TriageRow key={item.id} item={item} projects={projects} lang={lang} onTriage={onTriage} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function TriageRow({
  item,
  projects,
  lang,
  onTriage,
}: {
  item: Task;
  projects: Project[];
  lang: "ko" | "en";
  onTriage: (taskId: string, action: TriageAction) => void;
}) {
  const { t } = useT();
  const [projectId, setProjectId] = useState("");
  const created = new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", {
    month: "short",
    day: "numeric",
  }).format(new Date(item.createdAt));
  const isInbox = item.status === "inbox";

  return (
    <div className="tdy-triage-row">
      <div className="tdy-triage-info">
        <strong>{item.title}</strong>
        <small>
          {isInbox ? t("todayv.triageTypeInbox") : t("todayv.triageTypeUnassigned")} · {created}
        </small>
      </div>
      <div className="tdy-triage-actions">
        <select
          aria-label={t("todayv.assignSpace")}
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">{t("todayv.pickSpace")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="tdy-btn tdy-btn-navy tdy-btn-sm"
          disabled={!projectId}
          onClick={() => onTriage(item.id, { type: "assign", projectId })}
        >
          {t("todayv.assignSpace")}
        </button>
        {isInbox ? (
          <button
            type="button"
            className="tdy-btn tdy-btn-light tdy-btn-sm"
            onClick={() => onTriage(item.id, { type: "addToToday" })}
          >
            {t("todayv.addToToday")}
          </button>
        ) : null}
        <button
          type="button"
          className="tdy-btn tdy-btn-light tdy-btn-sm"
          onClick={() => onTriage(item.id, { type: "archive" })}
        >
          {t("common.archive")}
        </button>
        <button
          type="button"
          className="tdy-btn tdy-btn-light tdy-btn-sm"
          onClick={() => onTriage(item.id, { type: "keep" })}
        >
          {t("todayv.keepInbox")}
        </button>
      </div>
    </div>
  );
}
