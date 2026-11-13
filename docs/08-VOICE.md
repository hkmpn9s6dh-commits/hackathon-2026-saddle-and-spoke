# 08 — The video

Two minutes is the hard limit. The recorded take is about **66 seconds**, which leaves room
for a slower read and one pause. The rules require **your own voice** explaining the
project, so this file is the script, and `scripts/video.mjs` does the muxing.

## What exists already

`video/raw/take.webm` — a real screen recording of the production build, with captions
burned in at the bottom. Nothing in it is staged: the click on "Run the conformance suite"
runs the suite.

## Record the voice

1. Watch `video/raw/take.webm` once, at full screen, sound off.
2. Record yourself reading the lines below, trying to land each one as its caption appears.
   A phone voice-memo is fine; a headset is better. No music — the rules require that you own
   or have permission for every asset, and silence is safer than a copyright claim.
3. Save it as `video/voice.wav` (or `.m4a`, `.mp3` — the script accepts any format ffmpeg reads).
4. Run:

```bash
node scripts/video.mjs
```

It writes `video/saddle-and-spoke.mp4` at 1440×900, H.264 + AAC, loudness-normalised, and
prints the duration. Then upload that file to YouTube as **Public** or **Unlisted**.

If your read is longer than the picture, the script pads the last frame rather than cutting
you off, up to two minutes. If it is shorter, the video ends when you stop talking.

## The lines

| Time | Line | Word count |
| --- | --- | --- |
| 0:00 | This is a bicycle workshop's website. There is no chat window: the page is the shop. | 17 |
| 0:06 | I describe the fault the way I'd say it out loud, and three agents read the shop's real stock and diary. | 22 |
| 0:13 | Every change they want to make is shown to me first — the action, the arguments, and where it goes. | 20 |
| 0:20 | The parts co-op is a different website. It runs here, in my browser, on my model, after I say yes. | 22 |
| 0:27 | It's told the shop's trade account. Not my name, my phone, or my frame number. | 16 |
| 0:34 | The booking is irreversible, so it always asks. My details stay in this browser. | 15 |
| 0:41 | Findings, parts, labour, a slot, a receipt. The drawing annotated itself as the agents worked. | 16 |
| 0:48 | The Inspector reports the seven interoperability checks from the specification, with the evidence it actually saw. | 18 |
| 0:56 | And these four buttons are supposed to fail: an invalid network, a cycle, too much budget, a refused origin. | 21 |
| 1:04 | There's no funded model here. Paste your own key, pick any router — the network is the same data. | 19 |

Total ≈ 186 words, about 70 seconds at a measured pace. If you run over, cut the last line —
the settings panel is on screen for four seconds and can pass without comment.

## What not to do

- Do not read the captions verbatim; they are shorter than the lines above on purpose.
- Do not add music. Do not add a synthetic voice. The rules exclude both.
- Do not re-record the screen: use the take, so the timing matches the click sounds you can
  hear yourself making.
- Do not upload above two minutes. Judges are explicitly not required to watch past it.

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| `ffmpeg not found` | install it (`winget install Gyan.FFmpeg`) or hand both files to any editor |
| voice and picture drift apart | re-record with the take playing in headphones; the mux aligns from 0:00 |
| the file is over 60 MB | `node scripts/video.mjs --crf 28` |
