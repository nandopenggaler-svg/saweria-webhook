const express = require("express");
const crypto  = require("crypto");
const app     = express();
app.use(express.json());

// ============================================================
// IN-MEMORY STATE
// ============================================================
let donationQueue  = [];
let latestDonation = null;
let donationCounter = 0;

// ============================================================
// HELPER: Update leaderboard via Roblox Open Cloud
// ============================================================
async function updateLeaderboard(donorName, amount) {
  const universeId    = process.env.UNIVERSE_ID;
  const datastoreName = process.env.DATASTORE_NAME;
  const apiKey        = process.env.ROBLOX_API_KEY;
  if (!universeId || !datastoreName || !apiKey) return { success: false, reason: "missing_env" };

  const safeKey = donorName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "anonymous";
  const url     = `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(datastoreName)}&entryKey=${encodeURIComponent(safeKey)}`;

  let currentTotal = 0;
  try {
    const getRes = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (getRes.ok) {
      const text = await getRes.text();
      const parsed = JSON.parse(text);
      if (typeof parsed === "number") currentTotal = parsed;
    }
  } catch (e) { console.warn("[Leaderboard] GET error:", e.message); }

  const body = JSON.stringify(currentTotal + amount);
  const md5  = crypto.createHash("md5").update(body).digest("base64");
  try {
    const setRes = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey, "content-type": "application/json",
        "content-md5": md5, "roblox-entry-userids": "[]",
        "roblox-entry-attributes": "{}"
      }, body
    });
    if (setRes.ok) {
      console.log(`[Leaderboard] ✅ ${safeKey} += ${amount}`);
      return { success: true };
    }
    const errText = await setRes.text();
    console.error(`[Leaderboard] ❌ ${setRes.status}:`, errText);
    return { success: false, status: setRes.status };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status:         "online",
    universeId:     process.env.UNIVERSE_ID,
    datastore:      process.env.DATASTORE_NAME,
    apiKeyExists:   !!process.env.ROBLOX_API_KEY,
    queueLength:    donationQueue.length,
    latestDonation: latestDonation
      ? { donor: latestDonation.donorName, amount: latestDonation.amount }
      : null,
  });
});

// ============================================================
// SAWERIA WEBHOOK  →  POST /saweria
// ============================================================
app.post("/saweria", async (req, res) => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[Saweria] Webhook:", JSON.stringify(req.body));

  const raw = req.body;

  const donorName  = raw.donator_name  || raw.donatur_name || raw.donor_name || raw.name || "Anonymous";
  const amount     = parseInt(raw.amount_raw || raw.amount || raw.nominal || 0, 10);
  const message    = raw.message       || raw.pesan        || "";
  const avatarUrl  = raw.avatar_url    || raw.donatur_avatar || "";

  // donorUserId: Saweria kadang kirim field ini kalau linked ke akun Roblox
  // Field bisa bernama roblox_user_id, roblox_id, atau custom
  const donorUserId = raw.roblox_user_id || raw.roblox_id || raw.user_id || null;

  if (!amount || amount <= 0) {
    console.warn("[Saweria] Amount tidak valid, skip.");
    return res.status(200).send("OK (skipped)");
  }

  donationCounter++;
  const donation = {
    id: donationCounter,
    donorName,
    amount,
    message,
    avatarUrl,
    donorUserId: donorUserId ? String(donorUserId) : null,
    timestamp:   Date.now(),
    picked:      false,
  };

  donationQueue.push(donation);
  latestDonation = donation;

  console.log(`[Saweria] ✅ ${donorName} — Rp${amount.toLocaleString("id-ID")}${donorUserId ? ` (UserId: ${donorUserId})` : ""}`);

  // Update leaderboard Open Cloud di background
  updateLeaderboard(donorName, amount).then(r => {
    console.log("[Leaderboard] Result:", JSON.stringify(r));
  }).catch(e => console.error("[Leaderboard] Error:", e));

  res.status(200).send("OK");
});

// ============================================================
// ROBLOX POLLING  →  GET /poll-donation
// SaweriaPoller di Roblox memanggil ini setiap 3 detik.
// Mengembalikan donasi baru (belum dipick), lalu mark sudah diambil.
// ============================================================
app.get("/poll-donation", (req, res) => {
  const newDonations = donationQueue.filter(d => !d.picked);

  if (newDonations.length === 0) {
    return res.json({ hasDonation: false });
  }

  // Mark semua sudah diambil, bersihkan queue lama
  donationQueue = donationQueue.map(d => ({ ...d, picked: true }));
  if (donationQueue.length > 50) donationQueue = donationQueue.slice(-50);

  const first = newDonations[0];
  console.log(`[Poll] Roblox ambil: ${first.donorName} — Rp${first.amount.toLocaleString("id-ID")}`);

  res.json({
    hasDonation: true,
    id:          first.id,
    donorName:   first.donorName,
    amount:      first.amount,
    message:     first.message,
    avatarUrl:   first.avatarUrl,
    donorUserId: first.donorUserId,   // <-- dikirim ke Roblox untuk VFX targeting
    timestamp:   first.timestamp,
    pending:     newDonations.length - 1,
  });
});

// ============================================================
// DEBUG
// ============================================================
app.get("/debug", (req, res) => {
  const secret = process.env.DEBUG_SECRET;
  if (secret && req.query.key !== secret) return res.status(403).json({ error: "forbidden" });
  res.json({ counter: donationCounter, queueLength: donationQueue.length, latestDonation, queue: donationQueue.slice(-10) });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Railway] ✅ Server port ${PORT}`);
  console.log(`[Railway] Universe: ${process.env.UNIVERSE_ID}`);
  console.log(`[Railway] DataStore: ${process.env.DATASTORE_NAME}`);
  console.log(`[Railway] API Key: ${process.env.ROBLOX_API_KEY ? "ADA ✅" : "TIDAK ADA ❌"}`);
});
