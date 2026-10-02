(function () {
  const assetLink = document.querySelector('link[href*="assets/css/"]');
  const assetPrefix = assetLink ? assetLink.getAttribute("href").split("assets/css/")[0] : "./";

  function initStagingNotice() {
    const reviewHost = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)?fantasista-review-202605-staging\.pages\.dev$/;
    if (!reviewHost.test(location.hostname.toLowerCase()) || !document.body || document.getElementById("staging-environment-notice")) return;

    const notice = document.createElement("p");
    notice.id = "staging-environment-notice";
    notice.setAttribute("role", "note");
    notice.textContent = "テスト環境・本番ではありません";
    Object.assign(notice.style, {
      position: "fixed",
      left: "12px",
      bottom: "12px",
      zIndex: "2147483640",
      margin: "0",
      padding: "8px 12px",
      maxWidth: "calc(100vw - 24px)",
      boxSizing: "border-box",
      border: "1px solid #b28534",
      borderRadius: "4px",
      background: "#fff0c2",
      color: "#3b2b0a",
      fontSize: "14px",
      fontWeight: "600",
      lineHeight: "1.5",
      letterSpacing: "normal",
      pointerEvents: "none"
    });
    document.body.appendChild(notice);
  }

  function initMobileMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const header = document.querySelector(".site-header, .header");
    const nav = document.getElementById(toggle ? toggle.getAttribute("aria-controls") : "site-nav");

    if (!header || !toggle || !nav) return;

    header.classList.add("has-menu-toggle");

    function setMenuOpen(open) {
      header.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (!open) {
        nav.querySelectorAll("details[data-festa-guide][open]").forEach((details) => {
          details.open = false;
        });
        nav.querySelectorAll(".mobile-nav-parent").forEach((button) => {
          button.setAttribute("aria-expanded", "false");
          const submenu = document.getElementById(button.getAttribute("aria-controls"));
          if (submenu) submenu.hidden = true;
        });
      }
    }

    toggle.addEventListener("click", function () {
      setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      const parentButton = event.target.closest(".mobile-nav-parent");
      if (parentButton) {
        const willOpen = parentButton.getAttribute("aria-expanded") !== "true";
        nav.querySelectorAll(".mobile-nav-parent").forEach((button) => {
          const submenu = document.getElementById(button.getAttribute("aria-controls"));
          const isTarget = button === parentButton;
          button.setAttribute("aria-expanded", String(isTarget && willOpen));
          if (submenu) submenu.hidden = !(isTarget && willOpen);
        });
        return;
      }
      if (event.target.closest("a")) setMenuOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (!header.contains(event.target)) setMenuOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setMenuOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 861px)").matches) setMenuOpen(false);
    });
  }

  function initFestaGuideMenus() {
    const guides = Array.from(document.querySelectorAll("details[data-festa-guide]"));
    if (!guides.length) return;

    function setExpanded(guide, expanded) {
      const summary = guide.querySelector(":scope > summary");
      if (summary) summary.setAttribute("aria-expanded", String(expanded));
    }

    function closeGuide(guide, restoreFocus) {
      if (!guide.open) return;
      guide.open = false;
      setExpanded(guide, false);
      if (restoreFocus) guide.querySelector(":scope > summary")?.focus();
    }

    guides.forEach((guide) => {
      setExpanded(guide, guide.open);
      guide.addEventListener("toggle", function () {
        setExpanded(guide, guide.open);
        if (!guide.open) return;
        guides.forEach((other) => {
          if (other !== guide) closeGuide(other, false);
        });
      });
    });

    document.addEventListener("click", function (event) {
      guides.forEach((guide) => {
        if (!guide.contains(event.target)) closeGuide(guide, false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      const openGuide = guides.find((guide) => guide.open);
      if (openGuide) {
        event.preventDefault();
        closeGuide(openGuide, true);
      }
    });
  }

  function initTopButton() {
    const button = document.createElement("button");
    button.className = "top-button";
    button.type = "button";
    button.textContent = "↑";
    button.setAttribute("aria-label", "トップへ戻る");
    document.body.appendChild(button);

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    function update() {
      button.classList.toggle("is-visible", window.scrollY > 520);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  function initSmoothScroll() {
    document.addEventListener("click", function (event) {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      if (target.matches("details")) target.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function initFaqGroups() {
    const groups = Array.from(document.querySelectorAll("details.faq-group"));
    if (!groups.length) return;

    function openGroupFromHash() {
      const group = location.hash ? document.querySelector(location.hash) : null;
      if (group && group.matches("details.faq-group")) group.open = true;
    }

    groups.forEach((group) => {
      group.addEventListener("toggle", function () {
        if (!group.open) return;
        groups.forEach((other) => {
          if (other !== group) other.open = false;
        });
      });
    });

    openGroupFromHash();
    window.addEventListener("hashchange", openGroupFromHash);
  }

  function initHashDetails() {
    function openDetailsFromHash() {
      if (!location.hash) return;
      const target = document.querySelector(location.hash);
      if (target && target.matches("details")) target.open = true;
    }

    openDetailsFromHash();
    window.addEventListener("hashchange", openDetailsFromHash);
  }

  function initActiveSectionNav() {
    const links = Array.from(document.querySelectorAll('.site-nav a[href*="#"], .nav a[href^="#"]'));
    if (!links.length) return;

    const pairs = links
      .map((link) => {
        const hash = link.hash || link.getAttribute("href");
        return { link, section: hash ? document.querySelector(hash) : null };
      })
      .filter((item) => item.section);

    if (!pairs.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          pairs.forEach((item) => item.link.classList.toggle("is-section-active", item.section === entry.target));
        });
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0.01 }
    );

    pairs.forEach((item) => observer.observe(item.section));
  }

  function setupFilter(toolbarSelector, itemSelector, getValue) {
    const toolbar = document.querySelector(toolbarSelector);
    const items = Array.from(document.querySelectorAll(itemSelector));
    if (!toolbar || !items.length) return;

    toolbar.addEventListener("click", function (event) {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      const value = button.dataset.filter;
      toolbar.querySelectorAll("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      items.forEach((item) => {
        const match = value === "all" || getValue(item) === value;
        item.classList.toggle("is-filter-hidden", !match);
      });
    });
  }

  function initFilters() {
    document.querySelectorAll(".archive-item").forEach((item) => {
      const time = item.querySelector("time");
      if (time && !item.dataset.year) item.dataset.year = time.dateTime.slice(0, 4);
    });

    setupFilter("[data-archive-filter]", ".archive-item", (item) => item.dataset.year);
    setupFilter("[data-doc-filter]", "[data-doc-category]", (item) => item.dataset.docCategory);
  }

  function initLightbox() {
    const selector = '.gallery-thumb-card[href$=".jpg"], .gallery-thumb-card[href$=".jpeg"], .gallery-thumb-card[href$=".png"], .gallery-thumb-card[href$=".webp"], .gallery-photo-card a[href$=".jpg"], .gallery-photo-card a[href$=".jpeg"], .gallery-photo-card a[href$=".png"], .gallery-photo-card a[href$=".webp"], .archive-photo-card[href$=".webp"]';

    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.hidden = true;
    lightbox.innerHTML = '<button class="lightbox__close" type="button" aria-label="閉じる">×</button><div class="lightbox__dialog" role="dialog" aria-modal="true"><img class="lightbox__image" alt="" /><p class="lightbox__caption"></p></div>';
    document.body.appendChild(lightbox);

    const image = lightbox.querySelector(".lightbox__image");
    const caption = lightbox.querySelector(".lightbox__caption");
    const close = lightbox.querySelector(".lightbox__close");

    function hide() {
      lightbox.hidden = true;
      document.body.style.overflow = "";
    }

    document.addEventListener("click", function (event) {
      const link = event.target.closest(selector);
      if (!link) return;
      const img = link.querySelector("img");
      event.preventDefault();
      image.src = link.href;
      image.alt = img ? img.alt : "";
      caption.textContent = img ? img.alt : "";
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
      close.focus();
    });

    close.addEventListener("click", hide);
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) hide();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !lightbox.hidden) hide();
    });
  }

  function getFestaSiteUrl() {
    const isLocalEnvironment = ["127.0.0.1", "localhost"].includes(location.hostname);
    const isReviewEnvironment = location.hostname.includes("fantasista-review-202605-staging.pages.dev");
    return isLocalEnvironment || isReviewEnvironment
      ? assetPrefix + "festa-60th/"
      : "https://tus-fantasista-festa60.pages.dev/festa-60th/";
  }

  function initStructuredNavigation() {
    if (location.pathname.includes("/festa-60th/")) return;

    const normalizedPath = location.pathname.replace(/\/index\.html$/, "/");
    const pathEndsWith = (suffix) => normalizedPath.endsWith(suffix);
    const activeGroup = pathEndsWith("/about/") || pathEndsWith("/archive/") || normalizedPath.includes("/news/")
      ? "about"
      : pathEndsWith("/festa/") || pathEndsWith("/gallery/")
        ? "festa"
        : pathEndsWith("/history/") || normalizedPath.includes("/history/context/") || pathEndsWith("/data/")
          ? "history"
          : pathEndsWith("/documents/")
            ? "members"
            : pathEndsWith("/contact/")
              ? "contact"
              : "";

    const groups = [
      {
        id: "about",
        label: "FANTASISTAについて",
        english: "About",
        href: `${assetPrefix}about/`,
        children: [
          { label: "FANTASISTA会について", href: `${assetPrefix}about/`, current: pathEndsWith("/about/") },
          { label: "お知らせ", href: `${assetPrefix}archive/`, current: pathEndsWith("/archive/") || normalizedPath.includes("/news/") },
        ],
      },
      {
        id: "festa",
        label: "FESTA",
        english: "Events",
        href: `${assetPrefix}festa/`,
        children: [
          { label: "60周年記念FESTA", href: getFestaSiteUrl(), className: "nav-festa60" },
          { label: "過去のFESTA", href: `${assetPrefix}festa/`, current: pathEndsWith("/festa/") },
          { label: "写真・ギャラリー", href: `${assetPrefix}gallery/`, current: pathEndsWith("/gallery/") },
        ],
      },
      {
        id: "history",
        label: "舞研の歩み",
        english: "History",
        href: `${assetPrefix}history/`,
        children: [
          { label: "歴史・沿革", href: `${assetPrefix}history/`, current: pathEndsWith("/history/") && !normalizedPath.includes("/history/context/") },
          { label: "データ", href: `${assetPrefix}data/`, current: pathEndsWith("/data/") },
          { label: "競技ダンスの背景", href: `${assetPrefix}history/context/`, current: normalizedPath.includes("/history/context/") },
        ],
      },
      {
        id: "members",
        label: "会員向け",
        english: "Members",
        href: `${assetPrefix}documents/`,
        children: [
          { label: "公開資料", href: `${assetPrefix}documents/`, current: pathEndsWith("/documents/") && !location.hash },
          { label: "総会資料", href: `${assetPrefix}documents/#general-meeting-materials` },
          { label: "会則・規程", href: `${assetPrefix}documents/#rules-and-regulations` },
        ],
      },
    ];

    const navCopy = (label, english) => `<span class="nav-copy"><span class="nav-ja">${label}</span>${english ? `<span class="nav-en">${english}</span>` : ""}</span>`;
    const childLink = (item) => `<a${item.className ? ` class="${item.className}"` : ""} href="${item.href}"${item.current ? ' aria-current="page"' : ""}>${item.label}</a>`;

    document.querySelectorAll(".site-nav--desktop").forEach((nav) => {
      nav.innerHTML = groups.map((group) => `
        <div class="nav-group${activeGroup === group.id ? " is-current" : ""}">
          <a class="nav-parent-link" href="${group.href}">${navCopy(group.label, group.english)}</a>
          <div class="nav-submenu" aria-label="${group.label}">
            ${group.children.map(childLink).join("")}
          </div>
        </div>
      `).join("") + `<a class="nav-direct-link${activeGroup === "contact" ? " is-current" : ""}" href="${assetPrefix}contact/"${activeGroup === "contact" ? ' aria-current="page"' : ""}>${navCopy("お問い合わせ", "Contact")}</a>`;
    });

    document.querySelectorAll(".site-nav--mobile").forEach((nav) => {
      const navId = nav.id || "site-nav";
      nav.innerHTML = groups.map((group) => {
        const submenuId = `${navId}-${group.id}-submenu`;
        return `
          <div class="mobile-nav-group${activeGroup === group.id ? " is-current" : ""}">
            <button class="mobile-nav-parent" type="button" aria-expanded="false" aria-controls="${submenuId}">
              ${navCopy(group.label, group.english)}
              <span class="mobile-nav-parent__icon" aria-hidden="true"></span>
            </button>
            <div id="${submenuId}" class="mobile-nav-submenu" hidden>
              ${group.children.map(childLink).join("")}
            </div>
          </div>
        `;
      }).join("") + `<a class="nav-direct-link${activeGroup === "contact" ? " is-current" : ""}" href="${assetPrefix}contact/"${activeGroup === "contact" ? ' aria-current="page"' : ""}>${navCopy("お問い合わせ", "Contact")}</a>`;
    });
  }

  function initMainFooterLinks() {
    const footerContainer = document.querySelector(".site-footer .container");
    if (!footerContainer || footerContainer.querySelector(".footer-legal-links")) return;

    const links = document.createElement("nav");
    links.className = "footer-legal-links";
    links.setAttribute("aria-label", "サイトポリシー");
    links.innerHTML = `<a href="${assetPrefix}terms/">サイト利用条件</a><a href="${assetPrefix}privacy/">プライバシーポリシー</a>`;
    footerContainer.prepend(links);
  }

  function initFestaQuickLink() {
    if (location.pathname.includes("/festa-60th/")) return;
    const link = document.createElement("a");
    link.className = "festa-quick-link";
    link.href = getFestaSiteUrl();
    link.textContent = "60周年FESTA 特設ページ";
    document.body.appendChild(link);
  }

  function initContactTypeFromUrl() {
    const select = document.querySelector('select[name="inquiry_type"]');
    if (!select) return;

    const requestedType = new URLSearchParams(window.location.search).get("type");
    const availableValues = Array.from(select.options).map((option) => option.value);
    if (requestedType && availableValues.includes(requestedType)) {
      select.value = requestedType;
    }
  }

  function initMailtoForms() {
    const forms = Array.from(document.querySelectorAll("[data-mailto-form]"));
    if (!forms.length) return;

    const fieldLabels = {
      inquiry_type: "問い合わせ種別",
      full_name: "氏名",
      maiden_name: "旧姓・現姓",
      furigana: "ふりがな",
      graduation_year: "卒部年度",
      affiliation: "所属区分",
      dance_role: "当時の役割",
      email: "メールアドレス",
      phone: "電話番号",
      preferred_contact_method: "主な連絡希望手段",
      attendance_intent: "参加意向",
      companion_status: "同伴者の有無",
      guest_count: "同伴者人数",
      dance_time_intent: "ダンスタイム参加意向",
      photo_permission: "写真掲載・撮影に関する確認",
      volunteer_interest: "手伝い可否",
      sponsorship_interest: "協賛・寄付への関心",
      message: "本文・連絡事項",
      privacy_consent: "個人情報の取り扱いへの同意",
    };

    const hiddenFields = new Set(["form-name", "website", "form_started_at", "submission_id"]);

    function getFieldValue(form, name) {
      const fields = Array.from(form.elements).filter((field) => field.name === name);
      if (!fields.length) return "";

      if (fields[0].type === "radio") {
        const selected = fields.find((field) => field.checked);
        return selected ? getChoiceText(selected) : "";
      }

      if (fields[0].type === "checkbox") {
        const selected = fields.filter((field) => field.checked).map(getChoiceText);
        return selected.join("、");
      }

      const field = fields[0];
      if (field.tagName === "SELECT") {
        const option = field.options[field.selectedIndex];
        return option && option.value ? option.textContent.trim() : "";
      }

      return field.value ? field.value.trim() : "";
    }

    function getChoiceText(field) {
      const label = field.closest("label");
      return label ? label.textContent.trim() : field.value;
    }

    function getOrderedNames(form) {
      const names = [];
      Array.from(form.elements).forEach((field) => {
        if (!field.name || hiddenFields.has(field.name) || names.includes(field.name)) return;
        names.push(field.name);
      });
      return names;
    }

    function buildBody(form) {
      const names = getOrderedNames(form);
      const lines = [
        "FANTASISTA会 事務局 御中",
        "",
        "以下の内容で連絡します。",
        "",
        "---- 入力内容 ----",
      ];

      names.forEach((name) => {
        const value = getFieldValue(form, name);
        if (!value) return;
        lines.push((fieldLabels[name] || name) + ": " + value);
      });

      return lines.join("\n");
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function buildSummary(form) {
      return getOrderedNames(form)
        .filter((name) => name !== "privacy_consent")
        .map((name) => {
          const value = getFieldValue(form, name);
          if (!value) return "";
          const className = name === "message" ? " mailto-preview__summary-row--message" : "";
          return `<div class="mailto-preview__summary-row${className}"><dt>${escapeHtml(fieldLabels[name] || name)}</dt><dd>${escapeHtml(value)}</dd></div>`;
        })
        .join("");
    }

    function buildPayload(form) {
      const payload = {};
      Array.from(form.elements).forEach((field) => {
        if (!field.name || field.disabled) return;
        if (field.type === "radio") {
          if (field.checked) payload[field.name] = field.value;
          return;
        }
        if (field.type === "checkbox") {
          payload[field.name] = field.checked ? field.value : "";
          return;
        }
        payload[field.name] = field.value ? field.value.trim() : "";
      });
      return payload;
    }

    function ensurePreview(form) {
      let preview = form.parentElement.querySelector(".mailto-preview");
      if (preview) return preview;

      preview = document.createElement("section");
      preview.className = "mailto-preview";
      preview.id = "contact-confirm";
      preview.setAttribute("aria-labelledby", "contact-confirm-title");
      preview.hidden = true;
      preview.innerHTML =
        '<p class="panel__eyebrow">Confirm</p><h2 id="contact-confirm-title" tabindex="-1">入力内容の確認</h2><p class="mailto-preview__notice"><strong>まだ送信は完了していません。</strong><br>「FANTASISTA会事務局へ送信する」を押すと、この内容が事務局へ直接送信されます。</p><dl class="mailto-preview__summary" aria-label="送信するお問い合わせ内容"></dl><div class="mailto-preview__actions"><button class="button button--ghost mailto-preview__edit" type="button">入力内容を修正する</button><button class="button button--primary mailto-preview__send" type="button">FANTASISTA会事務局へ送信する</button></div><p class="mailto-preview__fallback" hidden>送信できませんでした。時間をおいて再度お試しいただくか、<a class="mailto-preview__open" href="#">メールソフトからお問い合わせください</a>。</p><p class="mailto-preview__status" role="status" aria-live="polite"></p>';
      form.insertAdjacentElement("afterend", preview);
      return preview;
    }

    forms.forEach((form) => {
      const startedAt = form.querySelector("[name='form_started_at']");
      if (startedAt) startedAt.value = String(Date.now());
      const submissionId = form.querySelector("[name='submission_id']");
      if (submissionId) {
        submissionId.value = crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        const recipient = form.dataset.mailtoRecipient || "tus.festa.office@gmail.com";
        const subjectPrefix = form.dataset.mailtoSubjectPrefix || "【FANTASISTA会】問い合わせ";
        const name = getFieldValue(form, "full_name");
        const subject = name ? subjectPrefix + " " + name : subjectPrefix;
        const body = buildBody(form);
        const href = "mailto:" + recipient + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        const payload = buildPayload(form);
        const preview = ensurePreview(form);
        const summary = preview.querySelector(".mailto-preview__summary");
        const sendButton = preview.querySelector(".mailto-preview__send");
        const fallback = preview.querySelector(".mailto-preview__fallback");
        const fallbackLink = preview.querySelector(".mailto-preview__open");
        const editButton = preview.querySelector(".mailto-preview__edit");
        const status = preview.querySelector(".mailto-preview__status");
        const title = preview.querySelector("#contact-confirm-title");
        const notice = preview.querySelector(".mailto-preview__notice");

        summary.innerHTML = buildSummary(form);
        fallbackLink.href = href;
        fallback.hidden = true;
        form.hidden = true;
        preview.hidden = false;
        status.textContent = "";
        sendButton.hidden = false;
        sendButton.disabled = false;
        editButton.hidden = false;
        preview.scrollIntoView({ behavior: "smooth", block: "start" });
        title.focus();

        sendButton.onclick = async function () {
          sendButton.disabled = true;
          editButton.disabled = true;
          status.textContent = "送信しています。画面を閉じずにお待ちください。";

          try {
            const response = await fetch(form.dataset.contactApi || "/api/contact", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.ok) throw new Error(result?.error || "send_failed");

            notice.innerHTML = `<strong>送信しました。</strong><br>受付番号：${result.receipt_id}`;
            status.textContent = result.receipt_email_sent
              ? "入力したメールアドレスへ自動受付メールを送信しました。"
              : "事務局への送信は完了しました。自動受付メールを送れなかったため、事務局からの連絡をお待ちください。";
            sendButton.hidden = true;
            editButton.hidden = true;
            fallback.hidden = true;
          } catch (error) {
            console.error("Contact form submission failed.", error);
            status.textContent = "送信できませんでした。入力内容は送信されていません。時間をおいて再度お試しいただくか、メールソフトをご利用ください。";
            fallback.hidden = false;
            sendButton.disabled = false;
            editButton.disabled = false;
          }
        };

        editButton.onclick = function () {
          sendButton.disabled = false;
          editButton.disabled = false;
          preview.hidden = true;
          form.hidden = false;
          form.scrollIntoView({ behavior: "smooth", block: "start" });
          form.querySelector("[name='full_name']").focus();
        };

      });
    });
  }

  initStagingNotice();
  initStructuredNavigation();
  initMainFooterLinks();
  initFestaGuideMenus();
  initMobileMenu();
  initTopButton();
  initSmoothScroll();
  initFaqGroups();
  initHashDetails();
  initActiveSectionNav();
  initFilters();
  initLightbox();
  initFestaQuickLink();
  initContactTypeFromUrl();
  initMailtoForms();
})();
