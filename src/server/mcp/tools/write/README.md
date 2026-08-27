# Write tools — V2, deliberately empty

Nothing lives here yet, and the directory exists so that when something does,
it lands in a place that already has rules.

**Why V1 is read-only** is not caution for its own sake. `buildSyncPlan` treats
the device as the source of truth and the account as a mirror it overwrites
(`src/domain/sync/buildSyncPlan.ts`). A server that writes a task into the
account has written it into a mirror that the next device sync may erase,
because the device's baseline never knew about it. That is R8, and it is a
design problem to solve before it is a feature to build — not a matter of
adding an endpoint.

**Two locks, when the time comes.** A write tool registers with
`mode: "write"`, which keeps it out of `tools/list` while the V1 build ships.
That is the application lock. The second one is the database refusing writes
carrying an OAuth client's claim (§6.5 of
`FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md`, milestone M5), so an
application mistake is not the only thing standing between a reader and a
delete. Q1 in §23 is what decides whether that second lock is available.
