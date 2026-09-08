import { planLabels, type EventLabel } from "../domain/calendar/googleSync/labelPlan";
import type { Project } from "../types";

export interface LabelOutcome {
  supported: boolean | null;
  mappings: { projectId: string; googleLabelId: string }[];
  overflow: number;
  failed: boolean;
}

/** Read-modify-write preserves foreign labels and calendar metadata. An ETag
 * protects against a second device changing the palette between GET and PUT. */
export async function runLabels(calendarId: string, accessToken: string, projects: readonly Project[], request: typeof fetch = fetch): Promise<LabelOutcome> {
  const empty: LabelOutcome = { supported: null, mappings: [], overflow: 0, failed: true };
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const read = await request(url, { headers });
      if (!read.ok) return empty;
      const calendar = await read.json();
      const remote: EventLabel[] = calendar.labelProperties?.eventLabels ?? [];
      const plan = planLabels(projects, remote);
      if (!plan.changed) return { supported: true, mappings: plan.mappings, overflow: plan.overflow, failed: false };
      const response = await request(url, { method: "PUT", headers: { ...headers, ...(calendar.etag ? { "If-Match": calendar.etag } : {}) },
        body: JSON.stringify({ ...calendar, labelProperties: { ...calendar.labelProperties, eventLabels: plan.labels } }) });
      if (response.status === 412) continue;
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Quota, missing permissions, malformed input and unsupported features
        // must not all become a permanent "unsupported account" verdict.
        const message = JSON.stringify(body?.error ?? "");
        const unsupported = [400, 403].includes(response.status) && /label/i.test(message) && /not supported|unsupported|not available|not enabled/i.test(message);
        return { ...empty, supported: unsupported ? false : null };
      }
      const actual: EventLabel[] = body?.labelProperties?.eventLabels ?? [];
      if (!plan.mappings.every((m) => actual.some((label) => label.id === m.googleLabelId))) return empty;
      return { supported: true, mappings: plan.mappings, overflow: plan.overflow, failed: false };
    }
  } catch { /* No successful response, no earned mapping. */ }
  return empty;
}
