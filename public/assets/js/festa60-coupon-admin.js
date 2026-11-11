const API_URL = "/api/festa60/admin/coupons";
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  second: "2-digit", hourCycle: "h23", timeZone: "Asia/Tokyo",
});

// datetime-local has no timezone. Interpret it explicitly as Japan time,
// including on an administrator's computer set to another timezone.
export function japanLocalToIso(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(String(value || ""));
  if (!match) throw new Error("日時を日本時間で入力してください。");
  const local = `${match[1]}T${match[2]}:${match[3] || "00"}`;
  const result = `${local}+09:00`;
  if (!Number.isFinite(Date.parse(result)) || isoToJapanLocal(result) !== local) {
    throw new Error("正しい日時を日本時間で入力してください。");
  }
  return result;
}

export function isoToJapanLocal(value) {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  return new Date(instant + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

export function couponState(coupon, now = Date.now()) {
  if (coupon.usage_state === "used") return { key: "used", label: "使用済み" };
  if (coupon.usage_state === "reserved") return { key: "reserved", label: "手続き中" };
  return availabilityState(coupon, now);
}

function availabilityState(coupon, now = Date.now()) {
  if (coupon.disabled_at) return { key: "disabled", label: "停止中" };
  if (Date.parse(coupon.expires_at) <= now) return { key: "expired", label: "期限切れ" };
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now) return { key: "scheduled", label: "開始前" };
  return { key: "active", label: "利用可能" };
}

function validCoupon(coupon) {
  return coupon && typeof coupon.id === "string" && coupon.id.length > 0 && coupon.id.length <= 200
    && typeof coupon.code === "string" && coupon.code.length > 0 && coupon.code.length <= 64
    && (coupon.label === null || coupon.label === undefined || typeof coupon.label === "string")
    && Number.isFinite(Date.parse(coupon.expires_at)) && Number.isFinite(Date.parse(coupon.updated_at))
    && (!coupon.starts_at || Number.isFinite(Date.parse(coupon.starts_at)))
    && (!coupon.disabled_at || Number.isFinite(Date.parse(coupon.disabled_at)))
    && (coupon.usage_state === undefined || coupon.usage_state === null || ["unused", "reserved", "used"].includes(coupon.usage_state))
    && [coupon.reserved_at, coupon.used_at].every((value) => value === undefined || value === null
      || (typeof value === "string" && Number.isFinite(Date.parse(value))))
    && (coupon.application_code === undefined || coupon.application_code === null || typeof coupon.application_code === "string");
}

function validBatch(batch) {
  return batch && typeof batch.batch_id === "string" && batch.batch_id.length > 0 && batch.batch_id.length <= 200
    && Number.isInteger(batch.count) && batch.count >= 1 && batch.count <= 100
    && Array.isArray(batch.codes) && batch.codes.length === batch.count && new Set(batch.codes).size === batch.count
    && batch.codes.every((code) => typeof code === "string" && code.length > 0 && code.length <= 64)
    && Number.isFinite(Date.parse(batch.expires_at)) && Number.isFinite(Date.parse(batch.created_at))
    && (!batch.starts_at || Number.isFinite(Date.parse(batch.starts_at)))
    && (batch.label === undefined || batch.label === null || typeof batch.label === "string");
}

function formatDate(value, empty = "指定なし（発行後から）") {
  return value ? dateFormatter.format(new Date(value)) : empty;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function setMessage(node, text, isError = false) {
  node.className = `admin-message${isError ? " admin-message--error" : ""}`;
  node.textContent = text;
  node.hidden = !text;
}

function requestError(message, status, code, uncertain = false) {
  return Object.assign(new Error(message), { status, code, uncertain });
}

async function requestApi(method, path = "", payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { accept: "application/json", ...(payload === undefined ? {} : { "content-type": "application/json" }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json().catch(() => null);
    if (response.status === 403 && result?.error === "coupon_issuer_required") {
      throw requestError("クーポンの発行・変更権限がありません。", response.status, result.error);
    }
    if (response.status === 401 || response.status === 403) {
      throw requestError("認証を確認できません。ページを再読み込みして認証してください。", response.status, "authentication");
    }
    if (!response.ok || !result?.ok) {
      const fallback = response.status === 409
        ? "内容が更新されたか、同じコードが存在します。一覧を更新して確認してください。"
        : "処理を完了できませんでした。時間をおいてもう一度お試しください。";
      throw requestError(typeof result?.message === "string" ? result.message.slice(0, 300) : fallback,
        response.status, result?.error, method !== "GET" && (!result || response.status >= 500));
    }
    const valid = path === "/batch"
      ? method === "GET"
        ? Array.isArray(result.batches) && result.batches.length <= 20 && result.batches.every(validBatch)
        : typeof result.batch_id === "string" && result.batch_id.length > 0 && typeof result.replayed === "boolean"
          && Array.isArray(result.coupons) && result.coupons.length === payload.count && result.coupons.every(validCoupon)
          && new Set(result.coupons.map((coupon) => coupon.id)).size === payload.count
          && new Set(result.coupons.map((coupon) => coupon.code)).size === payload.count
      : method === "GET" ? Array.isArray(result.coupons) && result.coupons.every(validCoupon) : validCoupon(result.coupon);
    if (!valid) {
      throw requestError("処理結果を確認できませんでした。一覧を更新して内容を確認してください。", response.status, "invalid_response", method !== "GET");
    }
    return result;
  } catch (error) {
    if (error.status !== undefined) throw error;
    throw requestError(method === "GET"
      ? "クーポンを取得できませんでした。通信状況をご確認のうえ、一覧を更新してください。"
      : "通信結果を確認できませんでした。重複した操作を避けるため、一覧を更新して発行・変更済みか確認してください。",
    0, "network", method !== "GET");
  } finally {
    clearTimeout(timer);
  }
}

export function initCouponAdmin(root) {
  const createForm = root.querySelector("[data-coupon-create]");
  const createPanel = root.querySelector("[data-coupon-create-panel]") || createForm;
  let permissionMessage = root.querySelector("[data-coupon-permission-message]");
  if (!permissionMessage) {
    permissionMessage = element("p", "admin-message");
    permissionMessage.setAttribute("data-coupon-permission-message", "");
    permissionMessage.setAttribute("role", "status");
    permissionMessage.setAttribute("aria-live", "polite");
    root.prepend(permissionMessage);
  }
  const refreshButton = root.querySelector("[data-coupon-refresh]");
  const list = root.querySelector("[data-coupon-list]");
  const listMessage = root.querySelector("[data-coupon-list-message]");
  const createMessage = root.querySelector("[data-coupon-create-message]");
  const count = root.querySelector("[data-coupon-count]");
  const updated = root.querySelector("[data-coupon-updated]");
  const issued = root.querySelector("[data-coupon-issued]");
  const issuedCode = root.querySelector("[data-coupon-issued-code]");
  const issuedCopy = root.querySelector("[data-coupon-issued-copy]");
  const generateButton = root.querySelector("[data-coupon-generate]");
  const generatedMessage = root.querySelector("[data-coupon-generated]");
  const bulkPanel = root.querySelector("[data-coupon-bulk-panel]");
  const bulkIssue = root.querySelector("[data-coupon-bulk-issue]");
  const bulkForm = root.querySelector("[data-coupon-bulk-create]");
  const bulkMessage = root.querySelector("[data-coupon-bulk-message]");
  const bulkRetry = root.querySelector("[data-coupon-bulk-retry]");
  const bulkResult = root.querySelector("[data-coupon-bulk-result]");
  const bulkSummary = root.querySelector("[data-coupon-bulk-summary]");
  const bulkCodes = root.querySelector("[data-coupon-bulk-codes]");
  const bulkCopy = root.querySelector("[data-coupon-bulk-copy]");
  const historyRefresh = root.querySelector("[data-coupon-bulk-history-refresh]");
  const historyMessage = root.querySelector("[data-coupon-bulk-history-message]");
  const historyValues = root.querySelector("[data-coupon-bulk-history-values]");
  const historySelect = root.querySelector("[data-coupon-bulk-history-select]");
  const historyShow = root.querySelector("[data-coupon-bulk-history-show]");
  const cards = new Map();
  let busy = false;
  let needsRefresh = false;
  let bulkPending = null;
  let bulkUncertain = false;
  let historyLoading = false;
  let historyRevision = 0;
  let batches = [];
  let permissions = { can_issue: false, can_manage: false };

  function updateControls() {
    root.setAttribute("aria-busy", String(busy));
    refreshButton.disabled = busy;
    createPanel.hidden = !permissions.can_issue;
    if (generateButton) generateButton.disabled = busy || needsRefresh || bulkUncertain || !permissions.can_issue;
    if (bulkIssue) bulkIssue.hidden = !permissions.can_issue;
    if (bulkRetry) {
      bulkRetry.hidden = !bulkUncertain;
      bulkRetry.disabled = busy || needsRefresh || !permissions.can_issue;
    }
    if (historyShow) historyShow.disabled = busy || bulkUncertain || batches.length === 0;
    if (bulkCopy) bulkCopy.disabled = busy || bulkUncertain || !bulkCodes?.value;
    const issueControls = new Set([...createForm.querySelectorAll("[data-coupon-lock]"),
      ...(bulkForm?.querySelectorAll("[data-coupon-lock]") || [])]);
    for (const control of root.querySelectorAll("[data-coupon-lock]")) {
      const allowed = issueControls.has(control) ? permissions.can_issue : permissions.can_manage;
      control.disabled = busy || needsRefresh || bulkUncertain || !allowed;
    }
    for (const editor of root.querySelectorAll("[data-coupon-editor]")) editor.hidden = !permissions.can_manage;
    for (const toggle of root.querySelectorAll("[data-coupon-toggle]")) toggle.hidden = !permissions.can_manage;
    setMessage(permissionMessage, permissions.can_issue && permissions.can_manage ? ""
      : !permissions.can_issue && !permissions.can_manage
        ? "クーポンの発行・変更は発券担当者のみ操作できます。使用状況は閲覧できます。"
        : `クーポンの${permissions.can_issue ? "変更" : "発行"}は発券担当者のみ操作できます。使用状況は閲覧できます。`);
  }

  async function copyCode(code, button, message) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await globalThis.navigator.clipboard.writeText(code);
      setMessage(message, "コードをコピーしました。");
    } catch {
      setMessage(message, "コピーできませんでした。表示されているコードを選択してコピーしてください。", true);
    } finally {
      button.disabled = false;
      if (button === bulkCopy) updateControls();
    }
  }

  function upsertCoupon(coupon, prepend = false, syncControls = true) {
    const next = renderCard(coupon);
    const previous = cards.get(coupon.id);
    if (previous) previous.replaceWith(next);
    else if (prepend) list.prepend(next);
    else list.append(next);
    cards.set(coupon.id, next);
    count.textContent = `${cards.size.toLocaleString("ja-JP")}件`;
    list.hidden = false;
    setMessage(listMessage, "");
    if (syncControls) updateControls();
    return next;
  }

  function editField(form, { label, name, value, type = "text", required = false, maxLength }) {
    const wrapper = element("div", "admin-field");
    const caption = element("label", "", label);
    const input = element("input");
    input.type = type;
    input.name = name;
    input.value = value || "";
    input.required = required;
    if (type === "datetime-local") input.step = "1";
    if (maxLength) input.maxLength = maxLength;
    caption.append(input);
    wrapper.append(caption);
    form.append(wrapper);
    return input;
  }

  function renderCard(coupon) {
    const card = element("article", "coupon-admin__card");
    card.setAttribute("data-coupon-id", coupon.id);
    const heading = element("div", "coupon-admin__card-heading");
    const identity = element("div", "coupon-admin__identity");
    const title = element("h3", "coupon-admin__code", coupon.code);
    const state = couponState(coupon);
    const usage = ["used", "reserved"].includes(state.key) ? state : { key: "unused", label: "未使用" };
    card.setAttribute("data-coupon-usage", usage.key);
    const availability = availabilityState(coupon);
    identity.append(title, element("span", `admin-status coupon-admin__state--${usage.key}`, usage.label));
    if (usage.key === "unused" || availability.key !== "active") {
      identity.append(element("span", `admin-status coupon-admin__state--${availability.key}`, availability.label));
    }
    const copy = element("button", "admin-button", "コードをコピー");
    copy.type = "button";
    copy.setAttribute("aria-label", `${coupon.code} をコピー`);
    heading.append(identity, copy);
    const memo = element("p", "coupon-admin__memo", coupon.label || "管理メモなし");
    const dates = element("dl", "coupon-admin__dates");
    const usageDate = usage.key === "used" ? formatDate(coupon.used_at, "記録なし")
      : usage.key === "reserved" ? "手続き中（未確定）" : "未使用";
    const rows = [["適用開始", formatDate(coupon.starts_at)], ["有効期限", formatDate(coupon.expires_at)],
      ["利用日時", usageDate], ["受付番号", coupon.application_code || "—"]];
    if (usage.key === "reserved") rows.push(["手続開始", formatDate(coupon.reserved_at, "記録なし")]);
    for (const [label, value] of rows) {
      dates.append(element("dt", "", label), element("dd", "", value));
    }
    const message = element("p", "admin-message");
    message.hidden = true;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const edit = element("details", "coupon-admin__editor");
    edit.setAttribute("data-coupon-editor", "");
    edit.append(element("summary", "", "期限・管理メモを変更"));
    const form = element("form");
    const fields = element("fieldset", "coupon-admin__fields");
    fields.setAttribute("data-coupon-lock", "");
    fields.append(element("legend", "visually-hidden", `${coupon.code} の編集`));
    const grid = element("div", "coupon-admin__grid");
    const label = editField(grid, { label: "管理メモ（任意・80文字まで）", name: "label", value: coupon.label, maxLength: 80 });
    const starts = editField(grid, { label: "適用開始（任意・日本時間）", name: "starts_at", type: "datetime-local", value: isoToJapanLocal(coupon.starts_at) });
    const expires = editField(grid, { label: "有効期限（必須・日本時間）", name: "expires_at", type: "datetime-local", value: isoToJapanLocal(coupon.expires_at), required: true });
    fields.append(grid);
    let enableOnSave;
    if (coupon.disabled_at && usage.key !== "used") {
      const checkboxLabel = element("label", "coupon-admin__checkbox");
      enableOnSave = element("input");
      enableOnSave.type = "checkbox";
      enableOnSave.name = "enable_on_save";
      checkboxLabel.append(enableOnSave, element("span", "", "保存と同時に停止を解除する"));
      fields.append(checkboxLabel);
    }
    const save = element("button", "admin-button admin-button--primary", "変更を保存");
    save.type = "submit";
    fields.append(save);
    form.append(fields);
    edit.append(form);

    const actions = element("div", "coupon-admin__actions");
    let toggle;
    if (usage.key === "used") {
      actions.append(element("p", "coupon-admin__note", "このコードは使用済みです。期限などを変更しても再利用はできません。"));
    } else {
      toggle = element("button", "admin-button", coupon.disabled_at ? "停止を解除" : "利用を停止");
      toggle.type = "button";
      toggle.setAttribute("data-coupon-lock", "");
      toggle.setAttribute("data-coupon-toggle", "");
      actions.append(toggle);
    }
    if (usage.key === "reserved") {
      actions.append(element("p", "coupon-admin__note", "申込手続き中のため、別の申込には使えません。"));
    }
    if (usage.key !== "used" && Date.parse(coupon.expires_at) <= Date.now()) {
      actions.append(element("p", "coupon-admin__note", "期限切れです。再び利用する場合は期限も延長してください。"));
    }
    card.append(heading, memo, dates, edit, actions, message);
    copy.addEventListener("click", () => copyCode(coupon.code, copy, message));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || needsRefresh || bulkUncertain || !permissions.can_manage || !form.reportValidity()) return;
      let payload;
      try {
        payload = { label: label.value.trim(), starts_at: starts.value ? japanLocalToIso(starts.value) : null,
          expires_at: japanLocalToIso(expires.value), expected_updated_at: coupon.updated_at };
        if (payload.starts_at && Date.parse(payload.starts_at) >= Date.parse(payload.expires_at)) throw new Error("有効期限は適用開始より後にしてください。");
        if (enableOnSave?.checked) payload.enabled = true;
      } catch (error) {
        setMessage(message, error.message, true);
        return;
      }
      await mutateCoupon(coupon, payload, card, "クーポンを更新しました。");
    });
    toggle?.addEventListener("click", async () => {
      if (busy || needsRefresh || bulkUncertain || !permissions.can_manage) return;
      await mutateCoupon(coupon, { enabled: Boolean(coupon.disabled_at), expected_updated_at: coupon.updated_at }, card,
        coupon.disabled_at ? "停止を解除しました。有効期間をご確認ください。" : "クーポンの利用を停止しました。");
    });
    return card;
  }

  async function mutateCoupon(coupon, payload, card, successMessage) {
    if (busy || needsRefresh || bulkUncertain || !permissions.can_manage) return;
    busy = true;
    updateControls();
    const message = card.querySelector('[role="status"]');
    setMessage(message, "変更を保存しています。");
    try {
      const result = await requestApi("PATCH", `/${encodeURIComponent(coupon.id)}`, payload);
      const next = upsertCoupon(result.coupon);
      setMessage(next.querySelector('[role="status"]'), successMessage);
      next.querySelector("h3").setAttribute("tabindex", "-1");
      next.querySelector("h3").focus({ preventScroll: true });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        permissions = { can_issue: false, can_manage: false };
        setMessage(listMessage, error.message, true);
      }
      if (error.status === 409 || error.status === 404 || error.uncertain) needsRefresh = true;
      setMessage(message, error.status === 409
        ? "他の管理者が更新した可能性があります。入力は保持しています。一覧を更新し、最新の内容でやり直してください。"
        : error.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function loadCoupons() {
    if (busy) return;
    const recovering = needsRefresh;
    busy = true;
    updateControls();
    setMessage(listMessage, "クーポン一覧を取得しています。");
    try {
      const result = await requestApi("GET");
      permissions = { can_issue: result.permissions?.can_issue === true, can_manage: result.permissions?.can_manage === true };
      cards.clear();
      list.replaceChildren();
      for (const coupon of result.coupons) upsertCoupon(coupon);
      needsRefresh = false;
      list.hidden = result.coupons.length === 0;
      count.textContent = `${result.coupons.length.toLocaleString("ja-JP")}件`;
      setMessage(listMessage, result.coupons.length ? "" : "発行したクーポンはまだありません。");
      if (recovering) setMessage(createMessage, "最新の一覧を取得しました。発行・変更済みか確認してから操作してください。");
      updated.textContent = `最終更新 ${dateFormatter.format(new Date())}（日本時間）`;
    } catch (error) {
      permissions = { can_issue: false, can_manage: false };
      needsRefresh = true;
      setMessage(listMessage, `${error.message}${cards.size ? " 表示は前回取得した内容です。" : ""}`, true);
      updated.textContent = "取得失敗";
    } finally {
      busy = false;
      updateControls();
    }
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || needsRefresh || bulkUncertain || !permissions.can_issue || !createForm.reportValidity()) return;
    const field = (name) => createForm.elements.namedItem(name).value.trim();
    let payload;
    try {
      payload = { expires_at: japanLocalToIso(field("expires_at")) };
      if (field("code")) payload.code = field("code");
      if (field("label")) payload.label = field("label");
      if (field("starts_at")) payload.starts_at = japanLocalToIso(field("starts_at"));
      if (payload.starts_at && Date.parse(payload.starts_at) >= Date.parse(payload.expires_at)) throw new Error("有効期限は適用開始より後にしてください。");
    } catch (error) {
      setMessage(createMessage, error.message, true);
      return;
    }
    busy = true;
    updateControls();
    setMessage(createMessage, "クーポンを発行しています。");
    try {
      const result = await requestApi("POST", "", payload);
      upsertCoupon(result.coupon, true);
      issuedCode.textContent = result.coupon.code;
      issued.hidden = false;
      createForm.reset();
      if (generatedMessage) setMessage(generatedMessage, "");
      setMessage(createMessage, "クーポンを発行しました。下のコードをコピーしてご案内できます。");
      issuedCode.focus({ preventScroll: true });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        permissions = { can_issue: false, can_manage: false };
        setMessage(listMessage, error.message, true);
      }
      if (error.uncertain) needsRefresh = true;
      setMessage(createMessage, error.code === "coupon_code_exists"
        ? "このコードはすでに発行されています。別のコードを指定するか、空欄にして自動生成してください。"
        : error.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  });
  generateButton?.addEventListener("click", () => {
    if (busy || needsRefresh || bulkUncertain || !permissions.can_issue) return;
    const message = generatedMessage || createMessage;
    try {
      if (typeof globalThis.crypto?.getRandomValues !== "function") throw new Error("secure_random_unavailable");
      const random = globalThis.crypto.getRandomValues(new Uint8Array(8));
      const code = `F60-${Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
      const input = createForm.elements.namedItem("code");
      input.value = code;
      setMessage(message, "コードを生成しました。有効期限を設定して「クーポンを発行」を押してください。");
      input.focus({ preventScroll: true });
    } catch {
      setMessage(message, "安全なランダムコードを生成できませんでした。対応するブラウザでお試しいただくか、コードを手動で入力してください。", true);
    }
  });
  function renderBatchHistory(selectedId = historySelect?.value) {
    if (!historySelect) return;
    historySelect.replaceChildren(...batches.map((batch) => {
      const option = element("option", "", `${formatDate(batch.created_at)} / ${batch.count}枚${batch.label ? ` / ${batch.label}` : ""}`);
      option.value = batch.batch_id;
      return option;
    }));
    if (batches.some((batch) => batch.batch_id === selectedId)) historySelect.value = selectedId;
    else historySelect.value = batches[0]?.batch_id || "";
    historyValues.hidden = batches.length === 0;
    historyShow.disabled = busy || bulkUncertain || batches.length === 0;
  }

  function showBatch(batch, replayed = false) {
    bulkCodes.value = batch.codes.join("\n");
    bulkSummary.textContent = `${batch.count}枚${replayed ? "（保存済みの発行結果）" : ""} / 発行時の有効期限 ${formatDate(batch.expires_at)}（日本時間）${batch.label ? ` / ${batch.label}` : ""}`;
    bulkResult.hidden = false;
    bulkCodes.focus({ preventScroll: true });
    updateControls();
  }

  async function loadBatchHistory() {
    if (!historyRefresh || historyLoading) return;
    historyLoading = true;
    const revision = historyRevision;
    historyRefresh.disabled = true;
    setMessage(historyMessage, "一括発行の履歴を取得しています。");
    try {
      const result = await requestApi("GET", "/batch");
      batches = revision === historyRevision ? result.batches
        : [...new Map([...result.batches, ...batches].map((batch) => [batch.batch_id, batch])).values()]
          .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, 20);
      renderBatchHistory();
      setMessage(historyMessage, batches.length ? "" : "一括発行の履歴はまだありません。");
    } catch (error) {
      setMessage(historyMessage, `履歴を取得できませんでした。${batches.length ? " 表示は前回取得した内容です。" : ""}「履歴を更新」から再確認してください。`, true);
    } finally {
      historyLoading = false;
      historyRefresh.disabled = false;
    }
  }

  async function issueBulk() {
    if (!bulkPending || busy || needsRefresh || !permissions.can_issue) return;
    busy = true;
    bulkResult.hidden = true;
    updateControls();
    setMessage(bulkMessage, bulkUncertain ? "同じ発行依頼の結果を確認しています。" : "クーポンをまとめて発行しています。");
    try {
      const result = await requestApi("POST", "/batch", bulkPending.payload);
      const batch = { batch_id: result.batch_id, count: result.coupons.length, label: bulkPending.payload.label || "",
        starts_at: bulkPending.payload.starts_at || null, expires_at: bulkPending.payload.expires_at,
        created_at: result.coupons[0].created_at || bulkPending.createdAt, codes: result.coupons.map((coupon) => coupon.code) };
      bulkUncertain = false;
      historyRevision += 1;
      for (const coupon of [...result.coupons].reverse()) upsertCoupon(coupon, true, false);
      batches = [batch, ...batches.filter((previous) => previous.batch_id !== batch.batch_id)].slice(0, 20);
      renderBatchHistory(batch.batch_id);
      setMessage(historyMessage, "");
      showBatch(batch, result.replayed);
      setMessage(bulkMessage, result.replayed
        ? `${batch.count}枚の保存済みコードを復元しました。新しいコードは追加発行していません。`
        : `${batch.count}枚を発行しました。下の一覧をコピーできます。`);
      // A completed operation is deliberate and final. A later submit may issue
      // another batch with identical settings; only uncertain outcomes reuse IDs.
      bulkPending = null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        permissions = { can_issue: false, can_manage: false };
        setMessage(listMessage, error.message, true);
      }
      if (error.uncertain) {
        bulkUncertain = true;
        setMessage(bulkMessage, "発行結果を確認できませんでした。入力内容を保持しています。「同じ発行結果を確認する」を押すと、同じ依頼を再確認してコードを復元します。", true);
      } else {
        if (error.code === "coupon_batch_conflict") {
          needsRefresh = true;
          bulkUncertain = false;
          bulkPending = null;
        }
        setMessage(bulkMessage, error.message, true);
      }
    } finally {
      busy = false;
      updateControls();
    }
  }

  bulkForm?.addEventListener("input", () => {
    if (!busy && !bulkUncertain) bulkPending = null;
  });
  bulkForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || needsRefresh || bulkUncertain || !permissions.can_issue || !bulkForm.reportValidity()) return;
    const field = (name) => bulkForm.elements.namedItem(name).value.trim();
    try {
      const count = Number(field("count"));
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("発行枚数は1〜100枚の整数で指定してください。");
      const payload = { count, expires_at: japanLocalToIso(field("expires_at")) };
      if (field("starts_at")) payload.starts_at = japanLocalToIso(field("starts_at"));
      if (field("label")) payload.label = field("label");
      if (payload.label?.length > 80) throw new Error("管理メモは80文字以内で入力してください。");
      if (payload.starts_at && Date.parse(payload.starts_at) >= Date.parse(payload.expires_at)) throw new Error("有効期限は適用開始より後にしてください。");
      const key = JSON.stringify(payload);
      if (!bulkPending || bulkPending.key !== key) {
        if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("安全な発行依頼IDを作成できませんでした。対応するブラウザでお試しください。");
        bulkPending = { key, payload: { ...payload, request_id: globalThis.crypto.randomUUID() }, createdAt: new Date().toISOString() };
      }
      await issueBulk();
    } catch (error) {
      setMessage(bulkMessage, error.message, true);
    }
  });
  bulkRetry?.addEventListener("click", () => bulkUncertain && issueBulk());
  bulkCopy?.addEventListener("click", () => {
    if (!busy && !bulkUncertain) return copyCode(bulkCodes.value, bulkCopy, bulkMessage);
  });
  historyShow?.addEventListener("click", () => {
    if (busy || bulkUncertain) return;
    const batch = batches.find((entry) => entry.batch_id === historySelect.value);
    if (batch) showBatch(batch, true);
  });
  historyRefresh?.addEventListener("click", loadBatchHistory);
  issuedCopy.addEventListener("click", () => copyCode(issuedCode.textContent, issuedCopy, createMessage));
  refreshButton.addEventListener("click", loadCoupons);
  loadCoupons();
  if (bulkPanel) loadBatchHistory();
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-coupon-admin]");
  if (root) initCouponAdmin(root);
}
