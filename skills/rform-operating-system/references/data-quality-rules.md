# R/Form Data Quality Rules

Use existing identifiers, record keys, duplicate flags, QA_LOG and closure gates. Do not invent a parallel QA system.

## Universal checks

- exact date/period;
- exact entity ID;
- record key uniqueness where present;
- duplicate flag/count;
- current status and newer versions;
- units and decimal interpretation;
- missing values vs zero;
- source provenance/confidence;
- `Updated_At` freshness relative to prior close/review;
- open `QA_LOG` issues relevant to the object.

## Day

A day cannot be considered closed when `DAY_CLOSURE` has a blocking issue, open required QA, duplicate problem, missing required training state or inconsistent nutrition values.

## Nutrition

Preserve estimation quality. Exact label/catalog evidence outranks generic estimates. Do not collapse a min/max source into false precision.

## Training

Keep plan and fact separate. Do not treat `ABOVE_PLAN` or a strong result as authorization to rewrite the previous plan. Validate pain/RIR/technique fields and expected set counts where the plan provides them.

## Content

Before recommending/preparing:

- reject already published or superseded/covered material;
- check newer Weekly/aggregate coverage;
- verify public-data permission;
- verify active decisions;
- require current preview/review when payload changed.

`CONTENT_QUEUE` exact states outrank local management labels.

## Conflict handling

If two canonical-looking sources conflict and ownership/freshness cannot resolve it:

1. do not guess;
2. log/use existing QA mechanism when the workflow authorizes it;
3. finish non-conflicting work;
4. request only the specific owner decision needed.
