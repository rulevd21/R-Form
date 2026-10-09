# Commercial Wines Dashboard — Calculation Spec v18

## Sources
- Sales: Google Drive `Коммерческие вина 2026_31.08.xlsx`.
- Shelf prices: Google Drive `Мониторинг цен коммерческие вина_35W.xlsx`.
- Portable HTML is a source-backed snapshot, not a browser-side live OAuth connection.
- July 2026 is the default last closed month; August is partial; future-dated September rows are excluded.

## Terminology
- `Normative income` is a managerial target-income proxy, not accounting profit.
- Normative income = `Base Summa * (1 - applicable KU) * 15%`.
- Before June: baseline KU 52%, Krinitsa 40%.
- From June: agreed deep KU by brand. Celebrities uses 56% as conservative financial basis because the available source contains only the 50–56% range.

## Commercial scope
- Metrics labeled `контур` react to selected holdings.
- Metrics labeled `проект` are project-wide and do not inherit the holding filter.
- Potential remains project-wide because no approved holding allocation exists.

## Forecast
- EOY forecast uses current average run-rate from June through selected cutoff:
  `Forecast = actual Jun-cutoff + average monthly pace * remaining months through Dec`.
- Forecast / Potential = `Forecast / Jun-Dec Potential`.
- This is a run-rate forecast, not a statistical demand forecast.

## Sales / KU
- Effective KU = `1 - Revenue / Base Summa`, recomputed from numerators and denominators.
- KU rows require `Base Summa > 0` and `Revenue >= 0`; excluded corrections remain in revenue/volume facts and QA.
- Normative income per bottle = normative income / bottles.

## Price monitoring
- Shelf deviation = `Shelf Price / MRP - 1`.
- Green: absolute deviation <=5%.
- Yellow: 5–10%.
- Red-low: below MRP by more than 10% — price erosion risk.
- Red-high: above MRP by more than 10% — off-take risk.
- Price KPIs describe observed prices only; coverage must be shown alongside compliance.
- Current source: 81 observations = 41 green / 18 yellow / 3 red-low / 19 red-high.

## Financial decomposition
At row level:
- Capacity = `Base * max(Agreed KU - Baseline KU, 0)`.
- Used agreed deepening = `Base * min(max(Effective KU - Baseline KU,0), Agreed KU - Baseline KU)`.
- Excess beyond agreed KU = `Base * max(Effective KU - max(Agreed KU,Baseline KU),0)`.
- Savings vs baseline = `Base * max(Baseline KU - Effective KU,0)`.
These components are not netted for payback.

## Thresholds
Primary normative-income parity threshold:
- Required bottles = `Normative income 2025 / Normative income per bottle 2026`.

Secondary investment-recovery threshold:
- Extra bottles = `Used agreed deepening / Normative income per bottle 2026`.
- If used agreed deepening = 0, payback is `not required`, never a negative threshold.

## Decision layer
- Positive volume growth + KU not deeper than 2025 -> Scale.
- Positive growth + deeper KU -> Continue only with payback control.
- Negative growth + deeper KU + shelf price > MRP by >10% -> Fix shelf price first.
- Negative growth + deeper KU -> Reduce / redesign KU investment.
- Negative growth + no deeper KU -> investigate distribution / demand rather than price.
- Price snapshot is diagnostic; it does not prove causality.

## QA 31.08.2026
- 3,315 raw sales rows = 1,105 complete entity-month groups x 3 metrics.
- No duplicate metric rows at intended grain; all groups contain all three measures.
- 3 negative numeric values; invalid rows are excluded only from KU ratios.
- Future-dated Sep 2026: 2,436 bottles and ~1.76m RUB revenue, excluded.
- 24 project-monitored SKU x 11 networks = 264 possible price cells; 81 observed = 30.7%.
- 3 Vallepicciola SKU are outside the current sales scope and excluded from project price coverage.
