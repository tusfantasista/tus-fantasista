import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { japanLocalToIso, isoToJapanLocal, couponState, initCouponAdmin } from "../public/assets/js/festa60-coupon-admin.js";

const originalTimezone = process.env.TZ;
for (const timezone of ["Asia/Tokyo", "America/Los_Angeles", "Pacific/Auckland"]) {
  process.env.TZ = timezone;
  assert.equal(japanLocalToIso("2027-01-31T23:59"), "2027-01-31T23:59:00+09:00");
  assert.equal(japanLocalToIso("2027-01-31T23:59:59"), "2027-01-31T23:59:59+09:00");
  assert.equal(isoToJapanLocal("2027-01-31T14:59:59.000Z"), "2027-01-31T23:59:59");
  assert.equal(japanLocalToIso("2028-02-29T12:00"), "2028-02-29T12:00:00+09:00");
  for (const invalid of ["", "2027-02-29T12:00", "2026-02-30T12:00", "2027-01-31T24:00", "2027-01-31T12:60", "2027-01-31T12:00:60", "2027-01-31", "2027-01-31T12:00Z"]) {
    assert.throws(() => japanLocalToIso(invalid), Error, `${timezone}: ${invalid} is rejected`);
  }
}
if (originalTimezone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimezone;

const NOW = Date.parse("2026-11-11T03:00:00Z");
const coupon = {
  id: "coupon-ui-test", code: "UI_TEST_ONLY", label: "管理用メモ", starts_at: null,
  expires_at: "2027-01-31T14:59:59.000Z", disabled_at: null,
  created_at: "2026-11-11T02:00:00.000Z", updated_at: "2026-11-11T02:00:00.000Z",
};
assert.equal(couponState(coupon, NOW).key, "active");
assert.equal(couponState({ ...coupon, starts_at: "2026-12-01T00:00:00Z" }, NOW).key, "scheduled");
assert.equal(couponState({ ...coupon, expires_at: "2026-11-11T03:00:00Z" }, NOW).key, "expired");
assert.equal(couponState({ ...coupon, disabled_at: "2026-11-11T03:00:00Z" }, NOW).key, "disabled");

// A small DOM adapter exercises actual event handlers without dependencies or a
// browser. All fetch/clipboard calls below are local stubs; none leave the process.
class Node {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.elements = { namedItem: (name) => this.querySelectorAll("input").find((input) => input.name === name) };
  }
  set textContent(value) { this.content = String(value); this.replaceChildren(); }
  get textContent() { return (this.content || "") + this.children.map((child) => child.textContent).join(""); }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
  prepend(node) { this.children.unshift(node); node.parent = this; }
  replaceChildren(...nodes) { for (const child of this.children) child.parent = null; this.children = []; this.append(...nodes); }
  replaceWith(node) {
    const index = this.parent.children.indexOf(this);
    this.parent.children[index] = node;
    node.parent = this.parent;
    this.parent = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  matches(selector) {
    const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (match) return this.attributes.has(match[1]) && (match[2] === undefined || this.attributes.get(match[1]) === match[2]);
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, listener) { this.listeners.set(name, [...(this.listeners.get(name) || []), listener]); }
  async emit(name) { await Promise.all((this.listeners.get(name) || []).map((listener) => listener({ preventDefault() {} }))); }
  reportValidity() { return this.querySelectorAll("input").every((input) => !input.required || input.value); }
  reset() { for (const input of this.querySelectorAll("input")) { input.value = ""; input.checked = false; } }
  focus() { this.focused = true; }
}

function makeNode(tag, attr) {
  const node = new Node(tag);
  if (attr) node.setAttribute(attr, "");
  return node;
}

function fixture() {
  const root = makeNode("section", "data-coupon-admin");
  const form = makeNode("form", "data-coupon-create");
  const fieldset = makeNode("fieldset", "data-coupon-lock");
  for (const name of ["code", "label", "starts_at", "expires_at"]) {
    const input = makeNode("input");
    input.name = name;
    input.required = name === "expires_at";
    fieldset.append(input);
  }
  form.append(fieldset);
  root.append(form);
  for (const [tag, attr] of [["button", "data-coupon-refresh"], ["div", "data-coupon-list"], ["p", "data-coupon-list-message"],
    ["p", "data-coupon-create-message"], ["p", "data-coupon-count"], ["p", "data-coupon-updated"],
    ["div", "data-coupon-issued"], ["output", "data-coupon-issued-code"], ["button", "data-coupon-issued-copy"]]) root.append(makeNode(tag, attr));
  return { root, form, fieldset, find: (attr) => root.querySelector(`[${attr}]`), field: (name) => form.elements.namedItem(name) };
}

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const requests = [];
const responses = [];
const copied = [];
const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); };
const response = (body, status = 200) => ({ ok: status < 400, status, async json() { return body; } });
const listResponse = (coupons) => response({ ok: true, coupons });
const successResponse = (value, status = 200) => response({ ok: true, coupon: value }, status);
let ui;
try {
  globalThis.document = { createElement: (tag) => new Node(tag), querySelector: () => null };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { async writeText(value) { copied.push(value); } } } });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : undefined });
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.match(url, /^\/api\/festa60\/admin\/coupons(?:\/coupon-ui-test)?$/);
    assert.ok(responses.length, "all requests have a local response; no external requests are allowed");
    const result = responses.shift();
    if (result instanceof Error) throw result;
    return await result;
  };

  responses.push(listResponse([]));
  ui = fixture();
  initCouponAdmin(ui.root);
  await tick();
  assert.match(ui.find("data-coupon-list-message").textContent, /まだありません/);
  assert.equal(ui.find("data-coupon-list").hidden, true);
  assert.equal(ui.fieldset.disabled, false);

  // Only one POST can be in flight, even when a submit event is repeated.
  ui.field("label").value = '<img src=x onerror="alert(1)">';
  ui.field("expires_at").value = "2027-01-31T23:59:59";
  let finishIssue;
  responses.push(new Promise((resolve) => { finishIssue = resolve; }));
  const firstIssue = ui.form.emit("submit");
  await tick();
  const afterIssue = requests.length;
  await ui.form.emit("submit");
  assert.equal(requests.length, afterIssue, "duplicate submit never makes another request");
  assert.equal(ui.fieldset.disabled, true);
  assert.equal(ui.find("data-coupon-refresh").disabled, true);
  const autoCoupon = { ...coupon, label: ui.field("label").value };
  finishIssue(successResponse(autoCoupon, 201));
  await firstIssue;
  assert.equal(requests.at(-1).body.code, undefined, "blank codes are left for server generation");
  assert.equal(requests.at(-1).body.expires_at, "2027-01-31T23:59:59+09:00");
  assert.equal(ui.find("data-coupon-issued-code").textContent, coupon.code);
  assert.equal(ui.find("data-coupon-issued").hidden, false);
  assert.equal(ui.field("expires_at").value, "", "successful issue clears the form");
  assert.equal(ui.find("data-coupon-list").querySelectorAll("img").length, 0, "memo text never creates HTML");
  assert.ok(ui.find("data-coupon-list").textContent.includes(autoCoupon.label));
  await ui.find("data-coupon-issued-copy").emit("click");
  assert.deepEqual(copied, [coupon.code]);

  // A conflicting update keeps typed values and blocks further mutations until
  // the administrator explicitly loads current server state.
  let card = ui.find("data-coupon-list").querySelector("article");
  let editor = card.querySelector("form");
  editor.elements.namedItem("label").value = "編集中のメモ";
  responses.push(response({ ok: false, error: "coupon_conflict", message: "競合しました。" }, 409));
  await editor.emit("submit");
  assert.equal(requests.at(-1).body.expected_updated_at, coupon.updated_at);
  assert.equal(editor.elements.namedItem("label").value, "編集中のメモ");
  assert.match(card.querySelector('[role="status"]').textContent, /一覧を更新/);
  const afterConflict = requests.length;
  await editor.emit("submit");
  assert.equal(requests.length, afterConflict);
  const refreshed = { ...coupon, updated_at: "2026-11-11T03:00:00.000Z" };
  responses.push(listResponse([refreshed]));
  await ui.find("data-coupon-refresh").emit("click");
  assert.equal(ui.fieldset.disabled, false);

  card = ui.find("data-coupon-list").querySelector("article");
  const stopped = { ...refreshed, disabled_at: "2026-11-11T04:00:00.000Z", updated_at: "2026-11-11T04:00:00.000Z" };
  responses.push(successResponse(stopped));
  const toggle = card.querySelectorAll("button").find((button) => button.textContent === "利用を停止");
  await toggle.emit("click");
  assert.deepEqual(requests.at(-1).body, { enabled: false, expected_updated_at: refreshed.updated_at });
  assert.equal(requests.at(-1).options.method, "PATCH");

  card = ui.find("data-coupon-list").querySelector("article");
  editor = card.querySelector("form");
  editor.elements.namedItem("label").value = "";
  editor.elements.namedItem("starts_at").value = "";
  editor.elements.namedItem("expires_at").value = "2027-02-01T12:34:56";
  editor.elements.namedItem("enable_on_save").checked = true;
  responses.push(successResponse({ ...stopped, disabled_at: null, expires_at: "2027-02-01T03:34:56.000Z", updated_at: "2026-11-11T05:00:00.000Z" }));
  await editor.emit("submit");
  assert.deepEqual(requests.at(-1).body, { label: "", starts_at: null, expires_at: "2027-02-01T12:34:56+09:00", enabled: true, expected_updated_at: stopped.updated_at });
  assert.equal(Object.hasOwn(requests.at(-1).body, "code"), false, "codes are immutable in every edit");

  ui.field("code").value = coupon.code;
  ui.field("expires_at").value = "2027-01-31T23:59";
  responses.push(response({ ok: false, error: "coupon_code_exists", message: "コード重複" }, 409));
  await ui.form.emit("submit");
  assert.match(ui.find("data-coupon-create-message").textContent, /別のコード/);
  assert.equal(ui.fieldset.disabled, false, "a known code conflict can be corrected without an ambiguous replay");

  // A lost POST response is not automatically retried, and the user must refresh
  // the list to see whether the server has already created the coupon.
  responses.push(new TypeError("offline"));
  await ui.form.emit("submit");
  assert.match(ui.find("data-coupon-create-message").textContent, /発行・変更済みか確認/);
  assert.equal(ui.fieldset.disabled, true);
  const afterLostResponse = requests.length;
  await ui.form.emit("submit");
  await tick();
  assert.equal(requests.length, afterLostResponse);
  responses.push(listResponse([coupon]));
  await ui.find("data-coupon-refresh").emit("click");
  assert.equal(ui.fieldset.disabled, false);

  responses.push(response(null, 401));
  const unauthenticated = fixture();
  initCouponAdmin(unauthenticated.root);
  await tick();
  assert.match(unauthenticated.find("data-coupon-list-message").textContent, /認証/);
  assert.equal(unauthenticated.fieldset.disabled, true);
  assert.equal(unauthenticated.find("data-coupon-refresh").disabled, false);

  assert.equal(responses.length, 0);
  assert.equal(requests.filter((request) => request.options.method === "POST").length, 3);
  const source = await readFile(new URL("../public/assets/js/festa60-coupon-admin.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie/);
  console.log("PASS coupon admin: explicit Japan-time conversion across browser timezones, issue/copy/edit/stop/resume, immutable codes, stale-version guards, duplicate-submit prevention, XSS-safe text, empty/auth/error states; no external calls");
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete globalThis.navigator;
}
