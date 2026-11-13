/**
 * Turns the silent take into the submission film.
 *
 *   node scripts/video.mjs                 # mux video/voice.* onto video/raw/take.webm
 *   node scripts/video.mjs --crf 28        # smaller file
 *   node scripts/video.mjs --no-voice      # picture only (mp4, silent)
 *
 * Needs ffmpeg on PATH. Nothing here is required to build or verify the site.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const crf = flag("crf", "23");
const noVoice = args.includes("--no-voice");

function ffmpeg(argsList) {
  const result = spawnSync("ffmpeg", argsList, { stdio: "inherit" });
  if (result.error) {
    console.error("\nffmpeg is not on PATH. Install it with:  winget install Gyan.FFmpeg");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const take = ["video/raw/take.webm", "video/raw/take.mp4"].find((file) => existsSync(file));
if (!take) {
  console.error("No recording at video/raw/take.webm. Run: node scripts/record.mjs");
  process.exit(1);
}

const voice = readdirSync("video").find((name) => /^voice\.(wav|m4a|mp3|aac|flac|ogg)$/i.test(name));
const out = "video/saddle-and-spoke.mp4";

if (!voice || noVoice) {
  ffmpeg([
    "-y",
    "-i", take,
    "-vf", "scale=1440:900:flags=lanczos,fps=30",
    "-c:v", "libx264", "-preset", "slow", "-crf", crf,
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an", out,
  ]);
  console.log(`\nwrote ${out} (silent). Add video/voice.wav and run again to mux the narration.`);
} else {
  ffmpeg([
    "-y",
    "-i", take,
    "-i", `video/${voice}`,
    "-vf", "scale=1440:900:flags=lanczos,fps=30",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
    "-c:v", "libx264", "-preset", "slow", "-crf", crf,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    "-shortest",
    out,
  ]);
  console.log(`\nwrote ${out} with ${voice}.`);
}

const size = statSync(out).size / (1024 * 1024);
console.log(`${size.toFixed(1)} MB. Upload it to YouTube as Public or Unlisted.`);
