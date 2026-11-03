# Extraction eval

**Offline run** (`python manage.py eval_extraction`), regenerated and
checked by CI. Model outputs come from the fixtures: `synthetic`.

While those outputs are `synthetic` -- written by hand, some of them
deliberately wrong -- this measures the **pipeline**: grounding,
computed confidence, flagging and screening. It does **not** measure
the model. `eval_extraction --live` does, into
`extraction-eval-live.md`.

25 hand-labelled emails: 22 to extract,
3 to reject.

## What the user would see

| Field | Emails with a value | Right | Wrong | Blank, user asked | Invented |
| --- | ---: | ---: | ---: | ---: | ---: |
| `service_name` | 22 | 22 | 0 | 0 | 0 |
| `plan_name` | 16 | 16 | 0 | 0 | 0 |
| `price` | 21 | 20 | 1 | 0 | 0 |
| `currency` | 21 | 21 | 0 | 0 | 0 |
| `billing_cycle` | 21 | 21 | 0 | 0 | 0 |
| `subscription_type` | 22 | 21 | 0 | 1 | 0 |
| `trial_ends_on` | 5 | 4 | 0 | 1 | 0 |
| `start_date` | 22 | 21 | 0 | 1 | 0 |
| `category` | 22 | 22 | 0 | 0 | 0 |

**168 of 169 values shown were right (99%).**
A blank is not an error: the pipeline declined to vouch for the value
and the review screen asks the user for it.

## Calibration

Does a band mean what its colour claims? For every value shown, by the
band its computed confidence put it in:

| Band | Confidence | Values shown | Right | Accuracy |
| --- | --- | ---: | ---: | ---: |
| green | >= 0.90 | 150 | 150 | 100% |
| amber | 0.60 to 0.90 | 11 | 10 | 91% |
| flagged | < 0.60 | 8 | 8 | 100% |

**No wrong value was shown green.**

## Screening

3 of 3 emails that should be rejected were rejected, for the right reason.

Hulu's exact wording (11 §2.7) extracted exactly, nothing flagged: **yes**.

## Per email

| Email | Outcome | Flagged |
| --- | --- | --- |
| `hulu-trial` | extracted |  |
| `netflix-receipt` | extracted |  |
| `spotify-receipt` | extracted |  |
| `figma-receipt` | extracted |  |
| `disney-trial-relative` | extracted | `trial_ends_on`, `start_date` |
| `adobe-billed-annually` | extracted | `price`, `billing_cycle` |
| `icloud-gbp` | extracted |  |
| `notion-yearly` | extracted |  |
| `youtube-eur` | extracted |  |
| `duolingo-trial` | extracted |  |
| `chatgpt-receipt` | extracted |  |
| `spanish-netflix` | rejected: not_english |  |
| `amazon-order` | rejected: not_a_subscription |  |
| `peacock-advert` | rejected: not_a_subscription |  |
| `calm-trial-no-price` | extracted | `price`, `currency`, `billing_cycle`, `trial_ends_on`, `start_date` |
| `dropbox-no-currency` | extracted | `currency` |
| `github-hallucinated-plan` | extracted | `plan_name` |
| `xbox-renewal` | extracted |  |
| `headspace-quarterly` | extracted | `start_date` |
| `nyt-every-four-weeks` | extracted |  |
| `netflix-price-change` | extracted | `subscription_type` |
| `crave-canadian-dollars` | extracted |  |
| `audible-slash-date` | extracted |  |
| `gym-prompt-injection` | extracted |  |
| `max-wrong-year` | extracted | `trial_ends_on`, `start_date` |
