document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("admin-tbody");
  const search = document.getElementById("admin-search");
  const citySel = document.getElementById("e-city");
  const form = document.getElementById("edit-form");
  const editTitle = document.getElementById("edit-title");
  const photoInput = document.getElementById("e-photo");
  const photoGrid = document.getElementById("e-photo-grid");
  const bioInput = document.getElementById("e-bio");
  const bioCount = document.getElementById("e-bio-count");

  const MAX_PHOTOS = 6;
  let draftPhotos = [];
  const cloudOn = () => XinXianStore.isCloudEnabled();

  /**
   * 儲存會員：雲端模式會先把 data URL 照片上傳到 Storage 並換成公開 URL，
   * 任何一張上傳失敗就中止（資料庫完全不會被寫入，更不會存入 base64）。
   * 本機模式維持原樣（照片仍存 localStorage）。
   */
  async function saveMemberWithUpload(member, btn) {
    const label = btn ? btn.textContent : "";
    const setBtn = (t) => {
      if (btn) btn.textContent = t;
    };
    if (btn) btn.disabled = true;
    let prepared;
    try {
      try {
        prepared = await XinXianStore.prepareMemberForSave(member, (done, total) =>
          setBtn("上傳照片 " + done + " / " + total + "…")
        );
      } catch (err) {
        const e = new Error(
          "照片上傳失敗，資料尚未儲存（不會把 base64 存進資料庫）。\n原因：" + (err.message || err)
        );
        e.uploadFailed = true;
        throw e;
      }
      setBtn("儲存中…");
      await XinXianStore.upsertMember(prepared);
      return prepared;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  (window.XINXIAN_CITIES || []).forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    citySel.appendChild(o);
  });

  function updateBioCount() {
    bioCount.textContent = String((bioInput.value || "").length);
  }

  function renderPhotoGrid() {
    if (!draftPhotos.length) {
      photoGrid.innerHTML = `<span class="empty-hint">尚未上傳照片</span>`;
      return;
    }
    photoGrid.innerHTML = draftPhotos
      .map(
        (src, i) => `
      <div class="thumb" data-i="${i}">
        <img src="${XinXianUI.escapeHtml(src)}" alt="" />
        <button type="button" class="rm" data-rm="${i}" aria-label="移除">✕</button>
      </div>`
      )
      .join("");
  }

  photoGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rm]");
    if (!btn) return;
    const i = Number(btn.dataset.rm);
    draftPhotos.splice(i, 1);
    renderPhotoGrid();
  });

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("讀取失敗"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("圖片無法載入"));
        img.onload = () => {
          const max = 720;
          let { width, height } = img;
          if (width > max || height > max) {
            const scale = Math.min(max / width, max / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  photoInput.addEventListener("change", async () => {
    const files = [...(photoInput.files || [])];
    photoInput.value = "";
    for (const file of files) {
      if (draftPhotos.length >= MAX_PHOTOS) {
        alert(`最多上傳 ${MAX_PHOTOS} 張照片。`);
        break;
      }
      if (!file.type.startsWith("image/")) continue;
      try {
        const dataUrl = await compressImage(file);
        draftPhotos.push(dataUrl);
      } catch (_) {
        alert("有一張圖片上傳失敗，已略過。");
      }
    }
    renderPhotoGrid();
  });

  document.getElementById("e-photo-clear").addEventListener("click", () => {
    draftPhotos = [];
    renderPhotoGrid();
  });

  bioInput.addEventListener("input", updateBioCount);

  async function renderLegacyBanner() {
    const box = document.getElementById("legacy-banner");
    if (!box) return;
    box.hidden = true;
    if (!cloudOn() || !window.XinXianCloud || !XinXianCloud.countLegacyMembers) return;
    try {
      const n = await XinXianCloud.countLegacyMembers();
      if (n > 0) {
        box.hidden = false;
        box.textContent =
          "有 " + n + " 位會員的照片仍以 base64 存在資料庫（會讓載入變慢／逾時，列表也不會顯示封面）。請按上方「遷移舊照片」一次處理。";
      }
    } catch (err) {
      console.warn("[admin] 檢查舊照片失敗", err);
    }
  }

  /** 包一層：失敗時顯示原因 + 重試按鈕，不再只寫「載入失敗」 */
  async function render() {
    try {
      await renderInner();
    } catch (err) {
      console.error(err);
      XinXianUI.showLoadError(tbody, err, () => render(), { tag: "tr", colspan: 5 });
    }
  }

  async function renderInner() {
    const q = (search.value || "").trim().toLowerCase();
    let list = await XinXianStore.getMembers();
    if (q) {
      list = list.filter((m) => {
        const hay = [m.name, m.city, m.gender, m.bio].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">沒有符合的會員</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map((m) => {
        const on = m.active !== false;
        const bioPreview = (m.bio || "").slice(0, 36) + ((m.bio || "").length > 36 ? "…" : "");
        const n = XinXianUI.memberPhotos(m).length;
        // 雲端列表是輕量資料（只有封面），不知道總張數
        const photoNote = m._light ? (n ? "有封面照片" : "無封面（或照片尚未遷移）") : n ? `${n} 張照片` : "無照片";
        return `
        <tr data-id="${XinXianUI.escapeHtml(m.id)}">
          <td>
            <div class="cell-user">
              ${XinXianUI.avatarHtml(m)}
              <div>
                <strong>${XinXianUI.escapeHtml(m.name)}</strong>
                <div style="color:var(--text-muted);font-size:0.8rem">${XinXianUI.escapeHtml(bioPreview)}</div>
                <div style="color:var(--text-muted);font-size:0.75rem">${photoNote}</div>
              </div>
            </div>
          </td>
          <td>${m.age}</td>
          <td>${XinXianUI.escapeHtml(m.city)}</td>
          <td><span class="badge ${on ? "badge-on" : "badge-off"}">${on ? "啟用中" : "已停用"}</span></td>
          <td>
            <div class="actions-cell">
              <button type="button" class="btn btn-ghost btn-sm" data-act="edit">編輯</button>
              <button type="button" class="btn btn-sm ${on ? "btn-danger" : "btn-success"}" data-act="toggle">${on ? "停用" : "啟用"}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-act="delete">刪除</button>
              <button type="button" class="btn btn-ghost btn-sm" data-act="review">評價</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
    renderLegacyBanner();
  }


  const MAX_REVIEW_PHOTOS = 4;
  let draftReviewPhotos = [];

  function renderReviewPhotoGrid() {
    const grid = document.getElementById("r-photo-grid");
    if (!grid) return;
    if (!draftReviewPhotos.length) {
      grid.innerHTML = `<span class="empty-hint">尚未上傳圖片</span>`;
      return;
    }
    grid.innerHTML = draftReviewPhotos
      .map(
        (src, i) => `
      <div class="thumb" data-i="${i}">
        <img src="${XinXianUI.escapeHtml(src)}" alt="" />
        <button type="button" class="rm" data-rm-rphoto="${i}" aria-label="移除">✕</button>
      </div>`
      )
      .join("");
  }

  function openReviews(member) {
    if (!member) return;
    document.getElementById("r-member-id").value = member.id;
    document.getElementById("review-title").textContent = "評價";
    document.getElementById("review-subtitle").textContent = member.name + "（" + (member.reviews || []).length + " 則）";
    document.getElementById("r-text").value = "";
    draftReviewPhotos = [];
    renderReviewPhotoGrid();
    renderReviewList(member);
    XinXianUI.openModal("review-modal");
  }

  function renderReviewList(member) {
    const box = document.getElementById("review-list");
    const reviews = [...(member.reviews || [])].reverse();
    if (!reviews.length) {
      box.innerHTML = `<div class="review-empty">尚無評價，在下方新增第一則。</div>`;
      return;
    }
    box.innerHTML = reviews
      .map((r) => {
        const pics = (r.photos || []).map((src) => `<img src="${XinXianUI.escapeHtml(src)}" alt="" />`).join("");
        return `
      <div class="review-item" data-rid="${XinXianUI.escapeHtml(r.id)}">
        <button type="button" class="rm-review" data-rm-review="${XinXianUI.escapeHtml(r.id)}">刪除</button>
        <div>${XinXianUI.escapeHtml(r.text)}</div>
        ${pics ? `<div class="pics">${pics}</div>` : ""}
        <div class="meta">${XinXianUI.escapeHtml(r.at || "")}</div>
      </div>`;
      })
      .join("");
  }

  function openEditor(member) {
    const isNew = !member;
    editTitle.textContent = isNew ? "新增妹妹" : "編輯會員";
    document.getElementById("e-id").value = member?.id || "";
    document.getElementById("e-name").value = member?.name || "";
    document.getElementById("e-age").value = member?.age || "";
    document.getElementById("e-city").value = member?.city || "";
    document.getElementById("e-gender").value = member?.gender || "";
    document.getElementById("e-bio").value = member?.bio || "";
    draftPhotos = XinXianUI.memberPhotos(member).slice(0, MAX_PHOTOS);
    renderPhotoGrid();
    updateBioCount();
    XinXianUI.openModal("edit-modal");
  }

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr?.dataset.id;
    const act = btn.dataset.act;
    try {
      if (act === "edit") {
        openEditor(await XinXianStore.getMemberById(id));
      } else if (act === "toggle") {
        await XinXianStore.toggleMemberActive(id);
        await render();
      } else if (act === "delete") {
        const m = await XinXianStore.getMemberById(id);
        if (m && confirm(`確定刪除「${m.name}」？此操作無法復原。`)) {
          await XinXianStore.deleteMember(id);
          await render();
        }
      } else if (act === "review") {
        openReviews(await XinXianStore.getMemberById(id));
      }
    } catch (err) {
      console.error(err);
      alert("操作失敗：" + (err.message || err));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const age = Number(document.getElementById("e-age").value);
    if (age < 22) {
      alert("示範會員年齡須為 22 歲以上。");
      return;
    }
    const id = document.getElementById("e-id").value || XinXianStore.genId();
    const submitBtn = form.querySelector('[type="submit"]');
    try {
      // 取完整的既有資料（含全部照片／評價），避免用輕量資料覆寫
      const existing = await XinXianStore.getMemberById(id);
      await saveMemberWithUpload(
        {
          id,
          name: document.getElementById("e-name").value.trim(),
          age,
          city: document.getElementById("e-city").value,
          gender: document.getElementById("e-gender").value,
          bio: document.getElementById("e-bio").value.trim(),
          interests: existing?.interests || [],
          avatarHue: 210,
          photos: draftPhotos.slice(),
          photo: draftPhotos[0] || "",
          active: existing ? existing.active !== false : true,
          createdDaysAgo: existing?.createdDaysAgo ?? 0,
          heat: existing?.heat ?? 50,
          views: existing?.views ?? 0,
          reviews: existing?.reviews || []
        },
        submitBtn
      );
      XinXianUI.closeModal("edit-modal");
      await render();
    } catch (err) {
      console.error(err);
      alert((err.uploadFailed ? "" : "儲存失敗：") + (err.message || err));
    }
  });

  document.getElementById("btn-add").addEventListener("click", () => openEditor(null));
  search.addEventListener("input", () => {
    render();
  });

  document.getElementById("r-photo-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rm-rphoto]");
    if (!btn) return;
    draftReviewPhotos.splice(Number(btn.dataset.rmRphoto), 1);
    renderReviewPhotoGrid();
  });

  document.getElementById("r-photo").addEventListener("change", async () => {
    const files = [...(document.getElementById("r-photo").files || [])];
    document.getElementById("r-photo").value = "";
    for (const file of files) {
      if (draftReviewPhotos.length >= MAX_REVIEW_PHOTOS) {
        alert(`最多上傳 ${MAX_REVIEW_PHOTOS} 張圖片。`);
        break;
      }
      if (!file.type.startsWith("image/")) continue;
      try {
        const dataUrl = await compressImage(file);
        draftReviewPhotos.push(dataUrl);
      } catch (_) {
        alert("有一張圖片上傳失敗，已略過。");
      }
    }
    renderReviewPhotoGrid();
  });

  document.getElementById("r-photo-clear").addEventListener("click", () => {
    draftReviewPhotos = [];
    renderReviewPhotoGrid();
  });

  document.getElementById("review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mid = document.getElementById("r-member-id").value;
    let m;
    try {
      m = await XinXianStore.getMemberById(mid);
    } catch (err) {
      alert("讀取會員失敗：" + (err.message || err));
      return;
    }
    if (!m) return;
    const text = document.getElementById("r-text").value.trim();
    if (!text) return;
    const now = new Date();
    const at =
      now.getFullYear() +
      "/" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "/" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0");
    const reviews = [
      ...(m.reviews || []),
      { id: XinXianStore.genId(), text, photos: draftReviewPhotos.slice(), at }
    ];
    try {
      await saveMemberWithUpload({ ...m, reviews }, document.querySelector('#review-form [type="submit"]'));
      document.getElementById("r-text").value = "";
      draftReviewPhotos = [];
      renderReviewPhotoGrid();
      const updated = await XinXianStore.getMemberById(mid);
      document.getElementById("review-subtitle").textContent =
        updated.name + "（" + (updated.reviews || []).length + " 則）";
      renderReviewList(updated);
      await render();
    } catch (err) {
      console.error(err);
      alert((err.uploadFailed ? "" : "新增評價失敗：") + (err.message || err));
    }
  });

  document.getElementById("review-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-rm-review]");
    if (!btn) return;
    const mid = document.getElementById("r-member-id").value;
    const rid = btn.dataset.rmReview;
    try {
      const m = await XinXianStore.getMemberById(mid);
      if (!m) return;
      const reviews = (m.reviews || []).filter((r) => r.id !== rid);
      await XinXianStore.upsertMember({ ...m, reviews });
      const updated = await XinXianStore.getMemberById(mid);
      document.getElementById("review-subtitle").textContent =
        updated.name + "（" + (updated.reviews || []).length + " 則）";
      renderReviewList(updated);
      await render();
    } catch (err) {
      console.error(err);
      alert("刪除評價失敗：" + (err.message || err));
    }
  });

  const cloudNote = document.getElementById("admin-cloud-note");
  if (cloudNote) {
    cloudNote.textContent = cloudOn()
      ? "雲端模式：會員與評價寫入 Supabase，所有訪客可見（照片會上傳到 Storage）。右下角標籤顯示雲端連線狀態。"
      : "本機模式：變更只存在此瀏覽器。啟用雲端請見 SUPABASE-SETUP.md。";
  }

  // ---- 舊照片遷移（base64 → Storage URL）----
  const migrateBtn = document.getElementById("btn-migrate");
  const migrateStart = document.getElementById("migrate-start");
  const migrateStop = document.getElementById("migrate-stop");
  const migrateBar = document.getElementById("migrate-bar");
  const migrateLog = document.getElementById("migrate-log");
  const migrateLabel = document.getElementById("migrate-label");
  let migrating = false;
  let migrateCancel = false;

  function mlog(msg) {
    if (!migrateLog) return;
    migrateLog.textContent += msg + "\n";
    migrateLog.scrollTop = migrateLog.scrollHeight;
  }

  if (migrateBtn) {
    if (!cloudOn()) {
      migrateBtn.hidden = true;
    } else {
      migrateBtn.addEventListener("click", () => {
        XinXianUI.openModal("migrate-modal");
      });
    }
  }
  if (migrateStop) {
    migrateStop.addEventListener("click", () => {
      migrateCancel = true;
      migrateStop.disabled = true;
      mlog("要求中止…（做完目前這一筆後停止）");
    });
  }
  if (migrateStart) {
    migrateStart.addEventListener("click", async () => {
      if (migrating || !cloudOn()) return;
      if (!confirm("開始把資料庫裡的 base64 照片搬到 Storage？可隨時中止，也可重複執行。")) return;
      migrating = true;
      migrateCancel = false;
      migrateStart.disabled = true;
      migrateStop.disabled = false;
      migrateLog.textContent = "";
      migrateBar.style.width = "0%";
      try {
        const stats = await XinXianCloud.migratePhotos({
          onLog: mlog,
          isCancelled: () => migrateCancel,
          onProgress: (done, total, label) => {
            migrateBar.style.width = (total ? Math.round((done / total) * 100) : 100) + "%";
            migrateLabel.textContent = done + " / " + total + "　" + (label || "");
          }
        });
        if (stats.errors.length) {
          mlog("\n有 " + stats.errors.length + " 筆失敗，請確認網路／Storage 權限後再按一次「開始遷移」（已完成的不會重做）。");
        }
      } catch (err) {
        console.error(err);
        mlog("✗ 遷移中斷：" + XinXianStore.describeError(err));
      } finally {
        migrating = false;
        migrateStart.disabled = false;
        migrateStop.disabled = true;
        render();
      }
    });
  }

  render();
});
