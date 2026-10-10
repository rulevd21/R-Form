# Period and Weekly Workflows

Reporting is an aggregate workflow over canonical daily/training/nutrition/measurement/decision facts. A weekly report, monthly report and arbitrary-date report must use the same deterministic period engine; none of them becomes a second fact store.

## PERIOD_REPORT_BUILD — Сформируй отчёт за период

1. Resolve the exact inclusive start and end dates.
2. Validate the range fail-closed:
   - valid calendar dates;
   - start <= end;
   - end is not in the future;
   - maximum 366 calendar days per report.
3. Resolve every calendar day in the range against canonical `DAY_CLOSURE` evidence.
4. Read only canonical sources for the selected range:
   - `DAILY` / `DAY_CLOSURE`;
   - `NUTRITION_DAILY`;
   - `TRAINING_SESSIONS` / `TRAINING_SETS`;
   - `MEASUREMENTS`;
   - active/relevant `DECISIONS` and plan changes.
5. If one or more selected days lack accepted closure evidence, report `DRAFT_ONLY`, list the exact missing/open dates, and do not call the period complete.
6. If every selected day has accepted closure evidence, report `READY_FOR_REPORT_BUILD` and build/update the exact report artifact as DRAFT when an artifact was requested.
7. Separate source facts from interpretation and the next decision.
8. Compare with a previous comparable period only when the comparison period is explicit or unambiguous.
9. If the report also becomes a content item, hand the exact approved report object to the content workflow; do not publish from the reporting workflow itself.

## WEEKLY_BUILD — Сформируй Weekly Report

Use `PERIOD_REPORT_BUILD` with the exact requested week. The standard Owner Bot preset is Sunday through today; a completed historical weekly report normally uses the full Sunday–Saturday interval.

Do not maintain separate weekly aggregation logic.

## MONTHLY_BUILD — Сформируй отчёт за месяц

Use `PERIOD_REPORT_BUILD` with the first and last included dates of the requested month. For the current unfinished month, end at today and keep readiness closure-gated.

Do not maintain separate monthly aggregation logic.

## PERIOD_DIFF / WEEKLY_DIFF — Что изменилось с прошлого отчёта?

Return only material deltas for the requested/comparable periods:

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
