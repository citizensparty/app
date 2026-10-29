// The citizensparty.ca Worker. Cloudflare serves the static site (dist/site) before this code runs; this adds
// the host directory, the front door for finding hosts:
//   GET  /hosts.json   hosts that passed their last check, most reliable first, each with its signed announcement
//   POST /api/hosts    a host registers (or re-registers) by sending its signed announcement (hosts/<its key>)
//   POST /api/feedback a member's or visitor's feedback, kept privately in D1 (read it with tools/feedback.py)
// Before listing a host, the Worker fetches its info page: it must answer with the key that signed the
// announcement and hold at least 80% as many records as the typical listed host. Every 30 minutes listed hosts
// are checked again; three failures in a row drops one for six hours. At most HOST_CAP hosts are listed.
// If this site is ever gone, hosts and apps still find each other through the same announcements in the record.
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const KIND = 30078;
const PROTOCOL = "1";        // the version of the record's rules (tag "p"), as in host/store.go
const STALE = 24 * 3600;     // a host that hasn't re-registered or passed a check in a day isn't listed
const FAILS = 3;
const BAD_FOR = 6 * 3600;
const MIN_GAP = 300;         // re-registering more often than this doesn't trigger a new check
const PER_RUN = 40;          // checks per cron run (the free plan allows 50 outgoing requests)
// RECHECK_AFTER (seconds between checks of a host) and CACHE_S (how long /hosts.json is cached) can be set in
// wrangler.toml [vars]; the tests set both to 0.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

const now = () => Math.floor(Date.now() / 1000);
const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
const isHex = (s, n) => typeof s === "string" && s.length === n && /^[0-9a-f]+$/.test(s);
const tag = (e, n) => (e.tags.find((t) => Array.isArray(t) && t[0] === n) || [])[1];
const cap = (env) => parseInt(env.HOST_CAP || "10000", 10);

function validEvent(e) {
  if (!e || typeof e !== "object" || !isHex(e.id, 64) || !isHex(e.pubkey, 64) || !isHex(e.sig, 128)) return false;
  if (e.kind !== KIND || !Number.isInteger(e.created_at) || !Array.isArray(e.tags) || typeof e.content !== "string") return false;
  const id = bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))));
  if (id !== e.id) return false;
  try { return schnorr.verify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey)); } catch { return false; }
}

function okURL(u, env) {
  if (typeof u !== "string" || u.length > 200) return false;
  if (env.ALLOW_LOCAL === "1" && /^ws:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(u)) return true;
  return /^wss:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u) && !/^wss:\/\/(\d+\.){3}\d+/.test(u); // a name, not a bare IP
}

async function hostInfo(url) {
  const r = await fetch(url.replace(/^ws/, "http"), { headers: { Accept: "application/nostr+json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("its info page answered " + r.status);
  return r.json();
}

// the typical record count among working listed hosts (the median), to spot a host that's mostly empty
async function typicalCount(env) {
  const { results } = await env.DB.prepare("select count from hosts where consec = 0 and last_ok > ? order by count").bind(now() - STALE).all();
  // the lower middle one: with two hosts, a host that just removed old records isn't "mostly empty"
  return results.length ? results[Math.floor((results.length - 1) / 2)].count : 0;
}

async function check(env, url, pubkey) {
  let info;
  try { info = await hostInfo(url); } catch (e) { throw new Error("unreachable (" + (e.message || e) + ")"); }
  if (info.pubkey !== pubkey) throw new Error("it answers with a different key");
  const count = (info.checkpoint && info.checkpoint.count) | 0;
  const typical = await typicalCount(env);
  if (typical >= 50 && count < typical * 0.8) throw new Error(`it holds ${count} records; listed hosts hold about ${typical}`);
  return { count, name: String(info.name || "").slice(0, 80) };
}

async function failed(env, pubkey) {
  const t = now();
  await env.DB.prepare(`update hosts set fails = fails + 1, consec = consec + 1, last_check = ?,
      bad_until = case when consec + 1 >= ? then ? else bad_until end where pubkey = ?`).bind(t, FAILS, t + BAD_FOR, pubkey).run();
}

async function register(req, env) {
  const body = await req.text();
  if (body.length > 16384) return json({ ok: false, why: "too large" }, 413);
  let e;
  try { e = JSON.parse(body); } catch { return json({ ok: false, why: "not JSON" }, 400); }
  if (!validEvent(e)) return json({ ok: false, why: "bad signature" }, 400);
  if (tag(e, "d") !== "hosts/" + e.pubkey || tag(e, "c") !== "hosts") return json({ ok: false, why: "not a host announcement" }, 400);
  const p = tag(e, "p"); // the protocol version (no label: version 1, from before Oct 28, 2026)
  if (p && p !== PROTOCOL) return json({ ok: false, why: "this directory lists hosts for version " + PROTOCOL + " of the protocol" }, 400);
  if (Math.abs(e.created_at - now()) > 3600) return json({ ok: false, why: "announcement is too old; sign a new one" }, 400);
  let a;
  try { a = JSON.parse(e.content); } catch { a = {}; }
  if (!okURL(a.url, env)) return json({ ok: false, why: "a host needs a wss:// address" }, 400);
  const t = now();
  const cur = await env.DB.prepare("select * from hosts where pubkey = ?").bind(e.pubkey).first();
  // a quick-tunnel host gets a new address every restart: its failures were at the old one, so check the new one
  // (at most once a minute) instead of making it wait out the 6 hours
  if (cur && cur.bad_until > t && (cur.url === a.url || t - cur.last_check < 60)) return json({ ok: false, why: "this host failed its checks; try again later" }, 403);
  if (cur && cur.url === a.url && cur.consec === 0 && t - cur.last_ok < MIN_GAP) {
    await env.DB.prepare("update hosts set ev = ?, updated = ? where pubkey = ?").bind(JSON.stringify(e), t, e.pubkey).run();
    return json({ ok: true, listed: true });
  }
  const taken = await env.DB.prepare("select pubkey from hosts where url = ? and pubkey <> ? and consec = 0 and last_ok > ?").bind(a.url, e.pubkey, t - STALE).first();
  if (taken) return json({ ok: false, why: "another host is listed at that address" }, 409);
  let res;
  try { res = await check(env, a.url, e.pubkey); } catch (err) {
    if (cur) await failed(env, e.pubkey);
    return json({ ok: false, why: String(err.message || err) }, 422);
  }
  if (!cur) {
    const n = (await env.DB.prepare("select count(*) as n from hosts where bad_until <= ?").bind(t).first()).n;
    if (n >= cap(env)) {
      const worst = await env.DB.prepare("select pubkey, consec from hosts order by consec desc, oks asc limit 1").first();
      if (!worst || worst.consec === 0) return json({ ok: false, why: `the list is full (${cap(env)} hosts) and they're all working` }, 503);
      await env.DB.prepare("delete from hosts where pubkey = ?").bind(worst.pubkey).run();
    }
  }
  await env.DB.prepare(`insert into hosts (pubkey, url, name, v, ev, count, first_ok, last_ok, last_check, oks, fails, consec, bad_until, updated)
      values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7, 1, 0, 0, 0, ?7)
      on conflict(pubkey) do update set url = ?2, name = ?3, v = ?4, ev = ?5, count = ?6, last_ok = ?7, last_check = ?7,
      oks = oks + 1, consec = 0, bad_until = 0, updated = ?7`)
    .bind(e.pubkey, a.url, String(a.name || res.name || "").slice(0, 80), String(a.v || "").slice(0, 20), JSON.stringify(e), res.count, t).run();
  return json({ ok: true, listed: true });
}

async function list(req, env, ctx) {
  const ttl = parseInt(env.CACHE_S ?? "60", 10);
  const cache = caches.default;
  const key = new Request(new URL("/hosts.json", req.url).toString());
  const hit = ttl > 0 && (await cache.match(key));
  if (hit) return hit;
  const t = now();
  const { results } = await env.DB.prepare(`select pubkey, url, name, v, ev, count, first_ok, last_ok, oks from hosts
      where consec < ? and bad_until <= ? and last_ok > ? order by oks desc, first_ok asc limit ?`).bind(FAILS, t, t - STALE, cap(env)).all();
  const hosts = results.map((r) => ({ url: r.url, name: r.name, pubkey: r.pubkey, v: r.v, count: r.count, since: r.first_ok, lastOk: r.last_ok, ev: JSON.parse(r.ev) }));
  const resp = json({ hosts, at: t }, 200, { "Cache-Control": "public, max-age=" + ttl });
  if (ttl > 0) ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

async function recheck(env) {
  const t = now();
  const { results } = await env.DB.prepare("select pubkey, url from hosts where bad_until <= ? and last_check < ? order by last_check limit ?")
    .bind(t, t - parseInt(env.RECHECK_AFTER ?? "1800", 10), PER_RUN).all();
  await Promise.all(results.map(async (h) => {
    await env.DB.prepare("update hosts set last_check = ? where pubkey = ?").bind(t, h.pubkey).run();
    try {
      const res = await check(env, h.url, h.pubkey);
      await env.DB.prepare("update hosts set count = ?, last_ok = ?, last_check = ?, oks = oks + 1, consec = 0 where pubkey = ?").bind(res.count, t, t, h.pubkey).run();
    } catch {
      await failed(env, h.pubkey);
    }
  }));
  // forget hosts that have been gone for a week
  await env.DB.prepare("delete from hosts where last_ok < ? and updated < ?").bind(t - 7 * 86400, t - 7 * 86400).run();
}

// Feedback (POST /api/feedback): a message, optionally a name and an email for a reply. Stored privately in D1;
// nothing is emailed. Spam: a hidden field people never fill in ("website"), and at most 5 messages an hour from
// one sender (a hash of their address and the day, never the address itself).
async function feedback(req, env) {
  const body = await req.text();
  if (body.length > 12000) return json({ ok: false, why: "That's too long." }, 413);
  let f;
  try { f = JSON.parse(body); } catch { return json({ ok: false, why: "Something went wrong. Try again." }, 400); }
  if (f.website) return json({ ok: true });  // the hidden field: a bot. Say thanks and drop it
  const msg = String(f.message || "").trim(), name = String(f.name || "").trim().slice(0, 100), email = String(f.email || "").trim().slice(0, 200);
  if (msg.length < 3) return json({ ok: false, why: "Write a few words first." }, 400);
  if (msg.length > 5000) return json({ ok: false, why: "Keep it under 5,000 characters." }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, why: "That email address doesn't look right." }, 400);
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const who = bytesToHex(sha256(utf8ToBytes("citizens-feedback/1|" + ip + "|" + new Date().toISOString().slice(0, 10)))).slice(0, 32);
  const t = now();
  const n = (await env.DB.prepare("select count(*) as n from feedback where who = ? and at > ?").bind(who, t - 3600).first()).n;
  if (n >= 5) return json({ ok: false, why: "Thanks! You've sent a lot this hour. Try again later." }, 429);
  await env.DB.prepare("insert into feedback (at, msg, name, email, page, who) values (?, ?, ?, ?, ?, ?)")
    .bind(t, msg, name, email, String(f.page || "").slice(0, 40), who).run();
  return json({ ok: true });
}

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS" && (pathname === "/hosts.json" || pathname === "/api/hosts" || pathname === "/api/feedback")) return new Response(null, { status: 204, headers: CORS });
    if (pathname === "/api/feedback" && req.method === "POST") return feedback(req, env);
    if (pathname === "/hosts.json" && req.method === "GET") return list(req, env, ctx);
    if (pathname === "/api/hosts" && req.method === "POST") return register(req, env);
    // the app asks whether this visit came through Tor (Cloudflare marks Tor's exits as country "T1"), so
    // people already using Tor Browser aren't told to get it; nothing is stored
    if (pathname === "/api/tor" && req.method === "GET") {
      const tor = (req.cf && req.cf.country) === "T1" || req.headers.get("cf-ipcountry") === "T1";
      return new Response(JSON.stringify({ tor }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(recheck(env));
  },
};
