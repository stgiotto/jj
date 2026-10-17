/**
 * 江江約會 — Supabase 雲端資料層
 * 需先載入 @supabase/supabase-js CDN 與 js/config.js。
 * 若設定缺失／未啟用，匯出 null（XinXianCloud = null）。
 */
(function (global) {
  const cfg = global.XINXIAN_CLOUD || {};
  const enabled =
    !!cfg.enabled &&
    typeof cfg.supabaseUrl === "string" &&
    cfg.supabaseUrl.indexOf("http") === 0 &&
    typeof cfg.supabaseAnonKey === "string" &&
    cfg.supabaseAnonKey.length > 20;

  if (!enabled) {
    global.XinXianCloud = null;
    return;
  }

  if (!global.supabase || typeof global.supabase.createClient !== "function") {
    console.error("[XinXianCloud] 請先載入 @supabase/supabase-js CDN");
    global.XinXianCloud = null;
    return;
  }

  /** 一般 API 請求逾時（毫秒）；Storage 上傳給較長時間 */
  const API_TIMEOUT_MS = 30000;
  const STORAGE_TIMEOUT_MS = 90000;

  /** 加上逾時的 fetch：避免網路／DNS 異常時畫面永遠卡在「載入中」 */
  function timeoutFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const ms = url.indexOf("/storage/v1/") >= 0 ? STORAGE_TIMEOUT_MS : API_TIMEOUT_MS;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, ms);
    const outer = init && init.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort();
      else outer.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    return fetch(input, Object.assign({}, init, { signal: ctrl.signal }))
      .catch((err) => {
        if (timedOut) {
          const e = new Error("連線逾時（超過 " + Math.round(ms / 1000) + " 秒沒有回應）");
          e.name = "TimeoutError";
          throw e;
        }
        throw err;
      })
      .finally(() => clearTimeout(timer));
  }

  const client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    global: { fetch: timeoutFetch }
  });

  /** 列表用欄位：刻意不含 photos / photo（可能是巨大的 base64） */
  const LIST_COLS =
    "id,name,age,city,gender,bio,interests,active,avatar_hue,created_days_ago,heat,views,created_at";

  function isDataUrl(v) {
    return typeof v === "string" && v.slice(0, 5).toLowerCase() === "data:";
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    if (typeof v === "string") {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  /**
   * light=true：列表用的輕量會員（photos 只含封面 URL、reviews 不含圖片），
   * 帶 _light 旗標；輕量物件寫回雲端時不會動到 photos／reviews（見 memberToRow / upsertMember）。
   */
  function rowToMember(row, reviews, light) {
    const photos = light ? (row.photo ? [row.photo] : []) : asArray(row.photos);
    const photo = row.photo || photos[0] || "";
    return {
      id: row.id,
      name: row.name,
      age: row.age,
      city: row.city,
      gender: row.gender,
      bio: row.bio,
      interests: asArray(row.interests),
      active: row.active !== false,
      avatarHue: row.avatar_hue ?? 210,
      createdDaysAgo: row.created_days_ago ?? 0,
      heat: row.heat ?? 50,
      views: row.views ?? 0,
      photos,
      photo,
      reviews: reviews || [],
      ...(light ? { _light: true } : {})
    };
  }

  function memberToRow(m) {
    const photos = asArray(m.photos).slice();
    if (!photos.length && m.photo) photos.push(m.photo);
    const base = {
      id: m.id,
      name: m.name,
      age: m.age,
      city: m.city || "",
      gender: m.gender || "女",
      bio: m.bio || "",
      interests: asArray(m.interests),
      active: m.active !== false,
      avatar_hue: m.avatarHue ?? 210,
      created_days_ago: m.createdDaysAgo ?? 0,
      heat: m.heat ?? 50,
      views: m.views ?? 0
    };
    // 輕量物件（_light）不含完整照片，絕不能用它覆寫雲端的 photos / photo
    if (m._light) return base;
    if (photos.some(isDataUrl) || isDataUrl(m.photo)) {
      throw new Error("照片尚未上傳到 Storage（拒絕把 base64 寫入資料庫）");
    }
    base.photos = photos;
    base.photo = m.photo || photos[0] || "";
    return base;
  }

  function rowToReview(row) {
    return {
      id: row.id,
      text: row.body || "",
      photos: asArray(row.images),
      at: row.at || ""
    };
  }

  function reviewToRow(r, memberId) {
    const imgs = asArray(r.photos || r.images);
    if (imgs.some(isDataUrl)) {
      throw new Error("評價圖片尚未上傳到 Storage（拒絕把 base64 寫入資料庫）");
    }
    return {
      id: r.id,
      member_id: memberId,
      body: r.text || r.body || "",
      images: imgs,
      at: r.at || ""
    };
  }

  /** 完整評價（含圖片）— 只在單一會員詳情／編輯時使用 */
  async function fetchReviewsByMemberIds(ids) {
    if (!ids.length) return {};
    const { data, error } = await client
      .from("reviews")
      .select("*")
      .in("member_id", ids)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.member_id]) map[row.member_id] = [];
      map[row.member_id].push(rowToReview(row));
    });
    return map;
  }

  /** 輕量評價（不含 images 欄位）— 列表用，只拿文字與數量 */
  async function fetchLightReviews() {
    const { data, error } = await client
      .from("reviews")
      .select("id,member_id,body,at,created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.member_id]) map[row.member_id] = [];
      map[row.member_id].push({
        id: row.id,
        text: row.body || "",
        photos: [],
        at: row.at || ""
      });
    });
    return map;
  }

  /**
   * 列表（輕量）：不含 photos 欄位；封面只取「不是 data: 開頭」的 photo。
   * 尚未遷移（仍是 base64）的會員在列表沒有封面，開啟詳情／編輯時才會單獨讀取完整資料。
   */
  async function getMembers(opts) {
    const onlyActive = !!(opts && opts.onlyActive);
    let q = client.from("members").select(LIST_COLS).order("created_at", { ascending: false });
    if (onlyActive) q = q.eq("active", true);
    const coverQ = client
      .from("members")
      .select("id,photo")
      .not("photo", "like", "data:%")
      .neq("photo", "");
    const [membersRes, coverRes, reviewMap] = await Promise.all([q, coverQ, fetchLightReviews()]);
    if (membersRes.error) throw membersRes.error;
    if (coverRes.error) throw coverRes.error;
    const covers = {};
    (coverRes.data || []).forEach((r) => {
      covers[r.id] = r.photo;
    });
    return (membersRes.data || []).map((row) =>
      rowToMember(Object.assign({}, row, { photo: covers[row.id] || "" }), reviewMap[row.id] || [], true)
    );
  }

  async function getActiveMembers() {
    return getMembers({ onlyActive: true });
  }

  /** 單一會員（完整：含全部照片與評價圖片） */
  async function getMemberById(id) {
    const { data, error } = await client.from("members").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const reviewMap = await fetchReviewsByMemberIds([id]);
    return rowToMember(data, reviewMap[id] || [], false);
  }

  /** 連線檢查：只讀一個極小的結果 */
  async function ping() {
    const { error } = await client.from("members").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return true;
  }

  async function syncReviewsForMember(memberId, reviews) {
    const list = Array.isArray(reviews) ? reviews : [];
    const { data: existing, error: readErr } = await client
      .from("reviews")
      .select("id")
      .eq("member_id", memberId);
    if (readErr) throw readErr;
    const keep = new Set(list.map((r) => r.id).filter(Boolean));
    const toDelete = (existing || []).map((r) => r.id).filter((rid) => !keep.has(rid));
    if (toDelete.length) {
      const { error } = await client.from("reviews").delete().in("id", toDelete);
      if (error) throw error;
    }
    if (list.length) {
      const rows = list.map((r) => reviewToRow(r, memberId));
      const { error } = await client.from("reviews").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
  }

  /**
   * 把會員（照片、評價圖片）中的 data URL 全部上傳到 Storage，回傳「已換成公開 URL」的新物件。
   * 任何一張上傳失敗就丟出錯誤（error.code = "UPLOAD_FAILED"），呼叫端不可再儲存。
   * onProgress(done, total) 可選。輕量物件原樣返回。
   */
  async function ensureMemberUploaded(member, onProgress) {
    if (!member || member._light) return member;
    const photosIn = asArray(member.photos);
    const reviewsIn = Array.isArray(member.reviews) ? member.reviews : null;
    // 相同的 data URL 只會上傳一次；total 以不重複計算
    const uniq = new Set();
    photosIn.concat([member.photo]).forEach((v) => isDataUrl(v) && uniq.add(v));
    (reviewsIn || []).forEach((r) => asArray(r.photos || r.images).forEach((v) => isDataUrl(v) && uniq.add(v)));
    const total = uniq.size;
    if (!total) return member;

    const cache = new Map();
    let done = 0;
    async function conv(src, prefix) {
      if (!isDataUrl(src)) return src;
      if (cache.has(src)) return cache.get(src);
      let url;
      try {
        url = await uploadDataUrl(src, prefix);
      } catch (err) {
        const e = new Error(
          "照片上傳失敗（第 " + (done + 1) + " / " + total + " 張）：" + ((err && err.message) || err)
        );
        e.code = "UPLOAD_FAILED";
        e.cause = err;
        throw e;
      }
      cache.set(src, url);
      done++;
      if (onProgress) onProgress(done, total);
      return url;
    }

    const out = Object.assign({}, member);
    const photos = [];
    for (const src of photosIn) photos.push(await conv(src, "members/" + member.id));
    out.photos = photos;
    out.photo = member.photo ? await conv(member.photo, "members/" + member.id) : photos[0] || "";
    if (reviewsIn) {
      const rs = [];
      for (const r of reviewsIn) {
        const imgs = [];
        for (const src of asArray(r.photos || r.images)) imgs.push(await conv(src, "reviews/" + member.id));
        rs.push(Object.assign({}, r, { photos: imgs }));
      }
      out.reviews = rs;
    }
    return out;
  }

  async function upsertMember(member) {
    // 先上傳 data URL（失敗會丟錯，此時資料庫完全不會被改動）
    const m = await ensureMemberUploaded(member);
    const row = memberToRow(m);
    const { error } = await client.from("members").upsert(row, { onConflict: "id" });
    if (error) throw error;
    // 輕量物件的 reviews 只是列表摘要，不可回寫
    if (!m._light && Object.prototype.hasOwnProperty.call(m, "reviews")) {
      await syncReviewsForMember(m.id, m.reviews);
    }
    return true;
  }

  async function saveMembers(list) {
    const src = list || [];
    if (!src.length) {
      const { data: all, error: readErr } = await client.from("members").select("id");
      if (readErr) throw readErr;
      const ids = (all || []).map((r) => r.id);
      if (ids.length) {
        const { error } = await client.from("members").delete().in("id", ids);
        if (error) throw error;
      }
      return [];
    }
    const prepared = [];
    for (const m of src) prepared.push(await ensureMemberUploaded(m));
    // 完整與輕量物件欄位不同，分開 upsert（同一批次的欄位必須一致）
    const full = prepared.filter((m) => !m._light);
    const light = prepared.filter((m) => m._light);
    if (full.length) {
      const { error } = await client.from("members").upsert(full.map(memberToRow), { onConflict: "id" });
      if (error) throw error;
    }
    if (light.length) {
      const { error } = await client.from("members").upsert(light.map(memberToRow), { onConflict: "id" });
      if (error) throw error;
    }
    for (const m of full) {
      if (Object.prototype.hasOwnProperty.call(m, "reviews")) {
        await syncReviewsForMember(m.id, m.reviews);
      }
    }
    return true;
  }

  async function deleteMember(id) {
    const { error } = await client.from("members").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function toggleMemberActive(id) {
    // 只讀 active 一欄，不再讀整列（含 base64 照片）
    const { data: cur, error: readErr } = await client
      .from("members")
      .select("active")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!cur) return true;
    const { data, error } = await client
      .from("members")
      .update({ active: !(cur.active !== false) })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("更新沒有生效（可能被資料庫權限 RLS 擋下）");
    return true;
  }

  /** 瀏覽次數 +1：只更新 views 一欄，不碰照片 */
  async function incrementViews(id) {
    const { data: cur, error: readErr } = await client
      .from("members")
      .select("views")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!cur) return null;
    const next = (cur.views || 0) + 1;
    const { error } = await client.from("members").update({ views: next }).eq("id", id);
    if (error) throw error;
    return next;
  }

  async function resetMembers(defaults) {
    const { data: all, error: readErr } = await client.from("members").select("id");
    if (readErr) throw readErr;
    const ids = (all || []).map((r) => r.id);
    if (ids.length) {
      const { error } = await client.from("members").delete().in("id", ids);
      if (error) throw error;
    }
    if (defaults && defaults.length) {
      await saveMembers(defaults);
    }
    return true;
  }

  /** 將 data URL 上傳到 Storage bucket「photos」，回傳公開 URL；失敗一律丟錯（不再回傳原 base64） */
  async function uploadDataUrl(dataUrl, pathPrefix) {
    if (!isDataUrl(dataUrl)) return dataUrl;
    const comma = dataUrl.indexOf(",");
    const header = comma > 0 ? dataUrl.slice(5, comma) : "";
    const parts = header.split(";");
    const mime = parts[0] || "image/jpeg";
    if (comma < 0 || parts.indexOf("base64") < 0) {
      throw new Error("不支援的圖片格式（不是 base64 data URL）");
    }
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.indexOf("png") >= 0 ? "png" : mime.indexOf("webp") >= 0 ? "webp" : mime.indexOf("gif") >= 0 ? "gif" : "jpg";
    const path =
      (pathPrefix || "uploads") +
      "/" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8) +
      "." +
      ext;
    const { error } = await client.storage.from("photos").upload(path, bytes, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from("photos").getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error("取不到公開網址");
    return data.publicUrl;
  }

  /** 還有幾位會員的封面 photo 仍是 base64（便宜的 count 查詢，不傳資料） */
  async function countLegacyMembers() {
    const { count, error } = await client
      .from("members")
      .select("id", { head: true, count: "exact" })
      .like("photo", "data:%");
    if (error) throw error;
    return count || 0;
  }

  /**
   * 遷移：把資料庫裡既有的 base64 照片（members.photos / members.photo / reviews.images）
   * 逐筆上傳到 Storage「photos」，並把該列改寫成公開 URL。
   * - 冪等：已經是 URL 的不會動；可重複執行、中斷後可續跑。
   * - 一次只處理一列，不會一次拉整張表，所以不會逾時。
   * - 單張失敗不影響其他：該張維持原狀、記入 errors，其餘照常更新。
   * opts: { onLog(msg), onProgress(done,total,label), isCancelled() }
   */
  async function migratePhotos(opts) {
    const o = opts || {};
    const log = o.onLog || function () {};
    const progress = o.onProgress || function () {};
    const cancelled = o.isCancelled || function () { return false; };
    const stats = {
      membersScanned: 0,
      membersMigrated: 0,
      reviewsScanned: 0,
      reviewsMigrated: 0,
      photosUploaded: 0,
      errors: [],
      cancelled: false
    };
    const fail = (where, err) => {
      const msg = where + "：" + ((err && err.message) || err);
      stats.errors.push(msg);
      log("✗ " + msg);
    };

    async function convertList(list, prefix, cache) {
      let changed = false;
      let failed = false;
      const out = [];
      for (const src of list) {
        if (!isDataUrl(src)) {
          out.push(src);
          continue;
        }
        if (cache.has(src)) {
          out.push(cache.get(src));
          changed = true;
          continue;
        }
        try {
          const url = await uploadDataUrl(src, prefix);
          cache.set(src, url);
          stats.photosUploaded++;
          out.push(url);
          changed = true;
        } catch (err) {
          failed = true;
          out.push(src);
          log("  ✗ 上傳失敗：" + ((err && err.message) || err));
        }
      }
      return { out, changed, failed };
    }

    log("開始掃描會員…");
    const { data: mlist, error: mErr } = await client
      .from("members")
      .select("id,name")
      .order("created_at", { ascending: true });
    if (mErr) throw mErr;
    const { data: rlist, error: rErr } = await client
      .from("reviews")
      .select("id,member_id")
      .order("created_at", { ascending: true });
    if (rErr) throw rErr;
    const members = mlist || [];
    const reviews = rlist || [];
    const total = members.length + reviews.length;
    let done = 0;
    log("共 " + members.length + " 位會員、" + reviews.length + " 則評價，逐筆檢查。");

    for (const m of members) {
      if (cancelled()) {
        stats.cancelled = true;
        break;
      }
      stats.membersScanned++;
      progress(done, total, "會員 " + (m.name || m.id));
      try {
        const { data: row, error } = await client
          .from("members")
          .select("id,photos,photo")
          .eq("id", m.id)
          .maybeSingle();
        if (error) throw error;
        if (row) {
          const photos = asArray(row.photos).filter((v) => typeof v === "string");
          const hasLegacy = photos.some(isDataUrl) || isDataUrl(row.photo);
          if (hasLegacy) {
            log("會員「" + (m.name || m.id) + "」：上傳照片…");
            const cache = new Map();
            const a = await convertList(photos, "members/" + m.id, cache);
            let photo = row.photo || "";
            const b = await convertList([photo], "members/" + m.id, cache);
            photo = b.out[0];
            if (!photo || isDataUrl(photo)) photo = (a.out.find((v) => !isDataUrl(v))) || photo;
            if (a.changed || b.changed) {
              const { data: upd, error: uErr } = await client
                .from("members")
                .update({ photos: a.out, photo: photo || "" })
                .eq("id", m.id)
                .select("id");
              if (uErr) throw uErr;
              if (!upd || !upd.length) throw new Error("更新沒有生效（可能被 RLS 擋下）");
              stats.membersMigrated++;
              log("✓ 會員「" + (m.name || m.id) + "」已改為 URL" + (a.failed || b.failed ? "（部分照片失敗）" : ""));
            }
            if (a.failed || b.failed) fail("會員「" + (m.name || m.id) + "」有照片上傳失敗", new Error("請稍後重跑"));
          }
        }
      } catch (err) {
        fail("會員「" + (m.name || m.id) + "」", err);
      }
      done++;
    }

    for (const r of reviews) {
      if (stats.cancelled || cancelled()) {
        stats.cancelled = true;
        break;
      }
      stats.reviewsScanned++;
      progress(done, total, "評價 " + r.id);
      try {
        const { data: row, error } = await client
          .from("reviews")
          .select("id,images")
          .eq("id", r.id)
          .maybeSingle();
        if (error) throw error;
        if (row) {
          const imgs = asArray(row.images).filter((v) => typeof v === "string");
          if (imgs.some(isDataUrl)) {
            log("評價 " + r.id + "：上傳圖片…");
            const c = await convertList(imgs, "reviews/" + r.member_id, new Map());
            if (c.changed) {
              const { data: upd, error: uErr } = await client
                .from("reviews")
                .update({ images: c.out })
                .eq("id", r.id)
                .select("id");
              if (uErr) throw uErr;
              if (!upd || !upd.length) throw new Error("更新沒有生效（可能被 RLS 擋下）");
              stats.reviewsMigrated++;
              log("✓ 評價 " + r.id + " 已改為 URL" + (c.failed ? "（部分圖片失敗）" : ""));
            }
            if (c.failed) fail("評價 " + r.id + " 有圖片上傳失敗", new Error("請稍後重跑"));
          }
        }
      } catch (err) {
        fail("評價 " + r.id, err);
      }
      done++;
    }
    progress(done, total, "完成");
    log(
      (stats.cancelled ? "已中止。" : "完成。") +
        " 會員改寫 " + stats.membersMigrated + "、評價改寫 " + stats.reviewsMigrated +
        "、上傳照片 " + stats.photosUploaded + " 張、錯誤 " + stats.errors.length + " 筆。"
    );
    return stats;
  }

  function isEnabled() {
    return true;
  }

  global.XinXianCloud = {
    isEnabled,
    client,
    ping,
    getMembers,
    getActiveMembers,
    getMemberById,
    upsertMember,
    saveMembers,
    deleteMember,
    toggleMemberActive,
    incrementViews,
    resetMembers,
    uploadDataUrl,
    ensureMemberUploaded,
    countLegacyMembers,
    migratePhotos
  };
})(window);
