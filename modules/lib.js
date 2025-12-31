// src/lib.js

export const OWNER_UUID = "7fea3331-7c36-49ac-975b-58de25ecf6ba";
export const INFINITE_UUID = OWNER_UUID;
export const TALATHYST_UUID = "be1f4c73-d031-4306-a9b4-b6d14b51556f";
export const TALATHYST_CONVERSATION_WINDOW_MS = 30000;
export const INFINITE_POINTS = 999999999999;
export const JSON_HEADERS = { "Content-Type": "application/json" };
export const MESSAGE_POINTS = { twitch: 15, youtube: 15, nexus: 25 };
export const CLIP_DEFAULT_DURATION_SECONDS = 30;
export const CLIP_MAX_DURATION_SECONDS = 60;

export const STORE_ITEMS = []; 

export const REDEEM_GROUPS = [
  {
    label: "Featured",
    redeems: [
      { id: "nexus_tts", name: "Nexus TTS", description: "Have Tala read a message.", cost: 100, requiresInput: true, platformDisplay: "Nexus" },
      { id: "spooky_sound", name: "Spooky Sound", description: "Play a spooky sound.", cost: 50, platformDisplay: "Nexus", soundKey: "sounds/spooky_1.mp3" }
    ]
  }
];

export const newId = () => crypto.randomUUID().replace(/-/g, "");

export function getCors(origin) {
  const allowed = ["https://nexus.wolfethyst.tv", "https://data.wolfethyst.tv"];
  const isAllowed = !origin || origin === "null" || origin.endsWith("wolfethyst.tv") || origin.includes("localhost") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://nexus.wolfethyst.tv",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, Upgrade, Connection, X-Twitch-Bot-Secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE"
  };
}

export function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { ...JSON_HEADERS, ...cors } });
}

export function redirect(to, cors, extra = {}) {
  return new Response("", { status: 302, headers: { Location: to, ...cors, ...extra } });
}

export function getDisplayName(user, fallback = "Adventurer") {
  return user?.display || user?.displayName || user?.name || user?.username || fallback;
}

export function slugifyRedeemKey(name) {
  if (!name) return "";
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "";
}

export function normalizeGameString(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, ""); 
}

export function sanitizeTwitch(t) {
  if (!t) return null;
  return { id: t.id, login: t.login, name: t.name, avatar: t.avatar };
}

export function sanitizeYouTube(y) {
  if (!y) return null;
  return { id: y.id, email: y.email, name: y.name, avatar: y.avatar };
}

// ================= ASSET CACHING =================
export async function cacheAsset(env, externalUrl, prefix = "misc") {
  const url = (externalUrl || "").trim();
  if (!url || url.startsWith("https://data.wolfethyst.tv/assets/")) return url;
  try {
    let ext = "jpg";
    if (url.match(/\.png(\?.*)?$/i)) ext = "png";
    if (url.match(/\.webp(\?.*)?$/i)) ext = "webp";
    if (url.match(/\.gif(\?.*)?$/i)) ext = "gif";
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuf = await crypto.subtle.digest("SHA-1", data);
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    const key = `${prefix}/${hashHex}.${ext}`;
    const existing = await env.ASSETS.get(key, { type: "arrayBuffer" });
    if (existing) return `https://data.wolfethyst.tv/assets/${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return url; 
    const buf = await res.arrayBuffer();
    await env.ASSETS.put(key, buf);
    return `https://data.wolfethyst.tv/assets/${encodeURIComponent(key)}`;
  } catch (err) { return url; }
}

export async function cacheUserAvatar(env, url) { return await cacheAsset(env, url, "avatars"); }
export async function cacheExternalImage(env, url) { return await cacheAsset(env, url, "covers"); }

// ================= SESSION =================
export function getSessionCookie(req) {
  const cookie = req.headers.get("Cookie") || "";
  return cookie.match(/wolfesession=([^;]+)/)?.[1] || null;
}
export function setSessionCookie(sid) {
  return { "Set-Cookie": `wolfesession=${sid}; Max-Age=31536000; Path=/; Domain=.wolfethyst.tv; HttpOnly; Secure; SameSite=None` };
}
export function clearSessionCookie() {
  return { "Set-Cookie": `wolfesession=; Max-Age=0; Path=/; Domain=.wolfethyst.tv; HttpOnly; Secure; SameSite=None` };
}
export async function getSession(env, sid) {
  if (!sid) return null;
  return env.SESSIONS.get(`session:${sid}`, "json");
}
export async function saveSession(env, sid, data) {
  await env.SESSIONS.put(`session:${sid}`, JSON.stringify(data));
}
export async function getSessionFromRequest(env, req) {
  const sid = getSessionCookie(req);
  const session = await getSession(env, sid);
  return { sid, session };
}
export async function ensureSession(env, req) {
  let sid = getSessionCookie(req);
  if (!sid) { sid = newId(); await env.SESSIONS.put(`session:${sid}`, JSON.stringify({ created: Date.now() })); }
  return sid;
}

// ================= D1 DATABASE =================
export async function ensureUserInD1(env, userId, displayName = "Adventurer", avatarUrl = null) {
  if (!userId) return;
  const db = env.DB;
  const now = Date.now();
  await db.prepare(`INSERT INTO users (id, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = COALESCE(excluded.avatar_url, users.avatar_url), updated_at = excluded.updated_at`).bind(userId, displayName, avatarUrl, now, now).run();
  await db.prepare(`INSERT INTO user_points (user_id, balance_total, messages_count, watch_minutes, updated_at) VALUES (?, 0, 0, 0, ?) ON CONFLICT(user_id) DO NOTHING`).bind(userId, now).run();
}
export async function getUserPoints(env, userId) {
  if (!userId) return 0;
  if (userId === INFINITE_UUID) { await ensureUserInD1(env, userId, "Wolfethyst", null); return INFINITE_POINTS; }
  const row = await env.DB.prepare(`SELECT balance_total FROM user_points WHERE user_id = ?`).bind(userId).first();
  return row ? Number(row.balance_total) || 0 : 0;
}
export async function addPoints(env, userId, delta, { reason = null, source = null, isMessage = false, isWatch = false } = {}) {
  if (!userId) return { balanceBefore: 0, balanceAfter: 0 };
  const db = env.DB;
  const now = Date.now();
  const amount = Number(delta) || 0;
  await ensureUserInD1(env, userId);
  let eventType = isMessage ? "message" : isWatch ? "watch" : (reason?.startsWith("mod_") ? "mod" : "adjust");
  if (reason === "redeem") eventType = "redeem";
  if (reason === "bonus") eventType = "bonus";
  if (reason === "store_purchase") eventType = "purchase";
  if (reason === "tip") eventType = "tip";
  if (reason === "subscription") eventType = "subscription";

  if (userId === INFINITE_UUID) {
     const after = INFINITE_POINTS;
     await db.prepare(`UPDATE user_points SET balance_total = ?, updated_at = ? WHERE user_id = ?`).bind(after, now, userId).run();
     if(amount !== 0) await db.prepare(`INSERT INTO point_events (user_id, delta, type, reason, source, created_at, balance_after) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, amount, eventType, reason, source, now, after).run();
     return { balanceBefore: INFINITE_POINTS, balanceAfter: INFINITE_POINTS };
  }
  const row = await db.prepare(`SELECT balance_total, messages_count, watch_minutes FROM user_points WHERE user_id = ?`).bind(userId).first();
  const before = row ? Number(row.balance_total) || 0 : 0;
  const after = Math.max(0, before + amount);
  await db.prepare(`UPDATE user_points SET balance_total = ?, messages_count = messages_count + ?, watch_minutes = watch_minutes + ?, updated_at = ? WHERE user_id = ?`).bind(after, isMessage ? 1 : 0, isWatch ? 1 : 0, now, userId).run();
  if (amount !== 0) await db.prepare(`INSERT INTO point_events (user_id, delta, type, reason, source, created_at, balance_after) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, amount, eventType, reason, source, now, after).run();
  return { balanceBefore: before, balanceAfter: after };
}

export async function awardMessagePoints(env, uuid, platform) {
  if (!uuid) return;
  const amount = MESSAGE_POINTS[platform] || 0;
  if (!amount) return;
  const throttleKey = `points_throttle:${uuid}`;
  const lastAward = await env.SESSIONS.get(throttleKey);
  const now = Date.now();
  if (lastAward && (now - Number(lastAward) < 10000)) { 
      return; 
  }
  await env.SESSIONS.put(throttleKey, now.toString(), { expirationTtl: 60 }); 
  await addPoints(env, uuid, amount, { reason: "message", source: platform, isMessage: true });
}

// ================= STORAGE (SHARDING) =================

export async function getOrCreateNexusMeta(env, uuid, displayFallback = "Adventurer") {
  const key = `nexus:meta:${uuid}`;
  let meta = await env.POINTS.get(key, "json");

  // Migration Check
  if (!meta) {
    const oldStore = await env.POINTS.get("userdata", "json");
    const oldKey = `nexus:${uuid}`;
    if (oldStore && oldStore.users && oldStore.users[oldKey]) {
        meta = oldStore.users[oldKey];
        await env.POINTS.put(key, JSON.stringify(meta));
    }
  }

  if (!meta) {
    meta = { uuid, platform: "nexus", displayName: displayFallback, points: 0, inventory: [], avatarDecoration: null, activeMessageDecoration: null };
  }
  if (!meta.inventory) meta.inventory = [];
  return { meta };
}

export async function saveNexusMeta(env, uuid, meta) {
    await env.POINTS.put(`nexus:meta:${uuid}`, JSON.stringify(meta));
}

export async function getUserdataStore(env) { return (await env.POINTS.get("userdata", "json")) || { users: {} }; }
export async function saveUserdataStore(env, data) { await env.POINTS.put("userdata", JSON.stringify(data)); }

export async function ensureNexusBonuses(env, session) {
  if (!session?.user?.id) return;
  const uuid = session.user.id;
  const display = getDisplayName(session.user, "Adventurer");
  let { meta } = await getOrCreateNexusMeta(env, uuid, display);
  
  let bonusTotal = 0; let changedMeta = false;
  if (!meta.bonusSignInGiven) { meta.bonusSignInGiven = true; bonusTotal += 2000; changedMeta = true; }
  const hasTwitch = !!session.twitch; const hasYoutube = !!session.youtube;
  if (hasTwitch && hasYoutube && !meta.bonusLinkedAccountsGiven) { meta.bonusLinkedAccountsGiven = true; bonusTotal += 2000; changedMeta = true; }
  
  if (changedMeta) { await saveNexusMeta(env, uuid, meta); }
  if (bonusTotal > 0) { await addPoints(env, uuid, bonusTotal, { reason: "bonus", source: "nexus_bonus" }); }
}

export async function purchaseStoreItem(env, userId, itemId) {
    const store = await getStoreItems(env);
    const item = store.items.find(i => i.id === itemId);
    if (!item) return { ok: false, error: "Item not found" };
    const currentPoints = await getUserPoints(env, userId);
    if (currentPoints < item.cost && userId !== INFINITE_UUID) return { ok: false, error: "Not enough crystals" };
    
    const { meta } = await getOrCreateNexusMeta(env, userId);
    if (meta.inventory.includes(itemId)) return { ok: false, error: "You already own this item" };
    
    await addPoints(env, userId, -item.cost, { reason: "store_purchase", source: itemId });
    meta.inventory.push(itemId);
    await saveNexusMeta(env, userId, meta);
    return { ok: true, balance: currentPoints - item.cost, inventory: meta.inventory };
}

export async function equipStoreItem(env, userId, itemId) {
    const { meta } = await getOrCreateNexusMeta(env, userId);
    if (itemId === "unequip_avatar") {
        meta.avatarDecoration = null;
        await saveNexusMeta(env, userId, meta); 
        return { ok: true, equipped: null, type: "avatar_decoration" };
    }
    if (itemId === "unequip_message") {
        meta.activeMessageDecoration = null;
        await saveNexusMeta(env, userId, meta); 
        return { ok: true, equipped: null, type: "message_decoration" };
    }
    
    if (!meta.inventory.includes(itemId)) return { ok: false, error: "You do not own this item" };
    const store = await getStoreItems(env);
    const item = store.items.find(i => i.id === itemId);
    if (!item) return { ok: false, error: "Invalid item definition" };
    
    const type = item.type || "avatar_decoration";
    if (type === "avatar_decoration") meta.avatarDecoration = item.cssClass;
    else if (type === "message_decoration") meta.activeMessageDecoration = item.cssClass;
    
    await saveNexusMeta(env, userId, meta);
    return { ok: true, equipped: item.cssClass, type };
}

export async function getPlayedStore(env) { return (await env.POINTS.get("played", "json")) || { games: [] }; }
export async function savePlayedStore(env, data) { await env.POINTS.put("played", JSON.stringify(data)); }
export async function getRequestsStore(env) { return { requests: [], ...(await env.POINTS.get("requests", "json")) }; }
export async function saveRequestsStore(env, store) { await env.POINTS.put("requests", JSON.stringify(store)); }
export async function getRedeemsStore(env) { return { list: [], ...(await env.POINTS.get("redeems", "json")) }; }
export async function saveRedeemsStore(env, store) { await env.POINTS.put("redeems", JSON.stringify(store)); }
export async function getStoreItems(env) {
    const data = await env.POINTS.get("store_items", "json");
    if (!data || !Array.isArray(data.items)) return { items: [] }; 
    return data;
}
export async function saveStoreItems(env, store) { await env.POINTS.put("store_items", JSON.stringify(store)); }

// Recurring Messages
export async function getRecurringMessages(env) {
    const data = await env.POINTS.get("recurring_messages", "json");
    return data || { messages: [] };
}
export async function saveRecurringMessages(env, store) {
    await env.POINTS.put("recurring_messages", JSON.stringify(store));
}

export async function getNexusUsernameRecord(env, lowerName) { return await env.POINTS.get(`nexus_username:${lowerName}`, "json"); }
export async function setNexusUsernameRecord(env, lowerName, record) { await env.POINTS.put(`nexus_username:${lowerName}`, JSON.stringify(record)); }
export async function deleteNexusUsernameRecord(env, lowerName) { await env.POINTS.delete(`nexus_username:${lowerName}`); }
export function normalizeNexusUsername(name) { return name.trim().toLowerCase(); }

export async function chargePointsForRedeem(env, userId, cost) {
  if(userId === INFINITE_UUID) return { ok: true, pointsAfter: INFINITE_POINTS };
  const costNum = Number(cost);
  const now = Date.now();
  const stmt = env.DB.prepare(`UPDATE user_points SET balance_total = balance_total - ?1, updated_at = ?2 WHERE user_id = ?3 AND balance_total >= ?1 RETURNING balance_total`).bind(costNum, now, userId);
  const result = await stmt.first();
  if (!result) { return { ok: false, message: "Not enough points" }; }
  env.DB.prepare(`INSERT INTO point_events (user_id, delta, type, reason, created_at, balance_after) VALUES (?, ?, 'redeem', 'redeem', ?, ?)`).bind(userId, -costNum, now, result.balance_total).run().catch(() => {});
  return { ok: true, pointsAfter: result.balance_total };
}

export async function getModerationStore(env) {
  let store = await env.POINTS.get("moderation", "json");
  return { mods: [], bans: [], warnings: [], unbanRequests: [], timeouts: {}, ...(store || {}) };
}
export async function saveModerationStore(env, store) { await env.POINTS.put("moderation", JSON.stringify(store)); }
export async function activeBanForUser(env, userId) {
    try {
        const row = await env.DB.prepare(`SELECT is_banned, ban_until, ban_reason, ban_kind FROM user_points WHERE user_id = ?`).bind(userId).first();
        if (row && row.is_banned) {
            const now = Date.now();
            if (row.ban_until && row.ban_until <= now) { return null; }
            return { userId, reason: row.ban_reason, expiresAt: row.ban_until, banKind: row.ban_kind };
        }
    } catch(e) {}
    return null;
}
export async function isUserBanned(env, uuid) { return !!(await activeBanForUser(env, uuid)); }

export async function requireRole(env, request, minRole) {
  const { sid, session } = await getSessionFromRequest(env, request);
  if (!session?.user?.id) return { ok: false, status: 401, error: "Not logged in" };
  const store = await getModerationStore(env);
  const userId = session.user.id;
  const isOwner = userId === OWNER_UUID;
  const isMod = store.mods.includes(userId) || userId === TALATHYST_UUID || isOwner;
  if (minRole === "owner" && !isOwner) return { ok: false, status: 403, error: "Forbidden" };
  if (minRole === "mod" && !isMod) return { ok: false, status: 403, error: "Forbidden" };
  const roles = [];
  if (isOwner) roles.push("owner");
  if (isMod) roles.push("mod");
  return { ok: true, session, roles, sid };
}

export async function checkAutomod(env, userId, text) {
    if (userId === OWNER_UUID) return null; 
    const [brainrotRaw, bannedRaw] = await Promise.all([ env.MODERATION.get("brainrot_words", "text"), env.MODERATION.get("banned_words", "text") ]);
    const parseList = (raw) => { if (!raw) return []; return raw.split(/[\r\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0); };
    const brainrotList = parseList(brainrotRaw);
    const bannedList = parseList(bannedRaw);
    if (brainrotList.length === 0 && bannedList.length === 0) return null;
    const normalizedText = text.toLowerCase();
    const foundBrainrot = brainrotList.find(word => normalizedText.includes(word));
    const foundBanned = bannedList.find(word => normalizedText.includes(word));

    if (foundBrainrot || foundBanned) {
        const durationMinutes = 5; 
        const matchedWord = foundBrainrot || foundBanned;
        const kind = foundBanned ? "automod_ban" : "brainrot"; 
        const reason = `Automod: Used forbidden word (${matchedWord})`;
        const timeoutUntil = Date.now() + durationMinutes * 60 * 1000;
        await env.DB.prepare(`UPDATE user_points SET ban_until = ?1, ban_reason = ?2, is_banned = 1, ban_kind = ?4 WHERE user_id = ?3`).bind(timeoutUntil, reason, userId, kind).run();
        const store = await getModerationStore(env);
        store.bans.push({ id: newId(), userId, reason, banKind: kind, createdAt: Date.now(), expiresAt: timeoutUntil, modId: "AUTO_MOD", modName: "Nexus System", platform: "nexus" });
        await saveModerationStore(env, store);
        return { action: "timeout", userId, durationMinutes, reason, kind: kind };
    }
    return null;
}

export async function broadcastModerationEvent(env, payload) { try { await env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global")).fetch("https://dummy/moderation/event", { method: "POST", body: JSON.stringify(payload) }); } catch {} }
export async function broadcastRedeemEvent(env, payload) { try { await env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global")).fetch("https://dummy/redeem/event", { method: "POST", body: JSON.stringify(payload) }); } catch {} }
export async function broadcastSupportEvent(env, payload) { try { const roomId = env.CHAT_ROOM.idFromName("global"); await env.CHAT_ROOM.get(roomId).fetch("https://dummy/support/event", { method: "POST", body: JSON.stringify(payload) }); } catch (e) { } }

export async function globalUUIDFor(env, key, id, preferredUuid = null) {
  const mapKey = `map:${key}:${id}`;
  const existing = await env.SESSIONS.get(mapKey);
  if (existing) return existing;
  const uuid = preferredUuid || crypto.randomUUID();
  await env.SESSIONS.put(mapKey, uuid);
  await env.SESSIONS.put(`rev:${uuid}`, `${key}:${id}`);
  return uuid;
}

export async function getSteamGridCoverUrl(apiKey, gameId) {
  try {
    const res = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900&types=static`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const json = await res.json();
    if (json.success && json.data?.length > 0) return json.data[0].url;
  } catch (e) {}
  return null;
}

async function getIgdbTwitchToken(env) {
  const cached = await env.POINTS.get("igdb:token", "json");
  if(cached && cached.expiresAt > Date.now() + 60000) return cached.accessToken;
  if(!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
  const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" })});
  if(!res.ok) return null;
  const data = await res.json();
  await env.POINTS.put("igdb:token", JSON.stringify({ accessToken: data.access_token, expiresAt: Date.now() + data.expires_in*1000 }));
  return data.access_token;
}

function extractYearHint(raw) {
  const m = String(raw || "").match(/\((\d{4})\)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeIgdbQuery(raw) {
  let query = (raw || "").trim();
  let yearHint = extractYearHint(query);
  if (yearHint !== null) query = query.replace(/\(\d{4}\)\s*$/, "").trim();
  const plusIdx = query.indexOf("+");
  if (plusIdx !== -1 && query.slice(0, plusIdx).trim().length >= 3) query = query.slice(0, plusIdx).trim();
  return { query, yearHint };
}

function pickBestIgdbGame(results, yearHint) {
  if (!Array.isArray(results) || !results.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < results.length; i++) {
    const g = results[i];
    const cat = Number(g.category);
    const year = g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null;
    let score = 0;
    if (g.cover?.image_id) score += 30;
    if (cat === 0) score += 80;
    else if (cat === 8 || cat === 9) score += 60;
    else if (cat === 4 || cat === 10) score += 20;
    else score -= 40;
    if (yearHint && year) { const diff = Math.abs(year - yearHint); if (diff === 0) score += 40; else score -= diff; }
    score -= i * 0.01;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best || results[0];
}

async function fetchIgdbInfo(env, name) {
  const token = await getIgdbTwitchToken(env);
  if(!token) return null;
  const { query, yearHint } = normalizeIgdbQuery(name);
  if(!query) return null;
  const res = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers: { "Client-ID": env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` }, body: `search "${query.replace(/"/g, '\\"')}"; fields name,slug,cover.image_id,first_release_date,category; limit 20;`});
  if(!res.ok) return null;
  const g = pickBestIgdbGame(await res.json(), yearHint);
  if (!g) return null;
  return { canonicalName: g.name, coverUrl: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : "" };
}

export async function extractItchMeta(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": "Nexus-Bot/1.0" } });
        if (!res.ok) return null;
        const html = await res.text();
        const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (match && match[1]) {
            return match[1]; 
        }
    } catch(e) { console.error("Itch scrape failed", e); }
    return null;
}

export async function enrichGameFromSteamGrid(env, nameOrUrl) {
  const apiKey = env.STEAMGRIDDB_API_KEY;
  let finalName = nameOrUrl;
  let finalCover = "";

  if (nameOrUrl.includes("itch.io")) {
      const scrapedCover = await extractItchMeta(nameOrUrl);
      if (scrapedCover) {
          const parts = nameOrUrl.split("/");
          const slug = parts[parts.length - 1] || parts[parts.length - 2];
          if(slug) {
              finalName = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          }
          finalCover = await cacheExternalImage(env, scrapedCover);
          return { name: finalName, cover: finalCover };
      }
  }

  if (apiKey) {
    try {
      const searchRes = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(finalName)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const searchJson = await searchRes.json();
      if (searchJson.success && searchJson.data.length) {
        finalName = searchJson.data[0].name;
        finalCover = await getSteamGridCoverUrl(apiKey, searchJson.data[0].id);
      }
    } catch (e) {}
  }
  
  if (!finalCover) {
      try { const ig = await fetchIgdbInfo(env, finalName); if(ig) { if(ig.canonicalName) finalName = ig.canonicalName; if(ig.coverUrl) finalCover = ig.coverUrl; } } catch(e) {}
  }
  
  if (finalCover) { finalCover = await cacheExternalImage(env, finalCover); }
  return { name: finalName || nameOrUrl, cover: finalCover || "" };
}

export async function handleCreateClip(request, env, cors) {
  const { session } = await getSessionFromRequest(env, request);
  if (!session?.user?.id) return json({ ok: false, error: "Not authenticated" }, cors, 401);
  
  const body = await request.json().catch(() => ({}));
  const dur = Math.min(60, Math.max(1, Number(body.windowSeconds) || 30));
  
  const streamMeta = await env.POINTS.get("streammeta", "json") || {};
  const currentGame = streamMeta.game || "Just Chatting";

  const res = await fetch(`https://customer-${env.STREAM_CUSTOMER_CODE}.cloudflarestream.com/${env.STREAM_LIVE_INPUT_ID}/manifest/video.m3u8?duration=${dur}s`);
  if (!res.ok) return json({ ok: false, error: "Stream not ready" }, cors, 502);
  
  const videoId = res.headers.get("stream-media-id");
  const start = parseFloat(res.headers.get("preview-start-seconds"));
  if (!videoId || isNaN(start)) return json({ ok: false, error: "Recording info unavailable" }, cors, 502);
  
  const id = `${videoId}-${Math.floor(start)}-${Date.now()}`;
  const clipUrl = `https://customer-${env.STREAM_CUSTOMER_CODE}.cloudflarestream.com/${videoId}/clip.mp4?time=${Math.max(0, Math.floor(start))}s&duration=${dur}s&filename=clip.mp4`;
  
  const title = body.title || `${currentGame} Clip`;

  if (env.CLIPS) {
    await env.CLIPS.put(`clip:${id}`, JSON.stringify({ 
        id, 
        url: clipUrl, 
        videoId, 
        time: `${Math.max(0, Math.floor(start))}s`, 
        duration: `${dur}s`, 
        createdAt: Date.now(), 
        userId: session.user.id, 
        title,
        game: currentGame 
    }));
  }
  return json({ ok: true, id, url: clipUrl }, cors);
}

export async function handleListClips(request, env, cors) {
    if(!env.CLIPS) return json({ ok: false, error: "No storage" }, cors, 500);
    const list = await env.CLIPS.list({ prefix: "clip:", limit: 30 });
    const clips = [];
    for(const key of list.keys) { const m = await env.CLIPS.get(key.name, "json"); if(m) clips.push(m); }
    return json({ ok: true, clips: clips.sort((a,b) => b.createdAt - a.createdAt) }, cors);
}

export async function handleGetClipFile(request, env, cors) {
    const id = new URL(request.url).searchParams.get("id");
    if(!id || !env.CLIPS) return new Response("Error", { status: 500 });
    const meta = await env.CLIPS.get(`clip:${id}`, "json");
    if(!meta) return new Response("Not found", { status: 404 });
    const cached = await env.CLIPS.get(`clipbin:${id}`, "arrayBuffer");
    if(cached) return new Response(cached, { headers: { "Content-Type": "video/mp4", ...cors } });
    const res = await fetch(meta.url);
    if(!res.ok) return Response.redirect(meta.url, 302);
    const buf = await res.arrayBuffer();
    await env.CLIPS.put(`clipbin:${id}`, buf);
    meta.cachedLocally = true;
    await env.CLIPS.put(`clip:${id}`, JSON.stringify(meta));
    return new Response(buf, { headers: { "Content-Type": "video/mp4", ...cors } });
}

export async function handleUpdateClipTitle(request, env, cors) {
    const { session } = await getSessionFromRequest(env, request);
    if(!session?.user?.id) return json({ error: "Auth required" }, cors, 401);
    const body = await request.json();
    const meta = await env.CLIPS.get(`clip:${body.id}`, "json");
    if(!meta || meta.userId !== session.user.id) return json({ error: "Forbidden" }, cors, 403);
    meta.title = body.title || meta.title;
    await env.CLIPS.put(`clip:${body.id}`, JSON.stringify(meta));
    return json({ ok: true, clip: meta }, cors);
}

export async function handleDeleteClip(request, env, cors) {
    const { session } = await getSessionFromRequest(env, request);
    const body = await request.json();
    const meta = await env.CLIPS.get(`clip:${body.id}`, "json");
    if(!meta || meta.userId !== session.user.id) return json({ error: "Forbidden" }, cors, 403);
    await env.CLIPS.delete(`clip:${body.id}`);
    await env.CLIPS.delete(`clipbin:${body.id}`);
    return json({ ok: true }, cors);
}

export async function createStripePaymentIntent(env, { amountCents, currency = "usd", metadata = {} }) {
  const body = new URLSearchParams({ amount: amountCents.toString(), currency: currency, "automatic_payment_methods[enabled]": "true", });
  for (const [key, value] of Object.entries(metadata)) { body.append(`metadata[${key}]`, value); }
  const res = await fetch("https://api.stripe.com/v1/payment_intents", { method: "POST", headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body });
  if (!res.ok) { throw new Error("Stripe error"); }
  return await res.json();
}

export async function verifyStripePayment(env, paymentIntentId) {
    if (!paymentIntentId) return null;
    try {
        const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, { headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` } });
        const data = await res.json();
        if (data.status === "succeeded") { return { ok: true, amount: data.amount, currency: data.currency }; }
    } catch(e) { console.error("Stripe verify error", e); }
    return { ok: false };
}

// --- [NEW] COINBASE COMMERCE HELPER ---
export async function createCoinbaseCharge(env, { amount, currency = "USD", metadata = {} }) {
    if (!env.COINBASE_API_KEY) return { ok: false, error: "Coinbase API Key missing" };
    
    try {
        const res = await fetch("https://api.commerce.coinbase.com/charges", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "X-CC-Api-Key": env.COINBASE_API_KEY, 
                "X-CC-Version": "2018-03-22" 
            },
            body: JSON.stringify({
                name: "Tip to Wolfethyst",
                description: metadata.message || "Nexus Tip",
                pricing_type: "fixed_price",
                local_price: { amount: amount.toString(), currency },
                metadata: metadata,
                redirect_url: "https://nexus.wolfethyst.tv/?tip_success=true",
                cancel_url: "https://nexus.wolfethyst.tv/"
            })
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        return { ok: true, url: data.data.hosted_url, code: data.data.code };
    } catch (e) {
        console.error("Coinbase Error:", e);
        return { ok: false, error: e.message };
    }
}

export async function getTalathystConfig(env) {
  let cfg = await env.MODERATION.get("talathyst:config", "json");
  return { behavior: "You are Talathyst.", model: "gpt-4o-mini", temperature: 0.8, nameColor: "#b972ff", ...(cfg || {}) };
}
export async function saveTalathystConfig(env, update) {
  const current = await getTalathystConfig(env);
  await env.MODERATION.put("talathyst:config", JSON.stringify({ ...current, ...update }));
}
async function getTalathystHistory(env, userId) {
    const data = await env.MODERATION.get(`talathyst:history:${userId}`, "json");
    return Array.isArray(data) ? data : [];
}
async function saveTalathystHistory(env, userId, history) {
    await env.MODERATION.put(`talathyst:history:${userId}`, JSON.stringify(history));
}

export async function handleTalathystChat(env, request, cors) {
  const body = await request.json();
  const text = body.text || body.message;
  const userId = body.user || "anonymous";
  if (!env.OPENAI_API_KEY) return json({ reply: "Talathyst is sleeping." }, cors);
  const cfg = await getTalathystConfig(env);
  let history = await getTalathystHistory(env, userId);
  history.push({ role: "user", content: text });
  if(history.length > 6) history = history.slice(history.length - 6);
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature, messages: [{ role: "system", content: cfg.behavior }, ...history], max_tokens: 150 }) });
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || "...";
  history.push({ role: "assistant", content: reply });
  await saveTalathystHistory(env, userId, history);
  return json({ ok: true, reply, nameColor: cfg.nameColor }, cors);
}

export async function handleTalaTts(env, request, cors) {
    const body = await request.json();
    let text = (body.text || "").toString();
    text = text.replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '');
    text = text.trim().slice(0, 200);
    if (!text) return json({ error: "Message is empty" }, cors, 400);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${body.voiceId || env.TALATHYST_VOICE_ID}`, { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ text: text, model_id: "eleven_turbo_v2_5" }) });
    if(!res.ok) return json({ error: "TTS failed" }, cors, 502);
    return new Response(await res.arrayBuffer(), { headers: { "Content-Type": "audio/mpeg", ...cors } });
}

export async function getStreamLiveStatus(env) {
  const cached = await env.POINTS.get("stream_live_status", "json");
  if (cached && (Date.now() - cached.checkedAt < 30000)) return cached;
  try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/live_inputs/${env.STREAM_LIVE_INPUT_ID}`, { headers: { "Authorization": `Bearer ${env.STREAM_API_TOKEN}` }});
      const data = await res.json();
      const status = { live: data?.result?.status === "connected", checkedAt: Date.now() };
      await env.POINTS.put("stream_live_status", JSON.stringify(status));
      return status;
  } catch { return { live: false }; }
}

export async function handleExternalChatInbound(request, env, cors, platform) {
  const body = await request.json();
  const secret = request.headers.get("X-Twitch-Bot-Secret") || request.headers.get("Authorization") || new URL(request.url).searchParams.get("secret");
  const expectedSecret = env.BRIDGE_SECRET || env.TWITCH_BOT_SHARED_SECRET;

  if (expectedSecret && secret !== expectedSecret) return json({ error: "Forbidden" }, cors, 403);
  
  const userId = body.userId || body.twitchId || body.youtubeId;
  const name = body.displayName || body.name || body.login;
  const text = body.message || body.text;
  
  if (!userId || !name || !text) return json({ error: "Missing fields" }, cors, 400);
  
  const uuid = await globalUUIDFor(env, platform, userId);
  await ensureUserInD1(env, uuid, name);
  
  if (await isUserBanned(env, uuid)) return json({ banned: true }, cors);
  
  const moderationResult = await checkAutomod(env, uuid, text);
  if (moderationResult) {
      try { 
          const roomId = env.CHAT_ROOM.idFromName("global"); 
          await env.CHAT_ROOM.get(roomId).fetch("https://dummy/moderation/event", { method: "POST", body: JSON.stringify({ type: "timeout", userId: moderationResult.userId, durationMinutes: moderationResult.durationMinutes, reason: moderationResult.reason, kind: moderationResult.kind }) }); 
      } catch(e) {}
      return json({ blocked: true, reason: moderationResult.reason, kind: moderationResult.kind }, cors, 200);
  }
  
  await awardMessagePoints(env, uuid, platform);
  
  const roomId = env.CHAT_ROOM.idFromName("global");
  const stub   = env.CHAT_ROOM.get(roomId);
  
  await stub.fetch("https://dummy/chat", { 
      method: "POST", 
      body: JSON.stringify({ 
          userId: uuid, 
          user: name, 
          text, 
          source: platform === "youtube" ? "YouTube" : "Twitch", 
          platform, 
          originPlatform: platform 
      }) 
  });
  return json({ ok: true }, cors);
}

export async function createStripeCheckoutSession(env, { priceId, userId, successUrl, cancelUrl }) {
  const body = new URLSearchParams({ "success_url": successUrl, "cancel_url": cancelUrl, "mode": "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1", "client_reference_id": userId, "metadata[userId]": userId });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body });
  if (!res.ok) { throw new Error("Failed to create checkout session"); }
  return await res.json();
}

export async function retrieveStripeSession(env, sessionId) {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!res.ok) return null;
  return await res.json();
}

export async function transferToBunny(env, cloudflareUrl, title) {
  const LIBRARY_ID = env.BUNNY_LIBRARY_ID;
  const API_KEY = env.BUNNY_API_KEY;

  if (!LIBRARY_ID || !API_KEY) {
    console.error("Missing Bunny Secrets");
    return null;
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/fetch`, {
    method: "POST",
    headers: {
      "AccessKey": API_KEY, 
      "Content-Type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify({
      url: cloudflareUrl, 
      title: title || `Imported Stream ${new Date().toISOString()}`
    })
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Bunny Transfer Failed:", err);
    return null;
  }

  const data = await res.json();
  return data.id; 
}

export async function deleteFromCloudflare(env, videoId) {
    if (!videoId) return;
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${videoId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${env.STREAM_API_TOKEN}` }
    });
    if (!res.ok) console.error(`Failed to delete Cloudflare Video ${videoId}`);
    else console.log(`Deleted Cloudflare Video ${videoId}`);
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "0s";
  const sec = Math.floor(Number(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function tagCloudflareVideo(env, videoId, meta) {
    if (!videoId) return;
    
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${videoId}`, {
        method: "POST",
        headers: { 
            "Authorization": `Bearer ${env.STREAM_API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ meta }) 
    });
}

// --- DIRECT TWITCH OUTBOUND (Replaces Fly.io Relay) ---
async function getTwitchBroadcasterToken(env) {
    if (!env.TWITCH_REFRESH_TOKEN || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
    try {
        const res = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: env.TWITCH_CLIENT_ID,
                client_secret: env.TWITCH_CLIENT_SECRET,
                refresh_token: env.TWITCH_REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.access_token;
    } catch (e) { return null; }
}

async function getTwitchBroadcasterId(env, token) {
    // Cache this if possible, for now fetch
    const res = await fetch("https://api.twitch.tv/helix/users", { headers: { "Authorization": `Bearer ${token}`, "Client-Id": env.TWITCH_CLIENT_ID }});
    if(!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.id;
}

export async function sendTwitchChat(env, message) {
    const token = await getTwitchBroadcasterToken(env);
    if (!token) return { ok: false, error: "No Token" };
    
    const broadcasterId = await getTwitchBroadcasterId(env, token);
    if(!broadcasterId) return { ok: false, error: "No Broadcaster ID" };

    try {
        const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Client-Id": env.TWITCH_CLIENT_ID,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                broadcaster_id: broadcasterId,
                sender_id: broadcasterId,
                message: message
            })
        });
        return { ok: res.ok, status: res.status };
    } catch(e) {
        return { ok: false, error: e.message };
    }
}

export async function banYouTubeUser(env, channelId) {
    if (!env.FLY_RELAY_URL || !env.BRIDGE_SECRET) return;
    try {
        await fetch(`${env.FLY_RELAY_URL}/relay/mod`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-relay-secret": env.BRIDGE_SECRET
            },
            body: JSON.stringify({
                platform: "youtube",
                action: "ban",
                userId: channelId 
            })
        });
    } catch (e) { console.error("YouTube Ban Relay Failed:", e); }
}

async function getTwitchUserToken(env) {
    if (!env.TWITCH_REFRESH_TOKEN || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
    try {
        const res = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: env.TWITCH_CLIENT_ID,
                client_secret: env.TWITCH_CLIENT_SECRET,
                refresh_token: env.TWITCH_REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.access_token;
    } catch (e) { return null; }
}

export async function updateTwitchChannel(env, title, gameName) {
    const token = await getTwitchUserToken(env);
    if (!token) return;

    let broadcasterId = null;
    try {
        const validateRes = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { "Authorization": `OAuth ${token}` } });
        if(validateRes.ok) {
            const data = await validateRes.json();
            broadcasterId = data.user_id; 
        } else return;
    } catch(e) { return; }

    const payload = {};
    if (title) payload.title = title;

    if (gameName) {
        try {
            const gameRes = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`, { headers: { "Client-ID": env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
            const gameData = await gameRes.json();
            if (gameData.data && gameData.data.length > 0) payload.game_id = gameData.data[0].id;
        } catch (e) {}
    }

    if (Object.keys(payload).length === 0) return;

    try {
        await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
            method: "PATCH",
            headers: { "Client-ID": env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error("Twitch Update Error:", e); }
}

export async function getTwitchBotToken(env) {
    const refresh = env.TWITCH_BOT_REFRESH_TOKEN;
    if (!refresh) return null;
    const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refresh }) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
}

export async function banTwitchUser(env, targetTwitchId, durationSeconds, reason, broadcasterId) {
    const token = await getTwitchBotToken(env);
    if (!token) return { ok: false, error: "No Bot Token" };
    const userRes = await fetch("https://api.twitch.tv/helix/users", { headers: { "Client-ID": env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
    const botData = await userRes.json();
    const botId = botData.data?.[0]?.id;
    if (!botId) return { ok: false, error: "Bot ID not found" };
    const body = { data: { user_id: targetTwitchId, reason: reason || "Banned from Nexus" } };
    if (durationSeconds > 0) body.data.duration = durationSeconds;
    const res = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botId}`, { method: "POST", headers: { "Client-ID": env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status };
}

export async function ensureCloudflareDownloads(env, videoId) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${videoId}/downloads`;
    const headers = { "Authorization": `Bearer ${env.STREAM_API_TOKEN}`, "Content-Type": "application/json" };

    try {
        const getRes = await fetch(url, { headers });
        const getData = await getRes.json();

        if (getData.success && getData.result?.default?.status === "ready") {
            return { ok: true, status: "ready", url: getData.result.default.url };
        }
        
        if (getData.success && getData.result?.default?.status === "processing") {
            return { ok: true, status: "processing" };
        }
        
        if (getData.success && getData.result?.default?.status === "error") {
             console.error(`[Cloudflare] MP4 Gen Error for ${videoId}`);
        }
    } catch(e) { console.error("Check DL error", e); }

    console.log(`[Cloudflare] Requesting MP4 generation for ${videoId}...`);
    try {
        const postRes = await fetch(`${url}/default`, { method: "POST", headers, body: "{}" });
        const postData = await postRes.json();
        if (postData.success) return { ok: true, status: "triggered" };
        else console.error("Trigger Error:", postData);
    } catch(e) { console.error("Gen DL error", e); }

    return { ok: false, error: "Failed to trigger" };
}

// Stub for YouTube (requires liveChatId)
export async function sendYouTubeChat(env, message) {
    // This functionality is currently limited by the need for liveChatId
    return { ok: false, error: "Not implemented" };
}