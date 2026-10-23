import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";
import { readFile } from "node:fs/promises";
test("actual build, part and repair forms produce a stock-consuming journal record", async () => {
  const window = new Window({ url: "https://example.test/#projects" });
  window.document.write(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  );
  const globals = {
    window,
    document: window.document,
    location: window.location,
    FormData: window.FormData,
    indexedDB: new IDBFactory(),
  };
  const old = new Map(
    Object.keys(globals).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  for (const [k, v] of Object.entries(globals))
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  const wait = () => new Promise((r) => setTimeout(r, 25));
  try {
    await import("../web/app.js");
    await wait();
    let f = window.document.querySelector("#project-form");
    f.elements.title.value = "A test build";
    f.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await wait();
    assert.match(
      window.document.querySelector("#view").textContent,
      /A test build/,
    );
    window.location.hash = "parts";
    window.dispatchEvent(new window.Event("hashchange"));
    f = window.document.querySelector("#part-form");
    f.elements.name.value = "Switch";
    f.elements.quantity.value = "3";
    f.elements.cost.value = "0.10";
    f.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await wait();
    window.location.hash = "log";
    window.dispatchEvent(new window.Event("hashchange"));
    f = window.document.querySelector("#entry-form");
    f.elements.projectId.selectedIndex = 1;
    f.elements.partId.selectedIndex = 1;
    f.elements.title.value = "Replaced switch";
    f.elements.result.value = "pass";
    f.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await wait();
    assert.match(
      window.document.querySelector("#entries").textContent,
      /Replaced switch/,
    );
    assert.match(
      window.document.querySelector("#entries").textContent,
      /Used 1 × Switch/,
    );
    window.dispatchEvent(new window.Event("pagehide"));
  } finally {
    for (const [k, d] of old) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    await window.happyDOM.abort();
  }
});
