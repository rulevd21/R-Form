# R/Form Content Control API v0.4 — production update

Цель: включить упрощённый ежедневный экран «Сегодня» с одним предложением и тремя редакционными решениями. Редактирование и медиа остаются дополнительными функциями.

## Что уже подготовлено

- Streamlit v0.4.3 в ветке `agent/content-control-streamlit-readonly`;
- `DATA_EVENTS` расширен owner-полями;
- приватная папка `RFORM_SYSTEM / CONTENT_ASSETS` создана;
- backend: `automation/content_control_api_v0_4.gs`;
- CI: Apps Script syntax + 34 unit/contract tests — PASS.

## Единственный ручной deployment gate

1. Откройте существующий standalone Apps Script-проект, который сейчас обслуживает Content Control API v0.3.
2. Откройте `automation/content_control_api_v0_4.gs` из GitHub.
3. В Apps Script замените текущий код Content Control API v0.3 целиком на v0.4.
   - Не держите v0.3 и v0.4 одновременно: оба содержат `doPost/doGet`.
   - Не запускайте `rformContentApiV04CreateSecret()` — старый секрет сохраняется.
4. Сохраните проект.
5. Запустите вручную `rformContentApiV04Preflight()`.
6. Если Google запросит доступ к Drive, разрешите: он нужен только для приватного `CONTENT_ASSETS`.
7. Проверьте результат:

```text
ok: true
version: 0.4.0
assetsRootAccessible: true
secretConfigured: true
telegramCallsPresent: false
scheduledStatusCanBeWritten: false
capabilities:
  content.read
  content.action
  event.review
  event.decision
  event.media
```

8. Apps Script → Deploy → Manage deployments → существующий Web App → Edit → New version → Deploy.
9. URL `/exec` не менять. Streamlit Secrets не менять.
10. Откройте Streamlit → `Система` → `Обновить данные`.

Production gate считается пройденным, если:

- шапка показывает `ЕЖЕДНЕВНЫЙ РЕЖИМ · v0.4.3`;
- диагностика показывает `event.review`, `event.decision`, `event.media`;
- раздел `Сегодня` показывает одно предложение без ошибки;
- кнопки `Добавить в публикации`, `Сохранить для недельного обзора` и `Не использовать` активны.

## Первый smoke test

Используйте одно неважное открытое событие:

1. откройте раздел `Сегодня`;
2. проверьте показанные `Факт` и `Главная мысль`;
3. выберите `Сохранить для недельного обзора`;
4. обновите данные;
5. убедитесь, что предложение исчезло из входящих, исходное `Fact` не изменилось, а `Owner_Review_Status` получил значение `WEEKLY`.

После этого контур ежедневных решений v0.4 можно считать активным. Загрузку медиа следует тестировать отдельно только тогда, когда она действительно потребуется для материала.
