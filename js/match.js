document.addEventListener("DOMContentLoaded", () => {
  const area = document.getElementById("swipe-area");
  const queueInfo = document.getElementById("queue-info");
  const matchPair = document.getElementById("match-pair");
  const matchMsg = document.getElementById("match-msg");
  let queue = [];
  let current = null;
  let animating = false;

  const meAvatar = `<div class="avatar avatar-lg" style="${XinXianUI.avatarStyle(265)}">我</div>`;

  async function refreshQueue() {
    queue = await XinXianStore.getSwipeQueue();
    current = queue[0] || null;
    // 佇列是輕量資料（沒有評價圖片）；目前這張卡改讀完整資料，失敗則沿用輕量資料
    if (current) {
      try {
        const full = await XinXianStore.getMemberById(current.id);
        if (full) {
          current = full;
          queue[0] = full;
        }
      } catch (err) {
        console.error("[match] 讀取完整會員資料失敗，改用摘要", err);
      }
    }
    render();
  }

  function render() {
    const matches = XinXianStore.getMatches().length;
    queueInfo.textContent = current
      ? `剩餘 ${queue.length} 位 · 已配對 ${matches} 人`
      : `沒有更多對象 · 已配對 ${matches} 人`;

    if (!current) {
      area.innerHTML = `
        <div class="glass-card swipe-card">
          <div class="avatar avatar-xl" style="${XinXianUI.avatarStyle(220)}">✓</div>
          <h2>今天先到這裡</h2>
          <p class="bio">你可以重設配對紀錄，或到瀏覽頁看看更多會員。</p>
          <div class="swipe-actions" style="justify-content:center">
            <button type="button" class="btn btn-primary" id="empty-reset">重設並再試</button>
          </div>
        </div>`;
      const btn = document.getElementById("empty-reset");
      if (btn) btn.addEventListener("click", () => {
        XinXianStore.resetMatchState();
        refreshSafe();
      });
      return;
    }

    const m = current;
    area.innerHTML = `
      <article class="glass-card swipe-card" id="current-card">
        ${XinXianUI.avatarHtml(m, "avatar-xl")}
        <h2>${XinXianUI.escapeHtml(m.name)}，${m.age}</h2>
        <div class="meta">${XinXianUI.escapeHtml(m.city)} · ${XinXianUI.escapeHtml(m.gender)}</div>
        <p class="bio">${XinXianUI.escapeHtml(m.bio)}</p>${XinXianUI.reviewsHtml(m)}
              </article>
      <div class="swipe-actions">
        <button type="button" class="btn btn-icon btn-pass" id="btn-pass" title="略過" aria-label="略過">✕</button>
        <button type="button" class="btn btn-icon btn-like" id="btn-like" title="喜歡" aria-label="喜歡">♡</button>
      </div>`;

    document.getElementById("btn-pass").addEventListener("click", () => act("pass"));
    document.getElementById("btn-like").addEventListener("click", () => act("like"));
  }

  function act(type) {
    if (!current || animating) return;
    animating = true;
    const card = document.getElementById("current-card");
    const member = current;
    if (card) card.classList.add(type === "like" ? "fly-right" : "fly-left");

    setTimeout(() => {
      if (type === "like") {
        const matched = XinXianStore.likeMember(member.id);
        if (matched) {
          matchPair.innerHTML = `
            ${meAvatar}
            <span class="heart">♡</span>
            ${XinXianUI.avatarHtml(member, "avatar-lg")}`;
          matchMsg.textContent = `你與 ${member.name} 互相有好感，可以開始認識對方了。`;
          XinXianUI.openModal("match-modal");
        }
      } else {
        XinXianStore.passMember(member.id);
      }
      animating = false;
      refreshSafe();
    }, 320);
  }

  document.getElementById("reset-swipes").addEventListener("click", () => {
    if (confirm("確定要清除喜歡／略過／配對紀錄嗎？")) {
      XinXianStore.resetMatchState();
      refreshSafe();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") act("pass");
    if (e.key === "ArrowRight") act("like");
  });

  function refreshSafe() {
    return refreshQueue().catch((err) => {
      console.error(err);
      queueInfo.textContent = "";
      XinXianUI.showLoadError(area, err, start);
    });
  }

  function start() {
    area.innerHTML = `<div class="glass-card swipe-card"><p class="bio">載入中…</p></div>`;
    return refreshSafe();
  }
  start();
});
