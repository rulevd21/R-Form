# R/Form Intent Map

Route semantically. Exact phrases are examples, not a parser grammar.

| User command / intent | Intent | Domain | Canonical workflow | State-changing |
|---|---|---|---|---|
| Открой день | DAY_OPEN | Daily | workflows-day-nutrition | Yes |
| Добавь завтрак / обед / ужин / перекус | MEAL_ADD | Nutrition | workflows-day-nutrition | Yes |
| План/факт по дню | DAY_PLAN_FACT | Daily/Nutrition | workflows-day-nutrition | No |
| Сколько осталось КБЖУ? | NUTRITION_REMAINING | Nutrition | workflows-day-nutrition | No |
| Закрой день | DAY_CLOSE | Daily | workflows-day-nutrition | Yes |
| Добавь тренировку | TRAINING_ADD | Training | workflows-training | Yes |
| Обнови статус подготовки | PREP_STATUS | Preparation | workflows-training | No unless an explicit decision is approved |
| Составь следующую тренировочную неделю | TRAINING_WEEK_DRAFT | Training | workflows-training | Draft only |
| Обнови план | TRAINING_PLAN_UPDATE | Training | workflows-training | Yes after validation |
| Что сегодня? | TODAY_STATUS | Cross-domain | day/training + source map | No |
| Сформируй Weekly Report | WEEKLY_BUILD | Weekly | workflows-weekly-content | Draft/update report |
| Закрой неделю | WEEKLY_CLOSE | Weekly | workflows-weekly-content | Yes after completeness checks |
| Что изменилось с прошлого отчёта? | WEEKLY_DIFF | Weekly | workflows-weekly-content | No |
| Проверь корректность данных | DATA_QA | Data quality | data-quality-rules | No, except explicit non-destructive reconciliation |
| Проверь очередь публикаций | CONTENT_QUEUE_CHECK | Content | workflows-content-production | No |
| Обнови контент-очередь | CONTENT_QUEUE_REFRESH | Content | workflows-content-production | Non-destructive classification only |
| Убери устаревший материал из очереди | CONTENT_SUPERSEDE | Content | workflows-content-production | Yes; supersede/hold, never delete history |
| Что публикуем сегодня? | CONTENT_TODAY_RECOMMEND | Content | workflows-content-production | No |
| Подготовь публикацию | PUBLICATION_PREPARE | Content/Publication | workflows-content-production | Draft/package only |
| Покажи предпросмотр | PUBLICATION_PREVIEW | Publication | workflows-content-production | No |
| Измени публикацию | PUBLICATION_EDIT | Publication | workflows-content-production | Yes, exact candidate only |
| Утверждаю публикацию | PUBLICATION_APPROVE | Publication | workflows-content-production | Approval only through canonical path |
| Утверждаю на <date/time> | PUBLICATION_APPROVE_SCHEDULE | Publication | workflows-content-production | Approval + schedule for exact preview |
| Опубликуй | PUBLICATION_PUBLISH | Publication or Code Release | resolve object type first | External side effect; explicit approval required |
| Что требует моего решения? | OWNER_DECISIONS | Cross-domain | domain workflow | No |
| Как отработал контент? | CONTENT_PERFORMANCE_REVIEW | Content Analytics | workflows-content-production | No |
| Публикуй vX.Y.Z | RELEASE_PUBLISH | Code Release if version belongs to an app | workflows-code-release | Gated |

## Router rule

The R/Form Operating System remains the single command router. Do not create another top-level router.

A domain reference file is the current implementation unit. Split a domain into a separate specialized Skill only when all are true:

1. the domain contract is stable;
2. the responsibility boundary is non-overlapping;
3. the Operating System can call it without duplicating business logic;
4. tests demonstrate backward-compatible routing;
5. the split reduces maintenance or execution complexity.

Until then, preserve the existing short-command interface.
