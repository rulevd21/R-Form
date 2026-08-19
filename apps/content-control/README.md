# R/Form · Управление контентом v0.2

Приватная панель только для чтения, предназначенная для контроля подготовки и публикации контента. Она читает листы `CONTENT_QUEUE` и `DATA_EVENTS` из мастер-таблицы, но не изменяет Google Таблицы и не обращается к API Telegram.

## Что уже есть

- сводка по материалам, требующим действия;
- следующая публикация по приоритету `SCHEDULED → APPROVED → REVIEW → PLANNED`;
- русскоязычный интерфейс, фильтруемая очередь и карточка материала;
- рабочая очередь без опубликованных и закрытых материалов по умолчанию;
- операционная сортировка по срочности и ближайшей дате;
- финальные статусы не переопределяются устаревшими блокировками;
- рейтинг событий из `DATA_EVENTS`;
- диагностика обязательных полей и повторяющихся идентификаторов;
- явный демонстрационный режим на синтетических данных;
- подписанное подключение только для чтения через Google Apps Script без Google Cloud.

## Локальный запуск

```bash
cd apps/content-control
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
streamlit run app.py
```

Без `secrets.toml` приложение запускается в режиме `DEMO / FIXTURE`.

## Подключение Google Таблиц без Google Cloud

1. Развернуть `../../automation/content_read_api_v0_1.gs` как отдельный Apps Script web app.
2. Выполнить инструкцию `../../automation/CONTENT_READ_API.md`.
3. Скопировать `.streamlit/secrets.example.toml` в `.streamlit/secrets.toml`.
4. Заполнить deployment URL и общий секрет.
5. Перезапустить приложение и проверить экран «Диагностика».

Файл `.streamlit/secrets.toml` исключён из Git. API-секрет нельзя передавать в чат или добавлять в репозиторий. Telegram-токен этому приложению не требуется.

## Streamlit Community Cloud

- Repository: `rulevd21/R-Form`
- Branch: ветка этого PR, затем `main` после проверки
- Main file path: `apps/content-control/app.py`
- Secrets: содержимое локального `.streamlit/secrets.toml`
- Доступ к приложению: Private

После первого запуска проверьте, что в верхней строке указан источник `Apps Script / только чтение`, а не `Демо / тестовые данные`, и что экран «Диагностика» не сообщает об отсутствующих обязательных полях.

## Проверка

```bash
cd apps/content-control
python -m unittest discover -s tests -v
```
