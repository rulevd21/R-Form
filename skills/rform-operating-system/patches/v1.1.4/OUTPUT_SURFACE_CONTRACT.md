# v1.1.4 — TEXT_ONLY output surface contract

When `Telegram_Post_Mode=TEXT_ONLY` and `Visual_Status=NOT_REQUIRED`:

1. The full Telegram post is a finished reusable social post.
2. If writing blocks are supported, emit the post body in exactly one `social_post` writing block.
3. Put Content_ID, statuses, QA, visual metadata, rationale and owner action outside the writing block.
4. Inside the writing block put only canonical `Telegram_Text` verbatim, unless an explicit edit was persisted and read back.
5. Do not use fenced code blocks, language identifiers, SVG/code renderers, image/artifact/canvas surfaces, diagrams, HTML previews, or media-generation paths.
6. If writing blocks are unavailable, use plain prose text only.
7. A standalone renderer/type token such as `svg` is a hard PREVIEW QA failure.
8. The first visible character of the post body must be the first character of canonical `Telegram_Text`.

This is an output-surface rule, not merely a token sanitizer.
