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
    && (!coupon.disabled_at || Number.isFinite(Date.parse(coupon.disabled_at)));
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
    if (response.status === 401 || response.status === 403) {
      throw requestError("認証を確認できません。ページを再読み込みして認証してください。", response.status, "authentication");
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const fallback = response.status === 409
        ? "内容が更新されたか、同じコードが存在します。一覧を更新して確認してください。"
        : "処理を完了できませんでした。時間をおいてもう一度お試しください。";
      throw requestError(typeof result?.message === "string" ? result.message.slice(0, 300) : fallback,
        response.status, result?.error, method !== "GET" && (!result || response.status >= 500));
    }
    if (method === "GET" ? !Array.isArray(result.coupons) || !result.coupons.every(validCoupon) : !validCoupon(result.coupon)) {
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
  const refreshButton = root.querySelector("[data-coupon-refresh]");
  const list = root.querySelector("[data-coupon-list]");
  const listMessage = root.querySelector("[data-coupon-list-message]");
  const createMessage = root.querySelector("[data-coupon-create-message]");
  const count = root.querySelector("[data-coupon-count]");
  const updated = root.querySelector("[data-coupon-updated]");
  const issued = root.querySelector("[data-coupon-issued]");
  const issuedCode = root.querySelector("[data-coupon-issued-code]");
  const issuedCopy = root.querySelector("[data-coupon-issued-copy]");
  const cards = new Map();
  let busy = false;
  let needsRefresh = false;

  function updateControls() {
    root.setAttribute("aria-busy", String(busy));
    refreshButton.disabled = busy;
    for (const control of root.querySelectorAll("[data-coupon-lock]")) control.disabled = busy || needsRefresh;
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
    }
  }

  function upsertCoupon(coupon, prepend = false) {
    const next = renderCard(coupon);
    const previous = cards.get(coupon.id);
    if (previous) previous.replaceWith(next);
    else if (prepend) list.prepend(next);
    else list.append(next);
    cards.set(coupon.id, next);
    count.textContent = `${cards.size.toLocaleString("ja-JP")}件`;
    list.hidden = false;
    setMessage(listMessage, "");
    updateControls();
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
    const badge = element("span", `admin-status coupon-admin__state--${state.key}`, state.label);
    identity.append(title, badge);
    const copy = element("button", "admin-button", "コードをコピー");
    copy.type = "button";
    copy.setAttribute("aria-label", `${coupon.code} をコピー`);
    heading.append(identity, copy);
    const memo = element("p", "coupon-admin__memo", coupon.label || "管理メモなし");
    const dates = element("dl", "coupon-admin__dates");
    for (const [label, value] of [["適用開始", formatDate(coupon.starts_at)], ["有効期限", formatDate(coupon.expires_at)]]) {
      dates.append(element("dt", "", label), element("dd", "", value));
    }
    const message = element("p", "admin-message");
    message.hidden = true;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const edit = element("details", "coupon-admin__editor");
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
    if (coupon.disabled_at) {
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
    const toggle = element("button", "admin-button", coupon.disabled_at ? "停止を解除" : "利用を停止");
    toggle.type = "button";
    toggle.setAttribute("data-coupon-lock", "");
    actions.append(toggle);
    if (Date.parse(coupon.expires_at) <= Date.now()) {
      actions.append(element("p", "coupon-admin__note", "期限切れです。再び利用する場合は期限も延長してください。"));
    }
    card.append(heading, memo, dates, edit, actions, message);
    copy.addEventListener("click", () => copyCode(coupon.code, copy, message));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || needsRefresh || !form.reportValidity()) return;
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
    toggle.addEventListener("click", async () => {
      if (busy || needsRefresh) return;
      await mutateCoupon(coupon, { enabled: Boolean(coupon.disabled_at), expected_updated_at: coupon.updated_at }, card,
        coupon.disabled_at ? "停止を解除しました。有効期間をご確認ください。" : "クーポンの利用を停止しました。");
    });
    return card;
  }

  async function mutateCoupon(coupon, payload, card, successMessage) {
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
    if (busy || needsRefresh || !createForm.reportValidity()) return;
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
      setMessage(createMessage, "クーポンを発行しました。下のコードをコピーしてご案内できます。");
      issuedCode.focus({ preventScroll: true });
    } catch (error) {
      if (error.uncertain) needsRefresh = true;
      setMessage(createMessage, error.code === "coupon_code_exists"
        ? "このコードはすでに発行されています。別のコードを指定するか、空欄にして自動生成してください。"
        : error.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  });
  issuedCopy.addEventListener("click", () => copyCode(issuedCode.textContent, issuedCopy, createMessage));
  refreshButton.addEventListener("click", loadCoupons);
  loadCoupons();
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-coupon-admin]");
  if (root) initCouponAdmin(root);
}
