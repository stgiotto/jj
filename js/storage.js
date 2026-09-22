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

  async function getMembers() {
    const c = cloud();
    if (c) {
      try {
        return await c.getMembers();
      } catch (err) {
        console.error("[XinXianStore] 雲端讀取會員失敗，改用本機", err);
        return getMembersLocal();
      }
    }
    return getMembersLocal();
  }

  async function saveMembers(list) {
    const c = cloud();
    if (c) {
      await c.saveMembers(list);
      return;
    }
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
  }

  async function getActiveMembers() {
    const list = await getMembers();
    return list.filter((m) => m.active !== false);
  }

  async function getMemberById(id) {
    const c = cloud();
    if (c) {
      try {
        return await c.getMemberById(id);
      } catch (err) {
        console.error("[XinXianStore] 雲端讀取會員失敗", err);
      }
    }
    const list = await getMembersLocal();
    return list.find((m) => m.id === id) || null;
  }

  async function upsertMember(member) {
    const c = cloud();
    if (c) {
      return await c.upsertMember(member);
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
      return await c.deleteMember(id);
    }
    const list = (await getMembersLocal()).filter((m) => m.id !== id);
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
    return list;
  }

  async function toggleMemberActive(id) {
    const c = cloud();
    if (c) {
      return await c.toggleMemberActive(id);
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
      return await c.resetMembers(defaults);
    }
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(defaults));
    return defaults;
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
