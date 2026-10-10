# Owner Bot Cockpit v1.3 — production acceptance · 2026-10-10

## Scope

Production acceptance for the Owner Bot v1.3 daily cockpit: one private owner screen aggregating Closure, DATA_EVENTS and Content Queue while surfacing only owner-required decisions.

## Source and rollout chain

- PR #35: Owner Bot Cockpit v1.3 candidate and guarded in-place rollout.
- PR #39: owner-visible `/today` stage diagnostics after the first Phase E smoke exposed a silent failure.
- PR #40: `/today` read-model changed to direct read-only canonical reads for CONTENT_QUEUE, DATA_EVENTS and DAY_CLOSURE; owner mutations remain behind Content Control API.
- Accepted repository source ref: `3bce04b04aeba9ab1f31c3aac1db79510b4b4512`.

## Runtime evidence

The v1.3 rollout used the existing private Owner Bot Apps Script web-app deployment in place. Guarded rollout evidence established source readback, stable deployment identity and a live v1.3 web-app banner. Later hotfixes retained the same deployment model and did not create a second publisher, datastore or Owner Bot.

The final private owner smoke on 2026-10-10 sent `/today` and successfully rendered:

- `R/Form · Сегодня`;
- current Closure state;
- DATA_EVENTS count and owner-gate count;
- Content Queue count and final-preview count;
- owner-required actions only, capped at three visible actions;
- `Обновить` and `Материалы` controls.

The smoke did not press any owner-decision button and performed no canonical or publication mutation.

## Acceptance result

`VERIFIED_PRODUCTION`

Owner Bot Cockpit v1.3 is accepted as the daily owner cockpit. Read-side aggregation is read-only against canonical Master Data. Existing Content Control API remains the mutation boundary for owner actions, and Telegram Autopost remains the only publication transport.
