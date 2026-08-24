'use strict';

const RFORM_ANALYZER_VERSION = 'deterministic-v1.0.0';

function text(v){ return String(v == null ? '' : v).trim(); }
function num(v){ if(v===null||v===undefined||String(v).trim()==='') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function norm(s){ return text(s).toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' '); }
function median(values){
  const a = values.filter(v=>Number.isFinite(v)).slice().sort((x,y)=>x-y);
  if(!a.length) return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function parseRir(v){
  if(Array.isArray(v)) return v.map(num).filter(x=>x!=null && x>=0 && x<=10);
  return text(v).split(/[\/;,\s]+/).map(num).filter(x=>x!=null && x>=0 && x<=10);
}
function volume(sets,reps){
  const s=num(sets), r=num(reps); return s!=null&&r!=null&&s>0&&r>0?s*r:null;
}
function hasSafetyText(s){
  const t=norm(s);
  return /(резк|остр|нараста|сильн|прострел|онемен|потер[яи] чувств|головокруж|обморок|травм)/.test(t);
}
function signalCategory(result){ return result && result.signal_code || 'UNKNOWN'; }

function determineComparability(current, previous){
  if(!previous) return {comparable:false, reason:'Нет предыдущего сопоставимого Check.'};
  const a=norm(current.exercise_name || current.exercise_id), b=norm(previous.exercise_name || previous.exercise_id);
  if(!a || !b || a!==b) return {comparable:false, reason:'Ключевые упражнения различаются.'};
  const goalA=norm(current.goal), goalB=norm(previous.goal);
  if(goalA && goalB && goalA!==goalB) return {comparable:false, reason:'Изменилась цель тренировочного контекста.'};
  const va=volume(current.actual_sets,current.actual_reps), vb=volume(previous.actual_sets,previous.actual_reps);
  if(va && vb){ const ratio=va/vb; if(ratio<0.7 || ratio>1.3) return {comparable:false, reason:'Объём отличается более чем на 30%.'}; }
  const la=num(current.actual_load), lb=num(previous.actual_load);
  if(la && lb){ const ratio=la/lb; if(ratio<0.8 || ratio>1.2) return {comparable:false, reason:'Нагрузка отличается более чем на 20%.'}; }
  return {comparable:true, reason:'Упражнение и нагрузочный контекст достаточно близки для осторожного сравнения.'};
}

function analyzeTrainingCheck(input, history){
  input=input||{}; history=Array.isArray(history)?history:[];
  const planSets=num(input.plan_sets), planReps=num(input.plan_reps), planLoad=num(input.plan_load);
  const actualSets=num(input.actual_sets), actualReps=num(input.actual_reps), actualLoad=num(input.actual_load);
  const targetRir=median(parseRir(input.target_rir));
  const actualRir=median(parseRir(input.actual_rir));
  const effort=norm(input.effort);
  const quality=norm(input.quality_rating || input.quality);
  const pain=num(input.pain_0_10);
  const combinedText=[input.quality_comment,input.overall_result,input.additional_event].map(text).join(' ');
  const safetyFlag=(pain!=null && pain>=4) || hasSafetyText(combinedText);
  const missing=[];
  if(!text(input.exercise_name||input.exercise_id)) missing.push('exercise');
  if(actualSets==null || actualReps==null) missing.push('actual_volume');
  if(!(actualRir!=null || effort)) missing.push('intensity');

  let signalCode='STABLE'; let signal='Значимого отклонения не обнаружено.';
  let interpretation='Фактическая картина близка к ожидаемой. По одной тренировке нет оснований менять подход.';
  let decision='Сохранить текущий подход и проверить его повторяемость на следующей сопоставимой тренировке.';
  let checkpoint='Повторяются ли сопоставимые объём, субъективная интенсивность и качество движения?';
  let confidence='MEDIUM'; let insufficient=false;

  if(safetyFlag){
    signalCode='SAFETY';
    signal='Отмечен существенный болевой или потенциально небезопасный сигнал.';
    interpretation='Training Check не интерпретирует выраженную или нарастающую боль как обычное тренировочное отклонение.';
    decision='Не использовать этот сигнал для самостоятельной корректировки тренинга; вопрос выходит за рамки Training Check и требует оценки профильного специалиста.';
    checkpoint='Получена ли профильная оценка и безопасно ли возвращаться к сопоставимой нагрузке?';
    confidence='HIGH';
  } else if(missing.length){
    signalCode='INSUFFICIENT'; insufficient=true; confidence='LOW';
    signal='Данных недостаточно для надёжного вывода.';
    interpretation='Не хватает ключевых фактов для сопоставления плана и результата без догадок.';
    decision='Ничего не менять на основании этого Check; в следующей сопоставимой тренировке зафиксировать недостающие параметры.';
    checkpoint='Удалось ли зафиксировать ключевое упражнение, фактический объём и интенсивность без пропусков?';
  } else {
    const planVol=volume(planSets,planReps), actualVol=volume(actualSets,actualReps);
    const volRatio=planVol&&actualVol?actualVol/planVol:null;
    const loadRatio=planLoad&&actualLoad?actualLoad/planLoad:null;
    const rirDelta=(targetRir!=null&&actualRir!=null)?actualRir-targetRir:null;

    if(volRatio!=null && volRatio<0.9){
      signalCode='VOLUME_BELOW'; signal='Фактический объём оказался ниже плана.';
      interpretation='План по ключевому упражнению выполнен не полностью. Одной сессии недостаточно, чтобы считать это устойчивым снижением возможностей.';
      decision='Не повышать требования по ключевому упражнению до следующего сопоставимого факта.';
      checkpoint='Повторится ли недовыполнение объёма при сопоставимой нагрузке и условиях?'; confidence='HIGH';
    } else if(loadRatio!=null && loadRatio<0.95){
      signalCode='LOAD_BELOW'; signal='Фактическая нагрузка оказалась ниже плана.';
      interpretation='Ключевое упражнение выполнено с уменьшенной нагрузкой; причина по одному Check не устанавливается.';
      decision='Сначала проверить воспроизводимость факта, меняя не более одного крупного параметра.';
      checkpoint='Получится ли выполнить запланированную нагрузку при сопоставимом объёме и качестве?'; confidence='HIGH';
    } else if(rirDelta!=null && rirDelta>=1){
      signalCode='EASIER'; signal='Запас оказался выше целевого: нагрузка воспринималась легче ожиданий.';
      interpretation='Это может быть предварительным сигналом запаса для прогрессии, но одной тренировки недостаточно для вывода о тренде.';
      decision='Сохранить остальные условия и проверить, повторяется ли более высокий запас; затем рассматривать небольшую прогрессию одного параметра.';
      checkpoint='Повторится ли более высокий запас при сопоставимой нагрузке, объёме и качестве?'; confidence='HIGH';
    } else if(rirDelta!=null && rirDelta<=-1){
      signalCode='HARDER'; signal='Запас оказался ниже целевого: нагрузка воспринималась тяжелее ожиданий.';
      interpretation='Фактическая интенсивность выше плановой. По одной сессии это не доказывает ухудшение формы.';
      decision='Не увеличивать требования до следующего сопоставимого факта.';
      checkpoint='Повторится ли более низкий запас при сопоставимой нагрузке, объёме и качестве?'; confidence='HIGH';
    } else if(/легче/.test(effort)){
      signalCode='EASIER'; signal='Тренировка воспринималась легче ожиданий.';
      interpretation='Это предварительный сигнал запаса, но без RIR точность оценки ниже.';
      decision='Сохранить остальные условия и проверить повторяемость сигнала перед изменением нагрузки.';
      checkpoint='Снова ли ключевое упражнение окажется легче ожиданий при сопоставимых условиях?';
    } else if(/тяжел/.test(effort)){
      signalCode='HARDER'; signal='Тренировка воспринималась тяжелее ожиданий.';
      interpretation='Это субъективный сигнал повышенной сложности, который стоит проверить повторно, а не компенсировать несколькими изменениями сразу.';
      decision='Сохранить структуру и получить ещё один сопоставимый факт перед прогрессией.';
      checkpoint='Снова ли ключевое упражнение окажется тяжелее ожиданий при сопоставимых условиях?';
    } else if(/хуже|ухуд|нестабил|потер/.test(quality)){
      signalCode='QUALITY_DOWN'; signal='Качество выполнения ухудшилось относительно ожиданий.';
      interpretation='Качество — отдельный ограничитель решения даже при выполненном объёме.';
      decision='Не усложнять нагрузочный контекст до подтверждения стабильного качества.';
      checkpoint='Вернётся ли стабильное качество при сопоставимой нагрузке и объёме?';
    }
  }

  const prev=history.length?history[history.length-1]:null;
  let comparisonStatus='BASELINE'; let comparisonNote='Исходная точка зафиксирована.';
  if(prev){
    const comp=determineComparability(input, prev.input||prev);
    if(!comp.comparable){ comparisonStatus='INSUFFICIENT_DATA'; comparisonNote=comp.reason; }
    else {
      const prevCode=signalCategory(prev.analysis||prev);
      if(prevCode===signalCode && !['INSUFFICIENT','SAFETY'].includes(signalCode)){
        comparisonStatus='CONFIRMED'; comparisonNote='Предыдущий сигнал повторился в сопоставимой тренировке.';
      } else if(prevCode && prevCode!=='UNKNOWN' && prevCode!==signalCode && !['INSUFFICIENT','SAFETY'].includes(signalCode)){
        comparisonStatus='NOT_CONFIRMED'; comparisonNote='Предыдущий сигнал не повторился в этой сопоставимой тренировке.';
      } else { comparisonStatus='INSUFFICIENT_DATA'; comparisonNote='Данных пока недостаточно для подтверждения предыдущего сигнала.'; }
    }
  }

  let trend='NONE';
  if(history.length>=2){
    const last2=history.slice(-2);
    const comps=last2.map(h=>determineComparability(input,h.input||h));
    const codes=last2.map(h=>signalCategory(h.analysis||h));
    if(comps.every(c=>c.comparable) && codes.every(c=>c===signalCode) && !['INSUFFICIENT','SAFETY'].includes(signalCode)) trend='OBSERVED_TENDENCY';
  }

  const factParts=[];
  if(text(input.exercise_name)) factParts.push(text(input.exercise_name));
  if(actualLoad!=null) factParts.push(String(actualLoad)+(text(input.load_unit)||' кг'));
  if(actualSets!=null&&actualReps!=null) factParts.push(actualSets+'×'+actualReps);
  if(actualRir!=null) factParts.push('медианный RIR '+actualRir);
  const fact=factParts.length?factParts.join(' · '):(text(input.overall_result)||'Факт тренировки сохранён.');

  return {
    engine:'RFORM_DETERMINISTIC', version:RFORM_ANALYZER_VERSION,
    fact, signal, signal_code:signalCode, interpretation,
    decision_direction:decision, checkpoint,
    comparison_status:comparisonStatus, comparison_note:comparisonNote,
    trend_status:trend, confidence, insufficient_data:insufficient,
    safety_flag:safetyFlag,
    observation_type:'FACT_AND_HYPOTHESIS_SEPARATED'
  };
}

const api={RFORM_ANALYZER_VERSION,parseRir,determineComparability,analyzeTrainingCheck};
if(typeof module!=='undefined' && module.exports) module.exports=api;
if(typeof globalThis!=='undefined') globalThis.RFormAnalyzer=api;
