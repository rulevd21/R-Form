# Owner Workspace installation — 08.10.2026

Owner explicitly authorized PR17 merge, existing Content API 0.6.0 and Owner Bot 1.1.0 replacement/deployment, new-training draft enablement and acceptance without channel publication (conversation ID294 and subsequent owner authorization).

## Installed

- PR17 merged: b87e8164889b6d79124bea7aaac4a458aae7c809; exact candidate ede3cbc3095d914a5a99cb241817c0c4209ba3ba. CI run 37742412507 passed on candidate.
- Content API 0.6.0: existing project 1ov4yqO3IO9yFKJ0yeeQyPlv1Lz2k3v51EznWU7m1NuM3BeJFZbhf4QP9, deployment version14. Existing deployment ID and URL preserved.
- Owner Bot 1.1.0: existing project 1p2gTdvpAM5UYKZSsUSh4kBO4hG9trBNlg8LDcWU1Gnp6849yP-jHQFRA, deployment version6. Existing deployment ID and URL preserved.
- API source SHA256: 64560ce1e382fdafa263b0de14b57746bc5167f89b7a1ff7fbf8fbe6539f768a.
- Bot source SHA256: 5339addb4cfdfc895a1d2e91d6e1fa896dd073c8a99c3cb526b1273eff49968b.
- Live editor source copied back and compared exactly before both deployments. API rollback matched installed 0.5.7 SHA256 aa2fc8c98b8de3c9d93d57f0beedec8045e21ac2797e08ed334f814d61364621. Bot 1.0.5 rollback captured. Previous deployment versions13/5 retained.
- No Training, Detector, Autopost or schema change. Pairing, secrets, webhook and sent state retained. Install/Enable legacy functions not rerun.

## Runtime evidence (Europe/Moscow)

- 11:02:06–11:02:10 API preflight: ok=true, version0.6.0, publication.owner_workspace and publication.owner_preview_prepare present, all missing-fields lists empty, assets root accessible, queueRows31, trainingSessionRows51.
- 11:04:59 Bot preflight encountered transient Google ContentService result GET HTTP404 after successful POST redirect. Only read-only preflight repeated; no state-changing request replayed.
- 11:05:52–11:06:01 Bot preflight passed: version1.1.0, API0.6.0, queue31, owner paired, one poll trigger, bot/actions enabled, webhook configured with zero pending updates and no last error.
- 11:07:00–11:07:04 API training drafts enabled using baseline helper.
- 11:10:54 Bot training drafts enabled. No new trigger created.
- 11:11:51 automatic time-triggered Poll completed in22.915s; read trace version1.1.0 stageDONE outcomeOK, HTTP200 JSON, no poll error. This was the existing scheduled poll, not a manually simulated trigger.
- 11:12:33 canonical/settings readback: API draft flagYES, baseline49 closed sessions, current49 closed sessions, queue31. No historical draft created. Series6 remainsHOLD/AutoPostNO; series7 remainsPUBLISHED/AutoPostNO.
- 11:14:19 Bot readback: draft flagYES, API0.6.0, queue31, work12, held3, published15, one poll trigger. Menu delivered privately to paired owner using existing WorkspaceMenu function; Telegram API returned success. Owner receipt/interaction has not yet been confirmed.
- Diagnostic helpers were added as separate editor files for verification, without redeploying Web Apps or modifying canonical content. API helper is read-only; Bot helper reads and sends the private navigation menu, never publishes or approves.

## Acceptance still pending

- Delivery of a draft from the next genuine newly closed training: no eligible new training existed after baseline. No fictional training created.
- Actual owner phone interaction through deployed webhook: navigation, search, text edit/review/save, photo upload/order/replacement, versions, HOLD/reminder/return. These passed offline harness but have not all been accepted on production runtime.
- Automatic AI model worker remains absent. Request/proposal/review contract exists; do not claim automated AI editing is installed.
- Existing intermittent ContentService response failures and observed read latency remain. Unknown outcomes must be inspected without replaying mutations.

No post was approved, scheduled or published during installation/acceptance. Existing canonical content and publication states retained.
