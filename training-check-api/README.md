# R/Form Training Check receiver

Purpose: receive one Training Check submission from the public GitHub Pages UI and write it only to the isolated `RFORM_TRAINING_CHECK_DB_v0_1` datastore. It does not write to `RFORM_MASTER_DATA_v1`.

## Datastore

Google Sheet ID is provided through Apps Script property `TRAINING_CHECK_SPREADSHEET_ID`.
Required tabs:
- `CHECKS`
- `PARTICIPANTS`
- `INGEST_LOG`

`INGEST_LOG.event_id` is the idempotency key. Existing `check_id` rows in `CHECKS` are updated instead of duplicated.

## Deploy as a standalone Apps Script web app

1. Create a new standalone Google Apps Script project.
2. Replace `Code.gs` with `training-check-api/Code.gs` from this repository.
3. In Project Settings → Script Properties add:
   - `TRAINING_CHECK_SPREADSHEET_ID` = the isolated Training Check spreadsheet ID.
   - `TRAINING_CHECK_ACCESS_TOKEN` = a long random pilot token. Do not commit this token to GitHub.
4. Deploy → New deployment → Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Copy the `/exec` URL.

The GitHub Pages client accepts the deployment URL and access token through participant-link query parameters (`api`, `access`, `participant`, `check`). This avoids committing the endpoint token into public source.

## Security boundary

- Payload schema is fixed to `rform.training_check.v0.2`.
- Data-store consent is mandatory.
- Payload size is capped.
- Access token is verified server-side.
- The receiver can touch only the configured Training Check spreadsheet.
- No writes to R/Form production master are performed.
