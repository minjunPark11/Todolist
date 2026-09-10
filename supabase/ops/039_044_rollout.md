# Google automatic sync rollout

1. Run `039_044_preflight.sql`. Required existing objects must be present; `already_started` must be null for a fresh rollout. If partially applied, inspect existing definitions before resuming; do not replay CREATE/RENAME migrations blindly.
2. Apply migrations 039–044 in numeric order before merging the frontend PR. Each migration is transactional. Do not serve the new frontend until all six finish. These migrations do not activate a previously disabled protocol account or change Google data directly.
3. Run `039_044_verify.sql`. Both guards and both RLS flags must be true, and all returned objects must exist.
4. Merge the tested frontend PR and verify Vercel production serves the new commit. A new client applies account timezone changes after pending writes settle, then rereads Google and re-evaluates retained reviews.
5. Check the connected account: timezone matches General settings; independent title/description edits merge; unsupported/ambiguous items remain visible; exclusions stay excluded; history can be opened and restored. Review counts are measured after the first completed sync, not promised in advance.

If frontend rollback is required, keep the schema and history tables. The old-client timezone guard intentionally blocks a mismatched timezone until a new client completes the conversion. Never undo this guard by rewriting mapping bases or deleting review/source records. Resolve database issues with a forward migration.

Local validation: database integration tests cover merge CAS, replay after response loss, deletion choices, version restore, recurrence baseline checks, timezone conversion and old-client lease refusal. Production preflight, migration application, and account verification require Supabase access and are still pending.
