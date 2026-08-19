"""R/Form · приватная панель управления контентом."""

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
from rform_content.repository import (
    DataSourceError,
    diagnostics,
    execute_content_action,
    load_bundle,
)
from rform_content.suggestions import render_suggestions


APP_ROOT = Path(__file__).resolve().parent

STATE_LABELS = {
    "ERROR": "Требует действия",
    "SCHEDULED": "Запланировано",
    "READY_FOR_PUBLICATION": "Готово к публикации",
    "REWORK": "На доработке",
    "READY_TO_PUBLISH": "Готово к публикации",
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

ACTION_LABELS = {
    "APPROVE": "Утвердить",
    "RETURN_FOR_REVISION": "Вернуть на доработку",
    "HOLD": "Поставить на паузу",
    "READY_TO_PUBLISH": "Готово к публикации",
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
    "Owner_Fact": "Факт для публикации",
    "Owner_Angle": "Главная мысль",
    "Owner_Review_Status": "Решение владельца",
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
    "READY_FOR_PUBLICATION": "Готово к публикации",
    "REWORK": "На доработке",
    "HOLD": "Пауза",
    "CANCELLED": "Отменено",
    "SUPERSEDED": "Заменено",
    "ERROR": "Ошибка",
    "CANDIDATE": "Кандидат",
    "PUBLICATION": "В публикацию",
    "WEEKLY": "В Weekly",
    "DISMISSED": "Пропущено",
    "EDITED": "Отредактировано",
}

FIELD_VALUE_LABELS = {
    "Rubric": {
        "TRAINING_LOG": "Дневник тренировок",
        "NUTRITION_CASE": "Разбор питания",
        "METHODOLOGY": "Методология",
        "WEEKLY CONTROL": "Недельный контроль",
        "SERIES": "Серия",
        "AI CHECK": "Проверка ИИ",
        "DECISION / AI_CHECK": "Решение / проверка ИИ",
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
}

SOURCE_LABELS = {
    "APPS SCRIPT / READ ONLY": "Apps Script / только чтение",
    "APPS SCRIPT / CONTROLLED": "Apps Script / управляемый доступ",
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
      .rf-subtitle { color: var(--rf-muted); max-width: 820px; font-size: 0.98rem; }
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
      [data-testid="stAlertContainer"] { background: rgba(127, 168, 188, .08) !important; border: 1px solid var(--rf-line) !important; color: var(--rf-white) !important; }
      [data-testid="stAlertContainer"] p { color: var(--rf-white) !important; }
      .stButton > button, .stDownloadButton > button, .stLinkButton > a { border: 1px solid var(--rf-brass); background: transparent; color: var(--rf-white); border-radius: 8px; }
      .stButton > button:hover, .stLinkButton > a:hover { border-color: var(--rf-white); color: var(--rf-white); }
      [data-testid="stDataFrame"] { border: 1px solid var(--rf-line); border-radius: 10px; overflow: hidden; }
      .rf-ok { color: var(--rf-green); }
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


def _columns(frame: pd.DataFrame, names: list[str]) -> list[str]:
    return [name for name in names if name in frame.columns]


def _display_table(frame: pd.DataFrame, fields: list[str]) -> pd.DataFrame:
    selected = _columns(frame, fields)
    view = frame[selected].copy()
    for field in selected:
        if field in {"Date", "Publish_At", "Display_Date"}:
            view[field] = view[field].map(_display_date)
        elif field in FIELD_VALUE_LABELS or field in {
            "Lifecycle_State", "Approval_Status", "Publication_Status",
            "Preview_Review_Status", "Public_Data_Allowed", "Text_Status",
            "Visual_Status", "Duplicate_Flag", "Manual_Gate", "Status",
            "Owner_Review_Status",
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
        ["Lifecycle_Priority", "Publish_Sort"], ascending=[True, True], na_position="last"
    )


def _candidate_queue(queue: pd.DataFrame) -> pd.DataFrame:
    if queue.empty or "Lifecycle_State" not in queue:
        return queue.iloc[0:0]
    result = queue[queue["Lifecycle_State"].isin(ACTIVE_PUBLICATION_STATES)].copy()
    return _sort_queue(result)


def _state_badge(state: str) -> str:
    css = "rf-badge rf-badge-error" if state == "ERROR" else "rf-badge"
    label = STATE_LABELS.get(state, state)
    return f'<span class="{css}">{escape(label)}</span>'


def _actions_enabled(bundle) -> bool:
    return "content.action" in set(bundle.capabilities)


def _source_label(source: str) -> str:
    return SOURCE_LABELS.get(source, source)


def render_header(source: str, capabilities: tuple[str, ...]) -> None:
    event_enabled = all(
        capability in set(capabilities)
        for capability in ("event.review", "event.decision", "event.media")
    )
    actions_enabled = "content.action" in set(capabilities)
    badge = "КОНТЕНТ + СОБЫТИЯ · v0.4" if event_enabled else (
        "КОНТРОЛИРУЕМЫЕ ДЕЙСТВИЯ · v0.3" if actions_enabled else "ТОЛЬКО ЧТЕНИЕ"
    )
    st.markdown('<div class="rf-kicker">R/Form · Контент-операции</div>', unsafe_allow_html=True)
    st.markdown('<div class="rf-title">Управление контентом</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="rf-subtitle">Один интерфейс для очереди публикаций и предложений Event Detector. '
        'Финальное решение всегда остаётся за владельцем.</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div style="margin-top:.8rem"><span class="rf-badge">{escape(badge)}</span> '
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
    cols[2].metric(
        "На подготовке",
        int(sum(state_counts.get(s, 0) for s in ("READY_TO_PUBLISH", "REVIEW", "APPROVED", "PLANNED"))),
    )
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
                '</div>',
                unsafe_allow_html=True,
            )

    left, right = st.columns([1.15, 1])
    with left:
        st.subheader("Активная очередь")
        view = candidates.head(8)
        if view.empty:
            st.caption("Нет активных материалов.")
        else:
            view = view.assign(Display_Date=_planned_dates(view))
            st.dataframe(
                _display_table(view, ["Content_ID", "Lifecycle_State", "Display_Date", "Rubric"]),
                hide_index=True,
                width="stretch",
            )
    with right:
        st.subheader("Требует решения")
        if action_required.empty:
            st.markdown(
                '<div class="rf-card"><span class="rf-ok">Критических блокировок нет.</span></div>',
                unsafe_allow_html=True,
            )
        else:
            st.dataframe(
                _display_table(
                    action_required.head(8),
                    ["Content_ID", "Lifecycle_State", "Blocking_Issue", "Publish_Error"],
                ),
                hide_index=True,
                width="stretch",
            )


def _render_content_actions(
    row: pd.Series,
    bundle,
    app_config: dict[str, Any],
    api_secrets: dict[str, Any],
) -> None:
    st.markdown("#### Управление материалом")
    state = _value(row, "Lifecycle_State", "")
    content_id = _value(row, "Content_ID", "")
    if state in TERMINAL_PUBLICATION_STATES:
        st.info("Материал закрыт. Изменение финального статуса из приложения запрещено.")
        return
    if not _actions_enabled(bundle):
        st.info("Действия пока отключены; просмотр данных работает.")
        return

    action = st.radio(
        "Выберите действие",
        list(ACTION_LABELS),
        format_func=lambda value: ACTION_LABELS[value],
        horizontal=True,
        key=f"content_action::{content_id}",
    )
    comment_required = action in {"RETURN_FOR_REVISION", "HOLD"}
    comment = st.text_area(
        "Комментарий" + (" — обязателен" if comment_required else " — необязательно"),
        max_chars=500,
        key=f"content_action_comment::{content_id}",
    )
    confirmed = st.checkbox(
        "Подтверждаю изменение мастер-таблицы",
        value=False,
        key=f"content_action_confirm::{content_id}",
    )
    disabled = not confirmed or (comment_required and not comment.strip())
    if st.button(
        "Применить действие",
        type="primary",
        disabled=disabled,
        key=f"content_action_submit::{content_id}",
    ):
        endpoint_url = str(app_config.get("apps_script_url", "")).strip()
        secret = str(api_secrets.get("secret", "")).strip()
        try:
            timeout_seconds = int(app_config.get("request_timeout_seconds", 20))
        except (TypeError, ValueError):
            timeout_seconds = 20
        try:
            result = execute_content_action(
                endpoint_url, secret, content_id, action, comment,
                timeout_seconds=timeout_seconds,
            )
        except (DataSourceError, ValueError) as exc:
            st.error(str(exc))
        else:
            status = str(result.get("status") or "APPLIED")
            suffix = "Уже было применено ранее." if status == "ALREADY_APPLIED" else "Изменение записано в журнал."
            st.session_state["content_action_success"] = f'«{ACTION_LABELS[action]}»: {content_id}. {suffix}'
            st.cache_data.clear()
            st.rerun()


def render_queue(bundle, app_config: dict[str, Any], api_secrets: dict[str, Any]) -> None:
    queue = bundle.queue
    st.subheader("Очередь контента")
    success_message = st.session_state.pop("content_action_success", "")
    if success_message:
        st.success(success_message)
    if queue.empty:
        st.info("Очередь контента пока пуста.")
        return

    show_archive = st.toggle(
        "Показать опубликованные и закрытые материалы",
        value=False,
        help="По умолчанию архив скрыт, чтобы в очереди оставалась только текущая работа.",
    )
    queue_scope = queue.copy() if show_archive else queue[~queue["Lifecycle_State"].isin(TERMINAL_PUBLICATION_STATES)].copy()

    f1, f2, f3 = st.columns([1, 1, 1.4])
    states = sorted(
        queue_scope["Lifecycle_State"].dropna().astype(str).unique().tolist(),
        key=lambda state: OPERATIONAL_PRIORITY.get(state, 89),
    )
    selected_states = f1.multiselect(
        "Статус", states, default=states,
        format_func=lambda state: STATE_LABELS.get(state, state),
    )
    rubrics = sorted(queue_scope.get("Rubric", pd.Series(dtype="object")).dropna().astype(str).unique().tolist())
    selected_rubrics = f2.multiselect(
        "Рубрика", rubrics,
        format_func=lambda rubric: _display_value("Rubric", rubric),
    )
    query = f3.text_input("Поиск", placeholder="Код материала или текст")

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
        _display_table(table, ["Content_ID", "Lifecycle_State", "Display_Date", "Rubric", "Content_Type"]),
        hide_index=True,
        width="stretch",
    )

    options = [value for value in filtered.get("Content_ID", pd.Series(dtype="object")).astype(str).str.strip().tolist() if value]
    if not options:
        return
    selected_id = st.selectbox("Открыть карточку материала", options)
    row = filtered[filtered["Content_ID"].astype(str) == selected_id].iloc[0]
    st.markdown(f"### {_value(row, 'Content_ID')}")
    st.markdown(_state_badge(_value(row, "Lifecycle_State")), unsafe_allow_html=True)

    tab_content, tab_readiness, tab_links = st.tabs(["Материал", "Готовность", "Ссылки"])
    with tab_content:
        st.markdown("#### Решение")
        st.write(_value(row, "Decision"))
        st.markdown("#### Направление")
        st.write(_value(row, "Editorial_Direction"))
        st.markdown("#### Предпросмотр Telegram")
        st.write(_value(row, "Telegram_Text"))
    with tab_readiness:
        issues = _value(row, "Readiness_Issues", "")
        if _value(row, "Lifecycle_State", "") in TERMINAL_PUBLICATION_STATES:
            st.info("Материал закрыт; повторная проверка не требуется.")
        elif issues:
            st.warning(issues)
        else:
            st.success("Все обязательные условия выполнены.")
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
            st.link_button(label, url, width="stretch")

    _render_content_actions(row, bundle, app_config, api_secrets)


def render_events(events: pd.DataFrame) -> None:
    st.subheader("Журнал событий")
    st.caption("Технический журнал Event Detector. Для ежедневной работы используйте раздел «Предложения». ")
    if events.empty:
        st.info("Журнал событий пока пуст.")
        return
    ranked = events.sort_values(
        ["Content_Value_Score_Num", "Event_Date_Sort"], ascending=[False, False], na_position="last"
    )
    st.dataframe(
        _display_table(
            ranked,
            ["Event_ID", "Date", "Event_Type", "Fact", "Content_Value_Score", "Manual_Gate", "Status", "Owner_Review_Status"],
        ),
        hide_index=True,
        width="stretch",
    )


def render_diagnostics(bundle) -> None:
    report = diagnostics(bundle)
    capabilities = set(bundle.capabilities)
    st.subheader("Диагностика")
    st.caption(f"Версия шлюза: {bundle.api_version or 'не указана'}")
    st.caption("Возможности: " + (", ".join(sorted(capabilities)) if capabilities else "только просмотр"))
    loaded_at = bundle.loaded_at.astimezone(ZoneInfo("Europe/Riga"))
    st.caption(f"Время загрузки: {loaded_at.strftime('%d.%m.%Y %H:%M:%S')} (Рига)")

    c1, c2 = st.columns(2)
    c1.metric("Материалов в очереди", report["queue_rows"])
    c2.metric("Событий в журнале", report["event_rows"])

    if report["queue_missing"]:
        st.warning("Очередь: отсутствуют поля: " + ", ".join(report["queue_missing"]))
    else:
        st.success("Очередь: обязательные поля присутствуют.")
    if report["event_missing"]:
        st.warning("События: отсутствуют базовые поля: " + ", ".join(report["event_missing"]))
    else:
        st.success("События: базовые поля присутствуют.")
    if report.get("event_owner_missing"):
        st.info("Для полного режима v0.4 не хватает полей: " + ", ".join(report["event_owner_missing"]))
    elif all(cap in capabilities for cap in ("event.review", "event.decision", "event.media")):
        st.success("Предложения R/Form: редактирование, решения и медиа доступны.")

    if report["queue_duplicates"] or report["event_duplicates"]:
        st.warning(
            f"Повторяющиеся идентификаторы: очередь — {report['queue_duplicates']}; события — {report['event_duplicates']}."
        )
    else:
        st.success("Повторяющиеся идентификаторы не найдены.")

    if st.button("Обновить данные"):
        st.cache_data.clear()
        st.rerun()


app_config = _secret_section("app")
api_secrets = _secret_section("content_api")

try:
    bundle = _cached_bundle(app_config, api_secrets)
except DataSourceError as exc:
    render_header("APPS SCRIPT / ERROR", ())
    st.error(str(exc))
    st.caption("Приложение остановлено: при ошибке рабочего источника тестовые данные не подставляются.")
    st.stop()

render_header(bundle.source, bundle.capabilities)
if bundle.source.startswith("DEMO"):
    st.warning(bundle.note)
else:
    st.caption(bundle.note)

with st.sidebar:
    st.markdown('<div class="rf-kicker">Навигация</div>', unsafe_allow_html=True)
    page = st.radio(
        "Раздел",
        ["Контроль", "Предложения", "Очередь", "События", "Диагностика"],
        label_visibility="collapsed",
    )
    st.markdown("---")
    st.caption("R/Form · Управление контентом v0.4")
    st.caption("Источник истины остаётся в Google Таблицах.")

if page == "Контроль":
    render_control(bundle.queue, bundle.events)
elif page == "Предложения":
    render_suggestions(bundle, app_config, api_secrets)
elif page == "Очередь":
    render_queue(bundle, app_config, api_secrets)
elif page == "События":
    render_events(bundle.events)
else:
    render_diagnostics(bundle)

st.markdown(
    '<div class="rf-footer">R/Form · система управления физической формой · '
    'Не угадывай. Управляй прогрессом.</div>',
    unsafe_allow_html=True,
)
