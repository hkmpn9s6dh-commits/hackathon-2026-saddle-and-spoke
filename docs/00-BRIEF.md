# 00 — BRIEF

One page. What this is, who it is for, and the constraint that shaped it.

## The site

**Saddle & Spoke**, 11 Quay Street, Saltcoats. A bicycle workshop with two benches, open
Thursday evening and Saturday morning. One page that is also the shop: a technical drawing
of a road bike, a job sheet, a parts bench and a counter.

## The visitor

Someone whose bike is doing something wrong and who has put off dealing with it, because
the alternative is phoning a shop during the two hours a week it is open. They arrive with
a symptom, not a diagnosis: "third gear jumps when I push hard uphill."

## What the page does that a booking form cannot

A booking form asks you to pick a service from a list you do not understand and a time you
cannot know is right. This page asks what the bike is doing, then does the work a good
mechanic does at the counter: narrow the cause, check what is in stock, quote the time,
and offer a slot that the parts can actually make.

The output is a document, not a conversation: findings, parts, labour, a total, a booking
with a receipt. The conversation is in the margin.

## The constraint

A workshop cannot fund an inference endpoint, and should not want to. So the site
publishes no default model. It runs a recorded session through the real runtime for
anyone who arrives without a key, and calls the visitor's own OpenAI-compatible router
when they bring one. The agent graph is data; the inference is pluggable; the shop is the
same either way.

## The second constraint

The interesting part of this challenge is not the chat. It is that a site can be
*composed*: another site's page can load this workshop's agents and run them, and this
workshop can ask a parts co-op without telling it who the customer is. That is what the
peer site is for, and it is why the private-context rules are visible in the Inspector
rather than buried in a config file.

## Done means

`bash scripts/verify.sh` green on a fresh clone; the seven interoperability checks
observable in the browser; a two-minute video with the entrant's own voice; the submission
copy written; the site live at a public URL.
