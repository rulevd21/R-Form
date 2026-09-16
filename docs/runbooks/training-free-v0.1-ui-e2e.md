# R/Form FREE training v0.1 — sandbox UI E2E

## Preconditions

- FREE-02 runtime acceptance is PASS.
- FREE-03 writer E2E is PASS.
- Sandbox Apps Script project only.
- Sandbox datastore only: `RFORM_MASTER_DATA_SANDBOX_v0_1__2026-08-09`.
- Production Training Mobile v2.1, production datastore and `main` remain unchanged.

## Deploy sandbox UI

Update the existing sandbox web-app deployment only. Do not create or update a production deployment.

The deployed sandbox code must include:

- `Code.gs` with `TrainingFreeSession.html` injection;
- `TrainingFreeClientService.gs`;
- `TrainingFreeOrderService.gs`;
- `TrainingFreeSession.html`;
- previously accepted FREE backend files.

## Manual acceptance scenario

1. Open the sandbox web-app URL.
2. Verify the existing planned-training card still renders as before.
3. Verify a second action appears: `Свободная тренировка`.
4. Start FREE training without a TRAINING_PLAN row.
5. Verify timer starts and session state is `DRAFT` / `FREE`.
6. Add an exercise from history/search and save a WARMUP set with RIR blank.
7. Add a WORKING set with KG load and required RIR.
8. Add or edit a BW set and verify kg is not fabricated.
9. Add or edit a LEVEL set and verify kg is not fabricated.
10. Add or edit a BW_PLUS_KG set and verify additional load is preserved.
11. Edit an existing set and verify the card updates after save.
12. Delete a set and verify remaining set numbers are contiguous.
13. Add a trainer comment to an exercise.
14. Add a second exercise and reorder the two exercise cards.
15. Reload the browser before completion and verify the active FREE session resumes with persisted sets/comments/order.
16. Open the finish summary and verify exercise count, warmup count, working count and best-set display.
17. Complete the session and verify state becomes `CLOSED` and editing controls are disabled.
18. Verify `TRAINING_SESSIONS` contains one FREE row for the manual scenario and `TRAINING_SETS` contains the saved facts.
19. Verify corresponding `TRAINING_FREE_*` events exist in `INBOX_LOG` with `Applied_By=OWNER`, `Source_Chat=RFORM_MOBILE`, and no duplicate flags.
20. Verify `TRAINING_PLAN` is unchanged.
21. Reload Today and verify the planned A/B/C read model still resolves the legacy planned session, not the FREE session.
22. Run `runTrainingFreeFoundationRegression()` and require PASS after the UI scenario.

## Acceptance result

PASS requires every step above to pass. Any browser error, write validation error, duplicate flag, lost active state, plan mutation, or legacy read-model regression is a blocker.

Keep PR #10 Draft until this UI E2E is complete.
