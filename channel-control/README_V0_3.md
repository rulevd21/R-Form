# R/Form Channel Control v0.3

This increment implements the four owner-approved usability/safety improvements on top of the existing v0.2 preview and the existing Telegram autopost engine.

## 1. Preview verification lock

`ChannelControlEnhancements_v0_3.gs` adds four non-destructive columns to `CONTENT_QUEUE`:

- `Preview_Review_Hash`
- `Preview_Reviewed_At`
- `Preview_Reviewed_By`
- `Preview_Review_Status`

The hash covers the exact outbound inputs: Telegram mode, trimmed Telegram text, visual source URL and the first 10 compatible PNG/JPEG files in filename order, including file ID/size/last-updated metadata.

Owner flow becomes:

`Edit → Preview → Проверено → Approve → Schedule → autopost`.

If text, mode or visual input changes after verification, Channel Control marks the row `RECHECK_REQUIRED`. If it had already been scheduled, the UI path disables autopost and returns the publication to review.

## 2. Exact Telegram structure simulation

The v0.3 preview mirrors the actual behavior of `telegram_autopost_v0_3`:

- `TEXT_ONLY` → one text message;
- `PHOTO_CAPTION`, text <= 1024 → photo with caption;
- `PHOTO_CAPTION`, text > 1024 → photo without caption, then a separate text message;
- `ALBUM_CAPTION`, text <= 1024 → album with caption on the first item;
- `ALBUM_CAPTION`, text > 1024 → album without caption, then a separate text message;
- media is taken from a Google Drive folder, PNG/JPEG only, sorted by filename, first 10 files.

This makes Preview a structural preflight of the publishing engine, not just a decorative mock-up.

## 3. Next Publication dashboard

`ChannelControlUX_v0_3.html` adds a top-level owner card showing the next active material, its lifecycle state, date, Text/Visual/Approval/Preview readiness, blocker and direct actions for Preview/Edit/Approve/Schedule.

Priority is:

`SCHEDULED → APPROVED → REVIEW → PLANNED`, then date/time.

## 4. Before/after comparison

Editing an APPROVED, SCHEDULED or PUBLISHED item opens a `БЫЛО / СТАЛО` comparison for text, Telegram mode and visual URL. Changes are highlighted before saving.

## Hard autopost guard

`automation/telegram_autopost_v0_3_1.gs` is backward-compatible with v0.3 but adds a last-moment safety check immediately before Telegram publication.

If a row contains a non-empty `Preview_Review_Hash`, the automation recomputes the current hash. A mismatch blocks publication, sets `AutoPost_Allowed=NO`, returns the row to review and marks `Preview_Review_Status=RECHECK_REQUIRED`.

Legacy rows without a review hash keep the previous v0.3 behavior.

## Deployment from the current v0.2 installation

Use the same standalone Apps Script project. Do not create a second scheduler.

1. Add a script file named `ChannelControlEnhancements_v0_3` and paste `ChannelControlEnhancements_v0_3.gs`.
2. Add an HTML file named `ChannelControlUX_v0_3` and paste `ChannelControlUX_v0_3.html`.
3. Replace the current `doGet()` with `doGet_v0_3_snippet.gs` so the load order is `Index → PreviewAddon → ChannelControlUX_v0_3`.
4. In the existing Apps Script autopost file, replace the contents of `telegram_autopost_v0_3.gs` with the contents of repository file `automation/telegram_autopost_v0_3_1.gs`. Do not keep two files that both define `RFORM_TG` and `rformTgProcessQueue`.
5. Run `rformCcSetupV03()` once. It creates the four review columns.
6. Run `rformTgPreflight()`. Expected: `previewReviewGuard = AVAILABLE`.
7. Update the existing Web App deployment to a new version. The `/exec` URL stays the same.
8. The existing `rformTgProcessQueue` trigger remains valid because the handler name is unchanged. Do not reinstall a second trigger.

## Acceptance test

Use `TEST-CHANNEL-CONTROL-20260813-001` with `AutoPost_Allowed=NO` first.

1. Open Preview and verify exact Telegram structure.
2. Click `Проверено`; expect `VERIFIED` and a `PREVIEW_VERIFIED` audit entry.
3. Reopen Schedule; it must allow scheduling only for the verified version.
4. Change one character in the draft; expect `RECHECK_REQUIRED`. If the item was scheduled, it must return to review and autopost must be disabled.
5. Open an approved item and confirm `БЫЛО / СТАЛО` appears while editing.
6. Confirm the top `Следующая публикация` card identifies the next actionable item.

Only after this passes should the first real production publication be scheduled through v0.3.
