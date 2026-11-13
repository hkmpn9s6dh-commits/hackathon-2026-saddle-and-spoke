/**
 * Recorded sessions.
 *
 * Three complaints, each played through the real runtime: the same validation,
 * delegation, action dispatch, consent, receipts and budgets that a live model
 * drives. Only the sentences come from here.
 */

import type { ReplayScenario } from "../runtime/replay.js";

export const SCENARIOS: ReplayScenario[] = [
  {
    id: "chain",
    label: "Chain skips under load",
    chip: "Chain skips on the climb",
    complaint: "Third gear jumps when I push hard uphill. It started at about 900 miles.",
    scripts: {
      front_desk: [
        {
          text: "Third gear jumping under load is a drivetrain question, not a mystery. I'll put it on the bench and get Danny, who does the drivetrains.",
          calls: [
            {
              name: "workshop_lead",
              arguments: {
                inquiry:
                  "Chain skips in third under load, since roughly 900 miles. Diagnose it and quote the work.",
                context: "56 cm road bike, 700c wheels, 11-speed.",
              },
            },
          ],
        },
        {
          text: "Here's what Danny found, and what it costs. Saturday 10:15 works: the ring can be here by Thursday, so the bike is only with us once. Approve the booking below and the slot is yours.",
          calls: [
            {
              name: "book_dropoff",
              arguments: {
                slot: "sat_1015",
                note: "Chain, chainring, drivetrain set-up. Ring arriving Thursday.",
              },
            },
          ],
        },
        {
          text: "Booked. Job {job}, Saturday 21 Nov at 10:15. Bring it ten minutes early and leave the lock at home — we'll take it from the door.",
          onRefusal: {
            text: "Nothing was booked, and nothing on the sheet changed. Thursday 19 Nov at 16:00 is free too, if that suits better.",
          },
        },
      ],
      workshop_lead: [
        {
          text: "On the bench. Reading the sheet and the catalogue first — I don't quote from memory.",
          calls: [
            { name: "read_job", arguments: {} },
            { name: "read_catalogue", arguments: {} },
            { name: "highlight_part", arguments: { part: "chain", note: "past 0.75%" } },
          ],
        },
        {
          text: "Chain is stretched, and one tooth on the 50 ring is hooked. They wear into each other, so a new chain on that ring would skip exactly where you feel it. Chain is on the shelf; the ring isn't.",
          calls: [
            {
              name: "record_finding",
              arguments: {
                title: "Chain stretched past 0.75%",
                detail:
                  "An 11-speed chain at this stretch has already worn the cassette and the ring. Replace it; adjusting it would hide the symptom for a week.",
                part: "chain",
                severity: "attention",
              },
            },
            {
              name: "record_finding",
              arguments: {
                title: "One hooked tooth on the 50T ring",
                detail:
                  "The tooth at the power position is hooked. A new chain on a hooked ring skips under load, which is the complaint you came in with.",
                part: "chainring",
                severity: "stop",
              },
            },
            {
              name: "add_part_to_bench",
              arguments: { part: "chain", quantity: 1, source: "shelf", note: "off the shelf" },
            },
            {
              name: "parts_desk",
              arguments: {
                inquiry:
                  "One 50T 110 BCD 5-arm chainring. Shelf stock, and if none, co-op lead time and trade price.",
                context: "Job 0417, 11-speed road bike.",
              },
            },
          ],
        },
        {
          text: "So it's chain and ring together, seventy minutes on the bench. Saturday 10:15 gives the ring time to land.",
          calls: [
            {
              name: "quote_labour",
              arguments: { task: "Fit chain and chainring, set the front mech", minutes: 55 },
            },
            {
              name: "quote_labour",
              arguments: { task: "Check cassette wear and hanger alignment", minutes: 15 },
            },
            { name: "propose_slot", arguments: { slot: "sat_1015" } },
          ],
        },
        {
          text: "That's the quote: a chain, a ring, seventy minutes. The ring arrives Thursday, so Saturday is safe.",
        },
      ],
      parts_desk: [
        {
          text: "Checking the shelf first, then the co-op.",
          calls: [
            { name: "read_catalogue", arguments: { part: "chainring" } },
            { name: "highlight_part", arguments: { part: "chainring", note: "50T · 110 BCD" } },
          ],
        },
        {
          text: "None on the shelf. The co-op keeps the 5-arm pattern, so it's a phone call rather than a rebuild. Asking them now.",
          calls: [
            {
              name: "spare_room",
              arguments: {
                inquiry:
                  "Do you have a 50T 110 BCD 5-arm chainring? Lead time and trade price to SS-1042 please.",
              },
            },
          ],
        },
        {
          text: "Co-op confirms it: six days, £27 trade, landing Thursday. That's inside the Saturday slot.",
          calls: [
            {
              name: "add_part_to_bench",
              arguments: { part: "chainring", quantity: 1, source: "co-op", note: "confirmed · 6 days" },
            },
          ],
        },
      ],
      counter: [
        {
          text: "Counter here. Give me a moment, I'll ask the catalogue.",
          calls: [
            {
              name: "catalogue",
              arguments: {
                inquiry: "50T 110 BCD 5-arm chainring: stock, lead time to KA21, trade price.",
              },
            },
          ],
        },
        {
          text: "Yes. Two in the Leeds bin, six days to Saltcoats, £27 trade against SS-1042. It lands Thursday.",
        },
      ],
      catalogue: [
        {
          text: "50T 110 BCD 5-arm: two in stock. Lead time six days to KA21. Trade price £27. Pattern is Shimano 5-arm, so it takes the same bolts.",
        },
      ],
    },
  },

  {
    id: "brake",
    label: "Brake rubs after a wheel change",
    chip: "Front brake rubs",
    complaint: "The front brake rubs after I put the wheel back on. It squeals when I stop.",
    scripts: {
      front_desk: [
        {
          text: "That's usually the quick release or a pad sitting off-centre, not the brake itself. Danny will look.",
          calls: [
            {
              name: "workshop_lead",
              arguments: {
                inquiry: "Front brake rubs and squeals since the customer refitted the front wheel.",
              },
            },
          ],
        },
        {
          text: "Cheap fix: pads are glazed and one is off-centre, and the cable is dry. Twenty-five minutes, one pair of pads, one cable. Thursday 17:45 is the next free slot — approve it and it's held.",
          calls: [
            { name: "book_dropoff", arguments: { slot: "thu_1745", note: "Front brake rub; pads and cable." } },
          ],
        },
        {
          text: "Booked for Thursday 19 Nov at 17:45, job {job}. If the rub comes back before then, stop riding it and bring it in earlier — a dragging pad will ruin the rim.",
          onRefusal: {
            text: "No booking made, nothing changed on the sheet. Thursday 16:00 is also free.",
          },
        },
      ],
      workshop_lead: [
        {
          text: "Reading the sheet and the catalogue before I touch anything.",
          calls: [
            { name: "read_job", arguments: {} },
            { name: "read_catalogue", arguments: {} },
            { name: "highlight_part", arguments: { part: "brake_pads", note: "glazed, off-centre" } },
          ],
        },
        {
          text: "Pads are glazed and one sits about a millimetre off-centre, so it drags on the rim. The cable housing is dry, which pulls the caliper off its rest position. Both are adjustment plus a new pair.",
          calls: [
            {
              name: "record_finding",
              arguments: {
                title: "Front pads glazed and off-centre",
                detail:
                  "Glazing squeals; an off-centre pad drags. A new pair and a true-up fixes both, and the rim is unmarked so far.",
                part: "brake_pads",
                severity: "attention",
              },
            },
            {
              name: "record_finding",
              arguments: {
                title: "Cable housing dry",
                detail:
                  "Dry housing stops the caliper returning to rest. Replace the inner and the last 20 cm of housing while the brake is apart.",
                part: "cable",
                severity: "info",
              },
            },
            {
              name: "add_part_to_bench",
              arguments: { part: "brake_pads", quantity: 1, source: "shelf", note: "one pair" },
            },
            {
              name: "quote_labour",
              arguments: { task: "Fit pads, true the caliper, replace the cable", minutes: 25 },
            },
            { name: "propose_slot", arguments: { slot: "thu_1745" } },
          ],
        },
        {
          text: "Twenty-five minutes, one pair of pads, one cable. Thursday at 17:45.",
        },
      ],
    },
  },

  {
    id: "service",
    label: "Service before a long ride",
    chip: "Service before a 200 km ride",
    complaint: "I'm doing a 200 km ride in three weeks. What does the bike need?",
    scripts: {
      front_desk: [
        {
          text: "Three weeks is enough to do it properly. Full check first, then we only do what it actually needs.",
          calls: [
            {
              name: "workshop_lead",
              arguments: { inquiry: "Pre-event check: 200 km ride in three weeks. What does it need?" },
            },
          ],
        },
        {
          text: "Nothing catastrophic: a tyre, pads, and an hour of adjustment. Saturday 09:45 leaves you two and a half weeks of riding before the event — approve the booking and it's yours.",
          calls: [{ name: "book_dropoff", arguments: { slot: "sat_0945", note: "Pre-event service." } }],
        },
        {
          text: "Booked for Saturday 21 Nov at 09:45, job {job}. Ride it hard the week after; if anything settles, bring it back and we'll take it up.",
          onRefusal: {
            text: "No booking made. The sheet stays as it is — say the word when you want a slot.",
          },
        },
      ],
      workshop_lead: [
        {
          text: "Starting with the things that end a long ride: tyres, brakes, chain.",
          calls: [
            { name: "read_job", arguments: {} },
            { name: "read_catalogue", arguments: {} },
            { name: "highlight_part", arguments: { part: "tyre", note: "casing at the shoulder" } },
          ],
        },
        {
          text: "Tyre is worn at the shoulder, pads are near the wear line, and the chain is at half a percent — that one is saveable.",
          calls: [
            {
              name: "record_finding",
              arguments: {
                title: "Front tyre worn at the shoulder",
                detail:
                  "The casing shows at the shoulder. Fine for a commute; not for 200 km with a loaded bike.",
                part: "tyre",
                severity: "stop",
              },
            },
            {
              name: "record_finding",
              arguments: {
                title: "Pads near the wear line",
                detail: "About a millimetre of material left. Replace before the event, not after it.",
                part: "brake_pads",
                severity: "attention",
              },
            },
            {
              name: "record_finding",
              arguments: {
                title: "Chain at 0.5%",
                detail: "Inside the limit. Clean, lubricate, and it will last the event.",
                part: "chain",
                severity: "info",
              },
            },
            {
              name: "add_part_to_bench",
              arguments: { part: "tyre", quantity: 1, source: "shelf", note: "one folding" },
            },
            {
              name: "add_part_to_bench",
              arguments: { part: "brake_pads", quantity: 1, source: "shelf", note: "road cartridge" },
            },
          ],
        },
        {
          text: "An hour of bench time covers the fit and the adjustments.",
          calls: [
            {
              name: "quote_labour",
              arguments: { task: "Fit tyre and pads, check torque, tune gears", minutes: 60 },
            },
            { name: "propose_slot", arguments: { slot: "sat_0945" } },
          ],
        },
        {
          text: "Tyre, pads, sixty minutes. Saturday morning leaves the most daylight for a test ride.",
        },
      ],
    },
  },
];


/**
 * The script the conformance suite plays.
 *
 * It is the chain complaint, with the booking removed: the suite must be able to run
 * six of the seven checks without a dialog, and a booking is a write the visitor has
 * to approve. Check 7 is exercised by its own four buttons.
 */
export const SUITE_SCENARIO: ReplayScenario = (() => {
  const chain = SCENARIOS.find((scenario) => scenario.id === "chain")!;
  const front = chain.scripts["front_desk"]!.map((step) => {
    if (!step.calls) return step;
    const calls = step.calls.filter((call) => call.name !== "book_dropoff");
    return { ...step, calls };
  });
  return {
    id: "suite",
    label: "Conformance suite",
    chip: "Run the suite",
    complaint: chain.complaint,
    scripts: { ...chain.scripts, front_desk: front },
  };
})();

const RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "chain", pattern: /chain|skip|jump|gear|drivetrain|third|3rd/i },
  { id: "brake", pattern: /brake|rub|squeal|pad|rim|stop/i },
  { id: "service", pattern: /service|200\s?km|event|long ride|check|audax/i },
];

export function pickScenario(text: string): ReplayScenario {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      const found = SCENARIOS.find((scenario) => scenario.id === rule.id);
      if (found) return found;
    }
  }
  return SCENARIOS[0]!;
}

export function scenarioById(id: string): ReplayScenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
