# Последняя согласованная версия — v20

Статус: **СОГЛАСОВАНО**.

Файл отчета: `Commercial_Wines_Integrated_2026_v20.html`.

Ключевое изменение v20: **август 2026 считается закрытым периодом и включается по умолчанию**. Все остальные расчеты, формулы, фильтры, структура и дизайн сохранены без изменений относительно предыдущей версии.

## Контроль целостности

SHA-256 исходного HTML:

`e3367d6dd9d0909a073ecc7bdb598cd2a79c407f665409d169da9c698a2474ec`

Для точного хранения через GitHub-коннектор HTML заархивирован как gzip, затем закодирован в Base64 и разбит на 5 текстовых частей:

`Commercial_Wines_Integrated_2026_v20.html.gz.b64.part-00` … `part-04`.

SHA-256 объединенного Base64-файла:

`c9bf0b57d5b55c0df621b4aade2e8ff2643a8e11c7bb2c350f05937ba08a5e4b`

Восстановление:

```bash
cat Commercial_Wines_Integrated_2026_v20.html.gz.b64.part-* > Commercial_Wines_Integrated_2026_v20.html.gz.b64
base64 -d Commercial_Wines_Integrated_2026_v20.html.gz.b64 | gzip -d > Commercial_Wines_Integrated_2026_v20.html
sha256sum Commercial_Wines_Integrated_2026_v20.html
```

Ожидаемый SHA-256 восстановленного HTML:

`e3367d6dd9d0909a073ecc7bdb598cd2a79c407f665409d169da9c698a2474ec`

## Правило фиксации

**v20 является последней согласованной версией. Не фиксировать дальнейшие изменения или обновления отчета в GitHub без отдельной явной команды пользователя.**
