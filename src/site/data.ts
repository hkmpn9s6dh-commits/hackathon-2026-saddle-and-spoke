/**
 * The shop's facts. Everything an agent may say about the shop must be readable
 * from here through a site action; nothing is hard-coded into a prompt.
 */

export interface Part {
  id: string;
  /** The bin the part lives in, written on the shelf label. */
  bin: string;
  name: string;
  spec: string;
  price: number;
  /** On the shelf right now. */
  stock: number;
  /** Days for the co-op to deliver, when the shelf is empty. */
  coOpDays: number | null;
  coOpTradePrice: number | null;
  note: string;
}

export const SHOP = {
  name: "Saddle & Spoke",
  street: "11 Quay Street",
  town: "Saltcoats",
  benchRatePerMinute: 0.8,
  currency: "£",
  hours: [
    { day: "Thursday", open: "16:00", close: "20:00" },
    { day: "Saturday", open: "09:00", close: "13:00" },
  ],
  promise: "Most jobs are done the same session. If a part has to come from the co-op, we say so before you leave the bike.",
} as const;

export const PARTS: Part[] = [
  {
    id: "chain",
    bin: "CH-11",
    name: "Chain",
    spec: "11-speed, 116 links, quick-link",
    price: 28,
    stock: 4,
    coOpDays: 2,
    coOpTradePrice: 17,
    note: "The one part that wears out before anything it touches.",
  },
  {
    id: "cassette",
    bin: "CA-32",
    name: "Cassette",
    spec: "11–32, 11-speed",
    price: 54,
    stock: 2,
    coOpDays: 3,
    coOpTradePrice: 36,
    note: "Replace with the chain if the teeth are hooked.",
  },
  {
    id: "chainring",
    bin: "CR-50",
    name: "Chainring",
    spec: "50T, 110 BCD, 5-arm",
    price: 46,
    stock: 0,
    coOpDays: 6,
    coOpTradePrice: 27,
    note: "Not on the shelf. The co-op keeps the 5-arm pattern.",
  },
  {
    id: "rear_derailleur",
    bin: "RD-11",
    name: "Rear derailleur",
    spec: "11-speed, medium cage",
    price: 72,
    stock: 1,
    coOpDays: 4,
    coOpTradePrice: 51,
    note: "Hanger alignment first; most 'broken' derailleurs are a bent hanger.",
  },
  {
    id: "hanger",
    bin: "HG-04",
    name: "Derailleur hanger",
    spec: "Replaceable, 4 variants in the drawer",
    price: 14,
    stock: 7,
    coOpDays: 5,
    coOpTradePrice: 6,
    note: "Cheap. Straighten it once, replace it the second time.",
  },
  {
    id: "brake_pads",
    bin: "BP-RD",
    name: "Brake pads",
    spec: "Road cartridge, pair",
    price: 18,
    stock: 12,
    coOpDays: 2,
    coOpTradePrice: 9,
    note: "Wet grit eats a set in a fortnight.",
  },
  {
    id: "cable",
    bin: "CB-2M",
    name: "Cable & housing",
    spec: "Gear, stainless, 2 m",
    price: 9,
    stock: 20,
    coOpDays: 1,
    coOpTradePrice: 4,
    note: "Friction is a full-service problem, not a derailleur problem.",
  },
  {
    id: "tyre",
    bin: "TY-28",
    name: "Tyre",
    spec: "700×28, folding",
    price: 32,
    stock: 6,
    coOpDays: 2,
    coOpTradePrice: 19,
    note: "Check the casing before you blame the tube.",
  },
  {
    id: "tube",
    bin: "TU-48",
    name: "Inner tube",
    spec: "700×25–32, 48 mm valve",
    price: 7,
    stock: 15,
    coOpDays: 1,
    coOpTradePrice: 3,
    note: "Two punctures in a week means the tyre, not the tube.",
  },
  {
    id: "wheel",
    bin: "WH-R",
    name: "Rear wheel",
    spec: "700c, 11-speed freehub",
    price: 120,
    stock: 0,
    coOpDays: 9,
    coOpTradePrice: 88,
    note: "Built to order.",
  },
  {
    id: "bottom_bracket",
    bin: "BB-68",
    name: "Bottom bracket",
    spec: "BSA 68 mm, sealed",
    price: 26,
    stock: 3,
    coOpDays: 3,
    coOpTradePrice: 15,
    note: "Creaks that survive a clean and a torque check usually live here.",
  },
  {
    id: "crank",
    bin: "CK-34",
    name: "Crankset",
    spec: "172.5 mm, 50/34",
    price: 95,
    stock: 0,
    coOpDays: 7,
    coOpTradePrice: 68,
    note: "Only if the taper or the spider is damaged.",
  },
  {
    id: "saddle",
    bin: "SD-143",
    name: "Saddle",
    spec: "143 mm, steel rail",
    price: 35,
    stock: 4,
    coOpDays: 4,
    coOpTradePrice: 21,
    note: "Sit bones, not fashion.",
  },
  {
    id: "bar_tape",
    bin: "BT-3M",
    name: "Bar tape",
    spec: "3 mm, cork",
    price: 12,
    stock: 9,
    coOpDays: 2,
    coOpTradePrice: 6,
    note: "Fitted free with any bar work.",
  },
];

export interface Slot {
  id: string;
  day: string;
  date: string;
  time: string;
  free: number;
  /** Minutes of bench time booked for this slot. */
  minutes: number;
}

export const SLOTS: Slot[] = [
  { id: "thu_1600", day: "Thursday", date: "19 Nov", time: "16:00", free: 2, minutes: 60 },
  { id: "thu_1745", day: "Thursday", date: "19 Nov", time: "17:45", free: 1, minutes: 60 },
  { id: "sat_0945", day: "Saturday", date: "21 Nov", time: "09:45", free: 1, minutes: 60 },
  { id: "sat_1015", day: "Saturday", date: "21 Nov", time: "10:15", free: 1, minutes: 60 },
  { id: "sat_1200", day: "Saturday", date: "21 Nov", time: "12:00", free: 3, minutes: 60 },
];

export function findPart(id: string): Part | undefined {
  return PARTS.find((part) => part.id === id);
}

export function money(value: number): string {
  return `${SHOP.currency}${value.toFixed(2)}`;
}

export function partIds(): string[] {
  return PARTS.map((part) => part.id);
}
