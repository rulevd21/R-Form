# R/Form Training Check receiver

Purpose: receive one Training Check submission from the public GitHub Pages UI and write it only to the isolated `RFORM_TRAINING_CHECK_DB_v0_1` datastore. It does not write to `RFORM_MASTER_DATA_v1`.

## Datastore

The isolated Training Check datastore is fixed in `Code.gs`. Required tabs:
- `CHECKS`
- `PARTICIPANTS`
- `INGEST_LOG`

Every pilot check must be pre-created in `CHECKS` with:
- `check_id`
- `participant_id`
- private `submission_token`

`INGEST_LOG.event_id` is the idempotency key. A repeated event is acknowledged as `ALREADY_APPLIED`. The receiver updates only a pre-created `check_id`; it never creates arbitrary new checks from the public client.

After the first accepted event the check moves from `PLANNED` to `COMPLETED`. A new event for that same check is rejected as `CHECK_CLOSED`; retrying the original event remains safe and returns `ALREADY_APPLIED`.

## Deploy as a standalone Apps Script web app

1. Create or open the standalone Google Apps Script project used by Training Check.
2. Replace `Code.gs` with `training-check-api/Code.gs` from this repository.
3. Deploy → Manage deployments → Edit → New version → Deploy.
4. Execute as: Me.
5. Who has access: Anyone.
6. Authorize access to the isolated Training Check spreadsheet when Google requests it.
7. Keep the existing deployment `/exec` URL when updating the current deployment.

No Script Properties are required for the pilot receiver.

## Pilot v1 participant experience

Canonical public client:

`https://rulevd21.github.io/R-Form/training-check.html#<OPAQUE_TICKET>`

The participant sees only the Training Check form and user-facing states. The page does not display `check_id`, participant IDs, submission tokens, receiver URLs, event IDs, or backend statuses.

The fragment ticket is an opaque transport wrapper for the pre-created check configuration. It is not encryption and must be treated like the private participant link itself. The fragment is not sent to GitHub Pages as an HTTP request or referrer. Never commit a participant ticket or submission token to the repository.

The page uses the fixed Training Check Apps Script endpoint and supports:
- autosaved local draft;
- pending transaction recovery with the same `event_id`;
- server-side status confirmation before declaring success;
- reopening the same link after submission;
- `COMPLETED` state: answers saved, report pending;
- `REPORTED` state: participant report rendered directly in the R/Form page without requiring Google Docs access.

## Receiver read modes

`mode=status` validates the check, participant and token, then returns the processing status for one `event_id` as JSONP.

`mode=check` validates the same access boundary and returns the current check state. When the check is `REPORTED` and the three analyst fields are populated, it also returns the participant-facing report payload:
- plan;
- fact;
- intensity / rest;
- quality;
- participant decision;
- key deviation;
- interpretation;
- next checkpoint.

The participant-facing report remains a single-session summary and is not a medical assessment or personalized training prescription.

## Report flow

Analyst workflow after an accepted submission:

`COMPLETED → fill analyst_key_deviation / analyst_interpretation / report_next_step → create internal report document if needed → set report metadata → REPORTED`

The canonical native report template is `RFORM_TRAINING_CHECK_REPORT_TEMPLATE_v0_2` on Google Drive. The Google Doc is an internal artifact; Pilot v1 can render the report directly from the isolated datastore.

## Migration flow

`GitHub Pages form → Apps Script doPost → validate check/participant/token/consent → update CHECKS → append INGEST_LOG → JSONP status confirmation → browser success state`

Then:

`analyst review → CHECKS = REPORTED → same participant link → mode=check → on-page report`

A local browser copy remains available as fallback if the receiver cannot confirm the submission.

## Security boundary

- Payload schema is fixed to `rform.training_check.v0.2`.
- Data-store consent is mandatory.
- Payload size is capped.
- `check_id`, `participant_id` and per-check token must match the private datastore.
- Idempotency is enforced through `INGEST_LOG.event_id`.
- Submitted checks are closed against new events.
- Report data is returned only after the same per-check access validation.
- The receiver can touch only the isolated Training Check spreadsheet.
- No writes to `RFORM_MASTER_DATA_v1` are performed.
