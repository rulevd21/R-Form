const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../training-mobile/SheetRepository.gs'), 'utf8');

function fixture({rejectRecovery = false} = {}) {
  const headers = [
    'Day_ID', 'Date', 'Day_Type', 'Morning_Weight', 'Day_Status',
    'Daily_Conclusion', 'Updated_At', 'Updated_By'
  ];
  const oldRow = [
    '=DAY_ID(B4)', '04.08.2026', 'REST', '71.85', 'CLOSED',
    'Historical August conclusion', '04.08.2026 22:00', 'OWNER'
  ];
  const oldFormulas = ['=DAY_ID(B4)', '', '', '', '', '', '', ''];
  let targetRow = Array(headers.length).fill('');
  let targetFormulas = Array(headers.length).fill('');
  let pastes = [];
  let clearCount = 0;
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => 4,
    getMaxRows: () => 20,
    getRange: (row, col, height, width) => {
      const index = row;
      return {
        getValues: () => [index === 1 ? headers : index === 4 ? oldRow : targetRow],
        getFormulas: () => [index === 4 ? oldFormulas : targetFormulas],
        copyTo: (destination, kind) => {
          pastes.push(kind);
          if (kind === 'PASTE_NORMAL') targetRow = oldRow.slice();
          if (kind === 'PASTE_FORMULA') {
            targetFormulas = ['=DAY_ID(B5)', '', '', '', '', '', '', ''];
            targetRow[0] = targetFormulas[0];
          }
        },
        setValues: rows => {
          const values = rows[0];
          if (rejectRecovery && values[2] === 'RECOVERY') {
            // Emulate a spreadsheet strict-validation failure after some cells
            // may already have been written.
            targetRow = [values[0], values[1], ...targetRow.slice(2)];
            throw new Error('Invalid input: DAILY!C5');
          }
          targetRow = values.slice();
        },
        clearContent: () => {
          clearCount++;
          targetRow = Array(headers.length).fill('');
          targetFormulas = Array(headers.length).fill('');
        }
      };
    }
  };
  const ctx = vm.createContext({
    SpreadsheetApp: {
      CopyPasteType: {
        PASTE_NORMAL: 'PASTE_NORMAL',
        PASTE_FORMAT: 'PASTE_FORMAT',
        PASTE_DATA_VALIDATION: 'PASTE_DATA_VALIDATION',
        PASTE_FORMULA: 'PASTE_FORMULA'
      },
      openById: () => ({getSheetByName: () => sheet})
    },
    RFormConfig: {
      SPREADSHEET_ID: 'test',
      MAX_ROWS_PER_SHEET: {DAILY: 20},
      CACHE_TTL_SECONDS: {HEADERS: 60}
    },
    RFormAppCache: {get: () => null, put: () => {}, remove: () => {}},
    RFormUtils: {
      normalizeString: v => String(v).trim(),
      isBlank: v => v == null || v === '',
      unique: v => [...new Set(v)]
    },
    RFormSchemaService: {
      assertWritable: () => ({templateRowUsed: 4}),
      assertReadable: () => {},
      getSchema: () => ({templateRow: 4}),
      getWritableFields: () => [
        'Date', 'Day_Type', 'Morning_Weight', 'Day_Status',
        'Daily_Conclusion', 'Updated_At', 'Updated_By'
      ],
      isFormulaField: (sheet, header) => header === 'Day_ID'
    }
  });
  vm.runInContext(source, ctx);
  const payload = {
    Date: '23.10.2026', Day_Type: 'RECOVERY',
    Morning_Weight: 73.7, Day_Status: 'OPEN',
    Daily_Conclusion: '', Updated_At: '23.10.2026 07:11', Updated_By: 'RFORM_TRAINING_MOBILE'
  };
  const write = () => ctx.RFormSheetRepository.appendFromTemplate('DAILY', payload, 'CREATE_DAILY');
  return {
    write, oldRow, getTarget: () => targetRow.slice(),
    getPastes: () => pastes.slice(), getClearCount: () => clearCount
  };
}

test('new DAILY row retains formula and validation without copying CLOSED or old narrative', () => {
  const f = fixture();
  assert.equal(f.write(), 5);
  const saved = f.getTarget();
  assert.deepEqual(f.getPastes(), ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION', 'PASTE_FORMULA']);
  assert.equal(saved[0], '=DAY_ID(B5)');
  assert.equal(saved[1], '23.10.2026');
  assert.equal(saved[2], 'RECOVERY');
  assert.equal(saved[3], 73.7);
  assert.equal(saved[4], 'OPEN');
  assert.equal(saved[5], '');
  assert.equal(f.oldRow[4], 'CLOSED');
  assert.equal(f.getClearCount(), 0);
});

test('strict Day_Type failure cleans new row rather than leaving a ghost CLOSED day', () => {
  const f = fixture({rejectRecovery: true});
  assert.throws(f.write, /DAILY!C5/);
  assert.deepEqual(f.getPastes(), ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION', 'PASTE_FORMULA']);
  assert(f.getTarget().every(value => value === ''));
  assert.equal(f.getClearCount(), 1);
  assert.equal(f.oldRow[4], 'CLOSED');
});
