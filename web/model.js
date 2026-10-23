export const empty = () => ({
  schema: 1,
  currency: "USD",
  projects: [],
  parts: [],
  entries: [],
  adjustments: [],
});
const text = (v, max = 5000) => typeof v === "string" && v.length <= max;
const id = (v) => typeof v === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(v);
const qty = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 100000;
const day = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(+new Date(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const uid = () => crypto.randomUUID();
export function stock(s, id) {
  return (
    s.parts.find((p) => p.id === id).initialStock +
    s.adjustments
      .filter((a) => a.partId === id)
      .reduce((n, a) => n + a.delta, 0) -
    s.entries
      .flatMap((e) => e.usage)
      .filter((u) => u.partId === id)
      .reduce((n, u) => n + u.quantity, 0)
  );
}
export function projectValue(s, id) {
  return s.entries
    .filter((e) => e.projectId === id)
    .flatMap((e) => e.usage)
    .reduce((n, u) => n + u.quantity * u.unitCostCents, 0);
}
export function validate(s) {
  if (
    s?.schema !== 1 ||
    s.currency !== "USD" ||
    !["projects", "parts", "entries", "adjustments"].every((k) =>
      Array.isArray(s[k]),
    )
  )
    throw Error("This is not a Benchbook backup.");
  if (
    s.projects.length > 100 ||
    s.parts.length > 500 ||
    s.entries.length > 2000 ||
    s.adjustments.length > 10000
  )
    throw Error("This workspace exceeds the first release's record limits.");
  const all = [...s.projects, ...s.parts, ...s.entries, ...s.adjustments];
  if (
    all.some((r) => !id(r.id)) ||
    new Set(all.map((r) => r.id)).size !== all.length
  )
    throw Error("Record IDs must be valid and unique.");
  for (const p of s.projects)
    if (
      !text(p.title, 100) ||
      !p.title.trim() ||
      !text(p.description) ||
      !["active", "paused", "complete"].includes(p.status)
    )
      throw Error("Check the project fields.");
  for (const p of s.parts)
    if (
      !text(p.name, 100) ||
      !p.name.trim() ||
      !qty(p.initialStock) ||
      !Number.isSafeInteger(p.unitCostCents) ||
      p.unitCostCents < 0 ||
      p.unitCostCents > 100000000 ||
      !text(p.notes) ||
      typeof p.retired !== "boolean"
    )
      throw Error("Check part quantities, names and unit values.");
  for (const e of s.entries) {
    if (
      !s.projects.some((p) => p.id === e.projectId) ||
      !day(e.date) ||
      !text(e.title, 120) ||
      !e.title.trim() ||
      !text(e.notes) ||
      !text(e.wiring) ||
      !["repair", "test", "note"].includes(e.kind) ||
      !["not-tested", "pass", "fail"].includes(e.result) ||
      typeof e.archived !== "boolean" ||
      !Array.isArray(e.usage) ||
      e.usage.length > 30
    )
      throw Error("Check the repair entry fields.");
    if (e.link && (!text(e.link, 500) || !/^https:\/\//i.test(e.link)))
      throw Error("Reference links must use HTTPS.");
    for (const u of e.usage)
      if (
        !s.parts.some((p) => p.id === u.partId) ||
        !text(u.name, 100) ||
        !qty(u.quantity) ||
        u.quantity === 0 ||
        !Number.isSafeInteger(u.unitCostCents) ||
        u.unitCostCents < 0 ||
        u.unitCostCents > 100000000
      )
        throw Error("Check the entry's part usage.");
  }
  for (const a of s.adjustments)
    if (
      !s.parts.some((p) => p.id === a.partId) ||
      !Number.isSafeInteger(a.delta) ||
      Math.abs(a.delta) > 100000 ||
      !text(a.reason, 500) ||
      !a.reason.trim() ||
      !day(a.date)
    )
      throw Error("Check stock adjustment fields.");
  for (const p of s.parts)
    if (stock(s, p.id) < 0 || stock(s, p.id) > 100000)
      throw Error(`Stock would fall outside 0–100,000 for ${p.name}.`);
  return s;
}
export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value)))
    throw Error("Enter a nonnegative unit value with at most two decimals.");
  const [whole, fraction = ""] = String(value).split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function command(s, type, v) {
  s = structuredClone(s);
  if (type === "project") {
    const row = {
      id: v.id || uid(),
      title: v.title.trim(),
      description: v.description || "",
      status: v.status || "active",
    };
    if (v.id) {
      if (!s.projects.some((p) => p.id === v.id))
        throw Error("Project not found.");
      s.projects = s.projects.map((p) => (p.id === v.id ? row : p));
    } else s.projects.push(row);
  } else if (type === "part")
    s.parts.push({
      id: uid(),
      name: v.name.trim(),
      initialStock: Number(v.quantity),
      unitCostCents: cents(v.cost),
      notes: v.notes || "",
      retired: false,
    });
  else if (type === "editPart") {
    const p = s.parts.find((p) => p.id === v.id);
    if (!p) throw Error("Part not found.");
    p.name = v.name.trim();
    p.unitCostCents = cents(v.cost);
    p.notes = v.notes || "";
  } else if (type === "adjust")
    s.adjustments.push({
      id: uid(),
      partId: v.partId,
      delta: Number(v.delta),
      reason: v.reason.trim(),
      date: v.date,
    });
  else if (type === "retire") {
    const p = s.parts.find((p) => p.id === v.id);
    if (!p) throw Error("Part not found.");
    p.retired = !p.retired;
  } else if (type === "entry") {
    const usage = [];
    if (v.partId) {
      const part = s.parts.find((p) => p.id === v.partId);
      if (!part || part.retired) throw Error("Choose an active part.");
      usage.push({
        partId: part.id,
        name: part.name,
        unitCostCents: part.unitCostCents,
        quantity: Number(v.quantity),
      });
    }
    s.entries.push({
      id: uid(),
      projectId: v.projectId,
      date: v.date,
      title: v.title.trim(),
      notes: v.notes || "",
      wiring: v.wiring || "",
      kind: v.kind,
      result: v.result,
      link: v.link?.trim() || "",
      archived: false,
      usage,
    });
  } else if (type === "editEntry") {
    const e = s.entries.find((e) => e.id === v.id);
    if (!e) throw Error("Entry not found.");
    e.title = v.title.trim();
    e.notes = v.notes || "";
    e.wiring = v.wiring || "";
    e.result = v.result;
    e.link = v.link?.trim() || "";
  } else if (type === "archive") {
    const e = s.entries.find((e) => e.id === v.id);
    if (!e) throw Error("Entry not found.");
    e.archived = !e.archived;
  } else throw Error("Unknown workspace action.");
  return validate(s);
}
export function searchEntries(
  s,
  { project = "all", query = "", result = "all", archived = false } = {},
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return s.entries
    .filter(
      (e) =>
        (project === "all" || e.projectId === project) &&
        (result === "all" || e.result === result) &&
        (archived || !e.archived) &&
        terms.every((t) =>
          [e.title, e.notes, e.wiring, ...e.usage.map((u) => u.name)]
            .join(" ")
            .toLowerCase()
            .includes(t),
        ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
