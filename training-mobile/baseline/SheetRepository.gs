/**
 * Единственная точка низкоуровневого доступа к SpreadsheetApp.
 * Все записи выполняются по заголовкам и белым спискам операций.
 */
var RFormSheetRepository = (function() {
  'use strict';

  var spreadsheet_ = null;
  var operationActive_ = false;
  var localHeaders_ = {};
  var localFindRows_ = {};
  var localSheets_ = {};

  function beginOperation() {
    operationActive_ = true;
    localHeaders_ = {};
    localFindRows_ = {};
  }

  function endOperation() {
    operationActive_ = false;
    localHeaders_ = {};
    localFindRows_ = {};
  }

  function getSpreadsheet() {
    if (!spreadsheet_) spreadsheet_ = SpreadsheetApp.openById(RFormConfig.SPREADSHEET_ID);
    return spreadsheet_;
  }

  function getSheet(sheetName) {
    if (localSheets_[sheetName]) return localSheets_[sheetName];
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Не найден лист ' + sheetName + '.');
    localSheets_[sheetName] = sheet;
    return sheet;
  }

  function headerCacheKey_(sheetName) {
    return 'HEADERS:' + sheetName;
  }

  function getHeaders(sheetName, fresh) {
    if (!fresh && operationActive_ && localHeaders_[sheetName]) {
      return localHeaders_[sheetName].slice();
    }

    if (!fresh) {
      var cached = RFormAppCache.get(headerCacheKey_(sheetName));
      if (cached && cached.length) {
        if (operationActive_) localHeaders_[sheetName] = cached.slice();
        return cached;
      }
    }

    var sheet = getSheet(sheetName);
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) return [];
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
      return RFormUtils.normalizeString(value);
    });

    if (operationActive_) localHeaders_[sheetName] = headers.slice();
    RFormAppCache.put(
      headerCacheKey_(sheetName),
      headers,
      RFormConfig.CACHE_TTL_SECONDS.HEADERS
    );
    return headers;
  }

  function getHeaderMap(sheetName, fresh) {
    var map = {};
    getHeaders(sheetName, fresh).forEach(function(header, index) {
      if (header) map[header] = index + 1;
    });
    return map;
  }

  function getFormulaMap(sheetName, rowNumber, freshHeaders) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName, freshHeaders);
    var formulas = sheet.getRange(rowNumber, 1, 1, headers.length).getFormulas()[0];
    var map = {};
    headers.forEach(function(header, index) {
      if (header) map[header] = formulas[index] || '';
    });
    return map;
  }

  function findFormulaTemplateRow(
    sheetName,
    requiredFields,
    preferredRow,
    maxScanRows,
    freshHeaders
  ) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName, freshHeaders);
    var headerMap = {};
    headers.forEach(function(header, index) {
      if (header) headerMap[header] = index;
    });

    var requiredIndexes = requiredFields.map(function(header) {
      return headerMap[header];
    });
    if (requiredIndexes.some(function(index) { return index === undefined; })) {
      return null;
    }

    var startRow = 2;
    var preferred = Number(preferredRow || 2);

    // Быстрый путь: в штатной схеме формульный шаблон находится в preferredRow.
    // Читаем только одну строку. Полный scan выполняется только как fallback,
    // поэтому контракт поиска шаблона не ослабляется.
    if (preferred >= startRow && preferred <= sheet.getMaxRows()) {
      var preferredFormulas = sheet.getRange(preferred, 1, 1, headers.length).getFormulas()[0];
      var preferredHasAll = requiredIndexes.every(function(columnIndex) {
        return Boolean(preferredFormulas[columnIndex]);
      });
      if (preferredHasAll) return preferred;
    }

    var scanLimit = Math.max(1, Number(maxScanRows || 250));
    var endRow = Math.min(
      sheet.getMaxRows(),
      Math.max(preferred, startRow + scanLimit - 1)
    );
    var formulas = sheet.getRange(
      startRow,
      1,
      endRow - startRow + 1,
      headers.length
    ).getFormulas();

    function rowHasAll_(rowIndex) {
      var row = formulas[rowIndex - startRow];
      return requiredIndexes.every(function(columnIndex) {
        return Boolean(row[columnIndex]);
      });
    }

    for (var rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
      if (rowNumber === preferred) continue;
      if (rowHasAll_(rowNumber)) return rowNumber;
    }
    return null;
  }

  function rowToObject_(headers, values, rowNumber) {
    var object = { _rowNumber: rowNumber };
    headers.forEach(function(header, index) {
      if (header) object[header] = values[index];
    });
    return object;
  }

  function readObjects(sheetName, options) {
    var opts = options || {};
    RFormSchemaService.assertReadable(sheetName);
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName, false);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var startRow = Math.max(2, Number(opts.startRow || 2));
    var endRow = Math.min(lastRow, Number(opts.endRow || lastRow));
    if (endRow < startRow) return [];

    var values = sheet.getRange(startRow, 1, endRow - startRow + 1, headers.length).getValues();
    return values.map(function(row, index) {
      return rowToObject_(headers, row, startRow + index);
    }).filter(function(row) {
      return headers.some(function(header) {
        return header && !RFormUtils.isBlank(row[header]);
      });
    });
  }

  function readRow(sheetName, rowNumber) {
    RFormSchemaService.assertReadable(sheetName);
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName, false);
    var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    return rowToObject_(headers, values, rowNumber);
  }

  function groupConsecutiveRows_(rowNumbers) {
    var sorted = rowNumbers.slice().sort(function(a, b) { return a - b; });
    var groups = [];
    sorted.forEach(function(row) {
      var group = groups[groups.length - 1];
      if (!group || row !== group.end + 1) {
        groups.push({ start: row, end: row });
      } else {
        group.end = row;
      }
    });
    return groups;
  }

  function readRowsByNumbers(sheetName, rowNumbers) {
    if (!rowNumbers || !rowNumbers.length) return [];
    RFormSchemaService.assertReadable(sheetName);
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName, false);
    var output = [];

    groupConsecutiveRows_(RFormUtils.unique(rowNumbers)).forEach(function(group) {
      var values = sheet.getRange(
        group.start,
        1,
        group.end - group.start + 1,
        headers.length
      ).getValues();
      values.forEach(function(row, index) {
        output.push(rowToObject_(headers, row, group.start + index));
      });
    });

    return output;
  }

  function findRowsCacheKey_(sheetName, header, value) {
    return sheetName + '|' + header + '|' + String(value);
  }

  function invalidateFindRowsCache_(sheetName) {
    if (!operationActive_) return;
    Object.keys(localFindRows_).forEach(function(key) {
      if (key.indexOf(sheetName + '|') === 0) delete localFindRows_[key];
    });
  }

  function findRowsByExactValue(sheetName, header, value) {
    if (RFormUtils.isBlank(value)) return [];
    var cacheKey = findRowsCacheKey_(sheetName, header, value);
    if (operationActive_ && Object.prototype.hasOwnProperty.call(localFindRows_, cacheKey)) {
      return localFindRows_[cacheKey].slice();
    }

    RFormSchemaService.assertReadable(sheetName);
    var sheet = getSheet(sheetName);
    var map = getHeaderMap(sheetName, false);
    if (!map[header]) throw new Error('На листе ' + sheetName + ' отсутствует поле ' + header + '.');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      if (operationActive_) localFindRows_[cacheKey] = [];
      return [];
    }

    var ranges = sheet.getRange(2, map[header], lastRow - 1, 1)
      .createTextFinder(String(value))
      .matchEntireCell(true)
      .findAll();

    var rows = ranges.map(function(range) { return range.getRow(); });
    if (operationActive_) localFindRows_[cacheKey] = rows.slice();
    return rows;
  }

  function findUniqueRow(sheetName, header, value) {
    var rows = findRowsByExactValue(sheetName, header, value);
    if (rows.length > 1) {
      throw new Error(
        'Обнаружено несколько записей ' + sheetName + '.' + header + '=' + value +
        '. Операция заблокирована.'
      );
    }
    return rows.length ? rows[0] : null;
  }

  function validateWriteFields_(sheetName, operation, valuesByHeader) {
    var allowed = {};
    RFormSchemaService.getWritableFields(sheetName, operation).forEach(function(header) {
      allowed[header] = true;
    });

    var invalid = Object.keys(valuesByHeader).filter(function(header) {
      return !allowed[header];
    });
    if (invalid.length) {
      throw new Error(
        'Операция ' + operation + ' не может записывать поля ' + invalid.join(', ') +
        ' на листе ' + sheetName + '.'
      );
    }

    Object.keys(valuesByHeader).forEach(function(header) {
      if (RFormSchemaService.isFormulaField(sheetName, header)) {
        throw new Error('Попытка записи в формульное поле ' + sheetName + '.' + header + '.');
      }
    });
  }

  function writeFields(sheetName, rowNumber, valuesByHeader, operation) {
    RFormSchemaService.assertWritable(sheetName);
    validateWriteFields_(sheetName, operation, valuesByHeader);

    var sheet = getSheet(sheetName);
    var map = getHeaderMap(sheetName, false);
    var cells = Object.keys(valuesByHeader).map(function(header) {
      if (!map[header]) throw new Error('Не найден столбец ' + sheetName + '.' + header + '.');
      return { header: header, column: map[header], value: valuesByHeader[header] };
    }).sort(function(a, b) { return a.column - b.column; });

    var segments = [];
    cells.forEach(function(cell) {
      var current = segments[segments.length - 1];
      if (!current || cell.column !== current.endColumn + 1) {
        segments.push({
          startColumn: cell.column,
          endColumn: cell.column,
          values: [cell.value]
        });
      } else {
        current.endColumn = cell.column;
        current.values.push(cell.value);
      }
    });

    segments.forEach(function(segment) {
      sheet.getRange(rowNumber, segment.startColumn, 1, segment.values.length)
        .setValues([segment.values]);
    });
    invalidateFindRowsCache_(sheetName);
  }

  function appendFromTemplate(sheetName, valuesByHeader, operation) {
    var writeReport = RFormSchemaService.assertWritable(sheetName);
    validateWriteFields_(sheetName, operation, valuesByHeader);

    var sheet = getSheet(sheetName);
    var schema = RFormSchemaService.getSchema(sheetName);
    var targetRow = Math.max(sheet.getLastRow() + 1, 2);
    var configuredLimit = RFormConfig.MAX_ROWS_PER_SHEET[sheetName] || sheet.getMaxRows();
    var hardLimit = Math.min(sheet.getMaxRows(), configuredLimit);

    if (targetRow > hardLimit) {
      throw new Error(
        'Лист ' + sheetName + ' достиг разрешённого лимита строк (' + hardLimit + ').'
      );
    }

    var headers = getHeaders(sheetName, false);
    var width = headers.length;
    var templateRow = writeReport.templateRowUsed ||
      RFormSchemaService.resolveTemplateRow(sheetName, false);
    if (!templateRow) {
      throw new Error(
        'Для листа ' + sheetName + ' не найдена строка-шаблон со всеми обязательными формулами.'
      );
    }
    var source = sheet.getRange(templateRow, 1, 1, width);
    var target = sheet.getRange(targetRow, 1, 1, width);

    source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);

    // После copyTo формулы уже адаптированы под targetRow. Собираем финальную
    // строку в памяти и выполняем один setValues вместо отдельной очистки
    // статических значений и серии сегментных записей.
    var finalRow = target.getFormulas()[0].map(function(formula) {
      return formula || '';
    });
    var map = {};
    headers.forEach(function(header, index) {
      if (header) map[header] = index;
    });
    Object.keys(valuesByHeader).forEach(function(header) {
      if (map[header] === undefined) {
        throw new Error('Не найден столбец ' + sheetName + '.' + header + '.');
      }
      finalRow[map[header]] = valuesByHeader[header];
    });

    target.setValues([finalRow]);
    invalidateFindRowsCache_(sheetName);
    return targetRow;
  }

  function invalidateSchemaCache(sheetName) {
    RFormAppCache.remove(headerCacheKey_(sheetName));
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    getHeaders: getHeaders,
    getHeaderMap: getHeaderMap,
    getFormulaMap: getFormulaMap,
    findFormulaTemplateRow: findFormulaTemplateRow,
    readObjects: readObjects,
    readRow: readRow,
    readRowsByNumbers: readRowsByNumbers,
    findRowsByExactValue: findRowsByExactValue,
    findUniqueRow: findUniqueRow,
    writeFields: writeFields,
    appendFromTemplate: appendFromTemplate,
    invalidateSchemaCache: invalidateSchemaCache,
    beginOperation: beginOperation,
    endOperation: endOperation
  };
}());
