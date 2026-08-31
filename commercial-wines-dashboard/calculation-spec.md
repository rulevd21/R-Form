# Commercial Wines Dashboard — Calculation Spec v17

## Sources
- Sales: Google Drive `Коммерческие вина 2026_31.08.xlsx`.
- Shelf prices: Google Drive `Мониторинг цен коммерческие вина_35W.xlsx`.
- Portable HTML is a source-backed snapshot, not a browser-side live OAuth connection.
- July 2026 is the default last closed month; August is partial; future-dated September rows are excluded.

## Sales / KU
- Effective KU = `1 - Revenue / Base Summa`, recomputed from numerators and denominators.
- KU rows require `Base Summa > 0` and `Revenue >= 0`; excluded corrections stay in revenue/volume facts and QA.
- Target income = `Base Summa * (1 - applicable KU) * 15%`.
- Before June: baseline KU 52%, Krinitsa 40%.
- From June: agreed deep KU by brand. Celebrities uses 56% as conservative financial basis because the new Drive folder contains only the 50–56% range, not the prior SKU-level mapping.
- Target income per bottle = target income / bottles.

## Marketing
- Recovery index = post-launch 2026/2025 volume index minus Jan-May 2026/2025 volume index, pp.
- Volume/revenue gap = revenue YoY % minus volume YoY %.
- Shelf deviation = Shelf Price / MRP - 1.
- Zones: green <=5% absolute deviation; yellow >5% and <=10%; red >10%.
- Price project coverage = observed project price cells / (24 project-monitored SKU x monitored selected networks).
- Required pace acceleration = required monthly pace to Jun-Dec potential / actual monthly pace since June.

## Financial decomposition
At row level:
- Capacity = `Base * max(Agreed KU - Baseline KU, 0)`.
- Used agreed deepening = `Base * min(max(Effective KU - Baseline KU,0), Agreed KU - Baseline KU)`.
- Excess beyond agreed KU = `Base * max(Effective KU - max(Agreed KU,Baseline KU),0)`.
- Savings vs baseline = `Base * max(Baseline KU - Effective KU,0)`.
These components are not netted for payback.

## Thresholds
Primary income-parity threshold:
- Required bottles = `Target income 2025 / Target income per bottle 2026`.
Secondary investment-recovery threshold:
- Extra bottles = `Used agreed deepening / Target income per bottle 2026`.

## QA 31.08.2026
- 3,315 raw sales rows = 1,105 complete entity-month groups x 3 metrics.
- No duplicate metric rows at intended grain; all groups contain all three measures.
- 3 negative numeric values; invalid rows are excluded only from KU ratios.
- Future-dated Sep 2026: 2,436 bottles and ~1.76m RUB revenue, excluded.
- Price monitor reconciles to 81 observed prices: 41 green / 18 yellow / 22 red.
- Project price scope: 24 SKU x 11 networks = 264 cells; 81 observed = 30.7%.
- 3 Vallepicciola SKU are outside the sales project scope and excluded from project price coverage.
