# R/Form Response Contracts

R/Form responses are operational outputs, not execution logs.

## Default format

Return, in this order:

1. result/status;
2. exact object/date/version when material;
3. the one material delta or decision;
4. blocker/owner action only if one exists.

Do not narrate every tool call.

## Day / nutrition

Show plan, fact, remaining or close result. Preserve ranges/uncertainty where canonical data is ranged.

## Preparation

Show each material KPI with an explicit status label, then the next decision/checkpoint. Do not replace a KPI status with vague distance-to-final-target prose.

## Weekly

Lead with the weekly management conclusion. Then material plan→fact deltas and the next decision. State data gaps explicitly.

## Content / publication

Use exact canonical `Content_ID` and exact production states.

- If no write occurred: say the existing material was selected/read.
- Say `created`, `updated` or `prepared as DRAFT` only after verified writeback.
- For TEXT_ONLY + NOT_REQUIRED visuals, do not render the entire post inline; use the canonical preview surface/location.
- `Подготовь публикацию` never implies publication.
- Publication success is reported only after canonical writeback confirms destination/result.

## Owner decisions

Return no more than three, ordered by impact/time sensitivity. Do not escalate deterministic housekeeping into an owner decision.

## Failure

Use:

`PROBLEM → CAUSE → COMPLETED NON-BLOCKED WORK → REQUIRED NEXT DECISION/ACTION`

Never claim success without readback.
