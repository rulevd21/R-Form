# Weekly Workflows

Weekly reporting is an aggregate workflow over canonical daily/training/nutrition/measurement/decision facts. It must not become a second fact store.

## WEEKLY_BUILD — Сформируй Weekly Report

1. Resolve the exact reporting period.
2. Confirm which days/sessions are closed and list any data gaps.
3. Read:
   - DAILY / DAY_CLOSURE;
   - NUTRITION_DAILY;
   - TRAINING_SESSIONS / TRAINING_SETS;
   - MEASUREMENTS;
   - active DECISIONS and plan changes.
4. Compare the period with the previous comparable report/checkpoint.
5. Build or update the existing versioned Weekly artifact as DRAFT.
6. Separate source facts from interpretation and next decision.
7. If the Weekly also becomes a content item, hand it to the content workflow; do not publish from the weekly workflow itself.

## WEEKLY_DIFF — Что изменилось с прошлого отчёта?

Return only material deltas:

- performance/plan;
- weight/body metrics;
- nutrition adherence;
- recovery/pain;
- decisions;
- unresolved data quality issues.

No write.

## WEEKLY_CLOSE — Закрой неделю

Because there is not yet a single canonical weekly-state field:

1. require complete/explicitly accepted input coverage;
2. identify the exact Weekly artifact/version being closed;
3. preserve its review/approval evidence;
4. never invent a MASTER_DATA state write;
5. if publication is requested separately, route the exact approved object to CONTENT_QUEUE/publication workflow.

The lack of a single weekly state owner is a P1 contract gap. Fix it by choosing one existing owner/contract, not by adding parallel state tables.
