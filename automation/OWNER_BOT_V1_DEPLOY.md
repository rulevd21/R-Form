# R/Form Owner Bot v1.0.5 · P0 Owner Inbox

## Текущая установленная версия: v1.0.5

Установлена по точному разрешению владельца 06.10.2026. Код.gs сохранён и прочитан после перезагрузки: SHA-256 `f0a86d4fc86d091c62b33d260b57dccd00613c22a2c58c6bf63e8ec0a643970a`. Существующее WebApp обновлено с deployment version 4 до 5 в 21:51 (Москва); прежние ID, URL, execute-as и доступ сохранены. doGet version 5, 21:51:50, показал R/Form Owner Bot v1.0.5.

Native SelfTest выполнен один раз, 21:50:44–21:50:45: ok=true, version=1.0.5, readyFilter/previewFingerprint/constantTimeCompare PASS. 29 offline tests PASS: 11 callback, 8 transport, 10 observability. Внешние вызовы замоканы.

v1.0.5 добавляет безопасный структурированный OWNER_BOT_API_READ_TRANSPORT log: статус POST/GET, число попыток, категория redirect, длина ответа, JSON/ok, этап/исход, общее время. Новая телеметрия не содержит URL/query/payload/ответ/подпись; тело non-JSON ошибки READ исключено из сообщения. Параметры HTTP и число запросов точно сохранены относительно v1.0.4: один signed POST и максимум один allowlisted ContentService GET; POST не повторяется, второй redirect не выполняется. Изменение является диагностическим; причина прежних GET 302/404 не установлена, исправление транспорта не заявляется.

Два ближайших автоматических READ в штатном Poll подтверждены Cloud logs: 21:51:51 (log 21:51:56, elapsedMs=3937) и 21:56:52 (log 21:57:01, elapsedMs=6297), Москва 06.10.2026. Оба: version=1.0.5, stage=DONE, outcome=OK, postAttempts=1/getAttempts=1, POST HTTP 302, Location count=1/chars=394/CONTENT_SERVICE; GET HTTP 200, redirectRoute=NONE, bodyChars=173843, json=true, ok=true. Первый native execution completed, 5.32 с. Это подтверждение успешного API READ в двух штатных запусках, не доказательство причины прежнего сбоя или полного webhook/preview E2E.

Три диагностических файла сохранены неизменными: их readback SHA совпал с baseline. Старые probes повторно не запускались. Install/Enable/SetWebhook, properties, pairing, секреты и существующий trigger не менялись. Ручной Poll, новые READ probes, реальные APPROVE/HOLD и публикации не запускались. Полный входящий webhook E2E остаётся PENDING.

Откат v1.0.5 требует восстановления HEAD v1.0.4 SHA-256 `b682fa77fa082d3a25d4b0855d3820c448bf91111ea29b3b0a0053ccc20d1137` и прежней WebApp version 4 на том же deployment; один откат WebApp не меняет clock-trigger на HEAD. Откат требует отдельного разрешения.

PR #6 остаётся draft/unmerged, base agent/content-control-streamlit-readonly. Production URLs и секреты в Git не добавляются.

## История установки v1.0.4

## Текущая установленная версия: v1.0.4

Установлена по точному разрешению владельца 06.10.2026. Код.gs прочитан обратно: SHA-256 `b682fa77fa082d3a25d4b0855d3820c448bf91111ea29b3b0a0053ccc20d1137`. Существующее WebApp обновлено с deployment version 3 до 4 в 18:16 (Москва); ID, URL, execute-as и доступ сохранены. /exec показал R/Form Owner Bot v1.0.4 в 18:17:08.

Транспорт: ровно один подписанный POST с followRedirects=false, затем максимум один GET только на https://script.googleusercontent.com/macros/echo? для получения ContentService-ответа. POST не повторяется; GET не содержит payload/подпись. Другие и повторные redirect отклоняются.

Native SelfTest PASS 18:15:41. Native Preflight PASS 18:18:15–18:18:36: version=1.0.4, contentApiVersion=0.5.4, queueRows=31, ownerFinalPreviewRows=0, ownerPaired=true, pollTriggerCount=1, botEnabled=YES, actionsEnabled=YES, webhookConfigured=true, webhookPendingUpdates=0, webhookLastErrorMessage/date пустые, channelPublishingCallsPresent=false.

Повторная проверка 18:21:51: автоматический Poll завершён за 35.027 с, но Cloud log 18:22:26 содержит Owner Bot poll failed: Content Control API returned non-JSON (HTTP 302), Код:964 → ApiRead_ → Poll. Функциональный Poll FAILED / API_READ. По установленному v1.0.4 ошибка возникает при разборе GET-ответа после принятого ContentService redirect: GET вернул ещё один HTTP 302. Host/path второго redirect ещё не измерены; причина не подтверждена. Preflight PASS 18:18:36 остаётся фактом отдельного успешного READ, не приёмкой автоматического Poll.

Подготовлен отдельный diagnostic READ probe v1.0.4 для измерения второго redirect: максимум один POST и один allowlisted GET; повтор POST и follow второго redirect запрещены; лог только статусов и host/path, без query/body/секретов. 4 офлайн-теста PASS. Разрешённая READ-диагностика v1.0.4 выполнена ровно один раз: rformOwnerBotV104RedirectProbe, 18:42:19–18:42:55 (36.245 с). Один POST HTTP 302 направлен на script.googleusercontent.com /macros/echo; последующий GET вернул HTTP 404 / non-JSON. secondRedirectHost/path пустые, secondRedirectFollowed=false. Второй redirect в этом запуске не воспроизведён; прежний Poll GET HTTP 302 остаётся отдельным наблюдением. Причина различающихся ответов пока не установлена. Файл установлен и его readback точно совпал с SHA-256 df548b22d8c35ca729b0787298d622c3e8268a27198bd4441c9b2dbb25424390. Код.gs после диагностики сохранил SHA-256 b682fa77fa082d3a25d4b0855d3820c448bf91111ea29b3b0a0053ccc20d1137. WebApp не обновлялся; properties, pairing, triggers, очередь, Telegram и контентные действия не менялись. Транспорт не принят; полного входящего webhook E2E нет. Полный webhook E2E отложен до устранения транспортного сбоя.

19 offline tests PASS: `node automation/tests/owner_bot_v1_callback.test.cjs` (11), `node automation/tests/owner_bot_v1_transport.test.cjs` (8).

### Callback error contract

Сохранены callback hardening v1.0.3 и runtime v1.0.1 (HtmlService webhook response, max_connections=1, webhook diagnostics). Валидный callback владельца при исключении независимо пытается записать BOT_CALLBACK_ERROR / OUTCOME_UNKNOWN и отправить безопасное уведомление. После handoff запрос мог уже примениться; автоматического APPROVE/HOLD retry нет.

Native controlled callback probe v1.0.3 в 18:05:17–18:05:19 подтвердил noticeSent=true, auditReadback=true, realContentActions=0. Это handler → audit/Telegram из редактора; полный входящий webhook E2E остаётся PENDING для текущего релиза. Историческая P0 acceptance не заменяет эту проверку.

### Обновление и откат

Install/Enable/SetWebhook, pairing, секреты и существующие триггеры не менялись. Диагностический файл в проекте сохранён неизменным; его probes имеют guard v1.0.3 и не запускались после обновления.

Для отката v1.0.4 восстановить baseline HEAD v1.0.3 SHA-256 `5ec48501dc86f7ff70ae7436910f0596e1472dd28ce412b7bb191fdafc0b319a` и прежнюю WebApp version 3 на том же deployment. Один откат WebApp не меняет clock-trigger на HEAD. Disable/DeleteWebhook — аварийная остановка, не откат исходника.

PR #6 остаётся draft/unmerged против существующей base agent/content-control-streamlit-readonly. В текущем main Owner Bot отсутствует. Production URLs и секреты в Git не добавляются.

## История установки v1.0.3 (до обновления)


## Текущая установленная версия: v1.0.3

Установлена 06.10.2026 в существующем Apps Script-проекте. WebApp обновлён с deployment version 2 до 3 на прежнем deployment ID и URL. Исходник после сохранения точно совпал с `automation/owner_bot_v1.gs` этой ветки:

SHA-256: `5ec48501dc86f7ff70ae7436910f0596e1472dd28ce412b7bb191fdafc0b319a`.

Live SelfTest PASS (17:32:14 Москва); действующий doGet показал `R/Form Owner Bot v1.0.3` (17:34:00). 11 офлайн-тестов: `node automation/tests/owner_bot_v1_callback.test.cjs`.

Регрессия: сохранены изменения установленной v1.0.1 относительно Git v1.0.0 — HtmlService-ответ webhook, max_connections=1 и дополнительные диагностические поля webhook. Исторический исходник заявленной в документации v1.0.2 не найден в проверенных источниках; v1.0.3 — новое исправление, не восстановление этого релиза.

### Callback error contract

Для корректного callback владельца обработчик при исключении пытается независимо записать `BOT_CALLBACK_ERROR / OUTCOME_UNKNOWN` в существующий аудит и отправить владельцу безопасное уведомление. Сырые ошибки в новые сообщения и audit не включаются. APPROVE/HOLD автоматически не повторяется. Если исключение возникло до handoff, операция не отправлена; после отправки запрос мог уже примениться. Владелец должен проверить текущий статус через /today или Content Control перед повторным действием. При недоступности Sheets/Telegram долговечная запись/доставка не гарантируется.

Контролируемая native callback error-проверка PASS в 18:05:17–18:05:19: одна fixture audit-запись прочитана обратно, одно тестовое уведомление отправлено, реальных content actions 0. Это handler → audit/Telegram из редактора, полный входящий webhook E2E остаётся pending. Native READ probe 18:04:09–18:04:13: один POST HTTP 302 → ContentService script.googleusercontent.com/macros/echo → один GET HTTP 200 JSON ok=true/version=0.5.4. Подпись/API работают; явное получение ответа проходит, автоматическое followRedirects даёт сбой. Код.gs v1.0.3 не изменён, диагностика добавлена отдельным файлом только в HEAD после разрешения владельца, WebApp deployment не менялся. Poll остаётся `FAILED / API_READ`. Подготовлен отдельно кандидат v1.0.4 с явным ограниченным GET для ContentService и без POST replay; 19 офлайн-тестов PASS. Кандидат не установлен. Историческая P0 acceptance не заменяет функциональную приёмку исправленного Poll.

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
  "version": "1.0.5",
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


## URL-preservation READ probe — 06.10.2026, 20:55 Moscow

Дополнительная URL-preservation READ-проверка выполнена по точному разрешению владельца ровно один раз, 20:55:36–20:55:47 (Москва, 06.10.2026): rformOwnerBotV104UrlProbe. Отдельный OwnerBot_v104_UrlProbe.gs сохранён и прочитан обратно, SHA-256 a9c000150df4c29b5a31241bfcd5a7f0670c10a9fdc792d58002778cebc2133d. Один signed READ POST HTTP 302; единственный Location (394 символа), без whitespace/fragment, script.googleusercontent.com /macros/echo. Два dry getRequest показали defaultRequestPreservesUrl=true и exactRequestPreservesUrl=true. Единственный GET с escaping=false: HTTP 200, JSON, ok=true, API v0.5.4, bodyChars=173843. Второго redirect нет, POST не повторялся. Это PASS отдельного чтения; гипотеза изменения URL при escaping в этом запуске не подтверждена. Стабильность автоматического Poll и причина прежних 302/404 остаются не подтверждены. Журналы Poll 20:31:51, 20:26:51 и 20:21:51 недоступны; native completed не считается приёмкой. Основной Код.gs после проверки точно сохранил SHA-256 b682fa77fa082d3a25d4b0855d3820c448bf91111ea29b3b0a0053ccc20d1137; deployment, триггеры и настройки не менялись. Следующий этап: log-based проверка ближайших автоматических Poll без ручного повторного запуска.


## Automatic Poll 21:01 HTTP 404 and prepared v1.0.5 telemetry

Проверка автоматического Poll после READ PASS: 06.10.2026, 21:01:51 (Москва), 17.445 с, native completed; Cloud log 21:02:08 подтверждает FAILED / API_READ: Content Control API returned non-JSON (HTTP 404), ApiPost_ Код:964 → ApiRead_ Код:839 → Poll Код:500. По установленному v1.0.4 это GET-ответ после ContentService redirect. В API executions по времени соответствует doPost deployment version 10, 21:01:53, 3.718 с, completed; связь основана на времени, не на nonce. JSON-результат API из этой строки не установлен. doGet в этом временном интервале в видимом списке отсутствует. Poll 20:56:51, 28.387 с, completed; журнал недоступен, функциональный результат UNKNOWN. API doPost 20:56:53, 3.29 с. READ probe имеет execution start 20:55:35, 11.501 с, а log start 20:55:36; это один и тот же единственный запуск. Успех READ probe не означает восстановления штатного Poll. На этапе 21:01 был подготовлен, но ещё не установлен кандидат Owner Bot v1.0.5: безопасный структурированный READ transport log (статусы POST/GET, число попыток, классификация redirect, длина ответа, JSON/ok, этап/исход, общее время); без URL/query/payload/ответа/подписи. Тело non-JSON ошибки READ исключено из сообщения. HTTP-параметры и число запросов не меняются; 11 callback + 8 transport + 10 observability tests PASS. SHA-256 f0a86d4fc86d091c62b33d260b57dccd00613c22a2c58c6bf63e8ec0a643970a. На момент 21:01 установленные main и WebApp оставались v1.0.4. Для установки v1.0.5 и обновления существующего WebApp требуется точное разрешение владельца; новые probes и ручной Poll не запускались.
