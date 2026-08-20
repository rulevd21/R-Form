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

EVENT_TYPE_LABELS = {
    "PLAN_FACT_GAP": "Отклонение плана от факта",
    "REPEATED_DEVIATION": "Повторяющееся отклонение",
    "STABLE_SIGNAL": "Стабильный сигнал",
    "TRAINING_DEVIATION": "Сигнал тренировки",
}


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


def _display_date(value: str) -> str:
    text = str(value).strip()
    if not text:
        return "—"
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=False)
    if pd.isna(parsed):
        return text
    return parsed.strftime("%d.%m.%Y")


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


def _event_type_label(value: str) -> str:
    normalized = str(value).strip().upper()
    return EVENT_TYPE_LABELS.get(normalized, value or "Событие")


def _recommended_decision(score: float) -> tuple[str, str]:
    if score >= 80:
        return (
            "Добавить в публикации",
            "Сильный сигнал: создать черновик материала и передать его в обычную подготовку.",
        )
    return (
        "Сохранить для Weekly",
        "Полезный сигнал: сохранить для недельного вывода, не создавая отдельную публикацию.",
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

ПОЧЕМУ ЭТО РАБОТАЕТ
После результата кратко объясни, как выбранная композиция отделяет проверяемый факт от интерпретации, направляет внимание к решению и сохраняет визуальную систему R/Form.

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


def render_suggestions(bundle, app_config: dict[str, Any], api_secrets: dict[str, Any]) -> bool:
    """Render one clear owner decision and keep preparation tools optional."""

    success = st.session_state.pop("event_success", "")
    if success:
        st.success(success)

    candidates = _open_events(bundle.events)
    if candidates.empty:
        st.success("Новых предложений, требующих вашего решения, сейчас нет.")
        return False

    st.subheader("Что решить сейчас")
    if len(candidates) == 1:
        st.caption("Одно предложение за раз. Обычное решение занимает меньше минуты.")
    else:
        st.caption(
            f"Одно предложение за раз. Сейчас показано первое из {len(candidates)}; "
            "остальные подождут."
        )

    option_labels: dict[str, str] = {}
    for _, item in candidates.iterrows():
        event_id = _text(item, "Event_ID")
        score_value = _score(item)
        option_labels[event_id] = (
            f"{_display_date(_text(item, 'Date'))} · {int(score_value)}/100 · "
            f"{_event_type_label(_text(item, 'Event_Type', 'Событие'))}"
        )
    event_ids = list(option_labels)
    selected_key = "event_suggestion_selected"
    if st.session_state.get(selected_key) not in event_ids:
        st.session_state[selected_key] = event_ids[0]

    if len(event_ids) > 1:
        with st.expander(f"Другие предложения: {len(event_ids) - 1}"):
            st.selectbox(
                "Перейти к другому предложению",
                event_ids,
                format_func=lambda value: option_labels.get(value, value),
                key=selected_key,
            )
    selected_id = str(st.session_state[selected_key])
    row = candidates[candidates["Event_ID"].astype(str) == selected_id].iloc[0]
    score = _score(row)
    event_type = _event_type_label(_text(row, "Event_Type", "Событие"))
    recommendation, recommendation_note = _recommended_decision(score)

    original_fact = _text(row, "Fact")
    default_fact = _text(row, "Owner_Fact", original_fact)
    default_angle = _text(row, "Owner_Angle") or _text(row, "Recommended_Angle_1")
    default_note = _text(row, "Owner_Note")
    fact_key = f"event_fact::{selected_id}"
    angle_key = f"event_angle::{selected_id}"
    note_key = f"event_note::{selected_id}"
    if fact_key not in st.session_state:
        st.session_state[fact_key] = default_fact
    if angle_key not in st.session_state:
        st.session_state[angle_key] = default_angle
    if note_key not in st.session_state:
        st.session_state[note_key] = default_note
    fact = str(st.session_state[fact_key]).strip()
    angle = str(st.session_state[angle_key]).strip()
    note = str(st.session_state[note_key]).strip()

    st.markdown(
        '<div class="rf-card rf-card-decision">'
        '<div class="rf-label">Следующее решение</div>'
        f'<div class="rf-value">{escape(event_type)}</div>'
        f'<div class="rf-detail">{escape(_display_date(_text(row, "Date")))} · '
        f'{int(score)}/100 · {escape(_score_label(score))}</div>'
        '</div>',
        unsafe_allow_html=True,
    )
    if _manual_gate(row):
        st.warning("Нужно ваше явное решение. Система ничего не отправит автоматически.")

    st.markdown("#### Факт")
    st.write(fact or "Факт не заполнен")
    st.markdown("#### Главная мысль")
    st.write(angle or "Главная мысль не заполнена")
    st.info(f"Рекомендация: **{recommendation}**. {recommendation_note}")

    capabilities = set(bundle.capabilities)
    review_enabled = "event.review" in capabilities
    decision_enabled = "event.decision" in capabilities
    media_enabled = "event.media" in capabilities
    endpoint_url, secret, timeout = _api_args(app_config, api_secrets)

    if not decision_enabled:
        st.warning(
            "Решения пока недоступны: действующий Apps Script нужно обновить до v0.4. "
            "До обновления можно только проверить формулировки."
        )

    with st.expander("Изменить предложение или добавить материалы"):
        fact = st.text_area(
            "Факт для публикации",
            height=130,
            max_chars=5000,
            help="Исходная запись Event Detector останется в истории.",
            key=fact_key,
        )
        angle = st.text_input(
            "Главная мысль",
            max_chars=700,
            placeholder="Что должен понять читатель?",
            key=angle_key,
        )
        note = st.text_area(
            "Комментарий — необязательно",
            height=80,
            max_chars=2000,
            placeholder="Контекст для подготовки материала",
            key=note_key,
        )

        save_col, prompt_col = st.columns(2)
        with save_col:
            if st.button(
                "Сохранить черновик",
                width="stretch",
                disabled=not review_enabled or not fact.strip() or not angle.strip(),
                key=f"event_save::{selected_id}",
            ):
                _save_review(endpoint_url, secret, timeout, selected_id, fact, angle, note)
        with prompt_col:
            if st.button(
                "Задание для инфографики",
                width="stretch",
                disabled=not fact.strip() or not angle.strip(),
                key=f"event_prompt::{selected_id}",
            ):
                st.session_state[f"event_prompt_text::{selected_id}"] = _infographic_prompt(
                    row, fact, angle
                )

        prompt_text = st.session_state.get(f"event_prompt_text::{selected_id}", "")
        if prompt_text:
            st.caption("Скопируйте задание и вставьте его в ChatGPT.")
            st.code(prompt_text, language=None, wrap_lines=True)

        st.markdown("##### Фото и видео — необязательно")
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

        uploads = st.file_uploader(
            "Добавить фото/видео",
            type=["jpg", "jpeg", "png", "webp", "mp4", "mov"],
            accept_multiple_files=True,
            help="До 30 МБ на файл. Файлы сохраняются приватно в Google Drive.",
            key=f"event_media::{selected_id}",
        )
        if uploads:
            too_large = [
                item.name for item in uploads
                if getattr(item, "size", 0) > 30 * 1024 * 1024
            ]
            if too_large:
                st.warning("Файлы больше 30 МБ не будут загружены: " + ", ".join(too_large))
            valid_uploads = [
                item for item in uploads
                if getattr(item, "size", 0) <= 30 * 1024 * 1024
            ]
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

        st.markdown("##### Исходные данные Event Detector")
        st.write(original_fact or "—")
        st.caption(f"Код события: {_text(row, 'Event_ID', '—')}")
        st.caption(f"Источник: {_text(row, 'Source', '—')}")
        angles = [_text(row, f"Recommended_Angle_{index}") for index in range(1, 4)]
        angles = [value for value in angles if value]
        if angles:
            st.markdown("**Другие предложенные мысли:**")
            for index, value in enumerate(angles, 1):
                st.write(f"{index}. {value}")

    st.markdown("### Ваше решение")
    st.caption("Ни один вариант не публикует материал в Telegram.")
    col_publication, col_weekly, col_skip = st.columns(3)
    disabled = not decision_enabled or not fact.strip() or not angle.strip()
    with col_publication:
        if st.button(
            "Добавить в публикации",
            type="primary",
            width="stretch",
            disabled=disabled,
            key=f"event_to_publication::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "TO_PUBLICATION", fact, angle, note,
            )
        st.caption("Создаст черновик в очереди. Публикация не запускается.")
    with col_weekly:
        if st.button(
            "Сохранить для Weekly",
            width="stretch",
            disabled=disabled,
            key=f"event_to_weekly::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "TO_WEEKLY", fact, angle, note,
            )
        st.caption("Сохранит событие для недельного вывода без отдельного поста.")
    with col_skip:
        if st.button(
            "Не использовать",
            width="stretch",
            disabled=disabled,
            key=f"event_dismiss::{selected_id}",
        ):
            _apply_decision(
                endpoint_url, secret, timeout, selected_id,
                "DISMISS", fact, angle, note,
            )
        st.caption("Уберёт предложение из входящих. Исходное событие сохранится.")

    return True
