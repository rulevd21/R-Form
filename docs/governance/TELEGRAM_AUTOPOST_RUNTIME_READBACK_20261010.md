# Telegram Autopost v0.3.2 runtime continuity — 2026-10-10

## Scope

Read-only refresh of Telegram Autopost production provenance. No Apps Script source, trigger, Script Property, `CONTENT_QUEUE` row, Telegram message, endpoint or deployment was changed.

## Evidence

Authenticated `clasp` readback located exactly one accessible Apps Script project matching the v0.3.2 source contract:

- `rformTgProcessQueue` present;
- `version: '0.3.2'` present;
- `reviewHashContract: 'V1_TEXT_VISUAL_URL'` present.

Safe readback values:

- live source SHA-256: `c6653ce1c87cd9bd8e77d02017a06d9cee8ef38af748a945c0176cbb1d5224b6`;
- accepted source SHA-256: `c35e82c69168dfc278b6e6245bdb8eb7b8176992782ba8609364acd1aebd7a56`;
- accepted source commit: `9fea95e11aab60dc7fe28277fa3aaedbb11c2c10`;
- accepted source path: `automation/telegram_autopost_v0_3.gs`.

The strict byte comparison failed. A second read-only diff inspection showed that all differences are comment-only: 14 diff lines consisting of comment text/escaping and added trailing comments. Executable logic is unchanged. No source-code statement, function body, constant value or publication guard differs from the accepted v0.3.2 implementation.

Therefore:

- byte continuity: **NO**;
- semantic/executable continuity: **YES**;
- production version continuity: **YES — v0.3.2**;
- runtime mutation during verification: **NONE**.

`rformTgPreflight()` was not executed because the original strict byte gate stopped before that step. No API-executable endpoint was created solely for verification.

## Acceptance continuity

The production acceptance recorded in PR #6 on 2026-08-25 remains applicable because the executable v0.3.2 logic is unchanged. That acceptance completed a real end-to-end publication path:

`OWNER_FINAL_PREVIEW → Owner Bot → approve → Content Control API → Telegram Autopost → PUBLISHED`

with Telegram writeback recorded as post #66. The same acceptance established the v0.3.2 review-hash contract:

`SHA256(trim(Telegram_Text) + "\n" + trim(Telegram_Visual_URL))`.

Fresh 2026-10-10 authenticated source readback plus the historical real E2E acceptance together provide current production continuity evidence.

## Classification

Telegram Autopost v0.3.2 is classified `VERIFIED_PRODUCTION` as of 2026-10-10.

The live comment-only drift is documented rather than rewritten in production because normalizing comments would create a production source mutation with no functional benefit.

## Safety conclusion

Do not redeploy or rewrite the live Apps Script merely to obtain byte equality. Future publisher-affecting changes must use a fresh runtime readback and normal acceptance gates.