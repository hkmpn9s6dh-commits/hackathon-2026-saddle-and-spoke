/**
 * The drawing.
 *
 * One hand-authored SVG of a road bicycle. No images, no icon library. The agent's
 * callouts follow the convention of a service manual: a numbered balloon on the part,
 * and a legend underneath. Text stays in HTML so it is crisp at any width and can
 * never collide with the line work.
 */

import { findPart, money } from "./data.js";

export interface PartArt {
  /** Where the balloon sits, in drawing units. */
  anchor: readonly [number, number];
  /** x, y, width, height — a detail window on the drawing, if one is ever needed. */
  bbox: [number, number, number, number];
}

export const PART_ART: Record<string, PartArt> = {
  chain: { anchor: [392, 486], bbox: [250, 380, 226, 118] },
  cassette: { anchor: [250, 432], bbox: [202, 384, 96, 96] },
  chainring: { anchor: [475, 382], bbox: [418, 380, 114, 116] },
  crank: { anchor: [512, 466], bbox: [436, 404, 108, 88] },
  rear_derailleur: { anchor: [296, 470], bbox: [258, 440, 62, 56] },
  hanger: { anchor: [282, 440], bbox: [260, 406, 44, 46] },
  brake_pads: { anchor: [745, 320], bbox: [712, 300, 68, 48] },
  cable: { anchor: [520, 208], bbox: [370, 188, 320, 48] },
  tyre: { anchor: [752, 308], bbox: [668, 312, 180, 180] },
  tube: { anchor: [700, 376], bbox: [676, 352, 156, 156] },
  wheel: { anchor: [250, 432], bbox: [124, 306, 252, 252] },
  bottom_bracket: { anchor: [475, 442], bbox: [444, 410, 64, 58] },
  saddle: { anchor: [368, 180], bbox: [320, 158, 104, 62] },
  bar_tape: { anchor: [702, 200], bbox: [648, 178, 84, 76] },
};

export interface Annotation {
  partId: string;
  note?: string;
}

/** A spoke fan is cheap to draw and reads as a wheel instantly. */
function spokes(cx: number, cy: number, inner: number, outer: number, count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.12;
    lines.push(
      `<line x1="${(cx + Math.cos(angle) * inner).toFixed(1)}" y1="${(cy + Math.sin(angle) * inner).toFixed(1)}" ` +
        `x2="${(cx + Math.cos(angle) * outer).toFixed(1)}" y2="${(cy + Math.sin(angle) * outer).toFixed(1)}"/>`,
    );
  }
  return lines.join("");
}

const REAR_X = 250;
const REAR_Y = 432;
const FRONT_X = 752;
const FRONT_Y = 432;
const BB_X = 475;
const BB_Y = 438;

export function bikeSvg(): string {
  return `
<svg class="bike" viewBox="-34 -26 1068 700" role="img" aria-labelledby="bike-title" preserveAspectRatio="xMidYMid meet">
  <title id="bike-title">Technical drawing of a road bicycle, with the parts this workshop services</title>
  <g id="bike-art">
    <g class="bk-base">
      <g class="bk-dim">
        <line x1="${REAR_X}" y1="586" x2="${FRONT_X}" y2="586"/>
        <line x1="${REAR_X}" y1="432" x2="${REAR_X}" y2="596"/>
        <line x1="${FRONT_X}" y1="432" x2="${FRONT_X}" y2="596"/>
        <path d="M${REAR_X} 586 l16 -5 v10 z M${FRONT_X} 586 l-16 -5 v10 z"/>
        <text x="501" y="606">1 005</text>
      </g>

      <circle cx="${REAR_X}" cy="${REAR_Y}" r="126" class="bk-tyre"/>
      <circle cx="${FRONT_X}" cy="${FRONT_Y}" r="126" class="bk-tyre"/>
      <circle cx="${REAR_X}" cy="${REAR_Y}" r="112" class="bk-rim"/>
      <circle cx="${FRONT_X}" cy="${FRONT_Y}" r="112" class="bk-rim"/>
      <g class="bk-spokes">${spokes(REAR_X, REAR_Y, 14, 110, 18)}${spokes(FRONT_X, FRONT_Y, 14, 110, 18)}</g>
      <circle cx="${REAR_X}" cy="${REAR_Y}" r="13" class="bk-hub"/>
      <circle cx="${FRONT_X}" cy="${FRONT_Y}" r="13" class="bk-hub"/>

      <g class="bk-frame">
        <path d="M${BB_X} ${BB_Y} L368 200"/>
        <path d="M368 200 L662 212"/>
        <path d="M${BB_X} ${BB_Y} L686 292"/>
        <path d="M662 212 L686 292"/>
        <path d="M${BB_X} ${BB_Y} L${REAR_X} ${REAR_Y}"/>
        <path d="M368 200 L${REAR_X} ${REAR_Y}"/>
      </g>
      <path d="M686 292 Q720 360 752 432" class="bk-fork"/>
      <path d="M${REAR_X} ${REAR_Y} L300 330" class="bk-stay"/>

      <line x1="368" y1="200" x2="372" y2="182" class="bk-post"/>
      <path d="M330 186 C 352 168, 400 168, 414 180 C 402 191, 356 195, 330 186 Z" class="bk-saddle"/>

      <line x1="662" y1="212" x2="656" y2="188" class="bk-stem"/>
      <path d="M656 188 C 690 182, 712 196, 716 224 C 718 244, 702 250, 696 238" class="bk-bar"/>

      <circle cx="${BB_X}" cy="${BB_Y}" r="54" class="bk-chainring"/>
      <circle cx="${BB_X}" cy="${BB_Y}" r="58" class="bk-teeth"/>
      <circle cx="${REAR_X}" cy="${REAR_Y}" r="42" class="bk-cassette"/>
      <circle cx="${REAR_X}" cy="${REAR_Y}" r="31" class="bk-cassette"/>
      <circle cx="${REAR_X}" cy="${REAR_Y}" r="20" class="bk-cassette"/>
      <g class="bk-crank">
        <line x1="${BB_X}" y1="${BB_Y}" x2="531" y2="470"/>
        <line x1="${BB_X}" y1="${BB_Y}" x2="419" y2="406"/>
        <rect x="525" y="464" width="26" height="9" rx="2" transform="rotate(8 531 470)"/>
        <rect x="400" y="400" width="26" height="9" rx="2" transform="rotate(8 419 406)"/>
      </g>
      <path d="M475 384 L250 390" class="bk-chain-line"/>
      <path d="M475 492 L250 474" class="bk-chain-line"/>
      <g class="bk-mech">
        <path d="M262 446 L282 462 L296 456"/>
        <circle cx="292" cy="478" r="13"/>
        <circle cx="306" cy="450" r="13"/>
      </g>

      <path d="M726 314 q19 -14 38 0" class="bk-brake"/>
      <path d="M726 314 l-6 22 M764 314 l6 22" class="bk-brake"/>
      <path d="M292 312 q14 -10 28 0" class="bk-brake"/>
    </g>

    <g class="bk-part" data-part="chain"><path d="M475 384 L250 390 M475 492 L250 474"/></g>
    <g class="bk-part" data-part="cassette"><circle cx="250" cy="432" r="42"/><circle cx="250" cy="432" r="31"/></g>
    <g class="bk-part" data-part="chainring"><circle cx="475" cy="438" r="58"/></g>
    <g class="bk-part" data-part="crank"><line x1="475" y1="438" x2="531" y2="470"/><rect x="525" y="464" width="26" height="9" rx="2" transform="rotate(8 531 470)"/></g>
    <g class="bk-part" data-part="rear_derailleur"><path d="M262 446 L282 462 L296 456"/><circle cx="292" cy="478" r="13"/><circle cx="306" cy="450" r="13"/></g>
    <g class="bk-part" data-part="hanger"><path d="M266 420 L292 442"/></g>
    <g class="bk-part" data-part="brake_pads"><path d="M726 314 q19 -14 38 0"/><path d="M726 314 l-6 22 M764 314 l6 22"/></g>
    <g class="bk-part" data-part="cable"><path d="M368 204 L662 216 M660 190 C 690 184, 712 198, 716 226"/></g>
    <g class="bk-part" data-part="tyre"><circle cx="752" cy="432" r="126"/></g>
    <g class="bk-part" data-part="tube"><circle cx="752" cy="432" r="112"/></g>
    <g class="bk-part" data-part="wheel"><circle cx="250" cy="432" r="126"/><circle cx="250" cy="432" r="112"/></g>
    <g class="bk-part" data-part="bottom_bracket"><circle cx="475" cy="438" r="17"/></g>
    <g class="bk-part" data-part="saddle"><path d="M330 186 C 352 168, 400 168, 414 180 C 402 191, 356 195, 330 186 Z"/></g>
    <g class="bk-part" data-part="bar_tape"><path d="M656 188 C 690 182, 712 196, 716 224 C 718 244, 702 250, 696 238"/></g>
  </g>

  <g class="bk-anno"></g>

  <g class="bk-titleblock">
    <line x1="26" y1="620" x2="700" y2="620"/>
    <text x="26" y="640" class="bk-tb-1">FIG. 1 — ROAD BICYCLE · 700c · 56 cm</text>
    <text x="700" y="640" text-anchor="end" class="bk-tb-2">SHEET 1/1</text>
  </g>
</svg>`;
}

export function annotate(svg: SVGSVGElement, annotations: Annotation[]): void {
  const layer = svg.querySelector(".bk-anno");
  if (!layer) return;
  layer.innerHTML = "";
  annotations.slice(0, 3).forEach((annotation, index) => {
    const art = PART_ART[annotation.partId];
    if (!art) return;
    const [ax, ay] = art.anchor;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "anno");
    group.innerHTML = `
      <circle cx="${ax}" cy="${ay}" r="27" class="anno-ring"/>
      <circle cx="${ax}" cy="${ay}" r="16" class="anno-balloon"/>
      <text x="${ax}" y="${ay + 6.5}" text-anchor="middle" class="anno-num">${index + 1}</text>
    `;
    layer.appendChild(group);
  });
}

/** The legend that pairs with the balloons. */
export function calloutLegend(annotations: Annotation[]): string {
  if (annotations.length === 0) return "";
  const rows = annotations.map((annotation, index) => {
    const part = findPart(annotation.partId);
    if (!part) return "";
    const stock =
      part.stock > 0
        ? `${part.stock} on the shelf · ${money(part.price)}`
        : part.coOpDays !== null
          ? `co-op, ${part.coOpDays} days · ${money(part.price)}`
          : "not stocked";
    const note = annotation.note ? `<em>${escapeText(annotation.note)}</em>` : "";
    return `<li><span class="balloon">${index + 1}</span><b>${escapeText(part.name)}</b><span class="co-spec">${stock}</span>${note}</li>`;
  });
  return `<ol class="callouts">${rows.join("")}</ol>`;
}

export function focusPart(svg: SVGSVGElement, partId: string | null): void {
  svg.classList.toggle("has-focus", Boolean(partId));
  for (const group of svg.querySelectorAll<SVGGElement>(".bk-part")) {
    group.classList.toggle("is-focus", group.dataset["part"] === partId);
  }
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
