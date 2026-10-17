/**
 * 江江約會 — 共用 UI 工具
 */
(function (global) {
  function avatarStyle(hue) {
    const h = hue ?? 260;
    return `background: linear-gradient(145deg, hsl(${h} 70% 48%), hsl(${(h + 40) % 360} 75% 35%));`;
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().slice(0, 1);
  }

  function defaultAvatarStyle() {
    return "background: linear-gradient(145deg, #3b82f6, #1d4ed8);";
  }

  function memberPhotos(member) {
    if (!member) return [];
    if (Array.isArray(member.photos) && member.photos.length) return member.photos.filter(Boolean);
    if (member.photo) return [member.photo];
    return [];
  }

  function avatarHtml(member, sizeClass = "") {
    const cls = ("avatar " + sizeClass).trim();
    const photos = memberPhotos(member);
    if (photos.length) {
      return `<div class="${cls} avatar-photo"><img src="${escapeHtml(photos[0])}" alt="" /></div>`;
    }
    const name = member?.name || "?";
    return `<div class="${cls} avatar-nameplate" style="${defaultAvatarStyle()}" title="${escapeHtml(name)}"><span>${escapeHtml(name)}</span></div>`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chipsHtml(interests) {
    return (interests || [])
      .map((i) => `<span class="chip">${escapeHtml(i)}</span>`)
      .join("");
  }

  function reviewsHtml(member) {
    const reviews = [...(member?.reviews || [])].reverse();
    if (!reviews.length) {
      return `<div class="front-reviews"><h3>評價</h3><p class="review-empty">尚無評價</p></div>`;
    }
    const items = reviews
      .map((r) => {
        const pics = (r.photos || [])
          .map((src) => `<img src="${escapeHtml(src)}" alt="" />`)
          .join("");
        return `<div class="review-item">
          <div>${escapeHtml(r.text)}</div>
          ${pics ? `<div class="pics">${pics}</div>` : ""}
          <div class="meta">${escapeHtml(r.at || "")}</div>
        </div>`;
      })
      .join("");
    return `<div class="front-reviews"><h3>評價（${reviews.length}）</h3><div class="review-list">${items}</div></div>`;
  }

  /**
   * 在 container 內顯示「載入失敗」＋原因＋重試按鈕。
   * opts.tag："tr" 時輸出成表格列（colspan = opts.colspan）；opts.title 自訂標題。
   */
  function showLoadError(container, err, onRetry, opts) {
    if (!container) return;
    const o = opts || {};
    const reason =
      (global.XinXianStore && global.XinXianStore.describeError
        ? global.XinXianStore.describeError(err)
        : (err && err.message) || String(err)) || "未知錯誤";
    const inner = `
      <div class="load-error" role="alert">
        <strong>${escapeHtml(o.title || "載入失敗")}</strong>
        <p>原因：${escapeHtml(reason)}</p>
        <p class="load-error-hint">這是真實的雲端讀取錯誤，並非沒有資料；網站不會再拿示範資料頂替。</p>
        <button type="button" class="btn btn-primary btn-sm" data-retry>重試</button>
      </div>`;
    container.innerHTML =
      o.tag === "tr"
        ? `<tr><td colspan="${o.colspan || 5}" style="padding:1.5rem">${inner}</td></tr>`
        : `<div class="empty-state glass-card" style="grid-column:1/-1;padding:1.5rem">${inner}</div>`;
    const btn = container.querySelector("[data-retry]");
    if (btn && typeof onRetry === "function") {
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "重試中…";
        onRetry();
      });
    }
  }

  /** 右下角的「雲端連線狀態」小標籤；點一下會重新檢查連線 */
  function mountCloudStatus() {
    const store = global.XinXianStore;
    if (!store || !store.getCloudStatus || document.getElementById("cloud-status")) return;
    const el = document.createElement("button");
    el.type = "button";
    el.id = "cloud-status";
    el.className = "cloud-status";
    document.body.appendChild(el);
    function paint(st) {
      const map = {
        local: ["本機模式（未啟用雲端）", "local"],
        pending: ["雲端：連線中…", "pending"],
        ok: ["雲端：已連線", "ok"],
        error: ["雲端：連線失敗（點此重試）", "error"]
      };
      const m = map[st.state] || map.pending;
      el.className = "cloud-status cloud-" + m[1];
      el.textContent = m[0];
      el.title = st.message ? "原因：" + st.message : "點一下重新檢查雲端連線";
    }
    paint(store.getCloudStatus());
    global.addEventListener("xinxian-cloud-status", (e) => paint(e.detail));
    el.addEventListener("click", () => {
      store.pingCloud().catch(() => {});
    });
  }

  function initNav() {
    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", () => links.classList.toggle("open"));
    }
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) {
        a.classList.add("active");
      }
    });
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  function bindModalClosers() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close-modal");
        closeModal(id);
      });
    });
    document.querySelectorAll(".modal-backdrop").forEach((bd) => {
      bd.addEventListener("click", (e) => {
        if (e.target === bd) bd.classList.remove("open");
      });
    });
  }


  const AGE_KEY = "jiangjiang_age18_ok";

  function isAgeVerified() {
    try {
      return localStorage.getItem(AGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function mountAgeGate() {
    if (isAgeVerified()) return;
    if (document.getElementById("age-gate")) return;

    document.body.classList.add("age-gate-locked");

    const gate = document.createElement("div");
    gate.id = "age-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "age-gate-title");
    gate.innerHTML = `
      <div class="age-gate-card">
        <div class="badge">18+</div>
        <h2 id="age-gate-title">年齡限制告知</h2>
        <p>江江約會僅供年滿 18 歲的成年人使用。進入本站前，請確認你已達法定成年年齡。</p>
        <div class="age-gate-actions">
          <button type="button" class="btn btn-primary" data-age="yes">我已滿 18 歲，進入網站</button>
          <button type="button" class="btn btn-ghost" data-age="no">我未滿 18 歲</button>
        </div>
        <p class="age-denied" hidden style="margin-top:1rem;margin-bottom:0;color:var(--danger)">抱歉，本站僅開放給 18 歲以上使用者。</p>
      </div>`;

    document.body.appendChild(gate);

    gate.querySelector('[data-age="yes"]').addEventListener("click", () => {
      try {
        localStorage.setItem(AGE_KEY, "1");
      } catch (_) {}
      document.body.classList.remove("age-gate-locked");
      gate.remove();
    });

    gate.querySelector('[data-age="no"]').addEventListener("click", () => {
      const denied = gate.querySelector(".age-denied");
      if (denied) denied.hidden = false;
      gate.querySelector('[data-age="yes"]').disabled = true;
    });
  }

  function boot() {
    mountAgeGate();
    initNav();
    bindModalClosers();
    mountCloudStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }


  global.XinXianUI = {
    avatarStyle,
    defaultAvatarStyle,
    initials,
    memberPhotos,
    avatarHtml,
    escapeHtml,
    chipsHtml,
    reviewsHtml,
    showLoadError,
    mountCloudStatus,
    openModal,
    closeModal,
    isAgeVerified,
    mountAgeGate
  };
})(window);
