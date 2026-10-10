# Apps Script runtime readback — 2026-10-10

Status: **SOURCE CONTINUITY PROVEN / PRIOR RUNTIME ACCEPTANCE REMAINS VALID**

## Scope

Authenticated readback of the live R/Form Apps Script runtime after the Cline Cloud one-shot onboarding, to resolve the conflicting browser reconciliation evidence and confirm whether the previously accepted Detector and Content API releases are still the live runtime.

## Method

- `bash scripts/cline/rform-cloud-onboard.sh` completed with `READY: R/Form Cline Cloud runtime session prepared.`
- `@google/clasp@3.4.1`, OAuth as the R/Form owner account.
- Project discovery by stable source anchor, then an exhaustive scan of every accessible project to prove project-level uniqueness.
- Private session, report and pulled sources kept outside the repository under `$HOME/.rform-cline/`. No project ID, deployment ID, credential or token is recorded here.

## Findings

### Project discovery (exhaustive)

| Anchor | Matching project | Files containing anchor |
| --- | --- | --- |
| `rformContentEventDetectorWriteV03` | `RFORM_CONTENT_EVENT_DETECTOR` (unique) | 1 |
| `RFORM_CONTENT_API_V04` | `RFORM_CONTENT_READ_API_v0_1` (unique) | 3 |

No other accessible project contains either anchor. Discovery is therefore unambiguous at the project level.

### Content Event Detector

- live target `content_event_detector_v0_3.js` SHA-256 `f1210427e006ad5204cf174a75c8aa4fea7575b755a9cf7b51d6121e82f3f78e` is **byte-identical** to reviewed PR #13 source `1b0474f4fa2616af5c6353650246476b67981774` (`diff` = 0 lines);
- present: `rformContentEventDetectorWriteV03`, `RFORM_DETECTOR_RUN`, `observability_version:'0.1'`;
- `rformContentEventDetectorTickV03` is absent from the live project and from every accessible project/Git ref;
- the source's trigger installer creates handler `rformContentEventDetectorWriteV03` on a 6-hour cadence.

PR #13 already contains production acceptance evidence dated 2026-10-09: one 6-hour `rformContentEventDetectorWriteV03` trigger, scheduled START/FINISH receipts, two controlled manual NO_OP runs, PR #12 no-op timestamp behavior, and no CONTENT_QUEUE/Telegram writes.

The authenticated 2026-10-10 source readback proves that the exact accepted Detector source remains live. Therefore the later browser-only TickV03 premise is superseded and does not invalidate the earlier runtime acceptance.

### Content Control API / automatic training cards

- live target `Код.js` SHA-256 `a959a62056004042e58b02723ff8c57c59b4fcbd1c86c2a7fbdf743455c1bf5c` is **byte-identical** to reviewed PR #25 source `5550d3c423294fd89c980d08ce019808b735c434` (`diff` = 0 lines);
- declares `version: '0.7.0'`; contains `rformContentApiV04Preflight`, `rformContentApiV04EnableTrainingCards`, `rformContentApiV04TrainingCardsSelfCheck`;
- existing deployment inventory contains one versioned production web-app deployment at version 19 plus `@HEAD`; no parallel production API was created.

PR #25 already contains production activation/acceptance evidence dated 2026-10-09:

- `rformContentApiV04Preflight()` PASS, `ok=true`, version `0.7.0`;
- `rformContentApiV04EnableTrainingCards()` PASS, automatic cards enabled, publication disabled, baseline preserved;
- private `rformContentApiV04TrainingCardsSelfCheck()` PASS for `S-20261009-C`: 14 sets, 5 exercises, bench 1920 kg, total 8610 kg, 1 private card artifact;
- `queue_changed=false`; nothing approved, scheduled or published.

The current project has no `executionApi` section, so `clasp run` cannot repeat those editor-function checks from the Cline session. That limitation does **not** erase the prior acceptance because the fresh authenticated readback proves the exact accepted source remains live and no contrary runtime evidence exists.

### Anchor occurrence within Content API project

Three files contain the text `RFORM_CONTENT_API_V04`. The canonical component source is the single file that **defines** the anchor object (`RFORM_CONTENT_API_V04 = ...`); the other files only reference it.

The Cline bootstrap now uses definition-based disambiguation. The production deployment guard is being aligned to the same fail-closed rule and covered by tests.

## Classification

| Component | Prior acceptance | 2026-10-10 continuity evidence | Classification |
| --- | --- | --- | --- |
| Detector | PASS in PR #13 | live source byte-identical to accepted PR #13 source | `VERIFIED_PRODUCTION` |
| Content API | PASS in PR #25 | live source byte-identical to accepted PR #25 source; existing deployment v19 | `VERIFIED_PRODUCTION` |
| Training cards | PASS in PR #25 | accepted 0.7.0 source remains live | `VERIFIED_PRODUCTION` |
| `production` ref | PR #25 accepted source | restored to `5550d3c423294fd89c980d08ce019808b735c434` | `VERIFIED_PRODUCTION` |
| Publication | disabled during acceptance | no contradictory evidence; no publish action taken | `UNCHANGED` |

## Governance conclusion

The temporary downgrade to `DEPLOYED_NOT_VERIFIED` was caused by later browser evidence that claimed a live-only TickV03 wrapper and missing PR #13 observability. Authenticated clasp readback disproves that premise. The evidence hierarchy is now:

1. prior successful runtime acceptance in PR #13 / PR #25;
2. fresh authenticated source/deployment readback proving the accepted source remains live;
3. superseded browser-only reconciliation evidence.

No Apps Script source, trigger, Script Property or publication state was changed by the Cline readback. The only governance correction is restoration of the production pointer and manifest to the already accepted source state.
