/** The paper. Everything on it is a projection of one state object. */

import { findPart, money as moneyOf, SLOTS } from "./data.js";
import { computeTotals, type JobState } from "./job.js";
import { $, clear, h } from "./ui.js";

export function renderSheet(state: JobState): void {
  const totals = computeTotals(state);

  const complaint = $<HTMLParagraphElement>("#complaint-text");
  if (state.complaint) {
    complaint.textContent = state.complaint;
    complaint.classList.remove("empty");
  } else {
    complaint.textContent = "Nothing written yet. Tell the counter what the bike is doing.";
    complaint.classList.add("empty");
  }

  const findings = $<HTMLOListElement>("#findings");
  clear(findings);
  if (state.findings.length === 0) {
    findings.append(h("li", { class: "empty-line", text: "Nothing recorded yet." }));
  } else {
    state.findings.forEach((finding, index) => {
      const part = finding.part ? findPart(finding.part) : undefined;
      findings.append(
        h("li", { class: "finding" }, [
          h("span", { class: "num", text: String(index + 1).padStart(2, "0") }),
          h("div", {}, [
            h("p", { class: "ftitle" }, [
              h("span", { class: `sev ${finding.severity}` }),
              finding.title,
            ]),
            h("p", { class: "fdetail", text: finding.detail }),
            part ? h("span", { class: "ftag", text: `${part.name} · ${part.spec}` }) : null,
          ]),
        ]),
      );
    });
  }
  $("#finding-count").textContent = state.findings.length > 0 ? `${state.findings.length} on the sheet` : "";

  const partsBody = $<HTMLTableSectionElement>("#parts-lines tbody");
  clear(partsBody);
  for (const item of state.bench) {
    const part = findPart(item.partId);
    if (!part) continue;
    partsBody.append(
      h("tr", {}, [
        h("td", {}, [
          h("span", { class: "lname", text: part.name }),
          h("span", {
            class: "ldetail",
            text: `${part.spec}${item.source === "co-op" ? " · co-op" : ""}${item.note ? ` · ${item.note}` : ""}`,
          }),
        ]),
        h("td", { class: "lqty", text: `×${item.quantity}` }),
        h("td", { class: "lprice", text: `${moneyOf(part.price * item.quantity)}` }),
      ]),
    );
  }
  $<HTMLParagraphElement>("#parts-empty").hidden = state.bench.length > 0;

  const labourBody = $<HTMLTableSectionElement>("#labour-lines tbody");
  clear(labourBody);
  for (const item of state.labour) {
    labourBody.append(
      h("tr", {}, [
        h("td", {}, [
          h("span", { class: "lname", text: item.task }),
          h("span", { class: "ldetail", text: `${item.minutes} minutes` }),
        ]),
        h("td", { class: "lqty" }),
        h("td", { class: "lprice", text: `${moneyOf(item.cost)}` }),
      ]),
    );
  }
  $<HTMLParagraphElement>("#labour-empty").hidden = state.labour.length > 0;

  $("#total-amount").textContent = moneyOf(totals.total);
  $("#total-sub").textContent =
    totals.minutes > 0
      ? `${totals.minutes} min on the bench · parts ${moneyOf(totals.parts)} · labour ${moneyOf(totals.labour)}`
      : "bench rate £48/hour";

  const slotHeld = $<HTMLDivElement>("#slot-held");
  const slot = state.slot ? SLOTS.find((item) => item.id === state.slot) : undefined;
  if (slot) {
    slotHeld.hidden = false;
    $("#slot-text").textContent = state.booked
      ? `Booked: ${slot.day} ${slot.date}, ${slot.time} · ${state.booked.receipt}`
      : `Held, not booked: ${slot.day} ${slot.date}, ${slot.time}`;
    slotHeld.querySelector(".peg")?.classList.toggle("booked", Boolean(state.booked));
  } else {
    slotHeld.hidden = true;
  }

  const stamp = $<HTMLDivElement>("#stamp");
  if (state.booked) {
    stamp.textContent = "Booked";
    stamp.classList.remove("on");
    // Re-trigger the animation on each new booking.
    void stamp.offsetWidth;
    stamp.classList.add("on");
    $("#sheet-state").textContent = `Booked · ${state.booked.receipt}`;
  } else {
    stamp.classList.remove("on");
    $("#sheet-state").textContent = state.findings.length > 0 ? "Quoted" : "Open";
  }
}

export function renderBench(state: JobState): void {
  const list = $<HTMLUListElement>("#bench-items");
  clear(list);
  if (state.bench.length === 0) {
    list.append(
      h("li", { class: "bench-empty", text: "Parts the workshop sets aside appear here, with the bin they came from." }),
    );
    $("#bench-count").textContent = "nothing yet";
    return;
  }
  const count = state.bench.reduce((sum, item) => sum + item.quantity, 0);
  $("#bench-count").textContent = `${count} part${count === 1 ? "" : "s"} set aside`;

  for (const item of state.bench) {
    const part = findPart(item.partId);
    if (!part) continue;
    const card = h("li", { class: "bench-item" }, [
      h("div", { class: "bin-tag" }, [
        h("span", { class: "bin-hole" }),
        h("span", { class: "bin-code", text: part.bin }),
      ]),
      h("span", { class: "bname", text: part.name }),
      h("span", { class: "bspec", text: part.spec }),
      h("div", { class: "brow" }, [
        h("span", { class: `bsrc ${item.source}`, text: item.source === "co-op" ? "co-op" : "shelf" }),
        h("span", { class: "bprice", text: `${moneyOf(part.price * item.quantity)}` }),
      ]),
    ]);
    list.append(card);
  }
}
