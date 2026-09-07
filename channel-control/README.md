# R/Form Channel Control v0.2

Owner dashboard for the R/Form Telegram publishing workflow.

## Decision baseline

Approved 2026-08-13:

- interface: standalone mobile web panel;
- after APPROVE + SCHEDULE, publish automatically;
- live Telegram edits allowed only with explicit confirmation and audit logging;
- analytics v0.1: Google Sheets + Telegram export / reactions, no MTProto dependency;
- content production stays in the existing R/Form ChatGPT process; Channel Control manages flow, not generation;
- **before scheduling a publication, the owner must be able to see the exact Telegram copy together with the visual card(s).**

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
        +-- Preview text + visual(s)
        +-- Approve
        +-- Preview again before Schedule
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

## Publication preview v0.2

Backend `rformCcGetPreview()` reads the current `CONTENT_QUEUE` row and returns the exact `Telegram_Text`, mode and visual source used for publication.

Visual resolution supports:

- direct Google Drive image/PDF file links;
- Google Drive folders containing several cards;
- external image URLs.

For a Drive folder the panel lists up to 10 image/PDF assets and sorts them by filename. The preview is read-only and does not modify `CONTENT_QUEUE` or `CONTROL_LOG`.

The UI add-on `PreviewAddon.html` adds:

- `Предпросмотр` on every content card;
- Telegram-like rendering of the text;
- horizontal inspection of all visual cards;
- mode / status / character / card-count control block;
- warnings when a visual is missing or not approved;
- source link for opening the original visual;
- replacement of the old Schedule dialog: `Schedule` now opens the preview first, and scheduling is confirmed from the preview window.

Therefore the production flow is now:

`Edit → Preview → Approve → Preview + time → Schedule → autopost`.

## Lifecycle model

v0.2 still does **not** add a destructive new lifecycle column to production. It derives a canonical UI lifecycle from existing fields and writes the legacy status fields atomically.

Displayed states:

`IDEA → DRAFT → PLANNED → REVIEW → APPROVED → SCHEDULED → PUBLISHED`

Exception states:

`HOLD`, `SUPERSEDED`, `CANCELLED`, `ERROR`

## Safety rules

1. Scheduling requires:
   - `Public_Data_Allowed = YES`
   - `Text_Status = APPROVED`
   - `Approval_Status = APPROVED`
   - non-empty `Telegram_Text`
   - for media posts: `Visual_Status = APPROVED`
2. The Schedule action is routed through publication preview before `AutoPost_Allowed` can be enabled from the UI.
3. `Schedule` sets `AutoPost_Allowed = YES` and `Publication_Status = SCHEDULED`.
4. `Hold` / `Cancel` always set `AutoPost_Allowed = NO`.
5. Published content cannot be cancelled retroactively. Use `Edit live` or `Supersede`.
6. Live edit requires explicit confirmation and a valid `Telegram_Message_ID`.
7. Every management write is appended to `CONTROL_LOG`; preview itself is read-only.
8. The existing autopost trigger remains the only process that creates new Telegram publications.

## Files

- `Code.gs` — Apps Script backend, including preview data and Drive visual resolution.
- `Index.html` — existing responsive R/Form owner dashboard.
- `PreviewAddon.html` — v0.2 preview UI layer loaded after `Index.html`.
- `appsscript.json` — Apps Script manifest.

## Deployment upgrade from v0.1 to v0.2

In the same Apps Script project that already runs Channel Control and `telegram_autopost_v0_3.gs`:

1. Replace `Code.gs` with the v0.2 version from this folder.
2. Create a new HTML file named `PreviewAddon` and paste `PreviewAddon.html` into it.
3. In `doGet()`, render `Index` and append `PreviewAddon` before the closing `</body>` tag. Recommended implementation:

```javascript
function doGet() {
  const base = HtmlService.createTemplateFromFile('Index').evaluate().getContent();
  const addon = HtmlService.createHtmlOutputFromFile('PreviewAddon').getContent();
  const html = base.replace('</body>', addon + '\n</body>');
  return HtmlService.createHtmlOutput(html)
    .setTitle('R/Form · Channel Control')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```

4. Save the project and update the existing Web App deployment to a new version. The existing deployment URL can remain the same.
5. The first preview of a Drive visual may request/refresh Drive authorization because v0.2 reads image files from the configured Drive folder.

The Telegram autopost trigger and token settings are unchanged.

## Owner workflow

### New/future content

1. `03_CONTENT_CALENDAR` plans the content row in `CONTENT_QUEUE`.
2. Existing R/Form chats produce text/visuals.
3. Channel Control shows the row as `PLANNED`, `DRAFT`, or `REVIEW`.
4. Owner opens `Предпросмотр` and checks text + card(s).
5. Owner edits if required, then `Approve`.
6. `Schedule` opens the same preview again together with date/time.
7. Owner schedules from that preview.
8. Existing autopost publishes and writes Telegram identifiers back.

### Published content

Channel Control displays the Telegram link and provides live text editing with explicit confirmation.

## v0.2 limits

- Preview reproduces content and card order, but it is not a pixel-perfect Telegram client emulator.
- Google Drive thumbnails are used for visual preview; the original file remains the publication source.
- No automatic MTProto views/forwards collection.
- No OpenAI API generation inside the dashboard.
- Live media replacement is not exposed yet.
- The web app is owner-only and is not intended as a public R/Form product.

## Next acceptance tests

1. Open preview for `TEXT_ONLY`: copy is identical to `Telegram_Text`.
2. Open preview for `PHOTO_CAPTION`: one visual + copy are visible.
3. Open preview for `ALBUM_CAPTION`: all expected cards appear in correct filename order.
4. Verify `Предпросмотр` performs no write to `CONTROL_LOG`.
5. For an APPROVED item, click `Schedule` and verify preview appears before the date/time confirmation.
6. Schedule, verify one Telegram publication and normal writeback.
7. Test mobile layout.
