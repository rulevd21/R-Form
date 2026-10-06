# R/Form Owner Bot v1.0.3 · P0 Owner Inbox

## Текущая установленная версия: v1.0.3

Установлена 06.10.2026 в существующем Apps Script-проекте. WebApp обновлён с deployment version 2 до 3 на прежнем deployment ID и URL. Исходник после сохранения точно совпал с `automation/owner_bot_v1.gs` этой ветки:

SHA-256: `5ec48501dc86f7ff70ae7436910f0596e1472dd28ce412b7bb191fdafc0b319a`.

Live SelfTest PASS (17:32:14 Москва); действующий doGet показал `R/Form Owner Bot v1.0.3` (17:34:00). 11 офлайн-тестов: `node automation/tests/owner_bot_v1_callback.test.cjs`.

Регрессия: сохранены изменения установленной v1.0.1 относительно Git v1.0.0 — HtmlService-ответ webhook, max_connections=1 и дополнительные диагностические поля webhook. Исторический исходник заявленной в документации v1.0.2 не найден в проверенных источниках; v1.0.3 — новое исправление, не восстановление этого релиза.

### Callback error contract

Для корректного callback владельца обработчик при исключении пытается независимо записать `BOT_CALLBACK_ERROR / OUTCOME_UNKNOWN` в существующий аудит и отправить владельцу безопасное уведомление. Сырые ошибки в новые сообщения и audit не включаются. APPROVE/HOLD автоматически не повторяется. Если исключение возникло до handoff, операция не отправлена; после отправки запрос мог уже примениться. Владелец должен проверить текущий статус через /today или Content Control перед повторным действием. При недоступности Sheets/Telegram долговечная запись/доставка не гарантируется.

Production E2E новой error-ветки пока не подтверждён. Автоматические Poll после обновления наблюдены в 17:36:51, 17:41:51, 17:46:51 и 17:51:51. Последний имеет native completed (14.609 с), но лог содержит `Content Control API rejected request: Use a signed POST request.` Poll ловит исключение, поэтому native completed не доказывает функциональный успех. Статус: `POLL FAILED / API_READ`. API endpoint совпал с действующим deployment; после doPost 17:51:54 наблюдён doGet 17:52:05. Вероятна проблема redirect-маршрута; точные Location/status ещё не измерены. Нельзя повторять POST APPROVE/HOLD ради диагностики. Подготовленные отдельно probes: signed READ без replay и fixture callback exception до handoff; они пока не установлены. Историческая P0 acceptance не считается acceptance v1.0.3.

### Обновление существующей установки

Не повторять шаги первоначальной установки ниже. Сохранить baseline и настройки; заменить только исходный код, запустить чистый SelfTest, обновить существующее WebApp-развёртывание и проверить /exec. Сохранить URL, pairing, Script Properties и существующий trigger. Не запускать Install/Enable/SetWebhook при обычном обновлении.

### Откат кода v1.0.3

Сохранённый baseline v1.0.1 имеет SHA-256 `fef3b9207a5d73b968da1a323c63f6f752201ce46a1998726cbb524c7c883ced`. Для полного отката восстановить этот HEAD и прежнюю WebApp version 2 на том же deployment. Один возврат WebApp к version 2 не откатит clock-trigger, работающий на HEAD. Disable/DeleteWebhook ниже — аварийная остановка, а не восстановление предыдущего кода.

PR #6 остаётся draft/unmerged. Его существующая base — agent/content-control-streamlit-readonly. В текущем main Owner Bot отсутствует; этот PR не меняет активное Streamlit-приложение до разрешённого merge. Секреты и production URLs в Git не добавляются.

## Первоначальная установка P0 (только для новой установки)



## Назначение

Приватный Telegram-интерфейс владельца R/Form. Бот показывает только материалы, дошедшие до `Current_Stage = OWNER_FINAL_PREVIEW`, и оставляет владельцу два P0-действия: **Согласовать** или **Отложить**.

P0 не заменяет существующий backend:

`RFORM_MASTER_DATA_v1 → Content Control API → Owner Bot → owner decision → Telegram Autopost → @r_form`

Owner Bot **не публикует в канал напрямую**. Согласование выполняется через существующую подписанную операцию `queue_publication_approval`, после которой `telegram_autopost_v0_3.gs` остаётся единственным транспортом публикации.

## Что уже реализовано

- приватное pairing владельца по одноразовому 8-значному коду;
- webhook с отдельным секретом в URL;
- проверка Telegram `from.id` для каждого callback;
- polling `OWNER_FINAL_PREVIEW` раз в 5 минут;
- показ до 3 карточек + точного `Telegram_Text`;
- кнопка **Согласовать**;
- кнопка **Отложить**;
- stale-preview protection: callback привязан к fingerprint текста, статуса, URL визуала и фактического набора файлов;
- защита от повторной отправки одного и того же preview;
- durable audit-события `BOT_PREVIEW_SENT`, `BOT_APPROVE_CLICK`, `BOT_HOLD_CLICK`, `BOT_STALE_CALLBACK` в `CONTENT_ACTION_LOG` с `Actor = OWNER_BOT`;
- безопасный smoke-mode: после установки bot/actions остаются выключенными;
- `/today` для ручного повторного показа текущего готового материала;
- `/help` для краткой справки.

## Файл

`automation/owner_bot_v1.gs`

Разворачивается в **отдельном standalone Google Apps Script project**. Не добавляйте его в проект Content Control API или Telegram Autopost: у каждого из этих Web App/trigger-контуров должен оставаться свой `doPost` и свой набор секретов.

## 1. Создать Telegram-бота

Через `@BotFather` создать отдельного приватного служебного бота, например `RFormOwnerBot`.

Bot Token не публиковать, не сохранять в Google Sheets и не коммитить в GitHub.

## 2. Создать standalone Apps Script

1. Создать новый standalone Apps Script project, например `RFORM_OWNER_BOT_V1`.
2. Удалить содержимое `Code.gs`.
3. Скопировать туда **целиком** `automation/owner_bot_v1.gs`.
4. Сохранить.
5. Выполнить `rformOwnerBotV1SelfTest()`.

Ожидаемо:

```json
{
  "ok": true,
  "version": "1.0.3",
  "readyFilter": "PASS",
  "previewFingerprint": "PASS",
  "constantTimeCompare": "PASS"
}
```

## 3. Добавить Script Properties

`Project Settings → Script Properties`:

| Property | Значение |
|---|---|
| `RFORM_OWNER_BOT_TOKEN` | token нового Owner Bot из BotFather |
| `RFORM_CONTENT_API_URL` | действующий `/exec` URL Content Control API v0.5.4 |
| `RFORM_CONTENT_API_SECRET` | тот же существующий `RFORM_CONTENT_API_SECRET`, которым подписывает запросы Streamlit |

Не создавать новый Content API secret: Owner Bot должен обращаться к уже действующему Content Control API.

## 4. Выполнить preflight

Запустить:

`rformOwnerBotV1Preflight()`

Проверить:

- `ok: true`;
- `contentApiVersion: 0.5.4` или новее;
- отсутствуют missing capabilities;
- `ownerFinalPreviewRows >= 1`, если в очереди сейчас готов Weekly;
- `channelPublishingCallsPresent: false`.

На этом шаге Google запросит разрешения на UrlFetch и доступ к `RFORM_MASTER_DATA_v1` для технического audit log. Разрешить от имени владельца проекта.

## 5. Развернуть Owner Bot как Web App

`Deploy → New deployment → Web app`

- **Execute as:** Me
- **Who has access:** Anyone

Telegram должен иметь возможность отправлять POST на webhook; доступ владельца всё равно ограничивается отдельным hook secret + проверкой Telegram user ID.

Скопировать полученный URL вида:

`https://script.google.com/macros/s/.../exec`

Добавить его в Script Properties:

| Property | Значение |
|---|---|
| `RFORM_OWNER_BOT_WEBAPP_URL` | URL нового Owner Bot Web App `/exec` |

## 6. Установить P0 в безопасном режиме

Запустить:

`rformOwnerBotV1Install()`

Функция:

- создаст один trigger `rformOwnerBotV1Poll` каждые 5 минут;
- создаст `RFORM_OWNER_BOT_WEBHOOK_SECRET`;
- зарегистрирует Telegram webhook;
- установит `RFORM_OWNER_BOT_ENABLED = NO`;
- установит `RFORM_OWNER_BOT_ACTIONS_ENABLED = NO`.

Публикация на этом этапе невозможна.

## 7. Привязать Telegram-владельца

Запустить:

`rformOwnerBotV1CreatePairCode()`

Функция вернёт одноразовый 8-значный код, действующий 15 минут.

В **личном чате** с Owner Bot отправить:

`/pair XXXXXXXX`

После успешной связки бот ответит, что pairing подтверждён. Telegram user ID и private chat ID будут сохранены в Script Properties. Другие пользователи остаются без ответа и не получают доступ к данным.

## 8. Smoke-test текущего Weekly без действий

Запустить:

`rformOwnerBotV1SmokePreview()`

Ожидаемый UX в Telegram:

1. `R/Form Owner Inbox` + название материала;
2. три актуальные карточки Weekly одним media group;
3. полный `Telegram_Text` отдельным сообщением;
4. строка `ТЕСТ · действия отключены`;
5. кнопок согласования нет.

Проверить визуально:

- 3 карточки и правильный порядок;
- используются актуальные `v03`/последние файлы из папки;
- текст совпадает с текущим `Telegram_Text` в `CONTENT_QUEUE`;
- не показывается отдельный устаревший материал по тренировке 21.08, если он покрыт Weekly;
- ничего не публикуется в `@r_form`.

## 9. Включить production Owner Inbox

Только после успешного smoke-test запустить:

`rformOwnerBotV1Enable()`

Функция:

- включает polling;
- включает callback actions;
- очищает sent-state теста;
- немедленно присылает новый actionable preview текущего материала.

Теперь под текстом появляются кнопки:

- **Согласовать**
- **Отложить**

## 10. Семантика кнопок

### Согласовать

Перед действием бот повторно читает API и пересчитывает preview fingerprint.

Если текст, статус, визуальная папка или набор файлов изменились, старый callback отклоняется и публикация не запускается.

Если preview актуален, бот вызывает `queue_publication_approval`. Content Control API переводит строку в:

- `Publication_Status = SCHEDULED`;
- `AutoPost_Allowed = YES`;
- `Current_Stage = AUTOPUBLISH_QUEUE`;
- `Publish_At = now`.

Далее работает существующий Telegram Autopost.

### Отложить

Бот вызывает allowlisted `content_action = HOLD` с комментарием `OWNER_BOT · отложено владельцем`.

Материал не публикуется и перестаёт попадать в Owner Inbox.

## 11. Защита от дублей

P0 использует четыре уровня защиты:

1. один preview fingerprint на фактический комплект `текст + визуалы + статус`;
2. sent-state предотвращает повторную автоматическую отправку неизменившегося preview;
3. stale callback не может примениться после изменения preview;
4. Content Control API и Telegram Autopost дополнительно блокируют повторный handoff/publish по текущим статусам и `Telegram_Message_ID`.

## 12. Audit trail

Owner Bot пишет технические события в существующий `CONTENT_ACTION_LOG`:

- `BOT_PREVIEW_SENT`;
- `BOT_APPROVE_CLICK`;
- `BOT_HOLD_CLICK`;
- `BOT_STALE_CALLBACK`;
- `BOT_CALLBACK_ERROR` (при доступном audit backend).

`Actor = OWNER_BOT`.

Сами бизнес-изменения `SCHEDULED/HOLD` продолжают логироваться Content Control API своим существующим механизмом. Owner Bot не переписывает эти записи.

## 13. Rollback

Для немедленной остановки:

`rformOwnerBotV1Disable()`

Это выключает polling и actions, но оставляет webhook доступным для диагностики.

Для полного отключения webhook:

`rformOwnerBotV1DeleteWebhook()`

Существующие Streamlit Content Control и Telegram Autopost при этом продолжают работать независимо.

## P0 acceptance criteria

- [ ] `rformOwnerBotV1SelfTest()` PASS
- [ ] `rformOwnerBotV1Preflight()` PASS
- [ ] ровно один polling trigger
- [ ] pairing принимает только private chat + одноразовый код
- [ ] smoke preview показывает текущие 3 карточки + полный текст
- [ ] smoke preview не имеет активных действий
- [ ] после enable появляется actionable preview
- [ ] старый preview блокируется после изменения источника/визуала
- [ ] **Отложить** не публикует материал
- [ ] **Согласовать** переводит ровно выбранный комплект в `SCHEDULED`
- [ ] существующий Autopost публикует материал один раз
- [ ] `CONTENT_ACTION_LOG` содержит bot audit events
- [ ] посторонний Telegram user не может читать очередь или выполнять callbacks

## Что не входит в P0

- редактирование текста через Telegram;
- переключение между вариантами визуала;
- видео-публикация;
- `/plan` и расширенная навигация;
- кросспостинг;
- n8n;
- публичный бот для подписчиков.

Эти функции добавляются только после production acceptance P0.
