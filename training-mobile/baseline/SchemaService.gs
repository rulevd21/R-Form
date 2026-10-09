/**
 * Контракт канонической схемы. Запись блокируется при изменении порядка
 * или состава заголовков целевого листа.
 */
var RFormSchemaService = (function() {
  'use strict';

  var operationAssertions_ = null;

  function beginOperation() {
    operationAssertions_ = { readable: {}, writable: {} };
  }

  function endOperation() {
    operationAssertions_ = null;
  }

  function schemas_() {
    var S = RFormConfig.SHEETS;
    var schemas = {};

    schemas[S.ACTIVE_PLANS] = {
      headers: ['Plan_ID','Area','Effective_From','Effective_To','Day_Type','Calories_Min','Calories_Max','Protein_Min','Protein_Max','Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Training_Block','Status','Decision_ID','Duplicate_Flag'],
      templateRow: 2,
      formulaFields: [],
      writable: {}
    };

    schemas[S.DAILY] = {
      headers: ['Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average','Sleep_Hours','Sleep_Quality','Readiness','Steps','Shoulder_Pain','Elbow_Pain','Other_Pain','Calories_Plan_Min','Calories_Plan_Max','Protein_Plan_Min','Protein_Plan_Max','Fat_Plan_Min','Fat_Plan_Max','Carbs_Plan_Min','Carbs_Plan_Max','Calories_Fact_Min','Calories_Fact_Max','Protein_Fact_Min','Protein_Fact_Max','Fat_Fact_Min','Fat_Fact_Max','Carbs_Fact_Min','Carbs_Fact_Max','Day_Status','Daily_Conclusion','Duplicate_Flag','Updated_At','Updated_By'],
      templateRow: 4,
      templateScanRows: 250,
      formulaFields: ['Day_ID','Weight_7D_Average','Calories_Plan_Min','Calories_Plan_Max','Protein_Plan_Min','Protein_Plan_Max','Fat_Plan_Min','Fat_Plan_Max','Carbs_Plan_Min','Carbs_Plan_Max','Calories_Fact_Min','Calories_Fact_Max','Protein_Fact_Min','Protein_Fact_Max','Fat_Fact_Min','Fat_Fact_Max','Carbs_Fact_Min','Carbs_Fact_Max','Duplicate_Flag'],
      writable: {
        CREATE_DAILY: ['Date','Day_Type','Morning_Weight','Sleep_Hours','Sleep_Quality','Readiness','Shoulder_Pain','Elbow_Pain','Other_Pain','Day_Status','Daily_Conclusion','Updated_At','Updated_By'],
        UPDATE_RECOVERY: ['Morning_Weight','Sleep_Hours','Sleep_Quality','Readiness','Shoulder_Pain','Elbow_Pain','Other_Pain','Updated_At','Updated_By'],
        APPEND_DAILY_CONCLUSION: ['Daily_Conclusion','Updated_At','Updated_By']
      }
    };

    schemas[S.TRAINING_SESSIONS] = {
      headers: ['Session_ID','Day_ID','Date','Session_Type','Planned_Duration','Actual_Duration','Sleep_Hours','Readiness','Pain_Before','Pain_After','Recovery_Status','Session_Goal','Main_Result','Plan_Status','Technique_Status','Session_Conclusion','Session_Decision','Session_Status','Duplicate_Flag','Session_Mode','Started_At','Completed_At','Session_Comment'],
      templateRow: 2,
      templateScanRows: 250,
      formulaFields: ['Duplicate_Flag'],
      writable: {
        CREATE_SESSION: ['Session_ID','Day_ID','Date','Session_Type','Planned_Duration','Actual_Duration','Sleep_Hours','Readiness','Pain_Before','Pain_After','Recovery_Status','Session_Goal','Main_Result','Plan_Status','Technique_Status','Session_Conclusion','Session_Decision','Session_Status'],
        UPDATE_DRAFT_SESSION: ['Planned_Duration','Actual_Duration','Sleep_Hours','Readiness','Pain_Before','Pain_After','Recovery_Status','Session_Goal','Main_Result','Plan_Status','Technique_Status','Session_Conclusion','Session_Decision','Session_Status'],
        CREATE_FREE_SESSION: ['Session_ID','Day_ID','Date','Session_Type','Actual_Duration','Plan_Status','Session_Status','Session_Mode','Started_At','Completed_At','Session_Comment'],
        UPDATE_FREE_SESSION: ['Actual_Duration','Session_Status','Completed_At','Session_Comment'],
        CLEAR_FREE_SESSION: ['Session_ID','Day_ID','Date','Session_Type','Planned_Duration','Actual_Duration','Sleep_Hours','Readiness','Pain_Before','Pain_After','Recovery_Status','Session_Goal','Main_Result','Plan_Status','Technique_Status','Session_Conclusion','Session_Decision','Session_Status','Session_Mode','Started_At','Completed_At','Session_Comment']
      }
    };

    schemas[S.TRAINING_SETS] = {
      headers: ['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','RPE','Rest_Seconds','Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Plan_Weight','Plan_Reps','Plan_RIR','Deviation','Comment','Record_Key','Duplicate_Flag','Exercise_Instance_ID','Exercise_Catalog_ID','Load_Value','Load_Unit','Exercise_Comment'],
      templateRow: 2,
      templateScanRows: 250,
      formulaFields: ['Record_Key','Duplicate_Flag'],
      writable: {
        CREATE_SET: ['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','RPE','Rest_Seconds','Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Plan_Weight','Plan_Reps','Plan_RIR','Deviation','Comment'],
        UPDATE_SET_FACT: ['Weight_Kg','Reps','RIR','RPE','Rest_Seconds','Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Deviation','Comment'],
        CREATE_FREE_SET: ['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','RPE','Rest_Seconds','Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Plan_Weight','Plan_Reps','Plan_RIR','Deviation','Comment','Exercise_Instance_ID','Exercise_Catalog_ID','Load_Value','Load_Unit','Exercise_Comment'],
        UPDATE_FREE_SET_FACT: ['Set_Type','Weight_Kg','Reps','RIR','Load_Value','Load_Unit','Comment'],
        UPDATE_FREE_EXERCISE: ['Exercise_Order','Exercise_Comment'],
        UPDATE_FREE_SET_NUMBER: ['Set_Number'],
        CLEAR_FREE_SET: ['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','RPE','Rest_Seconds','Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Plan_Weight','Plan_Reps','Plan_RIR','Deviation','Comment','Exercise_Instance_ID','Exercise_Catalog_ID','Load_Value','Load_Unit','Exercise_Comment']
      }
    };

    schemas[S.TRAINING_PLAN] = {
      headers: ['Plan_Set_ID','Plan_ID','Day_ID','Session_ID','Date','Session_Type','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Plan_Weight','Plan_Reps','Plan_RIR','Rest_Seconds','Pause_Seconds','Commands_Required','Technical_Cue','Plan_Status','Decision_ID','Updated_At','Updated_By','Record_Key','Duplicate_Flag'],
      templateRow: 2,
      formulaFields: [],
      writable: {}
    };

    schemas[S.INBOX_LOG] = {
      headers: ['Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity','Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status','Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'],
      templateRow: 2,
      templateScanRows: 250,
      formulaFields: ['Duplicate_Flag'],
      writable: {
        CREATE_INBOX_EVENT: ['Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity','Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status','Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Note'],
        UPDATE_INBOX_EVENT: ['Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity','Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status','Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Note']
      }
    };

    schemas[S.DICTIONARIES] = {
      headers: ['DAY_TYPE','DAY_STATUS','PLAN_STATUS','SESSION_TYPE','SESSION_STATUS','SET_TYPE','EXERCISE_CATEGORY','MEAL_TYPE','ESTIMATION_QUALITY','DECISION_AREA','DECISION_STATUS','CONTENT_STATUS','RUBRIC','RECORD_STATUS','PUBLIC_ALLOWED','UNIT','QA_TYPE','QA_SEVERITY','QA_STATUS','OWNER_ROLE','MEASUREMENT_METRIC','MEASUREMENT_CONDITION','RECOVERY_STATUS','TECHNIQUE_STATUS','PLATFORM','YES_NO','IMPORT_STATUS','INBOX_EVENT_TYPE','INBOX_VALIDATION_STATUS','INBOX_PROCESSING_STATUS','CLOSE_REQUEST','DAY_PACKET_STATUS'],
      templateRow: 2,
      formulaFields: [],
      writable: {}
    };

    schemas[S.QA_LOG] = {
      headers: ['QA_ID','Detected_At','QA_Type','Severity','Source_Sheet','Record_ID','Field_Name','Issue_Description','Current_Value','Expected_Value','Owner','Status','Resolution','Resolved_At','Resolved_By'],
      templateRow: 2,
      formulaFields: [],
      writable: {
        CREATE_QA: ['QA_ID','Detected_At','QA_Type','Severity','Source_Sheet','Record_ID','Field_Name','Issue_Description','Current_Value','Expected_Value','Owner','Status','Resolution','Resolved_At','Resolved_By'],
        UPDATE_QA: ['Detected_At','QA_Type','Severity','Source_Sheet','Record_ID','Field_Name','Issue_Description','Current_Value','Expected_Value','Owner','Status','Resolution','Resolved_At','Resolved_By']
      }
    };

    return schemas;
  }

  function getSchema(sheetName) {
    var schema = schemas_()[sheetName];
    if (!schema) throw new Error('Для листа ' + sheetName + ' не определён schema contract.');
    return schema;
  }

  function resolveTemplateRow(sheetName, fresh) {
    var schema = getSchema(sheetName);
    if (!schema.formulaFields.length) return Number(schema.templateRow || 2);

    return RFormSheetRepository.findFormulaTemplateRow(
      sheetName,
      schema.formulaFields,
      Number(schema.templateRow || 2),
      Number(schema.templateScanRows || 250),
      Boolean(fresh)
    );
  }

  function inspectReadable_(sheetName, fresh) {
    var schema = getSchema(sheetName);
    var headers = RFormSheetRepository.getHeaders(sheetName, Boolean(fresh));
    var duplicateHeaders = RFormUtils.duplicateValues(headers);
    var missingHeaders = schema.headers.filter(function(header) {
      return headers.indexOf(header) === -1;
    });
    var unexpectedHeaders = headers.filter(function(header) {
      return schema.headers.indexOf(header) === -1;
    });
    var exact = RFormUtils.arraysEqual(headers, schema.headers);

    return {
      sheet: sheetName,
      okForRead: missingHeaders.length === 0 && duplicateHeaders.length === 0,
      okForWrite: false,
      expectedHeaderHash: RFormUtils.sha256(schema.headers.join('|')),
      actualHeaderHash: RFormUtils.sha256(headers.join('|')),
      exactHeaderOrder: exact,
      duplicateHeaders: duplicateHeaders,
      missingHeaders: missingHeaders,
      unexpectedHeaders: unexpectedHeaders,
      missingTemplateFormulas: [],
      templateRowUsed: null
    };
  }

  function inspect(sheetName, fresh) {
    var schema = getSchema(sheetName);
    var headers = RFormSheetRepository.getHeaders(sheetName, Boolean(fresh));
    var duplicateHeaders = RFormUtils.duplicateValues(headers);
    var missingHeaders = schema.headers.filter(function(header) {
      return headers.indexOf(header) === -1;
    });
    var unexpectedHeaders = headers.filter(function(header) {
      return schema.headers.indexOf(header) === -1;
    });
    var exact = RFormUtils.arraysEqual(headers, schema.headers);
    var missingTemplateFormulas = [];
    var templateRowUsed = resolveTemplateRow(sheetName, fresh);

    if (schema.formulaFields.length) {
      var formulaMap = templateRowUsed
        ? RFormSheetRepository.getFormulaMap(
            sheetName,
            templateRowUsed,
            Boolean(fresh)
          )
        : {};
      missingTemplateFormulas = schema.formulaFields.filter(function(header) {
        return !formulaMap[header];
      });
    }

    return {
      sheet: sheetName,
      okForRead: missingHeaders.length === 0 && duplicateHeaders.length === 0,
      okForWrite: exact && duplicateHeaders.length === 0 && missingTemplateFormulas.length === 0,
      expectedHeaderHash: RFormUtils.sha256(schema.headers.join('|')),
      actualHeaderHash: RFormUtils.sha256(headers.join('|')),
      exactHeaderOrder: exact,
      duplicateHeaders: duplicateHeaders,
      missingHeaders: missingHeaders,
      unexpectedHeaders: unexpectedHeaders,
      missingTemplateFormulas: missingTemplateFormulas,
      templateRowUsed: templateRowUsed || null
    };
  }

  function assertReadable(sheetName) {
    if (operationAssertions_) {
      if (operationAssertions_.writable[sheetName]) {
        return operationAssertions_.writable[sheetName];
      }
      if (operationAssertions_.readable[sheetName]) {
        return operationAssertions_.readable[sheetName];
      }
    }

    // Для чтения проверяем только read-contract заголовков. Формулы строки-шаблона
    // являются write-contract и проверяются assertWritable().
    var report = inspectReadable_(sheetName, false);
    if (!report.okForRead) {
      throw new Error(
        'Схема листа ' + sheetName + ' не соответствует обязательному контракту чтения. ' +
        RFormUtils.safeJson(report, 1800)
      );
    }
    if (operationAssertions_) operationAssertions_.readable[sheetName] = report;
    return report;
  }

  function assertWritable(sheetName) {
    if (operationAssertions_ && operationAssertions_.writable[sheetName]) {
      return operationAssertions_.writable[sheetName];
    }

    var report = inspect(sheetName, true);
    if (!report.okForWrite) {
      throw new Error(
        'Запись в ' + sheetName + ' заблокирована: schema fingerprint или формулы шаблона изменены. ' +
        RFormUtils.safeJson(report, 1800)
      );
    }
    if (operationAssertions_) {
      operationAssertions_.writable[sheetName] = report;
      operationAssertions_.readable[sheetName] = report;
    }
    return report;
  }

  function getWritableFields(sheetName, operation) {
    var schema = getSchema(sheetName);
    var fields = schema.writable[operation];
    if (!fields) {
      throw new Error('Операция ' + operation + ' не разрешена для листа ' + sheetName + '.');
    }
    return fields.slice();
  }

  function isFormulaField(sheetName, header) {
    return getSchema(sheetName).formulaFields.indexOf(header) !== -1;
  }

  function inspectAll() {
    return Object.keys(schemas_()).map(function(sheetName) {
      try {
        return inspect(sheetName, true);
      } catch (error) {
        return {
          sheet: sheetName,
          okForRead: false,
          okForWrite: false,
          error: error.message
        };
      }
    });
  }

  return {
    getSchema: getSchema,
    resolveTemplateRow: resolveTemplateRow,
    inspect: inspect,
    inspectAll: inspectAll,
    assertReadable: assertReadable,
    assertWritable: assertWritable,
    getWritableFields: getWritableFields,
    isFormulaField: isFormulaField,
    beginOperation: beginOperation,
    endOperation: endOperation
  };
}());
