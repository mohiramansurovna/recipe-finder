# Source Rating Audit

The local Food.com source has individual ratings in `RAW_interactions.csv`; `RAW_recipes.csv` has no aggregate-rating column. The audit joined interaction recipe IDs to the prepared recipe IDs and did not retain contributor or rater identities.

| Finding | Result |
|---|---:|
| Interaction rows | 1,132,367 |
| Rating value 0 (unrated) | 60,847 |
| Positive source ratings | 1,071,520 |
| Prepared recipes with positive ratings | 226,590 of 231,636 |
| Positive-rating mean | 4.6615 |

| Rating | Count |
|---:|---:|
| 1 | 12,818 |
| 2 | 14,123 |
| 3 | 40,855 |
| 4 | 187,360 |
| 5 | 816,364 |

Source and user ratings use whole-number values from 1 to 5. Exclude 0 and compute the combined aggregate from all individual values, weighted by their counts. Raw and prepared dataset files remain local.

At audit time, the local prepared snapshot had no `ratings.csv` and all prepared recipe aggregate fields were empty. Regenerate the prepared output and reimport it before validating ratings in the graph.
