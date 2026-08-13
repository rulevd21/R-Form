# R/Form Channel Control v0.1

A lightweight owner dashboard for the R/Form Telegram publishing workflow.

## Decision baseline

Approved 2026-08-13:

- interface: standalone mobile web panel;
- after APPROVE + SCHEDULE, publish automatically;
- live Telegram edits allowed only with explicit confirmation and audit logging;
- analytics v0.1: Google Sheets + Telegram export / reactions, no MTProto dependency;
- content production stays in the existing R/Form ChatGPT process; Channel Control manages flow, not generation.

## Source of truth

`RFORM_MASTER_DATA_v1` remains the operational source of truth.

- Spreadsheet ID: `1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY`
- Queue: `CONTENT_QUEUE`
- Registry: `CONTENT_REGISTRY`

The owner-facing calendar remains:

- `RFORM_CONTENT_CALENDAR_CURRENT__2026-08-13`
- Spreadsheet ID: `1lDBGMRQqpgzCd1IhasH3sGYxVz_kAIoIi6WjpND7s80`
- Tabs: `CALENDAR`, `PUBLICATIONS`, `BACKLOG`, `README`, `CONTROL_LOG`

## MVP architecture

```text
RFORM_MASTER_DATA_v1 / CONTENT_QUEUE
        |
        v
R/Form Channel Control (Apps Script Web App)
        |
        +-- Save draft
        +-- Approve
        +-- Schedule
        +-- Hold / Cancel / Supersede
        +-- Edit published Telegram post
        |
        v
Existing telegram_autopost_v0_3.gs
        |
        v
Telegram @r_form
        |
        v
writeback to CONTENT_QUEUE + CONTROL_LOG
```

No new publishing engine is introduced. Channel Control deliberately reuses the existing `telegram_autopost_v0_3.gs` queue rules to prevent two competing schedulers.

## Lifecycle model

v0.1 does **not** add a destructive new status column to production. It derives a canonical UI lifecycle from existing fields and writes the legacy status fields atomically.

Displayed states:

`IDEA → DRAFT → PLANNED → REVIEW → APPROVED → SCHEDULED → PUBLISHED`

Exception states:

`HOLD`, `SUPERSEDED`, `CANCELLED`, `ERROR`

A later schema migration can persist `Lifecycle_State`, `Revision_ID`, and `Publication_ID` after the UI workflow proves stable.

## Safety rules

1. Scheduling requires:
   - `Public_Data_Allowed = YES`
   - `Text_Status = APPROVED`
   - `Approval_Status = APPROVED`
   - non-empty `Telegram_Text`
   - for media posts: `Visual_Status = APPROVED`
2. `Schedule` sets `AutoPost_Allowed = YES` and `Publication_Status = SCHEDULED`.
3. `Hold` / `Cancel` always set `AutoPost_Allowed = NO`.
4. Published content cannot be cancelled retroactively. Use `Edit live` or `Supersede`.
5. Live edit requires explicit confirmation and a valid `Telegram_Message_ID`.
6. Every management action is appended to `CONTROL_LOG`.
7. The existing autopost trigger remains the only process that creates new Telegram publications.

## Files

- `Code.gs` — Apps Script backend, Sheet write controls, Telegram live-edit actions, audit logging.
- `Index.html` — responsive R/Form owner dashboard.
- `appsscript.json` — Apps Script manifest.

## Deployment: lowest-friction route

Use the **existing standalone Apps Script project that runs `telegram_autopost_v0_3.gs`**. This is intentional: its Telegram token Script Property is already configured.

1. Add `Code.gs` and `Index.html` from this folder to that Apps Script project. Keep the existing autopost file unchanged.
2. Run `rformCcSetup()` once. It verifies the two spreadsheets and the audit sheet; it does not publish anything.
3. Deploy → New deployment → Web app:
   - Execute as: **Me**
   - Who has access: **Only myself** (or the narrowest owner-only option offered by the account)
4. Open the deployment URL on desktop/mobile and save it as a shortcut.

The existing trigger `rformTgProcessQueue` continues to handle scheduled posting.

## Owner workflow

### New/future content

1. `03_CONTENT_CALENDAR` creates/plans the content row in `CONTENT_QUEUE`.
2. Existing R/Form chats produce text/visuals.
3. Channel Control shows the row as `PLANNED`, `DRAFT`, or `REVIEW`.
4. Owner reviews copy and visual links.
5. `Approve`.
6. `Schedule` with date/time.
7. Existing autopost publishes and writes Telegram identifiers back.

### Published content

Channel Control displays the Telegram link and provides `Редактировать live`.

The UI forces a second confirmation before calling Telegram edit methods. The change is then written back to `Telegram_Text` and logged in `CONTROL_LOG`.

### Content that should not be published

Use:

- `Hold` — temporary stop, reversible;
- `Cancel` — remove from current publishing plan;
- `Supersede` — replace an obsolete version while preserving history.

## v0.1 limits

- No automatic MTProto views/forwards collection.
- No OpenAI API generation inside the dashboard.
- No automatic revision object yet; audit log is the first version-history layer.
- Live media replacement is not exposed in the UI yet; v0.1 edits live text/captions only.
- The web app is owner-only and is not intended as a public R/Form product.

## Next acceptance tests

1. Dashboard loads queue/calendar/publications without modifying data.
2. Edit a non-published planned row and verify Sheet writeback.
3. Approve a `TEXT_ONLY` test row.
4. Schedule a test row with `AutoPost_Allowed=YES`; verify the existing autopost publishes exactly once.
5. Verify `Telegram_Message_ID`, `Telegram_Post_URL`, `Posted_At` writeback.
6. Edit the test publication live and verify Telegram + `CONTROL_LOG`.
7. Put a future item on HOLD and verify autopost cannot send it.

Only after these pass should v0.1 be treated as the operating dashboard.
