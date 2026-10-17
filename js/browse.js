document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("profile-grid");
  const countEl = document.getElementById("result-count");
  const detailBody = document.getElementById("detail-body");
  const pageTitle = document.querySelector(".page-header h1");
  const sortTabs = document.getElementById("sort-tabs");
  const searchInput = document.getElementById("member-search");

  const regions = window.XINXIAN_REGIONS || {};
  const params = new URLSearchParams(location.search);
  const region = params.get("region") || "";
  let sortMode = params.get("sort") || "newest";
  let searchQuery = (params.get("q") || "").trim();
  if (searchInput && searchQuery) searchInput.value = searchQuery;

  const PAGE_SIZE = 9;
  let page = Math.max(1, Number(params.get("page")) || 1);
  const pagerEl = document.getElementById("pager");

  const pageBlurb = document.getElementById("region-blurb");

  /** 快取啟用中會員，避免每次 render 都打雲端 */
  let activeCache = null;
  let memberCache = {};

  async function loadActive() {
    activeCache = await XinXianStore.getActiveMembers();
    memberCache = Object.fromEntries(activeCache.map((m) => [m.id, m]));
    return activeCache;
  }

  async function ensureActive() {
    if (!activeCache) await loadActive();
    return activeCache;
  }

  function updateRegionNav() {
    document.querySelectorAll(".region-nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const active = region && href.includes("region=" + region);
      a.classList.toggle("active", !!active);
    });
  }

  function updateHeading() {
    if (!pageTitle) return;
    if (region && regions[region]) {
      const meta = regions[region];
      const title = meta.pageTitle || meta.label + "妹妹";
      pageTitle.textContent = title;
      document.title = "江江約會";
      if (pageBlurb) {
        pageBlurb.hidden = !meta.blurb;
        pageBlurb.textContent = meta.blurb || "";
      }
    } else {
      pageTitle.textContent = "瀏覽會員";
      document.title = "江江約會";
      if (pageBlurb) {
        pageBlurb.hidden = true;
        pageBlurb.textContent = "";
      }
    }
  }

  function setActiveSortBtn() {
    sortTabs.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sort === sortMode);
    });
  }

  function matchesSearch(m, q) {
    if (!q) return true;
    const hay = [
      m.name,
      m.city,
      m.bio,
      m.gender,
      String(m.age || ""),
      ...(m.interests || [])
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function regionMembers(list) {
    let out = list.slice();
    if (region && regions[region]) {
      const cities = regions[region].cities || [];
      out = out.filter((m) => cities.includes(m.city));
    }
    const q = searchQuery.toLowerCase();
    if (q) out = out.filter((m) => matchesSearch(m, q));
    return out;
  }

  function sortedList(list) {
    const out = regionMembers(list);
    if (sortMode === "hot") {
      out.sort((a, b) => (b.heat || 0) - (a.heat || 0));
    } else if (sortMode === "views") {
      out.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else {
      out.sort((a, b) => (a.createdDaysAgo ?? 99) - (b.createdDaysAgo ?? 99));
    }
    return out;
  }

  function syncPageUrl() {
    const url = new URL(location.href);
    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    history.replaceState(null, "", url);
  }

  function renderPager(total, totalPages) {
    if (!pagerEl) return;
    if (totalPages <= 1) {
      pagerEl.hidden = true;
      pagerEl.innerHTML = "";
      return;
    }
    pagerEl.hidden = false;
    pagerEl.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm" data-page="prev" ${page <= 1 ? "disabled" : ""}>上一頁</button>
      <span class="page-info">第 ${page} / ${totalPages} 頁</span>
      <button type="button" class="btn btn-ghost btn-sm" data-page="next" ${page >= totalPages ? "disabled" : ""}>下一頁</button>`;
  }

  async function renderInner() {
    updateHeading();
    updateRegionNav();
    setActiveSortBtn();
    const active = await ensureActive();
    const list = sortedList(active);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    syncPageUrl();

    countEl.textContent = total
      ? `共 ${total} 位 · 本頁 ${Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE))} 位`
      : `共 0 位`;

    if (!total) {
      const emptyMsg = searchQuery
        ? "找不到符合的結果，試試別的關鍵字。"
        : "這個地區目前沒有會員。";
      grid.innerHTML = `<div class="empty-state glass-card" style="grid-column:1/-1;padding:2.5rem">${emptyMsg}</div>`;
      renderPager(0, 1);
      return;
    }

    const start = (page - 1) * PAGE_SIZE;
    const pageList = list.slice(start, start + PAGE_SIZE);
    grid.innerHTML = pageList
      .map((m) => {
        const photos = XinXianUI.memberPhotos(m);
        const cover = photos.length
          ? `<div class="card-cover"><img src="${XinXianUI.escapeHtml(photos[0])}" alt="" /></div>`
          : `<div class="card-cover card-cover-fallback" style="${XinXianUI.defaultAvatarStyle ? XinXianUI.defaultAvatarStyle() : "background:linear-gradient(145deg,#3b82f6,#1d4ed8)"}"><span>${XinXianUI.escapeHtml(m.name)}</span></div>`;
        return `
      <article class="glass-card profile-card" data-id="${XinXianUI.escapeHtml(m.id)}" tabindex="0" role="button">
        ${cover}
        <div class="card-body">
          <h3>${XinXianUI.escapeHtml(m.name)}</h3>
          <div class="meta">${m.age} 歲 · ${XinXianUI.escapeHtml(m.city)}</div>
          <p class="bio">${XinXianUI.escapeHtml(m.bio)}</p>
          ${(m.reviews || []).length ? `<div class="meta review-count">評價 ${(m.reviews || []).length} 則</div>` : ""}
        </div>
      </article>`;
      })
      .join("");
    renderPager(total, totalPages);
  }

  /** 包一層：讀取失敗時顯示原因 + 重試按鈕（雲端模式不會再退回示範資料） */
  async function render() {
    try {
      await renderInner();
    } catch (err) {
      console.error(err);
      countEl.textContent = "";
      if (pagerEl) pagerEl.hidden = true;
      XinXianUI.showLoadError(grid, err, () => {
        activeCache = null;
        memberCache = {};
        render().then(() => maybeSurprisePick()).catch(() => {});
      });
    }
  }

  async function bumpViews(id) {
    try {
      const next = await XinXianStore.bumpViews(id);
      if (next == null) return;
      const m = memberCache[id];
      if (m) memberCache[id] = { ...m, views: next };
      if (activeCache) {
        const i = activeCache.findIndex((x) => x.id === id);
        if (i >= 0) activeCache[i] = { ...activeCache[i], views: next };
      }
    } catch (err) {
      console.error("[browse] 更新瀏覽次數失敗", err);
    }
  }

  async function showDetail(id, opts = {}) {
    const bumping = bumpViews(id);
    detailBody.innerHTML = `<p style="padding:2rem;text-align:center;color:var(--text-muted)">載入中…</p>`;
    XinXianUI.openModal("detail-modal");
    let m;
    try {
      // 列表是輕量資料；詳情一律向雲端讀完整的單一會員（含全部照片與評價圖片）
      m = await XinXianStore.getMemberById(id);
    } catch (err) {
      console.error(err);
      XinXianUI.showLoadError(detailBody, err, () => showDetail(id, opts), { title: "載入會員資料失敗" });
      return;
    }
    if (!m || m.active === false) {
      XinXianUI.closeModal("detail-modal");
      return;
    }
    const banner = opts.surprise
      ? `<div class="surprise-banner">熱門推薦</div>`
      : "";
    const photos = XinXianUI.memberPhotos(m);
    const hero = photos.length
      ? `<div class="detail-hero"><img src="${XinXianUI.escapeHtml(photos[0])}" alt="" /></div>`
      : "";
    const gallery = photos.length > 1
      ? `<div class="detail-gallery">${photos.slice(1).map((src) => `<img src="${XinXianUI.escapeHtml(src)}" alt="" />`).join("")}</div>`
      : "";
    detailBody.innerHTML = `
      ${banner}
      ${hero}
      <div class="detail-header detail-header-text">
        <div>
          <h2>${XinXianUI.escapeHtml(m.name)}</h2>
          <div class="meta">${m.age} 歲 · ${XinXianUI.escapeHtml(m.city)}</div>
        </div>
      </div>
      ${gallery}
      <p class="detail-bio">${XinXianUI.escapeHtml(m.bio)}</p>
      ${XinXianUI.reviewsHtml(m)}`;
    if (sortMode === "views") {
      await bumping;
      await render();
    }
  }

  async function poolForSurprise() {
    const list = await ensureActive();
    let pool = list;
    if (region && regions[region]) {
      const cities = regions[region].cities || [];
      pool = list.filter((m) => cities.includes(m.city));
    }
    const girls = pool.filter((m) => m.gender === "女");
    return girls.length ? girls : pool;
  }

  async function maybeSurprisePick() {
    if (params.get("pick") !== "1") return;
    const pool = await poolForSurprise();
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const url = new URL(location.href);
    url.searchParams.delete("pick");
    history.replaceState(null, "", url);
    await showDetail(pick.id, { surprise: true });
  }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".profile-card");
    if (card) showDetail(card.dataset.id);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".profile-card");
      if (card) {
        e.preventDefault();
        showDetail(card.dataset.id);
      }
    }
  });

  sortTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn");
    if (!btn) return;
    sortMode = btn.dataset.sort;
    page = 1;
    const url = new URL(location.href);
    url.searchParams.set("sort", sortMode);
    url.searchParams.delete("page");
    history.replaceState(null, "", url);
    render();
  });

  if (pagerEl) {
    pagerEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      const active = await ensureActive();
      const totalPages = Math.max(1, Math.ceil(sortedList(active).length / PAGE_SIZE) || 1);
      if (btn.dataset.page === "prev" && page > 1) page -= 1;
      if (btn.dataset.page === "next" && page < totalPages) page += 1;
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  }

  if (searchInput) {
    let timer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        page = 1;
        const url = new URL(location.href);
        if (searchQuery) url.searchParams.set("q", searchQuery);
        else url.searchParams.delete("q");
        url.searchParams.delete("page");
        history.replaceState(null, "", url);
        render();
      }, 120);
    });
  }

  function start() {
    grid.innerHTML = `<div class="empty-state glass-card" style="grid-column:1/-1;padding:2.5rem">載入中…</div>`;
    return render().then(() => maybeSurprisePick());
  }
  start().catch((err) => {
    console.error(err);
    XinXianUI.showLoadError(grid, err, start);
  });
});
