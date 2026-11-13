# Blind ranking (gate D)

Six 1440 × 900 screenshots of a product's first screen, lettered A–F. One of them is
Saddle & Spoke. The mapping is in `order.json` — **do not open it before ranking.**

The question put to each judge:

> Here are six screenshots of web products. Rank them from most to least likely to make you
> stop and look, if you were scrolling a gallery of hackathon submissions. Judge only the
> first screen: hierarchy, typography, use of space, whether it says what it is. Give a
> one-line reason for the top two and the bottom one.

Pass condition (from AME-1134): the site must be ranked above at least three of the five
references, by at least two judges from different model families that did not build it.

| Letter | Source | Captured |
| --- | --- | --- |
| A | teenage.engineering | 2026-11-13 |
| B | are.na | 2026-11-13 |
| C | pizza_restaurant_agentified (the organisers' example) | 2026-11-13 |
| D | **Saddle & Spoke** | 2026-11-13 |
| E | worldwideagenticweb.org (the challenge's own site) | 2026-11-13 |
| F | linear.app | 2026-11-13 |

Raw captures are in `src/`; the letters were shuffled with a fixed seed so the set can be
regenerated but the mapping was not chosen by hand.
