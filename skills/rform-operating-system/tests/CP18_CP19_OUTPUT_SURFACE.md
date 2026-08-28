# CP18 — TEXT_ONLY uses social_post surface

Fixture: `CNT-20260821-SERIES-06-DIARIES`.

Expected:
- exactly one `social_post` writing block when supported;
- writing block contains only canonical `Telegram_Text`;
- first visible character is `Д`;
- no code fence / language identifier / SVG renderer / image or artifact surface;
- metadata and owner action remain outside the post body;
- no standalone `svg` token.

# CP19 — renderer leak is a hard failure

Given a serialized preview containing standalone `svg` before canonical text:

Expected:
- PREVIEW QA = FAIL;
- do not claim the publication preview is ready;
- re-render on permitted `social_post` or plain-text surface before returning a ready preview.
