import test from "node:test";
import assert from "node:assert/strict";
import {
  empty,
  command,
  stock,
  projectValue,
  validate,
  cents,
} from "../web/model.js";
import { openWorkspace } from "../web/store.js";
import { IDBFactory } from "fake-indexeddb";
function setup() {
  let s = command(empty(), "project", {
    title: "Test build",
    description: "",
    status: "active",
  });
  s = command(s, "part", {
    name: "Switch",
    quantity: 3,
    cost: "0.10",
    notes: "",
  });
  return s;
}
const entry = (s) => ({
  projectId: s.projects[0].id,
  date: "2026-10-23",
  title: "Replace a switch",
  kind: "repair",
  result: "pass",
  notes: "Checked",
  partId: s.parts[0].id,
  quantity: 2,
});
test("part consumption is exact in cents; editing and archiving preserve value snapshots", () => {
  let s = setup();
  const p = s.parts[0].id;
  s = command(s, "entry", entry(s));
  assert.equal(stock(s, p), 1);
  assert.equal(projectValue(s, s.projects[0].id), 20);
  s = command(s, "editPart", {
    id: p,
    name: "New name",
    cost: "2.00",
    notes: "",
  });
  s = command(s, "archive", { id: s.entries[0].id });
  assert.equal(stock(s, p), 1);
  assert.equal(projectValue(s, s.projects[0].id), 20);
  assert.equal(s.entries[0].usage[0].name, "Switch");
});
test("overspending stock and invalid backups fail without mutating the input", () => {
  const s = setup();
  assert.throws(
    () => command(s, "entry", { ...entry(s), quantity: 4 }),
    /Stock/,
  );
  assert.equal(stock(s, s.parts[0].id), 3);
  assert.throws(() => validate({ ...s, schema: 99 }));
  assert.throws(() => cents("1.001"));
});
test("IndexedDB serializes concurrent commands and rolls back invalid stock changes", async () => {
  const factory = new IDBFactory(),
    a = await openWorkspace(factory),
    b = await openWorkspace(factory);
  await a.update(() => setup());
  await Promise.all([
    a.update((s) =>
      command(s, "project", {
        title: "Second",
        description: "",
        status: "active",
      }),
    ),
    b.update((s) =>
      command(s, "project", {
        title: "Third",
        description: "",
        status: "active",
      }),
    ),
  ]);
  assert.equal((await a.read()).projects.length, 3);
  await assert.rejects(
    a.update((s) => command(s, "entry", { ...entry(s), quantity: 99 })),
  );
  assert.equal(stock(await b.read(), (await b.read()).parts[0].id), 3);
  a.close();
  b.close();
});
