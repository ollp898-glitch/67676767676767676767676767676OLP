# Flashscore event-link audit, October 8

Source snapshot: 2026-10-07T17:33:49.395Z, 48 events / 1613 outcomes.
All 18 missing links were inspected against current sport/day feeds. Fourteen soccer identities were also checked on the actual Flashscore event pages. Exact scoped aliases resolve 13; a reviewed, event-ID-and-date-bound participant-order mapping resolves Forge–Pacific. No general soccer order relaxation is applied.

Expected coverage on this fixed snapshot: 30/48 -> 44/48 (91.7%). Soccer 18/32 -> 32/32; baseball 4/4, American football 2/2, hockey 3/3, basketball 1/1, cricket 2/6.

The four remaining cricket events are not confirmed in the observed sport/day feeds or checked team schedules:

| Source event | UTC start | Checked Flashscore team page |
|---|---|---|
| Kuwait–Thailand | 2026-10-08 01:15 | https://www.flashscore.com/team/kuwait/8xNDxcuC/fixtures/ |
| China–Maldives | 2026-10-08 06:00 | https://www.flashscore.com/team/china/fZI9wwQ5/results/ |
| Saudi Arabia–Singapore | 2026-10-08 06:00 | https://www.flashscore.com/team/singapore/hjb0ngUO/ |
| Malaysia–Hong Kong | 2026-10-08 06:00 | https://www.flashscore.com/team/malaysia/MeBk6Ze8/ |

This is observed absence, not proof Flashscore will never add these matches. Kuwait's page lists next fixtures starting October 22; Malaysia's Hong Kong match is September 24 in Asian Games, a different event and not a valid substitute. No team/league homepage is presented as a match link.

`node combo2/refresh-event-links.js snapshot` repairs missing links in a validated saved layer without requesting bookmaker odds or rewriting market outcomes, probabilities, rankings or source rows. It emits `event-link-audit.json` and readable `event-links.md`; the manual additive-layer workflow runs this step. New scanner builds use the same reviewed matching aliases. Existing verified links are retained. Numeric policies, schedules and fair-probability logic are unchanged.
