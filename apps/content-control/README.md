# R/Form · Управление контентом v0.4

Приватная русскоязычная панель для контроля подготовки и публикации контента. Источник истины остаётся в `RFORM_MASTER_DATA_v1`; приложение не публикует в Telegram само.

## Главное изменение v0.4

Добавлен рабочий раздел **«Предложения»** для событий Event Detector.

В одной карточке владелец может:

- увидеть сильное необработанное событие из `DATA_EVENTS`;
- самостоятельно поправить «Факт для публикации» и «Главную мысль» без изменения исходной записи Event Detector;
- добавить комментарий к будущему материалу;
- прикрепить JPG/PNG/WEBP или MP4/MOV до 30 МБ на файл;
- получить отдельной кнопкой готовый промпт для ChatGPT на сопроводительную инфографику R/Form;
- выбрать одно из трёх решений: **«В публикацию» / «В Weekly» / «Пропустить»**.

Файлы сохраняются приватно в Google Drive: `RFORM_SYSTEM / CONTENT_ASSETS / <Event_ID>`.

### Что делает «В публикацию»

Создаёт один детерминированный материал в `CONTENT_QUEUE` со статусом `PLANNED`. Событие не публикуется автоматически: текст, визуал, QA и утверждение проходят обычный контентный pipeline.

### Что делает «В Weekly»

Фиксирует решение владельца в `DATA_EVENTS.Owner_Review_Status = WEEKLY`. Новый материал в `CONTENT_QUEUE` не создаётся.

### Что делает «Пропустить»

Фиксирует `DISMISSED`, после чего событие исчезает из рабочего списка предложений. Исходная запись Event Detector сохраняется.

## Безопасность данных

Исходные поля Event Detector остаются неизменяемыми из интерфейса. Редактор пишет только в отдельные owner-поля:

- `Owner_Fact`
- `Owner_Angle`
- `Owner_Note`
- `Owner_Media_URLs`
- `Owner_Media_Folder_URL`
- `Owner_Review_Status`
- `Owner_Updated_At`

Все write-операции подписываются HMAC, имеют короткое окно действия и отдельный `Action_ID`. События и медиа журналируются в `EVENT_ACTION_LOG`. Вызовов Telegram в Content Control API нет.

## Возможности API v0.4

- `content.read`
- `content.action`
- `event.review`
- `event.decision`
- `event.media`

Шлюз не устанавливает `SCHEDULED`, `PUBLISHING` или `PUBLISHED`.

## Обновление существующего Apps Script

Используйте `../../automation/content_control_api_v0_4.gs` вместо v0.3 в существующем standalone Apps Script-проекте Content Control.

Важно:

1. Не создавайте новый секрет. v0.4 использует то же Script Property `RFORM_CONTENT_API_SECRET`.
2. Замените код v0.3 на v0.4; не оставляйте два `doPost/doGet` одновременно.
3. Выполните `rformContentApiV04Preflight()` и разрешите доступ к Google Drive, если Apps Script запросит его.
4. Результат должен содержать `ok: true`, `version: 0.4.0`, `assetsRootAccessible: true` и пять capabilities.
5. Обновите существующий Web App deployment новой версией. URL `/exec` должен остаться тем же.
6. Streamlit Secrets менять не требуется, если URL и секрет не изменились.

## Локальный запуск

```bash
cd apps/content-control
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
streamlit run app.py
```

Без `secrets.toml` приложение запускается в режиме `DEMO / FIXTURE`.

## Streamlit Community Cloud

- Repository: `rulevd21/R-Form`
- Branch: `agent/content-control-streamlit-readonly` до merge, затем `main`
- Main file path: `apps/content-control/app.py`
- Access: Private

После обновления backend на экране «Диагностика» должны отображаться capabilities `event.review`, `event.decision` и `event.media`, а в шапке — `КОНТЕНТ + СОБЫТИЯ · v0.4`.

## Проверка

```bash
cd apps/content-control
python -m unittest discover -s tests -v
```
