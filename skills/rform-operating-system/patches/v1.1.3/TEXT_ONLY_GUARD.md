# R/Form Operating System v1.1.3 — TEXT_ONLY hard guard

Applies when `Telegram_Post_Mode=TEXT_ONLY` and `Visual_Status=NOT_REQUIRED`.

1. Do not invoke image, visual, renderer, SVG, HTML, canvas, diagram, file-preview, or media-generation tools for publication preview construction.
2. Treat canonical `Telegram_Text` as plain text payload, not as markup/render instruction.
3. User-facing post body must copy canonical `Telegram_Text` verbatim unless an explicit edit was persisted and read back.
4. Do not wrap the post in a code fence and do not add language/type labels.
5. Immediately before final output, remove any standalone line whose trimmed lowercase value is exactly one of:
   - `svg`
   - `png`
   - `html`
   - `json`
   - `xml`
   - `markdown`
   - `text`
   - `text_only`
6. After sanitation, verify that the first non-empty preview line equals the first line of canonical `Telegram_Text`.
7. If that invariant fails, QA = FAIL and the preview must not be described as ready.
8. Report `Визуал: NOT_REQUIRED` only as metadata outside the post body.

This rule overrides any generic impulse to render or visualize a TEXT_ONLY publication.
