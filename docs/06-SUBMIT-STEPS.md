# 06 — Submitting it

The parts only the account holder can do. Each step says exactly what to click and what to
paste, in the order Devpost asks for it.

Deadline: **2027-01-11 16:00 UTC** — 2027-01-12 00:00 Beijing. Do not leave it to the last
day: Devpost is slow in the final hour.

## 0. Before you start (5 minutes, once)

- [ ] A Devpost account, signed in.
- [ ] The video: `video/saddle-and-spoke.mp4` — **your voice over it**. The rules say the
      entrant must explain the project, not an AI. `docs/08-VOICE.md` has the script with
      timecodes; record it on your phone or in Audacity and drop the file at
      `video/voice.wav`, then run `node scripts/video.mjs` to mux it.
- [ ] `submission/` folder open: cover, screenshots, this file.

## 1. Join the challenge

1. Open https://cognizant-agenticweb.devpost.com/
2. Click **Join hackathon** (top right of the challenge header). If it says *Register*, do
   that first — it is the same button.
3. Complete the registration form. It asks for your name, email, country. Nothing to pay.

## 2. Create the project

1. From the challenge page, open **Project gallery** → **Submit a project** (or the
   **Create project** button in the top nav).
2. **Project name**: `Saddle & Spoke`
3. **Elevator pitch** — paste this exactly:

```
A bicycle workshop that publishes itself as an agent network. Describe a fault; the page diagnoses it, prices it, and books the bench — and the drawing annotates itself as the agents work.
```

4. **Thumbnail**: upload `submission/cover-3x2.jpg` (1500 × 1000).
5. **Video demo**: paste the YouTube URL once it is uploaded and set to *Public* or
   *Unlisted*. Not *Private*: judges cannot open a private video.
6. **Image gallery**: upload, in this order —
   `submission/shot-01-bench.jpg`, `submission/shot-02-checks.jpg`, `submission/shot-03-peer.jpg`.
7. **"Try it out" links** — add all three:
   - `https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/`
   - `https://github.com/hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke`
   - `https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/check/`
8. **Built with**: `typescript`, `vite`, `agentic-web`, `open-agentic-web`, `webmcp`,
   `json-schema`, `no-dependencies`

## 3. The story fields

Devpost splits "About the project" into optional sections. Paste from `docs/05-SUBMISSION.md`:

| Devpost field | Take from |
| --- | --- |
| Inspiration | §Inspiration |
| What it does | §What it does |
| How we built it | §How we built it |
| Challenges we ran into | §Challenges |
| Accomplishments that we're proud of | the second and third paragraphs of §How we built it, plus the conformance checker |
| What we learned | §What we learned |
| What's next for Saddle & Spoke | §What's next |

## 4. The three questions at the bottom

- **"If your project uses Mozilla Otari…"** — this project does **not** use Otari. Leave
  the Otari email field empty; if the form insists, enter nothing and the field will not
  block submission. (If you later wire an Otari key in the Model panel, fill it in then.)
- **"Additional tools or services shared with the community"** — paste:

```
A conformance checker for other entrants: https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/check/

Point it at any agentic site and it reports which of the seven interoperability checks from §6 of MVP Profile 0.2 can be observed from the outside — manifest reachability and CORS, exact network-name match, definition reachability, data-only validation with the site's declared actions and bound peers, and links.json. MIT licensed, part of the same repository under check/.
```

- **"Anything else?"** — paste:

```
Nothing in this build needs an API key to be seen. The site ships a replay router that implements the same interface as a live one, so validation, delegation, site actions, consent, receipts and budgets all run for real; only the model's sentences are recorded. To use a real model, open Model in the top right and paste a key for any OpenAI-compatible router — it stays in that browser.

The parts co-op is a second origin on purpose (jsDelivr, from the same repository). It is fetched over CORS after explicit consent, and runs in your browser on your router. Its manifest declares its own router; the runtime ignores it and the trace says so.
```

## 5. Submit

1. Scroll to the bottom, tick the rules agreement.
2. Click **Submit project**.
3. Devpost sends a confirmation email. **Screenshot it** and send it to the build ticket.
4. Open the project page in a private window and check the video plays and the links work.

## 6. After submitting

- [ ] Project appears in the challenge gallery (may take a minute).
- [ ] Video is *Public* or *Unlisted*, under 2:00, and has your voice.
- [ ] The site loads with no console errors in a fresh browser profile.
- [ ] Reply to the ticket with the project URL so the return-flow notes can be written:
      judge feedback (when it arrives), the live link, and one reusable lesson.

## If something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| The peer step says "could not be reached" | jsDelivr cold cache for a brand-new repo | wait 10 minutes, or press the fallback button to use raw.githubusercontent.com |
| The site shows "The published network does not validate" | a stale `gh-pages` build | `bash scripts/deploy.sh` again |
| The video will not upload | over 2:00 or over 1 GB | re-render at `-crf 26`; `scripts/video.mjs` already targets 1080p under 60 MB |
