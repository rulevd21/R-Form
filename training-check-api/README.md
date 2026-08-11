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

## Deploy as a standalone Apps Script web app

1. Create a new standalone Google Apps Script project.
2. Replace `Code.gs` with `training-check-api/Code.gs` from this repository.
3. Deploy → New deployment → Web app.
4. Execute as: Me.
5. Who has access: Anyone.
6. Authorize access to the isolated Training Check spreadsheet when Google requests it.
7. Copy the deployment `/exec` URL.

No Script Properties are required for the pilot receiver.

## Participant link

The GitHub Pages client accepts these query parameters:
- `participant` — pre-created participant ID
- `check` — pre-created Training Check ID
- `api` — URL-encoded Apps Script `/exec` deployment URL
- `access` — per-check `submission_token`
- optional `context` — short training context

Template:

`https://rulevd21.github.io/R-Form/?participant=P-001&check=RTC-YYYYMMDD-001&api=<URL_ENCODED_EXEC_URL>&access=<SUBMISSION_TOKEN>`

Do not commit participant submission tokens to GitHub. They stay in the private datastore and are distributed only inside the participant-specific link.

## Migration flow

`GitHub Pages form → Apps Script doPost → validate check/participant/token/consent → update CHECKS → append INGEST_LOG → postMessage ACK → browser status`

A local browser copy remains available as fallback if the receiver does not acknowledge the submission.

## Security boundary

- Payload schema is fixed to `rform.training_check.v0.2`.
- Data-store consent is mandatory.
- Payload size is capped.
- `check_id`, `participant_id` and per-check token must match the private datastore.
- Idempotency is enforced through `INGEST_LOG.event_id`.
- The receiver can touch only the isolated Training Check spreadsheet.
- No writes to `RFORM_MASTER_DATA_v1` are performed.
