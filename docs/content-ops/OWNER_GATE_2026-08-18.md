# Owner Gate — 18.08.2026

Task: `RFORM-CONTENT-OPS-AUDIT-20260818-001`.

The full decision packet is stored in the Google Drive audit workspace. This repository note records only the decisions that affect code/content operations.

## Gate 1 — 107.5 kg recalibration content

Choose:

- **A — standalone post** before the 23.08 Weekly Control; recommended by the audit because the event scores 94/100 and closes the public decision arc created on 17.08.
- **B — Weekly only**, using the event as the opening conflict of the 23.08 Weekly Control.

No publication is scheduled until this gate is resolved.

## Gate 2 — vertical footage routine

Starting 19.08, capture only:

1. 10–20 sec key bench set in vertical 9:16;
2. 2–3 sec immediately after the set;
3. optional 2–3 sec plate/bar setup.

No need to film every exercise.

## Gate 3 — Event Detector production activation

Staging code: `automation/content_event_detector_v0_1.gs`.

Safe first action: place it in a standalone Apps Script project and run only `rformContentEventDetectorPreview()`.

Do not connect it directly to `CONTENT_QUEUE` or Telegram.
