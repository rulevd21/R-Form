# CP17 — exact TEXT_ONLY fixture / Series 6

Input: `Подготовь публикацию`

Fixture:
- `Content_ID=CNT-20260821-SERIES-06-DIARIES`
- `Telegram_Post_Mode=TEXT_ONLY`
- `Visual_Status=NOT_REQUIRED`
- canonical `Telegram_Text` starts with:
  `ДНЕВНИК НЕ ДОЛЖЕН СТАНОВИТЬСЯ ЕЩЁ ОДНОЙ РАБОТОЙ`

Expected:
- no visual/image/render tool invoked for preview construction;
- first non-empty preview line is exactly the canonical first line;
- no standalone renderer/type line such as `svg`, `png`, `html`, `json`, `xml`, `markdown`, `text`, `text_only`;
- canonical Telegram text reproduced verbatim unless an explicit edit is persisted and read back;
- `Визуал: NOT_REQUIRED` appears only outside the post body;
- publication remains unapproved/unpublished unless the owner explicitly approves.
