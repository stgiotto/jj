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

  const client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

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

  function rowToMember(row, reviews) {
    const photos = asArray(row.photos);
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
      reviews: reviews || []
    };
  }

  function memberToRow(m) {
    const photos = asArray(m.photos);
    if (!photos.length && m.photo) photos.push(m.photo);
    return {
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
      views: m.views ?? 0,
      photos,
      photo: m.photo || photos[0] || ""
    };
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
    return {
      id: r.id,
      member_id: memberId,
      body: r.text || r.body || "",
      images: asArray(r.photos || r.images),
      at: r.at || ""
    };
  }

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

  async function getMembers() {
    const { data, error } = await client.from("members").select("*").order("created_at", {
      ascending: false
    });
    if (error) throw error;
    const rows = data || [];
    const reviewMap = await fetchReviewsByMemberIds(rows.map((r) => r.id));
    return rows.map((row) => rowToMember(row, reviewMap[row.id] || []));
  }

  async function getActiveMembers() {
    const all = await getMembers();
    return all.filter((m) => m.active !== false);
  }

  async function getMemberById(id) {
    const { data, error } = await client.from("members").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const reviewMap = await fetchReviewsByMemberIds([id]);
    return rowToMember(data, reviewMap[id] || []);
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

  async function upsertMember(member) {
    const row = memberToRow(member);
    const { error } = await client.from("members").upsert(row, { onConflict: "id" });
    if (error) throw error;
    if (Object.prototype.hasOwnProperty.call(member, "reviews")) {
      await syncReviewsForMember(member.id, member.reviews);
    }
    return getMembers();
  }

  async function saveMembers(list) {
    const rows = (list || []).map(memberToRow);
    if (!rows.length) {
      const { data: all, error: readErr } = await client.from("members").select("id");
      if (readErr) throw readErr;
      const ids = (all || []).map((r) => r.id);
      if (ids.length) {
        const { error } = await client.from("members").delete().in("id", ids);
        if (error) throw error;
      }
      return [];
    }
    const { error } = await client.from("members").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    for (const m of list) {
      if (Object.prototype.hasOwnProperty.call(m, "reviews")) {
        await syncReviewsForMember(m.id, m.reviews);
      }
    }
    return getMembers();
  }

  async function deleteMember(id) {
    const { error } = await client.from("members").delete().eq("id", id);
    if (error) throw error;
    return getMembers();
  }

  async function toggleMemberActive(id) {
    const m = await getMemberById(id);
    if (!m) return getMembers();
    const { error } = await client
      .from("members")
      .update({ active: !m.active })
      .eq("id", id);
    if (error) throw error;
    return getMembers();
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
    return getMembers();
  }

  /** 可選：將 data URL 上傳到 Storage bucket「photos」，回傳公開 URL */
  async function uploadDataUrl(dataUrl, pathPrefix) {
    if (!dataUrl || typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) {
      return dataUrl;
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return dataUrl;
    const mime = match[1] || "image/jpeg";
    const b64 = match[2];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.indexOf("png") >= 0 ? "png" : mime.indexOf("webp") >= 0 ? "webp" : "jpg";
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
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from("photos").getPublicUrl(path);
    return data.publicUrl;
  }

  function isEnabled() {
    return true;
  }

  global.XinXianCloud = {
    isEnabled,
    client,
    getMembers,
    getActiveMembers,
    getMemberById,
    upsertMember,
    saveMembers,
    deleteMember,
    toggleMemberActive,
    resetMembers,
    uploadDataUrl
  };
})(window);
