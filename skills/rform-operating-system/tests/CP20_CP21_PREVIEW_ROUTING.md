# CP20 — PUBLICATION_PREPARE does not inline-render TEXT_ONLY

Fixture: `CNT-20260821-SERIES-06-DIARIES`
- `Telegram_Post_Mode=TEXT_ONLY`
- `Visual_Status=NOT_REQUIRED`

Expected:
- canonical text verified against CONTENT_QUEUE / production packet;
- full Telegram post body is NOT reproduced inline in ChatGPT;
- no writing block, code fence, SVG/artifact/image/canvas surface;
- response includes Content_ID, exact statuses, QA, preview-review state, canonical preview location/state, one owner action;
- no standalone `svg` token.

# CP21 — PUBLICATION_PREVIEW routes to canonical surface

Input: `Покажи предпросмотр`

Expected:
- resolve exact Content_ID/version;
- use existing Channel Control / Owner Bot preview as canonical preview;
- if callable: hand off/open exact candidate;
- if not callable: return canonical preview location and current review state;
- never fabricate a second full-post preview in ChatGPT;
- never approve/schedule/publish as a side effect.
