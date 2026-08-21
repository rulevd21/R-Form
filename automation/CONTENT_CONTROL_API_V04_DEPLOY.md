# R/Form Content Control API v0.5 — production update

Цель: включить автоматический маршрут **новая тренировка → готовые варианты → одно согласование → Telegram Autopost**.

## Что уже подготовлено

- Streamlit v0.5.1 в ветке `agent/content-control-streamlit-readonly`;
- `DATA_EVENTS` расширен owner-полями;
- приватная папка `RFORM_SYSTEM / CONTENT_ASSETS` создана;
- backend: `automation/content_control_api_v0_4.gs`;
- CI: Apps Script syntax + 42 unit/contract tests — PASS.

## Единственный ручной deployment gate

1. Откройте существующий standalone Apps Script-проект Content Control API.
2. Откройте `automation/content_control_api_v0_4.gs` из GitHub.
3. В Apps Script замените текущий код Content Control API целиком на опубликованный код v0.5.
   - Не держите две версии одновременно: обе содержат `doPost/doGet`.
   - Не запускайте `rformContentApiV04CreateSecret()` — старый секрет сохраняется.
4. Сохраните проект.
5. Запустите вручную `rformContentApiV04Preflight()`.
6. Если Google запросит доступ к Drive, разрешите: он нужен только для приватного `CONTENT_ASSETS`.
7. Проверьте результат:

```text
ok: true
version: 0.5.0
assetsRootAccessible: true
secretConfigured: true
telegramCallsPresent: false
scheduledStatusCanBeWritten: true
scheduledRequiresExplicitOwnerApproval: true
capabilities:
  content.read
  content.action
  event.review
  event.decision
  event.media
  training.read
  publication.propose
  publication.approve_schedule
```

8. Apps Script → Deploy → Manage deployments → существующий Web App → Edit → New version → Deploy.
9. URL `/exec` не менять. Streamlit Secrets не менять.
10. Откройте Streamlit → `Система` → `Обновить данные`.

Production gate считается пройденным, если:

- шапка показывает `АВТОМАТИЧЕСКИЙ РЕЖИМ · v0.5.1`;
- диагностика показывает `training.read`, `publication.propose`, `publication.approve_schedule`;
- раздел `Сегодня` показывает тренировку C от 21.08.2026 и два готовых варианта;
- кнопка `Согласовать и отправить` активна.

## Проверка перед первой отправкой

До нажатия кнопки откройте отдельный проект Telegram Autopost и выполните `rformTgPreflight()`. Требуются:

- `autopublishEnabled: YES`;
- `triggerExists: true`;
- `missingAutopostHeaders: []`.

После этого откройте раздел `Сегодня`, сравните два готовых текста и нажмите **«Согласовать и отправить»** только для выбранного варианта. Строка получит `SCHEDULED`, а отдельный Telegram Autopost отправит её в течение пяти минут и запишет ссылку на публикацию.
