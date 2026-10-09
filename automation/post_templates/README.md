# Full training post and photo workflow

Owner request, 9 October 2026: retain the complete exercise list in a card matching the Training summary; add bench and total tonnage in the caption; distinguish received, staged, saved and previewed photos.

## Reviewed example: S-20261009-C

Source: TRAINING_SESSIONS row 53 and TRAINING_SETS rows 826–839. All 14 recorded working sets, duration 65 minutes. Owner explicitly confirmed dumbbell weights are per dumbbell.

| Exercise | Recorded load and reps | Tonnage, kg |
| --- | --- | ---: |
| Barbell bench | 80 × 6 × 4 | 1920 |
| Squat | 110 × 8 × 3 | 2640 |
| Chest supported dumbbell row | 35 × 2 dumbbells × 12 × 3 | 2520 |
| Dumbbell chest fly | 16 × 2 × 15 + 15 × 2 × 15 | 930 |
| Rear delt fly | 10 × 2 × 15 × 2 | 600 |
| Total | 14 working sets | 8610 |

Bench tonnage excludes chest fly even though its legacy exercise category is BENCH. Warm-ups and bodyweight are excluded. Card weights are per dumbbell, matching the source; caption tonnage counts both.

Proposed publication: album, summary card first, owner's existing staged personal photo second; one caption on the first image. Example renderer produces the card and a 516-character caption. This is a proposed layout, not a live Telegram preview. Do not reconstruct the personal photo from screenshots or replace the owner's staged assets.

## Concrete changes in this branch

- New training drafts preserve every exercise group, set tuple and RIR. Above Telegram's 4096-character text limit, preparation is blocked rather than silently truncating exercises.
- Photo receipt explicitly separates draft count from saved count and supplies review buttons with the next steps.
- Review explains one photo or album, caption or separate message, using the existing 1024-character caption rule.
- Save confirms the saved photo count and directs the owner to final preview. Saving does not authorize publication.
- Regression tests cover full exercise retention, variable weights, oversized reports and photo receipt routing. All 171 Node tests pass.

## Remaining installation and integration

These changes and the example card are prepared, not deployed. Existing queue rows and pending drafts have not been changed. The renderer is an explicit example, not an automatic card generator.

Before applying the format to the existing material, read and preserve the owner's current pending photo assets; save their selected order through the content API, then add the generated card first and the reviewed caption. Use the API's existing version and hash guards. Never write CONTENT_QUEUE directly. Deliver the exact saved album through final preview before owner approval.

For automatic cards and tonnage across other workouts, add a generic source-backed renderer and an explicit per-side/load-unit contract. Missing or ambiguous dumbbell semantics must block the total or request clarification; do not guess from exercise names or double all loads. Do not infer BENCH tonnage from category alone. Future cards must include every recorded exercise, with actual weights and set-specific RIR.

## Current phone steps

The provided screenshot shows one staged photo and zero saved photos. On that review screen choose “Сохранить эту версию”, then “Финальный предпросмотр” in the refreshed card. This preserves the current draft; it does not add the newly prepared summary card automatically. The summary-card album must be prepared as a subsequent reviewed revision.
