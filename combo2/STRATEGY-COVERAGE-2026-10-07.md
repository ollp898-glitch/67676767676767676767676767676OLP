# Strategy and exact-provider coverage, October 7

Fixed source snapshot 2026-10-07T09:31:35.668Z. Ordinary Combo: 1895 → 1172 outcomes; 219 → 39 events. Excluded from the old verified Combo: {"tennis":500,"esports":223}. General Scanner collection and classification are unchanged. Summary/audit additionally count exclusions across all saved scanner outcomes, including those below Combo thresholds.

Comparison below applies both old and new matching to the SAME retained outcomes, observed feeds and live quotes. It excludes tennis/esports from both sides to isolate recognition gains; it is not a comparison between different scan times.

| Sport | Events | Outcomes | Flashscore events | BMR events | BMR outcomes | Any bookmaker | Fair probability |
|---|---:|---:|---:|---:|---:|---:|---:|
| soccer | 20 | 818 | 4 → 19 | 0 → 0 | 0 → 0 | 63 → 401 | 41 → 286 |
| cricket | 9 | 10 | 1 → 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| baseball | 4 | 175 | 4 → 4 | 3 → 4 | 5 → 6 | 19 → 19 | 19 → 19 |
| american-football | 2 | 133 | 2 → 2 | 0 → 2 | 0 → 5 | 63 → 63 | 63 → 63 |
| hockey | 3 | 15 | 0 → 3 | 0 → 3 | 0 → 6 | 0 → 15 | 0 → 15 |
| basketball | 1 | 21 | 0 → 1 | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 |

Event unmatched before → after: {"before":{"flashscore":{"Participants not confirmed in sport feeds":28},"bmr":{"event_not_in_feed":35}},"after":{"flashscore":{"Participants not confirmed in sport feeds":7},"bmr":{"event_not_in_feed":29}}}. BMR's actual date/sport feed returned 16 events, with no soccer/cricket events in this window. Reviewed NHL/CFB/MLB full-name aliases recover six mislabeled absence cases; unavailable events are not invented. Flashscore has six cricket fixtures absent from its returned feeds and a Canadian soccer fixture with reversed participant order, which remains unmatched rather than relaxing order checks.

21 new Flashscore event mappings, six BMR event mappings and WNBA overtime winner/spread/half-line totals are covered by live fixtures and negative sport/league/time/selection tests. Exact periods and signed lines, fair full-market evidence and bookmaker account deduplication remain required. All numeric Scanner/Combo policies and workflow schedules are unchanged.
