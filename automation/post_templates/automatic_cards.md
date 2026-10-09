# Automatic training cards — Content API 0.7.0

The existing Owner Bot five-minute Poll calls `sync_training`. When `RFORM_AUTO_CARDS_ENABLED=YES`, new CLOSED sessions outside the existing baseline and not already covered by CONTENT_QUEUE produce private deterministic PNG cards plus a caption. Existing materials and owner photo edits are not migrated or overwritten. No new scheduler, publisher, external rendering service, paid dependency or OAuth scope.

Data: TRAINING_SESSIONS and all TRAINING_SETS for the exact session. WORKING and ACCESSORY count; WARMUP does not. Bench tonnage uses explicit bench-press exercise identities, never BENCH category (which includes flies). Total is external load × repetitions, with both dumbbells counted for the three owner-confirmed bilateral exercises CHEST_SUPPORTED_DUMBBELL_ROW, DUMBBELL_CHEST_FLY, DUMBBELL_REAR_DELT_FLY. Their canonical kg value is one dumbbell. Explicit KG_TOTAL overrides this convention. Unknown dumbbell identities require explicit KG_PER_HAND or KG_TOTAL; bodyweight exercises require KG_ADDITIONAL and exclude body mass. Unsupported units, missing facts and duplicate identities block creation with a readable reason.

Cards include every recorded working/accessory exercise, actual weights/repetitions and each RIR. Long packets paginate without dropping exercises, bounded by Telegram/Drive existing asset limits. Caption contains bench and total tonnage and calculation method. PLANNED, NOT_REVIEWED, NOT_READY and AutoPost_Allowed=NO remain intact. Owner preview/review/approval is still required. Both session and set fingerprints protect preparation and approval from stale data.

Enable after deploying the existing API: run `rformContentApiV04EnableTrainingCards`. This verifies the existing auto-draft baseline, preserves it and enables only cards. Roll back by setting RFORM_AUTO_CARDS_ENABLED=NO or selecting the previous deployment version. An uncertain Drive/queue outcome is audited and not automatically replayed.

`rformContentApiV04TrainingCardsSelfCheck` renders a private verification artifact for S-20261009-C, verifies 14 approaches / 5 exercises / 1920 kg bench / 8610 kg total, and logs its private Drive folder. It does not mutate CONTENT_QUEUE or approve/publish a post.

Rendering uses palette PNG with valid CRC/zlib stored blocks, bounded typed buffers and embedded DejaVu Sans glyphs. The glyph source license is `fonts/LICENSE-DejaVu.txt`. Tests decode PNG, verify weights and pagination, idempotency, failures and set freshness.
