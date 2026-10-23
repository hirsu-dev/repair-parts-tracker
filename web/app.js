import {
  empty,
  command,
  stock,
  projectValue,
  searchEntries,
  validate,
} from "./model.js";
import { openWorkspace, memoryWorkspace } from "./store.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n / 100),
  today = () => new Date().toISOString().slice(0, 10);
let store,
  state = empty(),
  editProject = null,
  editPart = null,
  editEntry = null,
  busy = false,
  filters = { project: "all", query: "", result: "all", archived: false };
const say = (t) => ($("#message").textContent = t);
const projectName = (id) =>
  state.projects.find((p) => p.id === id)?.title || "Unknown build";
function projectView() {
  const p = state.projects.find((p) => p.id === editProject);
  return `<div class="grid"><section class="panel"><h2>${p ? "Edit build" : "Start a build"}</h2><form id="project-form"><label>Build name<input name="title" maxlength="100" value="${esc(p?.title)}" required/></label><label>Description<textarea name="description" maxlength="5000" rows="4">${esc(p?.description)}</textarea></label><label>Status<select name="status">${["active", "paused", "complete"].map((s) => `<option ${p?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><button type="submit">${p ? "Save build" : "Create build"}</button>${p ? '<button type="button" data-cancel>Edit cancelled / back</button>' : ""}</form></section><section class="panel"><h2>Your builds / ${state.projects.length}</h2>${state.projects.map((p) => `<article class="build"><div class="build-head"><h3>${esc(p.title)}</h3><span class="badge">${p.status}</span></div><p>${esc(p.description) || "No description yet."}</p><div class="build-meta"><span><b>${state.entries.filter((e) => e.projectId === p.id).length}</b>log entries</span><span><b>${money(projectValue(state, p.id))}</b>assigned parts value</span></div><div class="actions"><button data-project-edit="${p.id}">Edit build</button><button data-project-log="${p.id}">Open repair log →</button></div></article>`).join("") || '<p class="empty">Create a build, add parts to the cabinet, then record a repair or a test. No fictional history is preloaded.</p>'}</section></div>`;
}
function partView() {
  const p = state.parts.find((p) => p.id === editPart);
  return `<div class="grid"><section class="panel"><h2>${p ? "Edit part" : "Add a part"}</h2><form id="part-form"><label>Part name<input name="name" maxlength="100" required value="${esc(p?.name)}"/></label><div class="pair"><label>Starting quantity<input name="quantity" type="number" min="0" max="100000" step="1" value="${p ? p.initialStock : 1}" ${p ? "disabled" : "required"}/></label><label>Unit value (USD)<input name="cost" type="number" min="0" max="1000000" step="0.01" value="${p ? (p.unitCostCents / 100).toFixed(2) : "0.00"}" required/></label></div><label>Part notes<textarea name="notes" maxlength="5000" rows="3">${esc(p?.notes)}</textarea></label><button type="submit">${p ? "Save part" : "Add to cabinet"}</button>${p ? '<button type="button" data-cancel>Cancel edit</button>' : ""}</form><p class="help">Unit values are estimates in USD. They are copied into each usage record. Editing a part does not change past recorded values.</p></section><section class="panel"><h2>Parts cabinet / ${state.parts.length}</h2><div class="table-wrap part-list"><table><thead><tr><th>Part</th><th>In stock</th><th>Unit value</th><th>Actions</th></tr></thead><tbody>${state.parts.map((p) => `<tr><td>${esc(p.name)}${p.retired ? ' <span class="badge">retired</span>' : ""}<p class="help">${esc(p.notes)}</p></td><td>${stock(state, p.id)}</td><td>${money(p.unitCostCents)}</td><td><button data-part-edit="${p.id}">Edit</button> <button data-retire="${p.id}">${p.retired ? "Restore" : "Retire"}</button></td></tr>`).join("") || '<tr><td colspan="4">Your parts cabinet is empty.</td></tr>'}</tbody></table></div><h3>Adjust stock with a reason</h3><form id="adjust-form"><div class="pair"><label>Part<select name="partId" required><option value="">Choose part</option>${state.parts.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Quantity change (+/−)<input name="delta" type="number" min="-100000" max="100000" step="1" required/></label><label>Date<input name="date" type="date" value="${today()}" required/></label><label>Reason<input name="reason" maxlength="500" placeholder="Restock, return, correction…" required/></label></div><button type="submit" ${state.parts.length ? "" : "disabled"}>Record stock adjustment</button></form><details class="ledger"><summary>Stock adjustment history / ${state.adjustments.length}</summary>${
    state.adjustments
      .slice()
      .reverse()
      .map(
        (a) =>
          `<p>${a.date} / ${esc(state.parts.find((p) => p.id === a.partId).name)} / ${a.delta > 0 ? "+" : ""}${a.delta}<br/>${esc(a.reason)}</p>`,
      )
      .join("") || '<p class="help">No adjustments recorded.</p>'
  }</details></section></div>`;
}
function entryForm() {
  const e = state.entries.find((e) => e.id === editEntry);
  return `<section class="panel"><h2>${e ? "Edit note" : "Record a repair"}</h2><form id="entry-form">${!e ? `<label>Build<select name="projectId" required><option value="">Choose build</option>${state.projects.map((p) => `<option value="${p.id}" ${filters.project === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label><div class="pair"><label>Date<input name="date" type="date" value="${today()}" required/></label><label>Kind<select name="kind"><option value="repair">Repair</option><option value="test">Test</option><option value="note">Note</option></select></label></div>` : `<p class="help">Date and recorded part usage remain in the ledger. Use stock adjustments for returns or corrections.</p>`}<label>Title<input name="title" maxlength="120" required value="${esc(e?.title)}"/></label><label>Outcome<select name="result">${[
    ["not-tested", "Not tested"],
    ["pass", "Pass"],
    ["fail", "Fail"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${e?.result === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label>What happened / next test<textarea name="notes" maxlength="5000" rows="4">${esc(e?.notes)}</textarea></label><label>Wiring and connections<textarea name="wiring" maxlength="5000" rows="3" placeholder="Record verified pin mappings or a wiring reference…">${esc(e?.wiring)}</textarea></label><label>Reference link (optional HTTPS)<input name="link" type="url" maxlength="500" value="${esc(e?.link)}" placeholder="https://…"/></label>${
    !e
      ? `<div class="pair"><label>Part used (optional)<select name="partId"><option value="">No part used</option>${state.parts
          .filter((p) => !p.retired)
          .map(
            (p) =>
              `<option value="${p.id}">${esc(p.name)} / ${stock(state, p.id)} in stock</option>`,
          )
          .join(
            "",
          )}</select></label><label>Quantity used<input name="quantity" type="number" min="1" max="100000" step="1" value="1"/></label></div>`
      : ""
  }<button type="submit" ${state.projects.length ? "" : "disabled"}>${e ? "Save note changes" : "Record entry & part usage"}</button>${e ? '<button type="button" data-cancel>Cancel edit</button>' : ""}</form></section>`;
}
function logs() {
  const entries = searchEntries(state, filters);
  return (
    entries
      .map(
        (e) =>
          `<article class="entry"><p class="badge">${e.date} / ${esc(projectName(e.projectId))} / ${e.kind} / ${e.result}${e.archived ? " / archived" : ""}</p><h3>${esc(e.title)}</h3><p>${esc(e.notes) || "No additional notes."}</p>${e.wiring ? `<pre>${esc(e.wiring)}</pre>` : ""}${e.link ? `<p><a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">Open reference ↗</a></p>` : ""}${e.usage.map((u) => `<p>Used ${u.quantity} × ${esc(u.name)} / recorded value ${money(u.unitCostCents * u.quantity)}</p>`).join("")}<div class="actions"><button data-entry-edit="${e.id}">Edit note</button><button data-archive="${e.id}">${e.archived ? "Unarchive" : "Archive"}</button></div></article>`,
      )
      .join("") || '<p class="empty">No entries match these filters.</p>'
  );
}
function logView() {
  return `<div class="grid">${entryForm()}<section class="panel"><h2>The repair log</h2><p class="help">Archived notes still count toward stock and assigned parts value. Record a stock adjustment when a real part is returned.</p><form id="log-filters" class="filter-bar"><label>Build<select name="project"><option value="all">All builds</option>${state.projects.map((p) => `<option value="${p.id}" ${filters.project === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label><label>Search<input name="query" type="search" maxlength="100" value="${esc(filters.query)}"/></label><label>Outcome<select name="result">${[
    ["all", "All outcomes"],
    ["not-tested", "Not tested"],
    ["pass", "Pass"],
    ["fail", "Fail"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${filters.result === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="check"><input name="archived" type="checkbox" ${filters.archived ? "checked" : ""}/>Include archived notes</label></form><div id="entries">${logs()}</div></section></div>`;
}
function render() {
  const route = ["projects", "parts", "log"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "projects";
  $("#view").innerHTML =
    route === "parts"
      ? partView()
      : route === "log"
        ? logView()
        : projectView();
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === `#${route}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    say(e.message);
  } finally {
    busy = false;
  }
}
async function change(type, data) {
  state = await store.update((s) => command(s, type, data));
  editProject = null;
  editPart = null;
  editEntry = null;
  render();
  say(
    "Workspace saved." +
      (store.persistent ? "" : " Storage is temporary; export before leaving."),
  );
}
$("#view").addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "log-filters") return;
  const v = Object.fromEntries(new FormData(e.target));
  run(async () => {
    if (e.target.id === "project-form")
      await change("project", { ...v, id: editProject });
    if (e.target.id === "part-form")
      await change(editPart ? "editPart" : "part", { ...v, id: editPart });
    if (e.target.id === "entry-form")
      await change(editEntry ? "editEntry" : "entry", { ...v, id: editEntry });
    if (e.target.id === "adjust-form") await change("adjust", v);
  });
});
$("#view").addEventListener("input", (e) => {
  const f = e.target.closest("#log-filters");
  if (f) {
    filters = {
      ...Object.fromEntries(new FormData(f)),
      archived: f.elements.archived.checked,
    };
    $("#entries").innerHTML = logs();
  }
});
$("#view").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || (b.form && b.type === "submit")) return;
  run(async () => {
    if (b.dataset.projectEdit) {
      editProject = b.dataset.projectEdit;
      render();
      $("#project-form input").focus();
    } else if (b.dataset.partEdit) {
      editPart = b.dataset.partEdit;
      render();
      $("#part-form input").focus();
    } else if (b.dataset.entryEdit) {
      editEntry = b.dataset.entryEdit;
      render();
      $("#entry-form input[name=title]").focus();
    } else if (b.dataset.projectLog) {
      filters.project = b.dataset.projectLog;
      location.hash = "log";
      render();
    } else if (b.dataset.retire)
      await change("retire", { id: b.dataset.retire });
    else if (b.dataset.archive)
      await change("archive", { id: b.dataset.archive });
    else if (b.hasAttribute("data-cancel")) {
      editProject = editPart = editEntry = null;
      render();
    }
  });
});
$("#export").addEventListener("click", () =>
  run(async () => {
    const latest = await store.read(),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(latest, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "benchbook-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }),
);
$("#import").addEventListener("change", (e) =>
  run(async () => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20000000) throw Error("Use a backup smaller than 20 MB.");
      const next = validate(JSON.parse(await file.text()));
      if (
        !confirm(
          `Replace this app's workspace with ${next.projects.length} builds, ${next.parts.length} parts and ${next.entries.length} entries? Export the current workspace first.`,
        )
      )
        return;
      state = await store.update(() => next);
      render();
      say("Validated backup restored.");
    } finally {
      e.target.value = "";
    }
  }),
);
window.addEventListener("hashchange", () => {
  editProject = editPart = editEntry = null;
  render();
});
window.addEventListener("pagehide", () => store?.close());
async function init() {
  try {
    store = await openWorkspace();
    state = await store.read();
  } catch {
    store?.close();
    store = memoryWorkspace();
    say(
      "Local storage could not be opened. Existing database data was not changed. Export new work before leaving this temporary session.",
    );
  }
  $("#storage").textContent = store.persistent
    ? "PRIVATE WORKSPACE / INDEXEDDB / EXPORT A BACKUP"
    : "TEMPORARY SESSION / EXPORT BEFORE LEAVING";
  render();
}
init();
