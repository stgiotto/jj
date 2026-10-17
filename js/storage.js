/**
 * 江江約會 — 資料層
 * 會員／評價：雲端啟用時走 Supabase（XinXianCloud），否則 localStorage。
 * 喜歡／略過／配對／年齡門：一律本機（每位訪客各自）。
 * 會員相關 API 皆為 async（請 await）。
 */
(function (global) {
  const MEMBERS_KEY = "xinxian_members_v1";
  const MATCHES_KEY = "xinxian_matches_v1";
  const LIKES_KEY = "xinxian_likes_v1";
  const PASSES_KEY = "xinxian_passes_v1";

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function cloud() {
    return global.XinXianCloud && global.XinXianCloud.isEnabled && global.XinXianCloud.isEnabled()
      ? global.XinXianCloud
      : null;
  }

  // ---------------------------------------------------------------------
  // 雲端連線狀態 + 錯誤說明
  // ---------------------------------------------------------------------
  const status = {
    state: cloud() ? "pending" : "local", // local | pending | ok | error
    message: "",
    at: 0
  };

  function setStatus(state, message) {
    status.state = state;
    status.message = message || "";
    status.at = Date.now();
    try {
      global.dispatchEvent(new CustomEvent("xinxian-cloud-status", { detail: Object.assign({}, status) }));
    } catch (_) {}
  }

  /** 把 Supabase／fetch 的各種錯誤轉成人看得懂的原因 */
  function describeError(err) {
    if (!err) return "未知錯誤";
    const raw = typeof err === "string" ? err : err.message || String(err);
    const code = err.code ? String(err.code) : "";
    const httpStatus = err.status || err.statusCode || "";
    let reason = raw;
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
      reason = "無法連線到 Supabase（網路中斷、DNS 或連線被阻擋）";
    } else if (/timeout|逾時|abort/i.test(raw) || code === "57014") {
      reason = code === "57014"
        ? "資料庫查詢逾時（資料太大？請到管理頁執行「遷移舊照片」）"
        : "連線逾時（伺服器太久沒有回應）";
    } else if (/row-level security|\brls\b|permission denied/i.test(raw) || code === "42501") {
      reason = "沒有權限（資料庫 RLS 政策擋下）：" + raw;
    } else if (/jwt|apikey|invalid api key/i.test(raw) || code === "PGRST301") {
      reason = "API 金鑰無效或過期：" + raw;
    } else if (/relation .* does not exist|PGRST205|schema cache/i.test(raw) || code === "42P01") {
      reason = "資料表不存在，請先在 Supabase 執行 supabase/schema.sql：" + raw;
    } else if (/bucket not found/i.test(raw)) {
      reason = "Storage bucket「photos」不存在，請先執行 supabase/schema.sql：" + raw;
    }
    const extra = [];
    if (code && reason.indexOf(code) < 0) extra.push("code " + code);
    if (httpStatus && reason.indexOf(String(httpStatus)) < 0) extra.push("HTTP " + httpStatus);
    if (err.hint) extra.push("提示：" + err.hint);
    return extra.length ? reason + "（" + extra.join("，") + "）" : reason;
  }

  /** 執行雲端呼叫：更新連線狀態；失敗時丟出訊息可讀的 Error（保留 cause） */
  async function cloudCall(fn) {
    try {
      const r = await fn();
      setStatus("ok", "");
      return r;
    } catch (err) {
      const msg = describeError(err);
      console.error("[XinXianStore] 雲端操作失敗：", err);
      setStatus("error", msg);
      const e = new Error(msg);
      e.cause = err;
      e.code = err && err.code;
      e.isCloudError = true;
      throw e;
    }
  }

  function getCloudStatus() {
    return Object.assign({}, status);
  }

  /** 重新檢查雲端連線（會更新狀態）；本機模式直接回傳 true */
  async function pingCloud() {
    const c = cloud();
    if (!c) return true;
    setStatus("pending", "");
    return cloudCall(() => c.ping());
  }

  function mergeDemoMetrics(list) {
    const defaults = global.XINXIAN_DEFAULT_MEMBERS || [];
    const byId = Object.fromEntries(defaults.map((d) => [d.id, d]));
    return list.map((m) => {
      const d = byId[m.id];
      if (!d) return m;
      let photos;
      if (Array.isArray(m.photos)) photos = m.photos;
      else if (m.photo) photos = [m.photo];
      else photos = d.photos || [];
      return {
        ...m,
        createdDaysAgo: m.createdDaysAgo ?? d.createdDaysAgo,
        heat: m.heat ?? d.heat,
        views: m.views ?? d.views,
        photos,
        photo: photos[0] || "",
        reviews: Array.isArray(m.reviews) ? m.reviews : []
      };
    });
  }

  async function getMembersLocal() {
    try {
      const raw = localStorage.getItem(MEMBERS_KEY);
      if (!raw) {
        const defaults = deepClone(global.XINXIAN_DEFAULT_MEMBERS);
        localStorage.setItem(MEMBERS_KEY, JSON.stringify(defaults));
        return defaults;
      }
      return mergeDemoMetrics(JSON.parse(raw));
    } catch (e) {
      return deepClone(global.XINXIAN_DEFAULT_MEMBERS);
    }
  }

  /**
   * 會員列表。雲端模式：回傳輕量資料（封面 + 摘要）；讀取失敗會「丟出錯誤」，
   * 不會再偷偷退回本機示範資料。
   */
  async function getMembers() {
    const c = cloud();
    if (c) return cloudCall(() => c.getMembers());
    return getMembersLocal();
  }

  async function saveMembers(list) {
    const c = cloud();
    if (c) {
      await cloudCall(() => c.saveMembers(list));
      return;
    }
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
  }

  async function getActiveMembers() {
    const c = cloud();
    if (c) return cloudCall(() => c.getActiveMembers());
    const list = await getMembersLocal();
    return list.filter((m) => m.active !== false);
  }

  async function getMemberById(id) {
    const c = cloud();
    if (c) return cloudCall(() => c.getMemberById(id));
    const list = await getMembersLocal();
    return list.find((m) => m.id === id) || null;
  }

  async function upsertMember(member) {
    const c = cloud();
    if (c) {
      await cloudCall(() => c.upsertMember(member));
      return true;
    }
    const list = await getMembersLocal();
    const idx = list.findIndex((m) => m.id === member.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...member };
    } else {
      list.push(member);
    }
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
    return list;
  }

  async function deleteMember(id) {
    const c = cloud();
    if (c) {
      await cloudCall(() => c.deleteMember(id));
      return true;
    }
    const list = (await getMembersLocal()).filter((m) => m.id !== id);
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
    return list;
  }

  async function toggleMemberActive(id) {
    const c = cloud();
    if (c) {
      await cloudCall(() => c.toggleMemberActive(id));
      return true;
    }
    const list = await getMembersLocal();
    const m = list.find((x) => x.id === id);
    if (m) {
      m.active = !m.active;
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
    }
    return list;
  }

  async function resetMembers() {
    const defaults = deepClone(global.XINXIAN_DEFAULT_MEMBERS);
    const c = cloud();
    if (c) {
      await cloudCall(() => c.resetMembers(defaults));
      return true;
    }
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(defaults));
    return defaults;
  }

  /** 瀏覽次數 +1；雲端只更新 views 欄位（不會碰照片／評價）。回傳新的次數 */
  async function bumpViews(id) {
    const c = cloud();
    if (c) return cloudCall(() => c.incrementViews(id));
    const list = await getMembersLocal();
    const m = list.find((x) => x.id === id);
    if (!m) return null;
    m.views = (m.views || 0) + 1;
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
    return m.views;
  }

  /**
   * 儲存前把 data URL 照片上傳到 Storage（雲端模式）。本機模式原樣返回。
   * 失敗會丟出 code = "UPLOAD_FAILED" 的錯誤，呼叫端不可再儲存。
   */
  async function prepareMemberForSave(member, onProgress) {
    const c = cloud();
    if (!c) return member;
    return cloudCall(() => c.ensureMemberUploaded(member, onProgress));
  }

  function getLikes() {
    try {
      return JSON.parse(localStorage.getItem(LIKES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function getPasses() {
    try {
      return JSON.parse(localStorage.getItem(PASSES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function getMatches() {
    try {
      return JSON.parse(localStorage.getItem(MATCHES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function likeMember(id) {
    const likes = getLikes();
    if (!likes.includes(id)) {
      likes.push(id);
      localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
    }
    const mutualIds = ["m001", "m003", "m005", "m007", "m008", "m011"];
    const isMatch = mutualIds.includes(id) || Math.random() < 0.35;
    if (isMatch) {
      const matches = getMatches();
      if (!matches.find((x) => x.id === id)) {
        matches.push({ id, at: Date.now() });
        localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
      }
      return true;
    }
    return false;
  }

  function passMember(id) {
    const passes = getPasses();
    if (!passes.includes(id)) {
      passes.push(id);
      localStorage.setItem(PASSES_KEY, JSON.stringify(passes));
    }
  }

  async function getSwipeQueue() {
    const likes = new Set(getLikes());
    const passes = new Set(getPasses());
    const active = await getActiveMembers();
    return active.filter((m) => !likes.has(m.id) && !passes.has(m.id));
  }

  function resetMatchState() {
    localStorage.removeItem(LIKES_KEY);
    localStorage.removeItem(PASSES_KEY);
    localStorage.removeItem(MATCHES_KEY);
  }

  function genId() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isCloudEnabled() {
    return !!cloud();
  }

  global.XinXianStore = {
    getMembers,
    saveMembers,
    getActiveMembers,
    getMemberById,
    upsertMember,
    deleteMember,
    toggleMemberActive,
    resetMembers,
    bumpViews,
    prepareMemberForSave,
    getCloudStatus,
    pingCloud,
    describeError,
    getLikes,
    getPasses,
    getMatches,
    likeMember,
    passMember,
    getSwipeQueue,
    resetMatchState,
    genId,
    isCloudEnabled
  };
})(window);
