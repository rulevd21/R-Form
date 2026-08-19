# R/Form Content Control API v0.4 — production update

Цель: включить в существующем Streamlit Channel Control раздел «Предложения» с редактированием событий, фото/видео и редакционными решениями.

## Что уже подготовлено

- Streamlit v0.4 в ветке `agent/content-control-streamlit-readonly`;
- `DATA_EVENTS` расширен owner-полями;
- приватная папка `RFORM_SYSTEM / CONTENT_ASSETS` создана;
- backend: `automation/content_control_api_v0_4.gs`;
- CI: Apps Script syntax + 32 unit/contract tests — PASS.

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
10. Откройте Streamlit → `Диагностика` → `Обновить данные`.

Production gate считается пройденным, если:

- шапка показывает `КОНТЕНТ + СОБЫТИЯ · v0.4`;
- диагностика показывает `event.review`, `event.decision`, `event.media`;
- раздел `Предложения` открывается без ошибки;
- кнопки записи и загрузки медиа активны.

## Первый smoke test

Используйте одно неважное открытое событие:

1. измените только `Главную мысль`;
2. нажмите `Сохранить изменения`;
3. обновите данные;
4. убедитесь, что исходное `Fact` в DATA_EVENTS не изменилось, а `Owner_Angle` заполнен;
5. при необходимости прикрепите небольшое JPG;
6. для первого теста выберите `В Weekly`, а не `В публикацию`.

После этого write/media слой v0.4 можно считать активным.