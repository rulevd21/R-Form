# Apps Script runtime readback — 2026-10-10

Status: **SOURCE READBACK PROVEN / RUNTIME ACCEPTANCE NOT EXECUTABLE**

## Scope

Authenticated readback of the live R/Form Apps Script runtime to close the Detector
reconciliation gate and the Content API 0.7.0 deployment gate.

## Method

- `bash scripts/cline/rform-cloud-onboard.sh` completed with
  `READY: R/Form Cline Cloud runtime session prepared.`
- `@google/clasp@3.4.1`, OAuth as the R/Form owner account.
- Project discovery by stable source anchor, then an exhaustive scan of every
  accessible project to prove anchor uniqueness.
- Private session, report and pulled sources kept outside the repository under
  `$HOME/.rform-cline/`. No project ID, deployment ID, credential or token is
  recorded here.

## Findings

### Project discovery (exhaustive)

| Anchor | Matching project | Files containing anchor |
| --- | --- | --- |
| `rformContentEventDetectorWriteV03` | `RFORM_CONTENT_EVENT_DETECTOR` (unique) | 1 |
| `RFORM_CONTENT_API_V04` | `RFORM_CONTENT_READ_API_v0_1` (unique) | 3 |

No other accessible project contains either anchor. Discovery is therefore
unambiguous at the project level.

### Content Event Detector

- live target `content_event_detector_v0_3.js`
  SHA-256 `f1210427e006ad5204cf174a75c8aa4fea7575b755a9cf7b51d6121e82f3f78e`
  is **byte-identical** to reviewed PR #13 source
  `1b0474f4fa2616af5c6353650246476b67981774` (`diff` = 0 lines).
- present: `rformContentEventDetectorWriteV03`, `RFORM_DETECTOR_RUN`,
  `observability_version:'0.1'`.
- absent: `rformContentEventDetectorTickV03` — it exists in **no** accessible
  project and in **no** Git ref.
- the live trigger installer creates handler
  `rformContentEventDetectorWriteV03` on a 6-hour cadence and states that no
  Telegram or `CONTENT_QUEUE` trigger is created.

The previous manifest note ("PR #13 receipts are absent" and "one-minute TickV03
trigger") is contradicted by live evidence. The live Detector already equals the
reviewed PR #13 candidate, so no source reconciliation write is required.

### Content Control API / automatic training cards

- live target `Код.js`
  SHA-256 `a959a62056004042e58b02723ff8c57c59b4fcbd1c86c2a7fbdf743455c1bf5c`
  is **byte-identical** to reviewed PR #25 source
  `5550d3c423294fd89c980d08ce019808b735c434` (`diff` = 0 lines).
- declares `version: '0.7.0'`; contains `rformContentApiV04Preflight`,
  `rformContentApiV04EnableTrainingCards`, `rformContentApiV04TrainingCardsSelfCheck`.
- existing deployment inventory contains a single versioned web-app deployment
  `@19` described `Content API 0.7.0 - automatic workout cards and tonnage - PR25 5550d3c`
  plus `@HEAD`. No parallel production API was created.

### Anchor occurrence is non-unique within the API project

Three files contain `RFORM_CONTENT_API_V04`. The canonical component source is the
single file that **defines** the anchor object
(`const RFORM_CONTENT_API_V04 = Object.freeze({`). The other two files
(`Release060_ReadOnly.js`, `Channel_History_20261008.js`) only reference it.

`scripts/apps-script/guard.mjs` (`locateAnchor`) still requires exactly one file to
*contain* the anchor and would therefore refuse a guarded write for `content-api`
until it adopts the same definition-based rule. This does not block anything today
because the live source already equals the reviewed candidate.

## Acceptance execution unavailable

The Content API `appsscript.json` has no `executionApi` section and there is no
API-executable deployment, so `clasp run rformContentApiV04Preflight` fails with a
server `NOT_FOUND` error. Trigger inventory is not exposed by the clasp/Apps Script
REST surface. Per policy, no new public endpoint was created for testing.

Therefore the Content API, automatic training cards and Detector trigger behaviour
can be classified no higher than `DEPLOYED_NOT_VERIFIED`.

## Classification

| Component | Source readback | Runtime acceptance | Classification |
| --- | --- | --- | --- |
| Detector | matches PR #13 candidate | trigger inventory/behaviour not observable | `DEPLOYED_NOT_VERIFIED` |
| Content API | matches PR #25 candidate | preflight/self-check not executable | `DEPLOYED_NOT_VERIFIED` |
| Training cards | matches PR #25 candidate | enablement/self-check not executable | `DEPLOYED_NOT_VERIFIED` |
| `production` ref | unchanged (`122c2629`) | — | `UNCHANGED` |
| Publication | untouched | — | disabled (`UNCHANGED`) |

No source, deployment, trigger, Script Property or `production` ref was modified.
Publication stayed disabled throughout.
