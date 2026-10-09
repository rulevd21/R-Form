# Automatic Training Cards / Content API 0.7.0 — production preflight 2026-10-09

Status: **SOURCE + CI + LIVE DATA PREFLIGHT PASS / DEPLOYMENT + ACTIVATION PENDING**

## Exact release source

- PR #25 head: `5550d3c423294fd89c980d08ce019808b735c434`;
- parent / verified production baseline: `122c26290b7ddd3a096216cf47248aedd609d388`;
- dedicated immutable-intent release branch created: `release/content-api-0.7.0-production-candidate`;
- component: Content Control API 0.7.0, automatic private training cards;
- current verified production API remains 0.6.4 / deployment version 18 from PR #24 until runtime promotion is completed.

GitHub Actions `Content Control tests`, run `37923797643`, completed successfully for exact PR #25 head.

## Live canonical-data preflight

Canonical session: `S-20261009-C`.

Read-only production data confirms:

- session status: `CLOSED`;
- 14 recorded WORKING/ACCESSORY sets;
- 5 exercises;
- bench: `80 × 6 × 4 = 1,920 kg`;
- squat: `110 × 8 × 3 = 2,640 kg`;
- chest-supported dumbbell row: `35 × 2 × 12 × 3 = 2,520 kg`;
- dumbbell chest fly: `16 × 2 × 15 + 15 × 2 × 15 = 930 kg`;
- rear-delt dumbbell fly: `10 × 2 × 15 × 2 = 600 kg`;
- canonical total: `8,610 kg`.

This exactly matches `rformContentApiV04TrainingCardsSelfCheck()` in PR #25: 14 sets / 5 exercises / bench 1,920 kg / total 8,610 kg.

## Proof feature is not currently active

Current `CONTENT_QUEUE` row `CNT-20261009-S-20261009-C` is still:

- `Visual_Status = NOT_REQUIRED`;
- `Telegram_Post_Mode = TEXT_ONLY`;
- no training-card visual URL;
- `AutoPost_Allowed = NO`.

Therefore source merge must not be confused with production activation. Existing material was not altered during this preflight.

## Required production promotion

Using authenticated Apps Script access to the existing Content API project:

1. read current API source and confirm the installed 0.6.4 baseline / preserve properties and deployment identity;
2. replace the API source with the exact PR #25 candidate based on `5550d3c423294fd89c980d08ce019808b735c434`;
3. update the existing Web App deployment rather than creating a parallel API;
4. read deployed source back and compare with the exact reviewed candidate;
5. run `rformContentApiV04Preflight()` and require version `0.7.0` with no schema/access regressions;
6. run `rformContentApiV04EnableTrainingCards()`; require baseline preserved, `automatic_cards=true`, publication disabled;
7. run `rformContentApiV04TrainingCardsSelfCheck()` and verify the private Drive artifact plus exact 14 / 5 / 1920 / 8610 result;
8. verify a private Owner Bot preview path only; do not approve/schedule/publish during acceptance;
9. verify duplicate/load/fingerprint guards and `AutoPost_Allowed=NO` remain intact;
10. update PR #25 evidence, runtime manifest and `production` pointer only after the above passes.

Rollback is the previous API deployment version 18 plus disabling `RFORM_AUTO_CARDS_ENABLED` if activation has occurred.

## Access blocker in this execution

The currently connected Drive/Sheets integration cannot edit or execute Google Apps Script projects, deployments, Script Properties or editor functions. No authenticated browser/computer connector is currently connected. For that reason no production write was attempted and PR #25 remains correctly classified as `MERGED — NOT PRODUCTION VERIFIED`.
