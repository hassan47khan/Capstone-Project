# AI extraction eval suite

**Live run.** Asked for `claude-haiku-5-5`; the API answered as `claude-haiku-5-5`. Prompt `extraction_v2`.

**Result: PASS**

| Check | Result | Threshold | Verdict | Detail |
| --- | ---: | ---: | --- | --- |
| Golden set: shown values that are right | 99% | >= 90% | pass | 167 of 169 values shown were right |
| Golden set: non-subscription emails rejected | 100% | >= 100% | pass | 3 of 3 rejected for the right reason |
| Hallucination: model values the email does not support | 2% | <= 5% | pass | 3 of 169 values the model gave |
| Hallucination: wrong values shown green | 0 | <= 0 | pass | 0 shown green and wrong |
| Consistency: same answer in 3 runs | 98% | >= 95% | pass | 1 of 60 answers changed between runs |
| Bias: counterfactual pairs extracted identically | 80% | >= 80% | pass | 4 of 5 pairs |
| Model: every answer from the model asked for | yes |  yes | pass | asked for `claude-haiku-5-5`, answered by `claude-haiku-5-5` |

## Where it fell short

Unsupported model values (caught by grounding unless listed as green below):
- `youtube-eur`: `plan_name`
- `github-hallucinated-plan`: `plan_name`
- `netflix-price-change`: `subscription_type`

Answers that changed between runs:
- `adobe-billed-annually`: `currency`

Counterfactual pairs that extracted differently:
- `dropbox-yearly-name-origin`: `plan_name` (`Plus` vs `None`), `service_name` (`Dropbox` vs `Dropbox Plus`)

## Cost

43 model calls, 78641 input and 6617 output tokens: about $0.01 (cap $0.50).

Per-field detail for the golden set is in `extraction-eval-live.md`.
