/** Capability version, independent of the app release or Task storage schema.
 * Keep at 1 until the Google executor implements base reconciliation + fencing.
 */
export const GOOGLE_SYNC_PROTOCOL = "1";
export const GOOGLE_SYNC_PROTOCOL_HEADER = "x-focusflow-google-sync-protocol";
export const GOOGLE_SYNC_POLICY_EVENT = "focusflow:google-sync-policy";
export const MAX_GOOGLE_ACCESS_TOKEN_SECONDS = 3600;
export type GoogleSyncPolicyReason = "updateRequired" | "policyUnavailable";
