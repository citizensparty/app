# Strategy: architecture, keys, decentralization

## Decided
- **Name and domain:** Citizens Party, at citizensparty.ca (GoDaddy). BC first; the brand works nationally later.
- **Cost:** pay for static hosting of the landing page only. No server droplet and no managed database.
- **The app does the work.** It signs, verifies, counts and renders. Rules are deterministic, so every device computes the same result.
- **Open source, but not yet.** The code stays private until v1, then goes to a public GitHub repo. AGPL is proposed but not confirmed.
- **Not for profit:** no payment code, no ads, no data sales.
- **Phones:** an installable web app (PWA) first, then Capacitor builds for testers, then the app stores.
- **Identity:** a key on the member's device, restorable from 12 words (NIP-06). No usernames or passwords.
- **The record is public** (decided Oct 23, 2026): anyone can read it, matching "all party communications are public." Keeping it members-only wouldn't keep it private anyway: any one of thousands of members could copy it out. Privacy comes from how votes are recorded (Stage 5).
- **Anyone can run a host** (`host/`, one program for Windows and Linux): no sign-up. Hosts announce themselves in the record; the other hosts check each one before listing it and drop the ones that fail; members' apps test the hosts they use. Writes still need registrar approval. Caps for testing: 10,000 members, 10,000 hosts.
- **Every member's app keeps a copy** of what it can read and re-seeds hosts that are missing records.
- **ID:** a driver's licence check comes later. A licence proves residency, not citizenship, so citizenship needs a separate check or a sworn statement.

## Keys
- **The private key** signs votes. It never leaves the device and must stay secret.
- **The public key** is public by design. It lets anyone verify a signature.
- **What reveals a vote is the link between a person and a key.** So there are two keys (built Oct 24, 2026):
  - **Member identity:** "this person is a verified member of grid X." It's tied to who you are.
  - **Anonymous voting key:** certified as belonging to *some* verified member through a **blind signature**. The registrar checks your ID and signs your voting key without seeing it, so nobody, the registrar included, can link the key to you.
- **Renewal:** voting keys and stamps are per quarter, so a stamp from a lost or old account stops working within three months.
- **Key loss:** re-register to get a new key. Social recovery later.
- **iPhone risk:** Safari can delete a site's stored data after about 7 days without use, unless the PWA is on the home screen. Require home-screen install and offer an encrypted key backup.

## Decided: secret ballot and the penalty box
If ballots are anonymous, nobody can tell who missed a vote. The options:
1. **Record participation separately.** Publish "I took part," signed with your identity, plus an anonymous ballot. Ballots must be batched or delayed so timing can't link the two. This is the most work.
2. Drop the penalty box.
3. Make turnout public and keep only the choices secret.

**Decided (Oct 24): option 1.** Ballots go out right away; the "I took part" note follows 2–20 minutes later. The honesty gap (someone claiming to have voted without voting) is accepted.

## Decided: ballots travel through Tor (Oct 25)
Hosts see internet addresses, so a host receiving both a ballot and, later, the "I took part" note from the same address could match them. The fix: ballots and stamps travel through Tor; everything else uses normal connections.
- **Hosts** run Tor next to the host program and announce a `.onion` address with their usual one (`host/onion.go`; `TOR=off` turns it off). Tor traffic reaches the host on its own local port that never shows the status page.
- **The Android app** starts Tor quietly when it opens (`TorPlugin.java`, the Guardian Project's tor-android) and sends each ballot to each host's `.onion` address (or its usual address through Tor). About 2 seconds a ballot once Tor is warm; Tor starts in a few seconds after the first time. The very first start downloads Tor's directory (about 35 MB) and took about 30 seconds on the test emulator (the first ballot after that took 48 s).
- **If Tor won't open** within 45 s (a network blocking it), the ballot waits on the phone and the app asks: "Send it the normal way" or "Keep trying". No bridges yet.
- **Web:** in Tor Browser (the site recognizes Tor through Cloudflare's "T1" country, `/api/tor`), ballots are already hidden. In a regular browser, a one-time tip before the first vote suggests the app or Tor Browser; "Vote here anyway" goes ahead.
- **Not yet:** the iPhone app (needs a Mac; it sends the normal way for now), bridges for networks that block Tor. A spy agency watching large parts of the internet can still try to match timing.

## Decentralization: no servers you pay for
- **Landing page and app:** static files on a free Cloudflare Worker (static assets). The domain stays registered at GoDaddy.
- **Shared data:** **hosts** run by members, using Nostr relays. A host can't forge or alter anything, because everything is signed; the worst it can do is drop data, and the other hosts show that.
- **Integrity:** hosts publish signed checkpoints, a fingerprint of everything they hold. Disagreement between hosts is visible to every app. This is the Certificate Transparency model.
- **Finding hosts:** `citizensparty.ca/hosts.json`, a free Cloudflare Worker + D1 directory that checks every host before listing it. If the site is ever taken down, the same list lives in the record itself, so the network keeps finding itself.
- **Launch requirement:** 2–3 always-on hosts run by the party (ordinary hosts, for when there are no members yet). After that, anyone adds more with a double-click.
- **Registrars:** trusted volunteers per grid who check ID and blind-sign voting keys. Their public keys are published, and every certification they issue is auditable.

## Order of work
1. Landing page live at citizensparty.ca.
2. App runs standalone: adapter, PWA, served locally and at /app.
3. Android test APK download, then iOS TestFlight once there's an Apple Developer account. **APK built Oct 22, 2026.**
4. Nostr hosts and checkpoints. Drop the single shared database. **Built Oct 22, 2026; needs real hosts to go live.** Open hosting (Go host, quick tunnels, self-announcing hosts, app-side host testing) built Oct 23, 2026.
5. Registrars, blind-signed voting keys, and the penalty-box decision. **Built Oct 24, 2026.**
6. ID: licence check plus citizenship statement.
