# Google Play: listing and forms

What to type into Play Console for the Citizens Party Android app (`ca.citizensparty.app`).
Build: `tools/build_native.sh` writes `dist/play/citizensparty-<version>.aab` (upload this) next to the website APK.

## App signing

Use the same key as the website APK, so people can move between the two without reinstalling:
Play Console → Test and release → App integrity → App signing → "Use a different key" (export and upload a key from
Java keystore), then run the PEPK command it shows on the keystore in `~/.citizensparty/` (never in the repo).

## Store listing

- **App name:** Citizens Party
- **Short description (80):** A BC political party run by its members. Propose and vote from home, in secret.
- **Full description:**

  Citizens Party is a political party for British Columbia that runs on this app. Members propose, vote on and decide everything, from what we stand for to who speaks for us, from home.

  • Every member decides. BC is split into about 120 grids. You join the one you live in and vote on its principles. Good ideas can go BC-wide.
  • Your vote is secret. Ballots are signed with a separate voting key, so nobody, not even the party, can see how you voted. In this app, ballots travel through Tor.
  • Everything is in the open. Every vote is sealed into a public record that anyone can check, so nobody can quietly change a result.
  • Nobody can take it over. There's no central server and no board. The record is kept by many computers run by members, and anyone can run one.
  • No fees, no names, no tracking. You join with 12 words, not an email address.

  We're in beta: votes are a trial run and don't bind the party yet. The code is open source (AGPL-3.0): github.com/citizensparty/app

- **Category:** Social (or News & Magazines). **Tags:** politics, community.
- **Contact email:** admin@citizensparty.ca. **Website:** https://citizensparty.ca. **Privacy policy:** https://citizensparty.ca/privacy
- **Graphics:** icon 512×512 (`native/` icon source), feature graphic 1024×500 (from `landing/og.png`), 2–8 phone
  screenshots (`landing/shots/*-light.webp`, converted to PNG).

## App content

- **Privacy policy:** https://citizensparty.ca/privacy
- **Ads:** No.
- **App access:** All functionality is available without special access. Reviewer note: "Tap I'm new here, write down
  the 12 words, confirm two of them, and pick any BC town (e.g. Kamloops). New members are approved automatically
  during the beta. Votes need other members, so the tutorial (shown first) walks through every screen."
- **Content rating (IARC):** Category "Social / communication". User-generated content: yes (text proposals, no
  images or chat). Users can interact: yes (voting on proposals). Shares location: no (the grid is chosen by the
  member; nothing from GPS). Digital purchases: no. Expected result: Everyone / PEGI 3 or Teen, depending on the UGC answer.
- **Target audience:** 18 and over only. Not designed for children.
- **News app:** No.
- **Government app:** No (a political party, not a government).
- **Financial features, health, VPN:** None. (Tor is used only to send ballots; it isn't a VPN service.)
- **User-generated content:** members can report a proposal (Report this proposal, goes to the private feedback inbox)
  and ignore a member (hides their proposals). Rules: no hate, threats, illegal content or private details.
- **Account deletion:** in the app, Me → Settings → Delete my account. Web: https://citizensparty.ca/privacy#delete.

## Data safety

- **Collects or shares data:** Yes, collects. Shares: No. Encrypted in transit: Yes (wss/https; ballots via Tor).
  Users can request deletion: Yes.
- **Data types collected:**
  - *Location → Approximate location:* the member's grid and nearest town (chosen by the member, not from GPS).
    Purpose: App functionality. Required. Public on the record.
  - *Personal info → Other info:* the member's public key and join date. App functionality. Required.
  - *App activity → Other user-generated content:* proposals, and that the member took part in a vote. App
    functionality. Optional (only if they propose or vote).
  - *Personal info → Email address:* only if typed into feedback or a report. Purpose: Developer communications. Optional.
  - *App activity → Other actions:* feedback and report messages. Developer communications. Optional.
- **Not collected:** name, phone, address (matched on the phone, never sent), precise location, contacts, photos,
  device IDs, analytics, crash logs. Secret ballots are signed by an unlinked voting key, so they aren't tied to the user.

## Testing (new personal accounts)

Closed test with at least 12 testers opted in for 14 days in a row, then apply for production. Testers need a Google
account; add their emails to the closed-test list and send them the opt-in link.
