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
assert.equal(couponState({ ...coupon, usage_state: "unused" }, NOW).key, "active");
assert.equal(couponState({ ...coupon, usage_state: null }, NOW).key, "active", "legacy null usage remains unused");
assert.equal(couponState({ ...coupon, usage_state: "reserved", disabled_at: "2026-11-11T02:00:00Z" }, NOW).key, "reserved");
assert.equal(couponState({ ...coupon, usage_state: "used", disabled_at: "2026-11-11T02:00:00Z", expires_at: "2026-01-01T00:00:00Z" }, NOW).key, "used", "used takes precedence over availability");

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

function fixture({ generation = true } = {}) {
  const root = makeNode("section", "data-coupon-admin");
  const createPanel = makeNode("div", "data-coupon-create-panel");
  const form = makeNode("form", "data-coupon-create");
  const fieldset = makeNode("fieldset", "data-coupon-lock");
  for (const name of ["code", "label", "starts_at", "expires_at"]) {
    const input = makeNode("input");
    input.name = name;
    input.required = name === "expires_at";
    fieldset.append(input);
  }
  if (generation) {
    fieldset.append(makeNode("button", "data-coupon-generate"), makeNode("p", "data-coupon-generated"));
  }
  form.append(fieldset);
  createPanel.append(form);
  root.append(createPanel);
  for (const [tag, attr] of [["button", "data-coupon-refresh"], ["div", "data-coupon-list"], ["p", "data-coupon-list-message"],
    ["p", "data-coupon-create-message"], ["p", "data-coupon-count"], ["p", "data-coupon-updated"],
    ["div", "data-coupon-issued"], ["output", "data-coupon-issued-code"], ["button", "data-coupon-issued-copy"],
    ["p", "data-coupon-permission-message"]]) root.append(makeNode(tag, attr));
  return { root, form, fieldset, find: (attr) => root.querySelector(`[${attr}]`), field: (name) => form.elements.namedItem(name) };
}

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const requests = [];
const responses = [];
const copied = [];
let randomCalls = 0;
const localCrypto = { getRandomValues(bytes) {
  assert.equal(bytes.byteLength, 8, "generation uses 64 bits of secure random data");
  randomCalls += 1;
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (randomCalls - 1) * 16 + index;
  return bytes;
} };
const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); };
const response = (body, status = 200) => ({ ok: status < 400, status, async json() { return body; } });
const listResponse = (coupons, permissions = { can_issue: true, can_manage: true }) => response({ ok: true, coupons, permissions });
const successResponse = (value, status = 200) => response({ ok: true, coupon: value }, status);
let ui;
try {
  globalThis.document = { createElement: (tag) => new Node(tag), querySelector: () => null };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { async writeText(value) { copied.push(value); } } } });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: localCrypto });
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
  assert.equal(ui.find("data-coupon-create-panel").hidden, true, "issue controls stay hidden before permissions are loaded");
  await tick();
  assert.match(ui.find("data-coupon-list-message").textContent, /まだありません/);
  assert.equal(ui.find("data-coupon-list").hidden, true);
  assert.equal(ui.fieldset.disabled, false);
  assert.equal(ui.find("data-coupon-create-panel").hidden, false);
  assert.equal(ui.find("data-coupon-permission-message").hidden, true);

  const beforeGeneration = requests.length;
  await ui.find("data-coupon-generate").emit("click");
  assert.equal(ui.field("code").value, "F60-0001020304050607");
  assert.equal(ui.field("expires_at").value, "", "generation does not invent an expiration date");
  assert.match(ui.find("data-coupon-generated").textContent, /有効期限を設定して「クーポンを発行」/);
  assert.equal(requests.length, beforeGeneration, "generation does not save or request a payment");
  await ui.find("data-coupon-generate").emit("click");
  assert.equal(ui.field("code").value, "F60-1011121314151617");
  const previousCode = ui.field("code").value;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  await ui.find("data-coupon-generate").emit("click");
  assert.equal(ui.field("code").value, previousCode, "failure never replaces a code with an unsafe fallback");
  assert.match(ui.find("data-coupon-generated").textContent, /安全なランダムコードを生成できません/);
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: localCrypto });
  ui.field("code").value = "";

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
  const randomBeforeBusy = randomCalls;
  await ui.find("data-coupon-generate").emit("click");
  assert.equal(randomCalls, randomBeforeBusy, "generation is rejected while a request is in flight");
  const autoCoupon = { ...coupon, label: ui.field("label").value };
  finishIssue(successResponse(autoCoupon, 201));
  await firstIssue;
  assert.equal(requests.at(-1).body.code, undefined, "blank codes are left for server generation");
  assert.equal(requests.at(-1).body.expires_at, "2027-01-31T23:59:59+09:00");
  assert.equal(ui.find("data-coupon-issued-code").textContent, coupon.code);
  assert.equal(ui.find("data-coupon-issued").hidden, false);
  assert.equal(ui.field("expires_at").value, "", "successful issue clears the form");
  assert.equal(ui.find("data-coupon-generated").hidden, true);
  assert.equal(ui.find("data-coupon-list").querySelectorAll("img").length, 0, "memo text never creates HTML");
  assert.ok(ui.find("data-coupon-list").textContent.includes(autoCoupon.label));
  assert.equal(ui.find("data-coupon-list").querySelector('[data-coupon-usage="unused"]')?.tagName, "article", "old rows without usage fields are shown as unused");
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
  const randomBeforeRefresh = randomCalls;
  await ui.find("data-coupon-generate").emit("click");
  assert.equal(randomCalls, randomBeforeRefresh, "generation is rejected while current server state must be refreshed");
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

  // A used code stays used when stopped, expired, or edited. There is no
  // re-enable checkbox/button and no mutation of usage state from the UI.
  const used = { ...coupon, usage_state: "used", reserved_at: "2026-11-11T03:00:00.000Z",
    used_at: "2026-11-11T03:34:56.000Z", application_code: "F60-TEST-001",
    disabled_at: "2026-11-11T04:00:00.000Z", expires_at: "2026-11-01T00:00:00.000Z" };
  const reserved = { ...coupon, id: "coupon-ui-reserved", code: "RESERVED_TEST_ONLY", usage_state: "reserved",
    reserved_at: "2026-11-11T03:00:00.000Z", used_at: null, application_code: "F60-TEST-002" };
  responses.push(listResponse([used, reserved, { ...coupon, id: "coupon-ui-legacy" },
    { ...coupon, id: "coupon-ui-unused", usage_state: "unused", reserved_at: null, used_at: null, application_code: null }]));
  const usageUi = fixture();
  initCouponAdmin(usageUi.root);
  await tick();
  const usedCard = usageUi.find("data-coupon-list").querySelector('[data-coupon-usage="used"]');
  assert.ok(usedCard.textContent.includes("使用済み"));
  assert.ok(usedCard.textContent.includes("停止中"), "availability stays separately visible");
  assert.ok(usedCard.textContent.includes("F60-TEST-001"));
  assert.ok(usedCard.textContent.includes("12:34:56"), "usage timestamps are shown in Japan time");
  assert.ok(usedCard.textContent.includes("再利用はできません"));
  assert.equal(usedCard.querySelectorAll("button").some((button) => /停止を解除|利用を停止/.test(button.textContent)), false);
  const usedEditor = usedCard.querySelector("form");
  assert.equal(usedEditor.elements.namedItem("enable_on_save"), undefined);
  usedEditor.elements.namedItem("expires_at").value = "2027-01-31T23:59:59";
  responses.push(successResponse({ ...used, expires_at: coupon.expires_at, updated_at: "2026-11-11T06:00:00.000Z" }));
  await usedEditor.emit("submit");
  assert.equal(Object.hasOwn(requests.at(-1).body, "enabled"), false);
  assert.equal(Object.hasOwn(requests.at(-1).body, "usage_state"), false);
  assert.equal(usageUi.find("data-coupon-list").querySelectorAll('[data-coupon-usage="used"]').length, 1,
    "extending a used coupon never resets its usage display");
  const reservedCard = usageUi.find("data-coupon-list").querySelector('[data-coupon-usage="reserved"]');
  assert.ok(reservedCard.textContent.includes("手続き中"));
  assert.ok(reservedCard.textContent.includes("別の申込には使えません"));
  assert.ok(reservedCard.textContent.includes("F60-TEST-002"));
  assert.equal(usageUi.find("data-coupon-list").querySelectorAll('[data-coupon-usage="unused"]').length, 2);
  for (const invalid of [{ ...coupon, usage_state: "unexpected" }, { ...coupon, used_at: 123 },
    { ...coupon, reserved_at: "not a date" }, { ...coupon, application_code: 123 }]) {
    responses.push(listResponse([invalid]));
    const invalidUi = fixture();
    initCouponAdmin(invalidUi.root);
    await tick();
    assert.match(invalidUi.find("data-coupon-list-message").textContent, /処理結果を確認できません/);
    assert.equal(invalidUi.fieldset.disabled, true, "invalid usage data is not silently shown as available");
  }

  // Listing a code is allowed to all CRM viewers. Missing, malformed, or false
  // permission flags can never enable mutation controls or event handlers.
  for (const permissions of [undefined, null, {}, { can_issue: false, can_manage: false },
    { can_issue: "true", can_manage: 1 }]) {
    responses.push(response({ ok: true, coupons: [coupon], ...(permissions === undefined ? {} : { permissions }) }));
    const reader = fixture();
    initCouponAdmin(reader.root);
    await tick();
    assert.equal(reader.find("data-coupon-list").hidden, false);
    assert.equal(reader.find("data-coupon-create-panel").hidden, true);
    assert.equal(reader.fieldset.disabled, true);
    assert.match(reader.find("data-coupon-permission-message").textContent, /発券担当者のみ操作/);
    const readerCard = reader.find("data-coupon-list").querySelector("article");
    assert.equal(readerCard.querySelector("[data-coupon-editor]").hidden, true);
    assert.equal(readerCard.querySelector("[data-coupon-toggle]").hidden, true);
    assert.equal(readerCard.querySelector("[data-coupon-toggle]").disabled, true);
    reader.field("expires_at").value = "2027-01-31T23:59";
    const beforeReaderEvents = requests.length;
    const beforeReaderRandom = randomCalls;
    await reader.find("data-coupon-generate").emit("click");
    assert.equal(randomCalls, beforeReaderRandom, "non-issuers cannot generate codes through a hidden event handler");
    await reader.form.emit("submit");
    await readerCard.querySelector("form").emit("submit");
    await readerCard.querySelector("[data-coupon-toggle]").emit("click");
    assert.equal(requests.length, beforeReaderEvents, "hidden mutation events remain denied when invoked directly");
    await readerCard.querySelector("button").emit("click");
    assert.equal(copied.at(-1), coupon.code, "read-only viewers can still copy visible codes");
  }
  for (const permissions of [{ can_issue: true, can_manage: false }, { can_issue: false, can_manage: true }]) {
    responses.push(listResponse([coupon], permissions));
    const partial = fixture();
    initCouponAdmin(partial.root);
    await tick();
    assert.equal(partial.find("data-coupon-create-panel").hidden, !permissions.can_issue);
    assert.equal(partial.fieldset.disabled, !permissions.can_issue);
    assert.equal(partial.find("data-coupon-list").querySelector("[data-coupon-editor]").hidden, !permissions.can_manage);
  }
  responses.push(listResponse([coupon]));
  const revoked = fixture();
  initCouponAdmin(revoked.root);
  await tick();
  revoked.field("expires_at").value = "2027-01-31T23:59";
  responses.push(response({ ok: false, error: "coupon_issuer_required" }, 403));
  await revoked.form.emit("submit");
  assert.equal(revoked.find("data-coupon-create-panel").hidden, true, "a server permission rejection revokes visible controls immediately");
  assert.equal(revoked.find("data-coupon-list").querySelector("[data-coupon-editor]").hidden, true);
  assert.match(revoked.find("data-coupon-list-message").textContent, /発行・変更権限がありません/);

  responses.push(listResponse([]));
  const generatedUi = fixture();
  initCouponAdmin(generatedUi.root);
  await tick();
  await generatedUi.find("data-coupon-generate").emit("click");
  const generatedCode = generatedUi.field("code").value;
  assert.match(generatedCode, /^F60-[A-F0-9]{16}$/);
  const beforeDate = requests.length;
  await generatedUi.form.emit("submit");
  assert.equal(requests.length, beforeDate, "the generated code still needs a required expiration before issue");
  generatedUi.field("code").value = `${generatedCode}_EDITED`;
  generatedUi.field("expires_at").value = "2027-01-31T23:59";
  responses.push(successResponse({ ...coupon, code: generatedUi.field("code").value }, 201));
  await generatedUi.form.emit("submit");
  assert.equal(requests.at(-1).body.code, `${generatedCode}_EDITED`, "the preview code remains editable and is saved only on issue");
  assert.equal(generatedUi.find("data-coupon-issued-code").textContent, `${generatedCode}_EDITED`);

  responses.push(listResponse([]));
  const legacyHtml = fixture({ generation: false });
  initCouponAdmin(legacyHtml.root);
  await tick();
  assert.equal(legacyHtml.fieldset.disabled, false, "old HTML without the new button/status remains functional");

  responses.push(response(null, 401));
  const unauthenticated = fixture();
  initCouponAdmin(unauthenticated.root);
  await tick();
  assert.match(unauthenticated.find("data-coupon-list-message").textContent, /認証/);
  assert.equal(unauthenticated.fieldset.disabled, true);
  assert.equal(unauthenticated.find("data-coupon-refresh").disabled, false);

  assert.equal(responses.length, 0);
  assert.equal(requests.filter((request) => request.options.method === "POST").length, 5);
  const source = await readFile(new URL("../public/assets/js/festa60-coupon-admin.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie/);
  console.log("PASS coupon admin: secure random preview without issuance, Japan-time dates, issue/copy/edit/stop/resume, single-use usage, legacy compatibility, issuer permissions, stale guards, duplicate prevention, safe text and error states; no external calls");
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete globalThis.navigator;
  if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  else delete globalThis.crypto;
}
