# AI extraction eval suite

**Offline run** (`python manage.py eval_suite`): stored answers from the
fixtures are replayed, so this measures the pipeline, not the model.
`eval_suite --live` asks the model. Prompt `extraction_v1`.

**Result: PASS**

| Check | Result | Threshold | Verdict | Detail |
| --- | ---: | ---: | --- | --- |
| Golden set: shown values that are right | 99% | >= 90% | pass | 168 of 169 values shown were right |
| Golden set: non-subscription emails rejected | 100% | >= 100% | pass | 3 of 3 rejected for the right reason |
| Hallucination: model values the email does not support | 2% | <= 5% | pass | 4 of 173 values the model gave |
| Hallucination: wrong values shown green | 0 | <= 0 | pass | 0 shown green and wrong |
| Consistency: same answer in 3 runs | n/a | >= 95% | skipped | not measured offline. Replaying one stored answer would always agree with itself. |
| Bias: counterfactual pairs extracted identically | 100% | >= 80% | pass | 5 of 5 pairs. Offline this checks the pipeline, with the stored answer. |
| Model: every answer from the model asked for | n/a |  yes | skipped | not measured offline |

## Where it fell short

Unsupported model values (caught by grounding unless listed as green below):
- `github-hallucinated-plan`: `plan_name`
- `netflix-price-change`: `subscription_type`
- `max-wrong-year`: `trial_ends_on`
- `max-wrong-year`: `start_date`

Per-field detail for the golden set is in `extraction-eval.md`.
