# R/Form Content Read API v0.1

Защищённый шлюз только для чтения между `RFORM_MASTER_DATA_v1` и приватным приложением «Управление контентом». Не требует консоли Google Cloud, сервисного аккаунта или OAuth-клиента.

## Модель безопасности

- отдельный standalone Apps Script проект;
- web app выполняется от имени владельца таблицы;
- `GET` никогда не возвращает данные;
- `POST` подписывается HMAC-SHA256;
- запрос действует 5 минут и содержит одноразовый nonce;
- повтор запроса блокируется через Apps Script Cache;
- секрет хранится только в Script Properties и Streamlit Secrets;
- API выдаёт только белый список полей из `CONTENT_QUEUE` и `DATA_EVENTS`;
- код не содержит операций записи в Google Таблицы.

## Установка

1. Открыть `https://script.google.com` и создать новый проект `RFORM_CONTENT_READ_API_v0_1`.
2. Заменить содержимое `Code.gs` кодом из `content_read_api_v0_1.gs`.
3. В настройках проекта установить часовой пояс `Europe/Riga`.
4. Запустить `rformContentApiCreateSecret` и предоставить требуемые разрешения.
5. Скопировать значение `RFORM_CONTENT_API_SECRET` из журнала выполнения напрямую в Streamlit Secrets. Не передавать его в чат и не сохранять в GitHub.
6. Запустить `rformContentApiPreflight`. Ожидается `ok: true` и `secretConfigured: true`.
7. Нажать `Deploy → New deployment → Web app`.
8. Установить `Execute as: Me`, `Who has access: Anyone`.
9. Скопировать URL вида `https://script.google.com/macros/s/.../exec`.

Публичный URL сам по себе не открывает данные: доступ требует подписанного POST-запроса. При каждом изменении кода необходимо создать новую версию deployment.

## Streamlit Secrets

```toml
[app]
data_mode = "apps_script"
apps_script_url = "https://script.google.com/macros/s/PASTE_DEPLOYMENT_ID/exec"
request_timeout_seconds = 20

[content_api]
secret = "PASTE_RFORM_CONTENT_API_SECRET"
```

После сохранения секретов приложение должно показать источник `Apps Script / только чтение`. Если рабочий запрос настроен, но отклонён, приложение останавливается и не подменяет ошибку демонстрационными данными.

## Ротация секрета

1. Повторно запустить `rformContentApiCreateSecret`.
2. Сразу заменить `content_api.secret` в Streamlit Secrets.
3. Перезапустить приложение и проверить экран «Диагностика».

Старый секрет становится недействительным сразу после генерации нового.
