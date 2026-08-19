"""R/Form: приватная панель управления контентом в режиме чтения."""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from rform_content.lifecycle import (
    ACTIVE_PUBLICATION_STATES,
    OPERATIONAL_PRIORITY,
    TERMINAL_PUBLICATION_STATES,
)
from rform_content.repository import DataSourceError, diagnostics, load_bundle


APP_ROOT = Path(__file__).resolve().parent
STATE_LABELS = {
    "ERROR": "Требует действия",
    "SCHEDULED": "Запланировано",
    "APPROVED": "Утверждено",
    "REVIEW": "На проверке",
    "PLANNED": "В плане",
    "DRAFT": "Черновик",
    "IDEA": "Идея",
    "PUBLISHED": "Опубликовано",
    "HOLD": "Пауза",
    "CANCELLED": "Отменено",
    "SUPERSEDED": "Заменено",
}
FIELD_LABELS = {
    "Content_ID": "Код материала",
    "Lifecycle_State": "Статус",
    "Display_Date": "Дата публикации",
    "Publish_At": "Дата публикации",
    "Date": "Дата",
    "Rubric": "Рубрика",
    "Content_Type": "Тип материала",
    "Approval_Status": "Согласование",
    "Publication_Status": "Публикация",
    "Readiness_Issues": "Что мешает публикации",
    "Blocking_Issue": "Блокировка",
    "Publish_Error": "Ошибка публикации",
    "Preview_Review_Status": "Проверка предпросмотра",
    "Public_Data_Allowed": "Публичные данные разрешены",
    "Text_Status": "Статус текста",
    "Visual_Status": "Статус визуала",
    "Pipeline_Status": "Статус процесса",
    "Distribution_Mode": "Формат публикации",
    "Telegram_Text": "Текст для Telegram",
    "Duplicate_Flag": "Признак дубликата",
    "Event_ID": "Код события",
    "Event_Type": "Тип события",
    "Fact": "Факт",
    "Content_Value_Score": "Ценность для контента",
    "Editorial_Trigger": "Редакционный триггер",
    "Manual_Gate": "Ручная проверка",
    "Status": "Статус",
    "Owner_Action": "Действие владельца",
}
COMMON_VALUE_LABELS = {
    "YES": "Да",
    "NO": "Нет",
    "TRUE": "Да",
    "FALSE": "Нет",
    "APPROVED": "Утверждено",
    "PENDING": "Ожидает решения",
    "NOT_READY": "Не готово",
    "READY": "Готово",
    "DRAFT": "Черновик",
    "REVIEWED": "Проверено",
    "NOT_REVIEWED": "Не проверено",
    "RECHECK_REQUIRED": "Требуется повторная проверка",
    "PUBLISHED": "Опубликовано",
    "PLANNED": "В плане",
    "SCHEDULED": "Запланировано",
    "HOLD": "Пауза",
    "CANCELLED": "Отменено",
    "SUPERSEDED": "Заменено",
    "ERROR": "Ошибка",
    "CANDIDATE": "Кандидат",
}
FIELD_VALUE_LABELS = {
    "Rubric": {
        "TRAINING_LOG": "Дневник тренировок",
        "NUTRITION_CASE": "Разбор питания",
        "METHODOLOGY": "Методология",
        "WEEKLY CONTROL": "Недельный контроль",
        "SERIES": "Серия",
        "AI CHECK": "Проверка ИИ",
    },
    "Content_Type": {
        "PROOF": "Подтверждение",
        "PRODUCT_BRIDGE": "Связь с продуктом",
        "HUB": "Навигация",
        "HELP": "Помощь",
        "CASE": "Кейс",
        "CONTROL": "Контроль",
        "CHECK": "Проверка",
        "DECISION": "Решение",
    },
    "Distribution_Mode": {
        "ORGANIC": "Органическая публикация",
        "TEXT_ONLY": "Только текст",
        "TEXT": "Только текст",
        "MEDIA_CAPTION": "Визуал с подписью",
    },
    "Target_Segment": {
        "BUSY_MAN": "Занятый мужчина",
    },
    "Entity": {
        "TRAINING": "Тренировки",
        "NUTRITION": "Питание",
        "CONTROL": "Контроль",
    },
    "Event_Type": {
        "PLAN_FACT_GAP": "Отклонение плана от факта",
        "REPEATED_DEVIATION": "Повторяющееся отклонение",
        "STABLE_SIGNAL": "Стабильный сигнал",
    },
    "Editorial_Trigger": {
        "DECISION_REQUIRED": "Требуется решение",
        "REAL_LIFE": "Реальная ситуация",
        "CONTROL": "Контроль",
    },
}
SOURCE_LABELS = {
    "APPS SCRIPT / READ ONLY": "Apps Script / только чтение",
    "DEMO / FIXTURE": "Демо / тестовые данные",
    "APPS SCRIPT / ERROR": "Apps Script / ошибка",
}


st.set_page_config(
    page_title="R/Form · Управление контентом",
    page_icon="R/F",
    layout="wide",
    initial_sidebar_state="expanded",
)


st.markdown(
    """
    <style>
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Onest:wght@400;500;600;700&display=swap');
      :root {
        --rf-carbon: #0B1016;
        --rf-panel: #111922;
        --rf-panel-2: #17212B;
        --rf-white: #F2F5F7;
        --rf-steel: #7FA8BC;
        --rf-brass: #A88958;
        --rf-green: #5F9B7A;
        --rf-muted: #94A0AA;
        --rf-line: rgba(127, 168, 188, 0.22);
      }
      .stApp { background: var(--rf-carbon); color: var(--rf-white); }
      html, body, [class*="css"] { font-family: "Onest", sans-serif; }
      code, [data-testid="stMetricValue"], .rf-mono { font-family: "IBM Plex Mono", monospace; }
      [data-testid="stSidebar"] { background: #0E151C; border-right: 1px solid var(--rf-line); }
      [data-testid="stHeader"] { background: rgba(11, 16, 22, 0.86); }
      h1, h2, h3 { color: var(--rf-white); letter-spacing: -0.025em; }
      p, label, .stMarkdown { color: var(--rf-white); }
      .rf-kicker { color: var(--rf-steel); font: 600 0.72rem/1.4 "IBM Plex Mono", monospace; letter-spacing: 0.14em; text-transform: uppercase; }
      .rf-title { color: var(--rf-white); font: 650 clamp(1.9rem, 4vw, 3.4rem)/1.04 "Onest", sans-serif; letter-spacing: -0.045em; margin: 0.35rem 0 0.5rem; }
      .rf-subtitle { color: var(--rf-muted); max-width: 760px; font-size: 0.98rem; }
      .rf-rule { border-top: 1px solid var(--rf-line); margin: 1.2rem 0 1.5rem; }
      .rf-card { background: linear-gradient(180deg, rgba(23,33,43,.78), rgba(17,25,34,.94)); border: 1px solid var(--rf-line); border-radius: 12px; padding: 1rem 1.05rem; min-height: 100%; }
      .rf-card-decision { border-left: 3px solid var(--rf-brass); }
      .rf-label { color: var(--rf-steel); font: 500 0.68rem/1.4 "IBM Plex Mono", monospace; letter-spacing: .09em; text-transform: uppercase; }
      .rf-value { color: var(--rf-white); font-size: 1.02rem; font-weight: 600; margin-top: .35rem; }
      .rf-detail { color: var(--rf-muted); font-size: .84rem; margin-top: .35rem; }
      .rf-badge { display: inline-block; padding: .23rem .48rem; border: 1px solid var(--rf-line); border-radius: 999px; color: var(--rf-steel); font: 500 .67rem/1.2 "IBM Plex Mono", monospace; letter-spacing: .04em; }
      .rf-badge-error { color: var(--rf-white); border-color: var(--rf-brass); background: rgba(168,137,88,.13); }
      .rf-source { color: var(--rf-muted); font: 400 .72rem/1.5 "IBM Plex Mono", monospace; }
      [data-testid="stMetric"] { background: var(--rf-panel); border: 1px solid var(--rf-line); border-radius: 10px; padding: .9rem 1rem; }
      [data-testid="stMetricLabel"] { color: var(--rf-steel); }
      [data-testid="stMetricValue"] { color: var(--rf-white); }
      [data-testid="stAlertContainer"] {
        background: rgba(127, 168, 188, .08) !important;
        border: 1px solid var(--rf-line) !important;
        color: var(--rf-white) !important;
      }
      [data-testid="stAlertContainer"] p { color: var(--rf-white) !important; }
      [data-testid="stRadioOption"][data-selected="true"] > div > div > div:first-child {
        background-color: var(--rf-steel) !important;
        border-color: var(--rf-steel) !important;
      }
      [data-testid="stRadioOption"][data-selected="true"] > div > div > div:first-child > div {
        background-color: var(--rf-carbon) !important;
      }
      .stButton > button, .stDownloadButton > button, .stLinkButton > a { border: 1px solid var(--rf-brass); background: transparent; color: var(--rf-white); border-radius: 8px; }
      .stButton > button:hover, .stLinkButton > a:hover { border-color: var(--rf-white); color: var(--rf-white); }
      [data-testid="stDataFrame"] { border: 1px solid var(--rf-line); border-radius: 10px; overflow: hidden; }
      .rf-ok { color: var(--rf-green); }
      .rf-warn { color: var(--rf-brass); }
      .rf-footer { color: var(--rf-muted); font: 400 .68rem/1.5 "IBM Plex Mono", monospace; margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--rf-line); }
      @media (max-width: 700px) {
        .block-container { padding: 1.1rem .85rem 3rem; }
        .rf-title { font-size: 2rem; }
        [data-testid="stMetric"] { padding: .7rem .75rem; }
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def _secret_section(name: str) -> dict[str, Any]:
    try:
        return dict(st.secrets.get(name, {}))
    except (FileNotFoundError, KeyError):
        return {}


@st.cache_data(ttl=300, show_spinner=False)
def _cached_bundle(app_config: dict[str, Any], api_secrets: dict[str, Any]):
    return load_bundle(APP_ROOT, app_config, api_secrets)


def _value(row: pd.Series, name: str, fallback: str = "—") -> str:
    value = row.get(name, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    text = str(value).strip()
    return text or fallback


def _columns(frame: pd.DataFrame, names: list[str]) -> list[str]:
    return [name for name in names if name in frame.columns]


def _display_value(field: str, value: Any, fallback: str = "—") -> str:
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    normalized = " ".join(text.upper().split())
    if field == "Lifecycle_State":
        return STATE_LABELS.get(normalized, text)
    return FIELD_VALUE_LABELS.get(field, {}).get(
        normalized,
        COMMON_VALUE_LABELS.get(normalized, text),
    )


def _display_date(value: Any, fallback: str = "—") -> str:
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    is_iso_order = len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-"
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=not is_iso_order)
    if pd.isna(parsed):
        return text
    if parsed.hour or parsed.minute:
        return parsed.strftime("%d.%m.%Y %H:%M")
    return parsed.strftime("%d.%m.%Y")


def _display_table(frame: pd.DataFrame, fields: list[str]) -> pd.DataFrame:
    selected = _columns(frame, fields)
    view = frame[selected].copy()
    for field in selected:
        if field in {"Date", "Publish_At", "Display_Date"}:
            view[field] = view[field].map(_display_date)
        elif field in FIELD_VALUE_LABELS or field in {
            "Lifecycle_State",
            "Approval_Status",
            "Publication_Status",
            "Preview_Review_Status",
            "Public_Data_Allowed",
            "Text_Status",
            "Visual_Status",
            "Duplicate_Flag",
            "Manual_Gate",
            "Status",
        }:
            view[field] = view[field].map(lambda value, name=field: _display_value(name, value))
    return view.rename(columns={field: FIELD_LABELS.get(field, field) for field in selected})


def _planned_dates(frame: pd.DataFrame) -> pd.Series:
    publish = frame.get("Publish_At", pd.Series("", index=frame.index)).fillna("").astype(str).str.strip()
    dates = frame.get("Date", pd.Series("", index=frame.index)).fillna("").astype(str).str.strip()
    return publish.where(publish.ne(""), dates)


def _sort_queue(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame.copy()
    result = frame.copy()
    if "Lifecycle_Priority" not in result:
        result["Lifecycle_Priority"] = result["Lifecycle_State"].map(OPERATIONAL_PRIORITY).fillna(89)
    if "Publish_Sort" not in result:
        result["Publish_Sort"] = pd.to_datetime(_planned_dates(result), errors="coerce", utc=True)
    return result.sort_values(
        ["Lifecycle_Priority", "Publish_Sort"],
        ascending=[True, True],
        na_position="last",
    )


def _source_label(source: str) -> str:
    return SOURCE_LABELS.get(source, source)


def _candidate_queue(queue: pd.DataFrame) -> pd.DataFrame:
    if queue.empty or "Lifecycle_State" not in queue:
        return queue.iloc[0:0]
    result = queue[queue["Lifecycle_State"].isin(ACTIVE_PUBLICATION_STATES)].copy()
    return result.sort_values(
        ["Lifecycle_Priority", "Publish_Sort"],
        ascending=[True, True],
        na_position="last",
    )


def _state_badge(state: str) -> str:
    css = "rf-badge rf-badge-error" if state == "ERROR" else "rf-badge"
    label = STATE_LABELS.get(state, state)
    return f'<span class="{css}">{escape(label)}</span>'


def _link(label: str, url: str) -> None:
    if url.startswith(("https://", "http://")):
        st.link_button(label, url, width="stretch")


def render_header(source: str) -> None:
    st.markdown('<div class="rf-kicker">R/Form · Контент-операции</div>', unsafe_allow_html=True)
    st.markdown('<div class="rf-title">Управление контентом</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="rf-subtitle">Единая точка контроля подготовки и публикации контента. '
        'Приложение читает данные и не изменяет мастер-таблицу.</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div style="margin-top:.8rem"><span class="rf-badge">ТОЛЬКО ЧТЕНИЕ · v0.2</span> '
        f'<span class="rf-source">ИСТОЧНИК: {escape(_source_label(source))}</span></div>'
        '<div class="rf-rule"></div>',
        unsafe_allow_html=True,
    )


def render_control(queue: pd.DataFrame, events: pd.DataFrame) -> None:
    action_required = _sort_queue(queue[queue.get("Is_Action_Required", False) == True])  # noqa: E712
    state_counts = queue.get("Lifecycle_State", pd.Series(dtype="object")).value_counts()
    candidates = _candidate_queue(queue)

    cols = st.columns(4)
    cols[0].metric("Требует действия", int(len(action_required)))
    cols[1].metric("Запланировано", int(state_counts.get("SCHEDULED", 0)))
    cols[2].metric("На подготовке", int(sum(state_counts.get(s, 0) for s in ("REVIEW", "APPROVED", "PLANNED"))))
    cols[3].metric("Опубликовано", int(state_counts.get("PUBLISHED", 0)))

    st.subheader("Следующая публикация")
    if candidates.empty:
        st.info("В активной очереди нет запланированных или готовящихся публикаций.")
    else:
        row = candidates.iloc[0]
        left, right = st.columns([1.35, 1])
        with left:
            st.markdown(
                '<div class="rf-card rf-card-decision">'
                f'<div class="rf-label">Контент</div><div class="rf-value">{escape(_value(row, "Content_ID"))}</div>'
                f'<div style="margin-top:.55rem">{_state_badge(_value(row, "Lifecycle_State"))}</div>'
                f'<div class="rf-detail">{escape(_display_value("Rubric", row.get("Rubric")))} · '
                f'{escape(_display_value("Content_Type", row.get("Content_Type")))}</div>'
                '</div>',
                unsafe_allow_html=True,
            )
        with right:
            st.markdown(
                '<div class="rf-card">'
                f'<div class="rf-label">Публикация</div><div class="rf-value rf-mono">'
                f'{escape(_display_date(_value(row, "Publish_At", _value(row, "Date"))))}</div>'
                f'<div class="rf-detail">{escape(_display_value("Distribution_Mode", row.get("Distribution_Mode")))}</div>'
                f'<div class="rf-detail">Сегмент: {escape(_display_value("Target_Segment", row.get("Target_Segment")))}</div>'
                '</div>',
                unsafe_allow_html=True,
            )

    col_a, col_b = st.columns([1.15, 1])
    with col_a:
        st.subheader("Активная очередь")
        view = candidates.head(8)
        if view.empty:
            st.caption("Нет активных материалов.")
        else:
            view = view.assign(Display_Date=_planned_dates(view))
            st.dataframe(
                _display_table(
                    view,
                    ["Content_ID", "Lifecycle_State", "Display_Date", "Rubric"],
                ),
                hide_index=True,
                width="stretch",
            )
    with col_b:
        st.subheader("Требует решения")
        if action_required.empty:
            st.markdown('<div class="rf-card"><span class="rf-ok">Критических блокировок нет.</span></div>', unsafe_allow_html=True)
        else:
            st.dataframe(
                _display_table(
                    action_required.head(8),
                    [
                        "Content_ID",
                        "Lifecycle_State",
                        "Blocking_Issue",
                        "Publish_Error",
                        "Preview_Review_Status",
                    ],
                ),
                hide_index=True,
                width="stretch",
            )

    st.subheader("Сильные события для контента")
    if events.empty:
        st.caption("В журнале данных пока нет событий.")
    else:
        ranked = events.sort_values(
            ["Content_Value_Score_Num", "Event_Date_Sort"], ascending=[False, False], na_position="last"
        ).head(6)
        st.dataframe(
            _display_table(
                ranked,
                ["Event_ID", "Date", "Event_Type", "Fact", "Content_Value_Score", "Owner_Action"],
            ),
            hide_index=True,
            width="stretch",
        )


def render_queue(queue: pd.DataFrame) -> None:
    st.subheader("Очередь контента")
    if queue.empty:
        st.info("Очередь контента пока пуста.")
        return

    show_archive = st.toggle(
        "Показать опубликованные и закрытые материалы",
        value=False,
        help="По умолчанию архив скрыт, чтобы в очереди оставалась только текущая работа.",
    )
    if show_archive:
        queue_scope = queue.copy()
    else:
        queue_scope = queue[~queue["Lifecycle_State"].isin(TERMINAL_PUBLICATION_STATES)].copy()

    filter_a, filter_b, filter_c = st.columns([1, 1, 1.4])
    states = sorted(
        queue_scope["Lifecycle_State"].dropna().astype(str).unique().tolist(),
        key=lambda state: OPERATIONAL_PRIORITY.get(state, 89),
    )
    selected_states = filter_a.multiselect(
        "Статус",
        states,
        default=states,
        format_func=lambda state: STATE_LABELS.get(state, state),
        placeholder="Выберите статусы",
        key=f"queue_states_{show_archive}",
    )
    rubrics = sorted(
        queue_scope.get("Rubric", pd.Series(dtype="object")).dropna().astype(str).unique().tolist()
    )
    selected_rubrics = filter_b.multiselect(
        "Рубрика",
        rubrics,
        format_func=lambda rubric: _display_value("Rubric", rubric),
        placeholder="Выберите рубрики",
        key=f"queue_rubrics_{show_archive}",
    )
    query = filter_c.text_input("Поиск", placeholder="Код материала или текст")

    filtered = queue_scope[queue_scope["Lifecycle_State"].isin(selected_states)].copy()
    if selected_rubrics and "Rubric" in filtered:
        filtered = filtered[filtered["Rubric"].astype(str).isin(selected_rubrics)]
    if query:
        searchable = filtered[_columns(filtered, ["Content_ID", "Rubric", "Telegram_Text", "Decision"])].fillna("").astype(str)
        mask = searchable.apply(lambda column: column.str.contains(query, case=False, regex=False)).any(axis=1)
        filtered = filtered[mask]

    filtered = _sort_queue(filtered)
    st.caption(
        f"Показано: {len(filtered)} из {len(queue)}. "
        + ("Архив включён." if show_archive else "Опубликованные и закрытые материалы скрыты.")
    )
    table = filtered.assign(Display_Date=_planned_dates(filtered))
    st.dataframe(
        _display_table(
            table,
            ["Content_ID", "Lifecycle_State", "Display_Date", "Rubric", "Content_Type"],
        ),
        hide_index=True,
        width="stretch",
    )

    ids = filtered.get("Content_ID", pd.Series(dtype="object")).astype(str).str.strip()
    options = [value for value in ids.tolist() if value]
    if not options:
        return
    option_labels = {
        _value(row, "Content_ID", ""): (
            f'{_value(row, "Content_ID", "")} · '
            f'{_display_value("Lifecycle_State", row.get("Lifecycle_State"))} · '
            f'{_display_date(_value(row, "Publish_At", _value(row, "Date")))}'
        )
        for _, row in filtered.iterrows()
    }
    selected_id = st.selectbox(
        "Открыть карточку материала",
        options,
        format_func=lambda content_id: option_labels.get(content_id, content_id),
    )
    row = filtered[filtered["Content_ID"].astype(str) == selected_id].iloc[0]
    st.markdown(f"### {_value(row, 'Content_ID')}  ")
    st.markdown(_state_badge(_value(row, "Lifecycle_State")), unsafe_allow_html=True)

    tab_content, tab_readiness, tab_links = st.tabs(["Материал", "Готовность", "Ссылки"])
    with tab_content:
        st.markdown("#### Решение")
        st.write(_value(row, "Decision"))
        st.markdown("#### Направление")
        st.write(_value(row, "Editorial_Direction"))
        st.markdown("#### Предпросмотр публикации в Telegram")
        st.markdown('<div class="rf-card">', unsafe_allow_html=True)
        st.write(_value(row, "Telegram_Text"))
        st.markdown("</div>", unsafe_allow_html=True)
    with tab_readiness:
        issues = _value(row, "Readiness_Issues", "")
        state = _value(row, "Lifecycle_State", "")
        if state in TERMINAL_PUBLICATION_STATES:
            st.info("Материал закрыт; повторная проверка готовности не требуется.")
        elif issues:
            st.warning(issues)
        else:
            st.success("Все обязательные условия для планирования выполнены.")
        readiness_fields = [
            "Public_Data_Allowed", "Text_Status", "Visual_Status", "Approval_Status",
            "Publication_Status", "Preview_Review_Status", "Duplicate_Flag",
        ]
        st.dataframe(
            pd.DataFrame({
                "Показатель": [FIELD_LABELS.get(name, name) for name in readiness_fields],
                "Значение": [_display_value(name, row.get(name)) for name in readiness_fields],
            }),
            hide_index=True,
            width="stretch",
        )
    with tab_links:
        links = [
            ("Рабочий пакет", _value(row, "Work_Packet_URL", "")),
            ("Папка", _value(row, "Folder_URL", "")),
            ("Текст", _value(row, "Text_URL", "")),
            ("Визуал", _value(row, "Visual_URL", "")),
        ]
        valid = [(label, url) for label, url in links if url.startswith(("https://", "http://"))]
        if not valid:
            st.caption("Ссылки для этой карточки не заполнены.")
        for label, url in valid:
            _link(label, url)


def render_events(events: pd.DataFrame) -> None:
    st.subheader("События для контента")
    if events.empty:
        st.info("Журнал событий пока пуст.")
        return

    ranked = events.sort_values(
        ["Content_Value_Score_Num", "Event_Date_Sort"], ascending=[False, False], na_position="last"
    )
    st.dataframe(
        _display_table(
            ranked,
            [
                "Event_ID",
                "Date",
                "Event_Type",
                "Fact",
                "Content_Value_Score",
                "Editorial_Trigger",
                "Manual_Gate",
                "Status",
                "Owner_Action",
            ],
        ),
        hide_index=True,
        width="stretch",
    )

    ids = ranked.get("Event_ID", pd.Series(dtype="object")).astype(str).str.strip().tolist()
    ids = [value for value in ids if value]
    if not ids:
        return
    selected_id = st.selectbox("Открыть событие", ids)
    row = ranked[ranked["Event_ID"].astype(str) == selected_id].iloc[0]
    left, right = st.columns([1.4, 1])
    with left:
        st.markdown('<div class="rf-card rf-card-decision">', unsafe_allow_html=True)
        st.markdown("#### Факт")
        st.write(_value(row, "Fact"))
        st.markdown("#### Действие владельца")
        st.write(_value(row, "Owner_Action"))
        st.markdown("</div>", unsafe_allow_html=True)
    with right:
        st.metric("Ценность для контента", _value(row, "Content_Value_Score"))
        st.caption(f"Триггер: {_display_value('Editorial_Trigger', row.get('Editorial_Trigger'))}")
        st.caption(f"Ручная проверка: {_display_value('Manual_Gate', row.get('Manual_Gate'))}")
    st.markdown("#### Рекомендуемые углы")
    for index in range(1, 4):
        angle = _value(row, f"Recommended_Angle_{index}", "")
        if angle:
            st.write(f"{index}. {angle}")


def render_diagnostics(bundle) -> None:
    report = diagnostics(bundle)
    st.subheader("Диагностика")
    st.markdown(
        '<div class="rf-card"><div class="rf-label">Режим доступа</div>'
        '<div class="rf-value">ТОЛЬКО ЧТЕНИЕ</div>'
        '<div class="rf-detail">В коде нет операций записи в Google Таблицы и нет токена Telegram.</div></div>',
        unsafe_allow_html=True,
    )

    col_a, col_b = st.columns(2)
    col_a.metric("Материалов в очереди", report["queue_rows"])
    col_b.metric("Событий в журнале", report["event_rows"])
    st.caption(f"Источник: {_source_label(bundle.source)}")
    loaded_at = bundle.loaded_at.astimezone(ZoneInfo("Europe/Riga"))
    st.caption(f"Время загрузки: {loaded_at.strftime('%d.%m.%Y %H:%M:%S')} (Рига)")

    st.markdown("#### Схема данных")
    if report["queue_missing"]:
        missing = [FIELD_LABELS.get(field, field) for field in report["queue_missing"]]
        st.warning("Очередь контента: отсутствуют поля: " + ", ".join(missing))
    else:
        st.success("Очередь контента: обязательные поля присутствуют.")
    if report["event_missing"]:
        missing = [FIELD_LABELS.get(field, field) for field in report["event_missing"]]
        st.warning("Журнал событий: отсутствуют поля: " + ", ".join(missing))
    else:
        st.success("Журнал событий: обязательные поля присутствуют.")

    st.markdown("#### Уникальность")
    if report["queue_duplicates"] or report["event_duplicates"]:
        st.warning(
            f"Повторяющиеся идентификаторы: очередь контента — {report['queue_duplicates']}; "
            f"журнал событий — {report['event_duplicates']}."
        )
    else:
        st.success("Повторяющиеся коды материалов и событий не найдены.")

    if st.button("Обновить данные"):
        st.cache_data.clear()
        st.rerun()


app_config = _secret_section("app")
api_secrets = _secret_section("content_api")

try:
    bundle = _cached_bundle(app_config, api_secrets)
except DataSourceError as exc:
    render_header("APPS SCRIPT / ERROR")
    st.error(str(exc))
    st.caption("Приложение остановлено: при ошибке рабочего источника тестовые данные не подставляются.")
    st.stop()

render_header(bundle.source)
if bundle.source.startswith("DEMO"):
    st.warning(bundle.note)
else:
    st.caption(bundle.note)

with st.sidebar:
    st.markdown('<div class="rf-kicker">Навигация</div>', unsafe_allow_html=True)
    page = st.radio("Раздел", ["Контроль", "Очередь", "События", "Диагностика"], label_visibility="collapsed")
    st.markdown("---")
    st.caption("R/Form · Управление контентом v0.2")
    st.caption("Источник истины остаётся в Google Таблицах.")

if page == "Контроль":
    render_control(bundle.queue, bundle.events)
elif page == "Очередь":
    render_queue(bundle.queue)
elif page == "События":
    render_events(bundle.events)
else:
    render_diagnostics(bundle)

st.markdown(
    '<div class="rf-footer">R/Form · система управления физической формой · '
    'Не угадывай. Управляй прогрессом.</div>',
    unsafe_allow_html=True,
)
