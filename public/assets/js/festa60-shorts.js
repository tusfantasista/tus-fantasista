import { setVideoMetrics } from "./festa60-video-metrics.js?v=20261113-1";

const catalogUrl = new URL("../data/festa60-shorts.json", import.meta.url);
const shortId = (item) => item.key.toLowerCase();
const seconds = (value) => `${Math.round(value)}秒`;
let catalogPromise;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(catalogUrl, { credentials: "omit" }).then((response) => {
      if (!response.ok) throw new Error("catalog unavailable");
      return response.json();
    }).then((data) => {
      const items = data.items?.filter((item) => /^festa60-short-(?:pr\d{2}|h\d{2})$/.test(item.id)
        && /^(?:PR\d{2}|H\d{2})$/.test(item.key) && ["pr", "history"].includes(item.kind)
        && typeof item.title === "string" && Number.isFinite(item.duration) && item.duration > 0
        && typeof item.src === "string" && item.src.startsWith("/festa-60th/media/shorts/")
        && typeof item.poster === "string" && item.poster.startsWith("/festa-60th/media/shorts/"));
      if (!items || items.length !== 24 || new Set(items.map((item) => item.id)).size !== 24
        || items.filter((item) => item.kind === "pr").length !== 10
        || items.filter((item) => item.kind === "history").length !== 14) throw new Error("invalid catalog");
      return items;
    });
  }
  return catalogPromise;
}

function sharePath(item) {
  return `/festa-60th/shorts/?video=${encodeURIComponent(shortId(item))}`;
}

function chooseRandom(items, previousId) {
  const choices = items.filter((item) => item.id !== previousId);
  if (!choices.length) return items[0];
  const random = globalThis.crypto?.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
  return choices[Math.floor(random * choices.length)];
}

function configurePlayer(player, item) {
  player.pause();
  setVideoMetrics(player, item.id);
  player.poster = item.poster;
  player.src = item.src;
  player.load();
}

async function play(player, status) {
  try {
    await player.play();
    if (status) status.textContent = "再生中です。次の動画は一覧からお選びください。";
  } catch {
    if (status) status.textContent = "プレーヤーの再生ボタンを押してください。";
  }
}

async function initializeHome(root) {
  const player = root.querySelector("[data-short-player]");
  const title = root.querySelector("[data-short-title]");
  const info = root.querySelector("[data-short-info]");
  const share = root.querySelector("[data-short-share]");
  const download = root.querySelector("[data-short-download]");
  const next = root.querySelector("[data-short-random]");
  try {
    const items = (await loadCatalog()).filter((item) => item.kind === "pr");
    let selected;
    const select = () => {
      selected = chooseRandom(items, selected?.id);
      configurePlayer(player, selected);
      title.textContent = selected.title;
      info.textContent = `${seconds(selected.duration)}・音声あり`;
      share.href = sharePath(selected);
      download.href = selected.src;
    };
    select();
    next.addEventListener("click", select);
    next.hidden = false;
  } catch {
    setVideoMetrics(player, "festa60-short-pr01");
    info.textContent = "音声あり。ほかの動画も一覧からご覧いただけます。";
  }
}

async function initializeGallery(root) {
  const player = root.querySelector("[data-short-player]");
  const title = root.querySelector("[data-short-title]");
  const info = root.querySelector("[data-short-info]");
  const status = root.querySelector("[data-short-status]");
  const list = root.querySelector("[data-short-list]");
  const groupTitle = root.querySelector("[data-short-group-title]");
  const groupDescription = root.querySelector("[data-short-group-description]");
  const share = root.querySelector("[data-short-share]");
  const download = root.querySelector("[data-short-download]");
  const previous = root.querySelector("[data-short-previous]");
  const next = root.querySelector("[data-short-next]");
  const filters = root.querySelectorAll("[data-short-kind]");
  let selected;
  let group = [];
  let items;

  const updateMarkers = () => {
    list.querySelectorAll("[data-short-select]").forEach((link) => {
      if (link.dataset.shortSelect === selected.id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    const index = group.findIndex((item) => item.id === selected.id);
    previous.disabled = index <= 0;
    next.disabled = index < 0 || index === group.length - 1;
  };
  const select = (item, { shouldPlay = false, updateUrl = true } = {}) => {
    selected = item;
    configurePlayer(player, item);
    title.textContent = item.title;
    info.textContent = `${item.key}・${seconds(item.duration)}・音声あり`;
    share.href = sharePath(item);
    download.href = item.src;
    status.textContent = "再生ボタンを押すと音が出ます。";
    updateMarkers();
    if (updateUrl) history.replaceState(null, "", sharePath(item));
    if (shouldPlay) {
      play(player, status);
      if (matchMedia("(max-width: 760px)").matches) root.querySelector("[data-short-player-area]").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const renderGroup = (kind) => {
    const historyOrder = ["H01", "H04", "H05", "H06", "H02", "H07", "H08", "H09", "H10", "H11", "H12", "H13", "H14", "H03"];
    group = items.filter((item) => item.kind === kind).sort((a, b) => kind === "history"
      ? historyOrder.indexOf(a.key) - historyOrder.indexOf(b.key)
      : a.key.localeCompare(b.key));
    filters.forEach((filter) => filter.setAttribute("aria-pressed", String(filter.dataset.shortKind === kind)));
    groupTitle.textContent = kind === "history" ? "60年の物語 · 14本" : "2月11日が楽しみになるPR動画 · 10本";
    groupDescription.textContent = kind === "history"
      ? "一人ひとりが仲間になり、部を育ててきた歩みを、一篇ずつ振り返ります。"
      : "再会、デモンストレーション、ダンスタイム。60周年FESTAで会いたくなる一篇を。";
    list.replaceChildren(...group.map((item, index) => {
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.className = "festa-short-card";
      link.href = item.src;
      link.dataset.shortSelect = item.id;
      link.setAttribute("aria-label", `${item.title}を再生`);
      const image = document.createElement("img");
      image.src = item.poster;
      image.alt = "";
      image.loading = "lazy";
      image.width = 72;
      image.height = 128;
      const copy = document.createElement("span");
      const meta = document.createElement("span");
      meta.className = "festa-short-card__meta";
      meta.textContent = `${String(index + 1).padStart(2, "0")} · ${seconds(item.duration)}`;
      const heading = document.createElement("span");
      heading.className = "festa-short-card__title";
      heading.textContent = item.title;
      const era = document.createElement("span");
      era.className = "festa-short-card__era";
      era.textContent = item.era || "";
      const action = document.createElement("span");
      action.className = "festa-short-card__action";
      action.textContent = "▶ 再生する";
      copy.append(meta, heading, era, action);
      link.append(image, copy);
      row.append(link);
      return row;
    }));
  };

  try {
    items = await loadCatalog();
    const parameters = new URLSearchParams(location.search);
    const requested = parameters.get("video")?.toLowerCase();
    const requestedItem = items.find((item) => item.id === requested || shortId(item) === requested);
    const kind = requestedItem?.kind || (parameters.get("kind") === "history" ? "history" : "pr");
    renderGroup(kind);
    select(requestedItem || group[0], { updateUrl: false });
    filters.forEach((filter) => filter.addEventListener("click", () => {
      renderGroup(filter.dataset.shortKind);
      select(group[0], { updateUrl: false });
      history.replaceState(null, "", `?kind=${filter.dataset.shortKind}`);
    }));
    list.addEventListener("click", (event) => {
      const link = event.target.closest("[data-short-select]");
      if (!link) return;
      event.preventDefault();
      const item = items.find((candidate) => candidate.id === link.dataset.shortSelect);
      if (item) select(item, { shouldPlay: true });
    });
    root.querySelector("[data-short-play]").addEventListener("click", () => select(selected, { shouldPlay: true }));
    previous.addEventListener("click", () => select(group[Math.max(0, group.indexOf(selected) - 1)]));
    next.addEventListener("click", () => select(group[Math.min(group.length - 1, group.indexOf(selected) + 1)]));
    root.querySelector("[data-short-copy]").addEventListener("click", async () => {
      const url = new URL(sharePath(selected), location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = "この動画のリンクをコピーしました。LINEやSNSで共有できます。";
      } catch {
        status.textContent = `共有用リンク：${url}`;
      }
    });
    player.addEventListener("ended", () => { status.textContent = "再生が終わりました。次の一篇を一覧からお選びください。"; });
  } catch {
    setVideoMetrics(player, "festa60-short-pr01");
    status.textContent = "各動画のリンクからも再生できます。";
  }
}

document.querySelectorAll("[data-festa-short-home]").forEach(initializeHome);
document.querySelectorAll("[data-festa-shorts-gallery]").forEach(initializeGallery);
function showFullVersion() {
  if (location.hash === "#pr-video-full") {
    const full = document.getElementById("pr-video-full");
    if (full) full.open = true;
  }
}
showFullVersion();
window.addEventListener("hashchange", showFullVersion);
