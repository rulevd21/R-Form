# R/Form Content Control v0.1

Приватная read-only панель для контроля подготовки и публикации контента. Она читает `CONTENT_QUEUE` и `DATA_EVENTS` из мастер-таблицы, но не изменяет Google Sheets и не обращается к Telegram API.

## Что уже есть

- сводка по материалам, требующим действия;
- следующая публикация по приоритету `SCHEDULED → APPROVED → REVIEW → PLANNED`;
- фильтруемая очередь и карточка материала;
- рейтинг событий из `DATA_EVENTS`;
- диагностика обязательных полей и повторяющихся идентификаторов;
- явный demo-режим на синтетических данных;
- подписанное read-only подключение через Google Apps Script без Google Cloud.

## Локальный запуск

```bash
cd apps/content-control
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
streamlit run app.py
```

Без `secrets.toml` приложение запускается в режиме `DEMO / FIXTURE`.

## Подключение Google Sheets без Google Cloud

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

После первого запуска проверьте, что в верхней строке указан `APPS SCRIPT / READ ONLY`, а не `DEMO / FIXTURE`, и что экран «Диагностика» не сообщает об отсутствующих обязательных полях.

## Проверка

```bash
cd apps/content-control
python -m unittest discover -s tests -v
```
