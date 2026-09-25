# Regression matrix: TRAINING_CLOSE / Completed_At

Use a non-production fixture first.

| Case | Action | Expected |
|---|---|---|
| Normal close | Save all planned sets, finish once | CLOSED, Completed_At populated, one APPLIED close |
| Warning close | Leave intentional plan omissions, finish | CLOSED, Completed_At populated, WARNING/APPLIED close |
| Retry | Repeat same requestId after successful close | idempotentReplay=true, no second close row, timestamp unchanged |
| Broken replay fixture | APPLIED close exists but Completed_At blank | request fails closed; must not claim successful replay |
| Duplicate guard | Duplicate session row or close event | operation blocked according to existing duplicate rules |
| Schema guard | Completed_At missing from current schema contract | preflight/write blocked before production enable |
| Day isolation | Finish training | DAILY.Day_Status unchanged |
| Nutrition isolation | Finish training | nutrition sheets unchanged |
| Plan isolation | Finish training | TRAINING_PLAN unchanged |
| Set isolation | Finish training | no TRAINING_SETS mutation caused by timestamp patch |

## Production smoke acceptance

For the first planned session after deployment, verify from master data:

- the close audit is `APPLIED`;
- `Session_Status=CLOSED`;
- `Completed_At` is populated immediately, without reconciliation;
- the app renders the session as completed;
- one immediate refresh still renders completed;
- one retry/reload does not create another `TRAINING_CLOSE`.

If any invariant fails, rollback the Apps Script deployment to the immediately
previous version and leave the reconciliation tool available as containment.
