"""Minimal owner UX for Event Detector suggestions."""

from __future__ import annotations

import json
from html import escape
from typing import Any

import pandas as pd
import streamlit as st

from .repository import (
    DataSourceError,
    execute_event_decision,
    execute_event_review,
    upload_event_media,
)


SYSTEM_PROCESSED = {"PUBLISHED", "ALREADY_IN_PIPELINE", "FILTERED_OUT_V03"}
OWNER_PROCESSED = {"PUBLICATION", "WEEKLY", "DISMISSED"}


def _text(row: pd.Series, field: str, fallback: str = "") -> str:
    value = row.get(field, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    text = str(value).strip()
    return text or fallback


def _score(row: pd.Series) -> float:
    value = row.get("Content_Value_Score_Num", row.get("Content_Value_Score", 0))
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _score_label(value: float) -> str:
    if value >= 90:
        return "Флагман"
    if value >= 80:
        return "Приоритет"
    if value >= 65:
        return "Кандидат"
    return "В запас"


def _manual_gate(row: pd.Series) -> bool:
    value = _text(row, "Manual_Gate").upper()
    return bool(value) and not value.startswith("NO") and value not in {"НЕТ", "FALSE", "0"}


def _open_events(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return events.copy()
    result = events.copy()
    score = pd.to_numeric(result.get("Content_Value_Score", 0), errors="coerce").fillna(0)
    status = result.get("Status", pd.Series("", index=result.index)).fillna("").astype(str).str.strip().str.upper()
    owner = result.get("Owner_Review_Status", pd.Series("", index=result.index)).fillna("").astype(str).str.strip().str.upper()
    candidate = result.get("Candidate_Content_ID", pd.Series("", index=result.index)).fillna("").astype(str).str.strip()
    manual = result.get("Manual_Gate", pd.Series("", index=result.index)).fillna("").astype(str).str.upper()
    manual_mask = manual.ne("") & ~manual.str.startswith("NO")
    mask = (
        ((score >= 65) | manual_mask)
        & ~status.isin(SYSTEM_PROCESSED)
        & ~owner.isin(OWNER_PROCESSED)
        & candidate.eq("")
    )
    result = result.loc[mask].copy()
    if result.empty:
        return result
    if "Content_Value_Score_Num" not in result:
        result["Content_Value_Score_Num"] = score.loc[result.index]
    if "Event_Date_Sort" not in result:
        result["Event_Date_Sort"] = pd.to_datetime(result.get("Date", ""), errors="coerce", utc=True)
    return result.sort_values(
        ["Content_Value_Score_Num", "Event_Date_Sort"],
        ascending=[False, False],
        na_position="last",
    )


def _media_urls(row: pd.Series) -> list[str]:
    raw = _text(row, "Owner_Media_URLs")
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except (TypeError, ValueError):
        pass
    return [item.strip() for item in raw.splitlines() if item.strip()]


def _api_args(app_config: dict[str, Any], api_secrets: dict[str, Any]) -> tuple[str, str, int]:
    endpoint_url = str(app_config.get("apps_script_url", "")).strip()
    secret = str(api_secrets.get("secret", "")).strip()
    try:
        timeout = int(app_config.get("request_timeout_seconds", 20))
    except (TypeError, ValueError):
        timeout = 20
    return endpoint_url, secret, min(max(timeout, 5), 60)


def _infographic_prompt(row: pd.Series, fact: str, angle: str) -> str:
    source = _text(row, "Source", "DATA_EVENTS")
    event_id = _text(row, "Event_ID")
    event_type = _text(row, "Event_Type")
    return f"""Ты работаешь как 05_INFOGRAPHIC_STUDIO проекта R/Form by Rulev Denis.

ЗАДАЧА
Создай сопроводительную инфографику для Telegram-публикации R/Form на основе события ниже. Не пересказывай будущую подпись: визуал должен быстро передать один ключевой факт и одно решение/вывод.

ИСТОЧНИК ИСТИНЫ
Event_ID: {event_id}
Тип события: {event_type}
Источник: {source}
Факт для публикации: {fact}
Главная мысль: {angle}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА
— используй только данные, явно приведённые выше; ничего не додумывай;
— если для блока ПЛАН → ФАКТ → РЕШЕНИЕ не хватает одного из элементов, не изобретай его: используй только доступные части;
— главный акцент — на проверяемом факте и принятом решении, а не на мотивационном лозунге;
— ИИ анализирует и визуализирует данные, но не заменяет человека или профильного специалиста;
— не обещай будущий спортивный результат.

ВИЗУАЛЬНАЯ СИСТЕМА R/Form
— формат 1080×1350, вертикальная карточка для Telegram;
— Carbon #0B1016 — фон;
— Clear White #F2F5F7 — основной текст;
— Steel Data #7FA8BC — данные и вторичные элементы;
— brass-акцент #A88958 — только для решения/главного акцента;
— Onest для заголовков, IBM Plex Mono для чисел/данных;
— без неона, градиентов, декоративной спортивной агрессии и случайных фото атлетов;
— плотная, но легко считываемая мобильная композиция.

СТРУКТУРА
1. Короткий заголовок до 7 слов.
2. Один главный факт крупно.
3. Короткая интерпретация — только если она прямо следует из исходных данных.
4. Блок «РЕШЕНИЕ» или «ВЫВОД» с главным смыслом: {angle}
5. Нижний маркер: R/Form · ПЛАН → ФАКТ → РЕШЕНИЕ.

Сначала проверь, что ни один факт не был добавлен от себя. Затем создай финальную инфографику в стилистике R/Form."""


def _save_review(
    endpoint_url: str,
    secret: str,
    timeout: int,
    event_id: str,
    fact: str,
    angle: str,
    note: str,
) -> None:
    try:
        execute_event_review(
            endpoint_url, secret, event_id, fact, angle, note,
            timeout_seconds=timeout,
        )
    except (DataSourceError, ValueError) as exc:
        st.error(str(exc))
        return
    st.session_state["event_success"] = "Изменения сохранены."
    st.cache_data.clear()
    st.rerun()


def _apply_decision(
    endpoint_url: str,
    secret: str,
    timeout: int,
    event_id: str,
    decision: str,
    fact: str,
    angle: str,
    note: str,
) -> None:
    try:
        result = execute_event_decision(
            endpoint_url, secret, event_id, decision, fact, angle, note,
            timeout_seconds=timeout,
        )
    except (DataSourceError, ValueError) as exc:
        st.error(str(exc))
        return
    if decision == "TO_PUBLICATION":
        content_id = str(result.get("candidate_content_id") or "").strip()
        message = "Событие добавлено в очередь публикаций."
        if content_id:
            message += f" Материал: {content_id}."
    elif decision == "TO_WEEKLY":
        message = "Событие сохранено для ближайшего Weekly Control."
    else:
        message = "Событие больше не будет предлагаться."
    st.session_state["event_success"] = message
    st.cache_data.clear()
    st.rerun()


def render_suggestions(bundle, app_config: dict[str, Any], api_secrets: dict[str, Any]) -> None:
    """Render the minimal owner-facing Event Detector workflow."""

    st.subheader("Предложения R/Form")
    st.caption(
        "Event Detector показывает только сильные необработанные события. "
        "Вы можете поправить формулировку, добавить фото/видео и одним действием выбрать судьбу материала."
    )

    success = st.session_state.pop("event_success", "")
    if success:
        st.success(success)

    candidates = _open_events(bundle.events)
    if candidates.empty:
        st.success("Новых событий, требующих редакционного решения, сейчас нет.")
        return

    manual_count = int(candidates.apply(_manual_gate, axis=1).sum())
    priority_count = int((candidates["Content_Value_Score_Num"] >= 80).sum())
    a, b, c = st.columns(3)
    a.metric("Новых предложений", len(candidates))
    b.metric("Приоритетных", priority_count)
    c.metric("Нужна ваша проверка", manual_count)

    option_labels: dict[str, str] = {}
    for _, item in candidates.iterrows():
        event_id = _text(item, "Event_ID")
        score = _score(item)
        option_labels[event_id] = (
            f"{_text(item, 'Date', '—')} · {int(score)}/100 · "
            f"{_score_label(score)} · {_text(item, 'Event_Type', 'Событие')}"
        )
    event_ids = list(option_labels)
    selected_id = st.selectbox(
        "Выберите событие",
        event_ids,
        format_func=lambda value: option_labels.get(value, value),
        key="event_suggestion_selected",
    )
    row = candidates[candidates["Event_ID"].astype(str) == selected_id].iloc[0]
    score = _score(row)

    st.markdown(
        '<div class="rf-card rf-card-decision">'
        '<div class="rf-label">Событие</div>'
        f'<div class="rf-value">{escape(_text(row, "Event_Type", "Событие"))}</div>'
        f'<div class="rf-detail">{escape(_text(row, "Date", "—"))} · '
        f'{int(score)}/100 · {escape(_score_label(score))}</div>'
        '</div>',
        unsafe_allow_html=True,
    )
    if _manual_gate(row):
        st.warning(
            "Это событие требует вашего явного решения. Автоматически в публикацию оно не попадёт."
        )

    original_fact = _text(row, "Fact")
    fact = st.text_area(
        "Факт для публикации",
        value=_text(row, "Owner_Fact", original_fact),
        height=145,
        max_chars=5000,
        help="Можно исправить формулировку. Исходная запись Event Detector при этом не удаляется.",
        key=f"event_fact::{selected_id}",
    )
    default_angle = _text(row, "Owner_Angle") or _text(row, "Recommended_Angle_1")
    angle = st.text_input(
        "Главная мысль",
        value=default_angle,
        max_chars=700,
        placeholder="Что должен понять читатель?",
        key=f"event_angle::{selected_id}",
    )
    note = st.text_area(
        "Комментарий — необязательно",
        value=_text(row, "Owner_Note"),
        height=80,
        max_chars=2000,
        placeholder="Контекст для подготовки поста, если он нужен",
        key=f"event_note::{selected_id}",
    )

    capabilities = set(bundle.capabilities)
    review_enabled = "event.review" in capabilities
    decision_enabled = "event.decision" in capabilities
    media_enabled = "event.media" in capabilities
    endpoint_url, secret, timeout = _api_args(app_config, api_secrets)

    save_col, prompt_col = st.columns(2)
    with save_col:
        if st.button(
            "Сохранить изменения",
            width="stretch",
            disabled=not review_enabled or not fact.strip() or not angle.strip(),
            key=f"event_save::{selected_id}",
        ):
            _save_review(endpoint_url, secret, timeout, selected_id, fact, angle, note)
    with prompt_col:
        if st.button(
            "Промпт для инфографики",
            width="stretch",
            disabled=not fact.strip() or not angle.strip(),
            key=f"event_prompt::{selected_id}",
        ):
            st.session_state[f"event_prompt_text::{selected_id}"] = _infographic_prompt(row, fact, angle)

    prompt_text = st.session_state.get(f"event_prompt_text::{selected_id}", "")
    if prompt_text:
        st.caption("Скопируйте промпт кнопкой в правом верхнем углу блока и вставьте в ChatGPT.")
        st.code(prompt_text, language=None, wrap_lines=True)

    st.markdown("#### Фото и видео")
    urls = _media_urls(row)
    folder_url = _text(row, "Owner_Media_Folder_URL")
    if urls:
        st.caption(f"Уже прикреплено файлов: {len(urls)}")
        link_cols = st.columns(min(len(urls), 3))
        for index, url in enumerate(urls):
            with link_cols[index % len(link_cols)]:
                if url.startswith(("https://", "http://")):
                    st.link_button(f"Файл {index + 1}", url, width="stretch")
    elif folder_url:
        st.link_button("Открыть папку медиа", folder_url, width="stretch")
    else:
        st.caption("Можно прикрепить исходное фото или короткое видео. Файлы сохраняются в Google Drive.")

    uploads = st.file_uploader(
        "Добавить фото/видео",
        type=["jpg", "jpeg", "png", "webp", "mp4", "mov"],
        accept_multiple_files=True,
        help="До 30 МБ на файл. Файлы остаются приватными в RFORM_SYSTEM / CONTENT_ASSETS.",
        key=f"event_media::{selected_id}",
    )
    if uploads:
        too_large = [item.name for item in uploads if getattr(item, "size", 0) > 30 * 1024 * 1024]
        if too_large:
            st.warning("Файлы больше 30 МБ не будут загружены: " + ", ".join(too_large))
        valid_uploads = [item for item in uploads if getattr(item, "size", 0) <= 30 * 1024 * 1024]
        if st.button(
            "Прикрепить выбранные файлы",
            width="stretch",
            disabled=not media_enabled or not valid_uploads,
            key=f"event_media_submit::{selected_id}",
        ):
            uploaded = 0
            with st.spinner("Сохраняю файлы в Google Drive…"):
                for item in valid_uploads:
                    try:
                        upload_event_media(
                            endpoint_url,
                            secret,
                            selected_id,
                            item.name,
                            item.type or "application/octet-stream",
                            item.getvalue(),
                            timeout_seconds=max(timeout, 60),
                        )
                    except (DataSourceError, ValueError) as exc:
                        st.error(f"{item.name}: {exc}")
                    else:
                        uploaded += 1
            if uploaded:
                st.session_state["event_success"] = f"Прикреплено файлов: {uploaded}."
                st.cache_data.clear()
                st.rerun()

    if not review_enabled or not decision_enabled or not media_enabled:
        st.info(
            "Интерфейс уже готов, но запись событий и загрузка медиа включатся после обновления "
            "Apps Script шлюза до v0.4. Просмотр и генерация промпта работают уже сейчас."
        )

    st.markdown("#### Что сделать с событием")
    col_publication, col_weekly, col_skip = st.columns(3)
    disabled = not decision_enabled or not fact.strip() or not angle.strip()
    with col_publication:
        if st.button(
            "В публикацию",
            type="primary",
            width="stretch",
            disabled=disabled,
            key=f"event_to_publication::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "TO_PUBLICATION", fact, angle, note,
            )
    with col_weekly:
        if st.button(
            "В Weekly",
            width="stretch",
            disabled=disabled,
            key=f"event_to_weekly::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "TO_WEEKLY", fact, angle, note,
            )
    with col_skip:
        if st.button(
            "Пропустить",
            width="stretch",
            disabled=disabled,
            key=f"event_dismiss::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "DISMISS", fact, angle, note,
            )

    with st.expander("Исходные данные Event Detector"):
        st.write(original_fact or "—")
        st.caption(f"Event ID: {_text(row, 'Event_ID', '—')}")
        st.caption(f"Источник: {_text(row, 'Source', '—')}")
        angles = [_text(row, f"Recommended_Angle_{index}") for index in range(1, 4)]
        angles = [value for value in angles if value]
        if angles:
            st.markdown("**Предложенные системой углы:**")
            for index, value in enumerate(angles, 1):
                st.write(f"{index}. {value}")
