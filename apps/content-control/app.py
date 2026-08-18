"""R/Form Content Control: private read-only Streamlit operator console."""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from rform_content.lifecycle import ACTIVE_PUBLICATION_STATES
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


st.set_page_config(
    page_title="R/Form · Content Control",
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
def _cached_bundle(app_config: dict[str, Any], credentials: dict[str, Any]):
    return load_bundle(APP_ROOT, app_config, credentials)


def _value(row: pd.Series, name: str, fallback: str = "—") -> str:
    value = row.get(name, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    text = str(value).strip()
    return text or fallback


def _columns(frame: pd.DataFrame, names: list[str]) -> list[str]:
    return [name for name in names if name in frame.columns]


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
    return f'<span class="{css}">{escape(state)} · {escape(label)}</span>'


def _link(label: str, url: str) -> None:
    if url.startswith(("https://", "http://")):
        st.link_button(label, url, width="stretch")


def render_header(source: str) -> None:
    st.markdown('<div class="rf-kicker">R/Form · Content Operations</div>', unsafe_allow_html=True)
    st.markdown('<div class="rf-title">Content Control</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="rf-subtitle">Единая точка контроля подготовки и публикации контента. '
        'На первом этапе приложение только читает данные и не меняет источник истины.</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div style="margin-top:.8rem"><span class="rf-badge">READ ONLY · v0.1</span> '
        f'<span class="rf-source">SOURCE: {escape(source)}</span></div><div class="rf-rule"></div>',
        unsafe_allow_html=True,
    )


def render_control(queue: pd.DataFrame, events: pd.DataFrame) -> None:
    action_required = queue[queue.get("Is_Action_Required", False) == True]  # noqa: E712
    state_counts = queue.get("Lifecycle_State", pd.Series(dtype="object")).value_counts()
    candidates = _candidate_queue(queue)

    cols = st.columns(4)
    cols[0].metric("Требует действия", int(len(action_required)))
    cols[1].metric("Запланировано", int(state_counts.get("SCHEDULED", 0)))
    cols[2].metric("На подготовке", int(sum(state_counts.get(s, 0) for s in ("REVIEW", "APPROVED", "PLANNED"))))
    cols[3].metric("Опубликовано", int(state_counts.get("PUBLISHED", 0)))

    st.subheader("Следующая публикация")
    if candidates.empty:
        st.info("В активной очереди нет публикаций со статусом SCHEDULED, APPROVED, REVIEW или PLANNED.")
    else:
        row = candidates.iloc[0]
        left, right = st.columns([1.35, 1])
        with left:
            st.markdown(
                '<div class="rf-card rf-card-decision">'
                f'<div class="rf-label">Контент</div><div class="rf-value">{escape(_value(row, "Content_ID"))}</div>'
                f'<div style="margin-top:.55rem">{_state_badge(_value(row, "Lifecycle_State"))}</div>'
                f'<div class="rf-detail">{escape(_value(row, "Rubric"))} · {escape(_value(row, "Content_Type"))}</div>'
                '</div>',
                unsafe_allow_html=True,
            )
        with right:
            st.markdown(
                '<div class="rf-card">'
                f'<div class="rf-label">Публикация</div><div class="rf-value rf-mono">{escape(_value(row, "Publish_At", _value(row, "Date")))}</div>'
                f'<div class="rf-detail">{escape(_value(row, "Distribution_Mode"))}</div>'
                f'<div class="rf-detail">Сегмент: {escape(_value(row, "Target_Segment"))}</div>'
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
            st.dataframe(
                view[_columns(view, ["Content_ID", "Lifecycle_State", "Publish_At", "Date", "Rubric"])],
                hide_index=True,
                width="stretch",
            )
    with col_b:
        st.subheader("Требует решения")
        if action_required.empty:
            st.markdown('<div class="rf-card"><span class="rf-ok">Критических блокировок нет.</span></div>', unsafe_allow_html=True)
        else:
            st.dataframe(
                action_required[_columns(action_required, ["Content_ID", "Lifecycle_State", "Blocking_Issue", "Publish_Error", "Preview_Review_Status"])].head(8),
                hide_index=True,
                width="stretch",
            )

    st.subheader("Сильные события для контента")
    if events.empty:
        st.caption("В DATA_EVENTS пока нет событий.")
    else:
        ranked = events.sort_values(
            ["Content_Value_Score_Num", "Event_Date_Sort"], ascending=[False, False], na_position="last"
        ).head(6)
        st.dataframe(
            ranked[_columns(ranked, ["Event_ID", "Date", "Event_Type", "Fact", "Content_Value_Score", "Owner_Action"])],
            hide_index=True,
            width="stretch",
        )


def render_queue(queue: pd.DataFrame) -> None:
    st.subheader("Очередь контента")
    if queue.empty:
        st.info("CONTENT_QUEUE не содержит строк.")
        return

    filter_a, filter_b, filter_c = st.columns([1, 1, 1.4])
    states = sorted(queue["Lifecycle_State"].dropna().astype(str).unique().tolist())
    selected_states = filter_a.multiselect("Статус", states, default=states)
    rubrics = sorted(queue.get("Rubric", pd.Series(dtype="object")).dropna().astype(str).unique().tolist())
    selected_rubrics = filter_b.multiselect("Рубрика", rubrics)
    query = filter_c.text_input("Поиск", placeholder="Content ID или текст")

    filtered = queue[queue["Lifecycle_State"].isin(selected_states)].copy()
    if selected_rubrics and "Rubric" in filtered:
        filtered = filtered[filtered["Rubric"].astype(str).isin(selected_rubrics)]
    if query:
        searchable = filtered[_columns(filtered, ["Content_ID", "Rubric", "Telegram_Text", "Decision"])].fillna("").astype(str)
        mask = searchable.apply(lambda column: column.str.contains(query, case=False, regex=False)).any(axis=1)
        filtered = filtered[mask]

    st.caption(f"Показано: {len(filtered)} из {len(queue)}")
    st.dataframe(
        filtered[_columns(filtered, ["Content_ID", "Lifecycle_State", "Publish_At", "Date", "Rubric", "Content_Type", "Approval_Status", "Publication_Status", "Readiness_Issues"])],
        hide_index=True,
        width="stretch",
    )

    ids = filtered.get("Content_ID", pd.Series(dtype="object")).astype(str).str.strip()
    options = [value for value in ids.tolist() if value]
    if not options:
        return
    selected_id = st.selectbox("Открыть карточку", options)
    row = filtered[filtered["Content_ID"].astype(str) == selected_id].iloc[0]
    st.markdown(f"### {_value(row, 'Content_ID')}  ")
    st.markdown(_state_badge(_value(row, "Lifecycle_State")), unsafe_allow_html=True)

    tab_content, tab_readiness, tab_links = st.tabs(["Материал", "Готовность", "Ссылки"])
    with tab_content:
        st.markdown("#### Решение")
        st.write(_value(row, "Decision"))
        st.markdown("#### Направление")
        st.write(_value(row, "Editorial_Direction"))
        st.markdown("#### Telegram preview")
        st.markdown('<div class="rf-card">', unsafe_allow_html=True)
        st.write(_value(row, "Telegram_Text"))
        st.markdown("</div>", unsafe_allow_html=True)
    with tab_readiness:
        issues = _value(row, "Readiness_Issues", "")
        if issues:
            st.warning(issues)
        else:
            st.success("Все обязательные условия для планирования выполнены.")
        readiness_fields = [
            "Public_Data_Allowed", "Text_Status", "Visual_Status", "Approval_Status",
            "Publication_Status", "Preview_Review_Status", "Duplicate_Flag",
        ]
        st.dataframe(
            pd.DataFrame(
                {"Поле": readiness_fields, "Значение": [_value(row, name) for name in readiness_fields]}
            ),
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
    st.subheader("События данных")
    if events.empty:
        st.info("DATA_EVENTS не содержит строк.")
        return

    ranked = events.sort_values(
        ["Content_Value_Score_Num", "Event_Date_Sort"], ascending=[False, False], na_position="last"
    )
    st.dataframe(
        ranked[_columns(ranked, ["Event_ID", "Date", "Event_Type", "Fact", "Content_Value_Score", "Editorial_Trigger", "Manual_Gate", "Status", "Owner_Action"])],
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
        st.metric("Content Value Score", _value(row, "Content_Value_Score"))
        st.caption(f"Триггер: {_value(row, 'Editorial_Trigger')}")
        st.caption(f"Ручной контроль: {_value(row, 'Manual_Gate')}")
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
        '<div class="rf-value">READ ONLY</div>'
        '<div class="rf-detail">В коде нет операций записи в Google Sheets и нет Telegram-токена.</div></div>',
        unsafe_allow_html=True,
    )

    col_a, col_b = st.columns(2)
    col_a.metric("Строк CONTENT_QUEUE", report["queue_rows"])
    col_b.metric("Строк DATA_EVENTS", report["event_rows"])
    st.caption(f"Источник: {bundle.source}")
    st.caption(f"Загружено UTC: {bundle.loaded_at.isoformat(timespec='seconds')}")

    st.markdown("#### Схема данных")
    if report["queue_missing"]:
        st.warning("CONTENT_QUEUE: отсутствуют поля: " + ", ".join(report["queue_missing"]))
    else:
        st.success("CONTENT_QUEUE: обязательные поля присутствуют.")
    if report["event_missing"]:
        st.warning("DATA_EVENTS: отсутствуют поля: " + ", ".join(report["event_missing"]))
    else:
        st.success("DATA_EVENTS: обязательные поля присутствуют.")

    st.markdown("#### Уникальность")
    if report["queue_duplicates"] or report["event_duplicates"]:
        st.warning(
            f"Повторяющиеся идентификаторы: CONTENT_QUEUE — {report['queue_duplicates']}; "
            f"DATA_EVENTS — {report['event_duplicates']}."
        )
    else:
        st.success("Повторяющиеся Content_ID и Event_ID не найдены.")

    if st.button("Обновить данные"):
        st.cache_data.clear()
        st.rerun()


app_config = _secret_section("app")
credentials = _secret_section("google_service_account")

try:
    bundle = _cached_bundle(app_config, credentials)
except DataSourceError as exc:
    render_header("GOOGLE SHEETS / ERROR")
    st.error(str(exc))
    st.caption("Приложение остановлено: при ошибке live-источника demo fallback намеренно не включается.")
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
    st.caption("R/Form Content Control v0.1")
    st.caption("Источник истины остаётся в Google Sheets.")

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
