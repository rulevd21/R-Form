#!/usr/bin/env python3
"""Deterministic scoring core for R/Form Strength Trend Scout v1.

This module does not fetch the internet and does not write R/Form state.
Agent Reach (or another approved research capability) collects external
signals; this module normalizes cluster scoring and editorial disposition.

Input JSON:
{
  "now": "2026-10-11T16:00:00Z",  # optional; defaults to current UTC
  "clusters": [
    {
      "cluster_key": "rir-autoregulation",
      "audience_fit": 0.9,
      "rform_fit": 1.0,
      "reader_value": 0.9,
      "rform_position_available": true,
      "signals": [ ... ]
    }
  ]
}

The script writes scored JSON to stdout and has no external dependencies.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PLATFORM_CAP = 4
RECENT_SOURCE_CAP = 6


def _clamp01(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(number) or math.isinf(number):
        return 0.0
    return max(0.0, min(1.0, number))


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _age_days(moment: datetime | None, now: datetime) -> float | None:
    if moment is None:
        return None
    seconds = (now - moment).total_seconds()
    return max(0.0, seconds / 86400.0)


def _freshness_factor(published_at: datetime | None, now: datetime) -> float:
    age = _age_days(published_at, now)
    if age is None:
        return 0.10
    if age <= 7:
        return 1.00
    if age <= 14:
        return 0.70
    if age <= 30:
        return 0.40
    return 0.10


def _source_identity(signal: dict[str, Any]) -> str:
    """Prefer an explicit underlying-source key, then URL, then signal id.

    Collectors should set source_key when the same paper/article/video is
    syndicated across multiple platforms. This prevents repost distribution
    from becoming fake cross-platform evidence.
    """
    for key in ("source_key", "url", "signal_id"):
        value = signal.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return json.dumps(signal, sort_keys=True, ensure_ascii=False)


def _dedupe_signals(signals: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for signal in signals:
        if not isinstance(signal, dict):
            continue
        identity = _source_identity(signal)
        if identity in seen:
            continue
        seen.add(identity)
        result.append(signal)
    return result


@dataclass(frozen=True)
class ScoreBreakdown:
    freshness: float
    cross_platform: float
    velocity: float
    authority: float
    audience_fit: float
    rform_fit: float

    @property
    def total(self) -> float:
        return sum(
            (
                self.freshness,
                self.cross_platform,
                self.velocity,
                self.authority,
                self.audience_fit,
                self.rform_fit,
            )
        )

    def as_dict(self) -> dict[str, float]:
        return {
            "freshness": round(self.freshness, 2),
            "cross_platform": round(self.cross_platform, 2),
            "velocity": round(self.velocity, 2),
            "authority": round(self.authority, 2),
            "audience_fit": round(self.audience_fit, 2),
            "rform_fit": round(self.rform_fit, 2),
            "total": round(self.total, 2),
        }


def _score_breakdown(cluster: dict[str, Any], signals: list[dict[str, Any]], now: datetime) -> ScoreBreakdown:
    if signals:
        freshness = 20.0 * sum(
            _freshness_factor(_parse_iso(signal.get("published_at")), now)
            for signal in signals
        ) / len(signals)
    else:
        freshness = 0.0

    platforms = {
        str(signal.get("platform", "")).strip().lower()
        for signal in signals
        if str(signal.get("platform", "")).strip()
    }
    cross_platform = 25.0 * min(len(platforms) / PLATFORM_CAP, 1.0)

    recent_count = 0
    for signal in signals:
        event_time = _parse_iso(signal.get("published_at")) or _parse_iso(signal.get("discovered_at"))
        age = _age_days(event_time, now)
        if age is not None and age <= 7:
            recent_count += 1
    velocity = 20.0 * min(recent_count / RECENT_SOURCE_CAP, 1.0)

    authorities = sorted(
        (_clamp01(signal.get("authority")) for signal in signals),
        reverse=True,
    )[:3]
    authority = 15.0 * (sum(authorities) / len(authorities) if authorities else 0.0)

    audience_fit = 10.0 * _clamp01(cluster.get("audience_fit"))
    rform_fit = 10.0 * _clamp01(cluster.get("rform_fit"))

    return ScoreBreakdown(
        freshness=freshness,
        cross_platform=cross_platform,
        velocity=velocity,
        authority=authority,
        audience_fit=audience_fit,
        rform_fit=rform_fit,
    )


def _classify(cluster: dict[str, Any], signals: list[dict[str, Any]], breakdown: ScoreBreakdown, now: datetime) -> str:
    score = breakdown.total
    platforms = {
        str(signal.get("platform", "")).strip().lower()
        for signal in signals
        if str(signal.get("platform", "")).strip()
    }
    recent_count = 0
    for signal in signals:
        event_time = _parse_iso(signal.get("published_at")) or _parse_iso(signal.get("discovered_at"))
        age = _age_days(event_time, now)
        if age is not None and age <= 7:
            recent_count += 1

    if score >= 80 and len(platforms) >= 3 and recent_count >= 5:
        return "BREAKOUT"
    if score >= 60 and len(platforms) >= 2 and recent_count >= 3:
        return "TREND"

    has_primary = any(bool(signal.get("primary_evidence")) for signal in signals)
    strong_primary_watch = has_primary and _clamp01(cluster.get("rform_fit")) >= 0.60
    if score >= 45 or strong_primary_watch:
        return "WATCH"
    return "NOISE"


def _editorial_disposition(cluster: dict[str, Any], trend_class: str) -> str:
    reader_value = _clamp01(cluster.get("reader_value"))
    rform_fit = _clamp01(cluster.get("rform_fit"))
    position = bool(cluster.get("rform_position_available"))

    if trend_class in {"TREND", "BREAKOUT"} and reader_value >= 0.60 and rform_fit >= 0.60 and position:
        return "CONTENT_CANDIDATE"
    if trend_class in {"WATCH", "TREND", "BREAKOUT"} and (reader_value >= 0.40 or position):
        return "WATCH"
    return "NO_POST"


def score_cluster(cluster: dict[str, Any], now: datetime) -> dict[str, Any]:
    raw_signals = cluster.get("signals") or []
    signals = _dedupe_signals(raw_signals if isinstance(raw_signals, list) else [])
    breakdown = _score_breakdown(cluster, signals, now)
    trend_class = _classify(cluster, signals, breakdown, now)
    disposition = _editorial_disposition(cluster, trend_class)

    platforms = sorted(
        {
            str(signal.get("platform", "")).strip().lower()
            for signal in signals
            if str(signal.get("platform", "")).strip()
        }
    )

    return {
        "cluster_key": str(cluster.get("cluster_key") or "unclassified"),
        "trend_class": trend_class,
        "trend_score": round(breakdown.total, 2),
        "score_breakdown": breakdown.as_dict(),
        "editorial_disposition": disposition,
        "independent_sources": len(signals),
        "platforms": platforms,
        "primary_evidence_count": sum(bool(signal.get("primary_evidence")) for signal in signals),
        "audience_fit": _clamp01(cluster.get("audience_fit")),
        "rform_fit": _clamp01(cluster.get("rform_fit")),
        "reader_value": _clamp01(cluster.get("reader_value")),
        "rform_position_available": bool(cluster.get("rform_position_available")),
    }


def score_payload(payload: dict[str, Any]) -> dict[str, Any]:
    now = _parse_iso(payload.get("now")) or datetime.now(timezone.utc)
    clusters = payload.get("clusters") or []
    if not isinstance(clusters, list):
        raise ValueError("clusters must be a list")

    scored = [score_cluster(cluster, now) for cluster in clusters if isinstance(cluster, dict)]
    scored.sort(key=lambda item: (-item["trend_score"], item["cluster_key"]))

    editorial_candidates = [
        item for item in scored if item["editorial_disposition"] == "CONTENT_CANDIDATE"
    ][:3]

    return {
        "contract": "RFORM_STRENGTH_TREND_SCOUT_V1",
        "scored_at": now.isoformat().replace("+00:00", "Z"),
        "cluster_count": len(scored),
        "clusters": scored,
        "top_editorial_candidates": editorial_candidates,
    }


def _load_payload(path: str | None) -> dict[str, Any]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.load(sys.stdin)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score normalized R/Form strength-training trend clusters")
    parser.add_argument("input", nargs="?", help="Input JSON file; omit to read stdin")
    args = parser.parse_args(argv)

    try:
        payload = _load_payload(args.input)
        result = score_payload(payload)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
