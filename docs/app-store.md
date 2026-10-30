# Apple App Store: the iPhone app

The iPhone app is built on GitHub's Macs (`.github/workflows/ios.yml`): Actions → "iPhone app" → Run workflow.
Unticked, it only checks that the app compiles. Ticked "Send to TestFlight", it signs the app and uploads it.

## One-time Apple setup

1. **Join the Apple Developer Program** ($99 USD a year): https://developer.apple.com/programs/enroll
   - Sign in with an Apple ID that has two-factor authentication on.
   - Enroll as an **Individual** (the seller name shown on the App Store is your own name), or as an
     **Organization** (needs a legal entity and a free D-U-N-S number, which takes days to weeks).
   - Approval usually takes a day or two.
2. **Team ID:** https://developer.apple.com/account → Membership details → Team ID (10 characters).
3. **App ID:** Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App →
   Description `Citizens Party`, Bundle ID **Explicit** `ca.citizensparty.app`. No capabilities needed.
4. **Distribution certificate:** Certificates → **+** → **Apple Distribution** → upload
   `~/Downloads/citizensparty-apple.certSigningRequest` (its private key stays in `~/.citizensparty/apple/`) →
   download the `.cer`. Claude turns it into the `.p12` for GitHub.
5. **Provisioning profile:** Profiles → **+** → Distribution → **App Store Connect** → App ID `ca.citizensparty.app` →
   the certificate from step 4 → name `Citizens Party App Store` → download the `.mobileprovision`.
6. **The app record:** https://appstoreconnect.apple.com → Apps → **+** → New App: iOS, name `Citizens Party`,
   primary language English (Canada), bundle ID `ca.citizensparty.app`, SKU `citizensparty-ios`, full access.
7. **Upload key:** App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys →
   **+** → name `GitHub upload`, access **App Manager** → download the `.p8` (only once!), and note the
   **Key ID** and the **Issuer ID** shown above the list.
8. **GitHub secrets** (repo Settings → Secrets and variables → Actions, or `gh secret set`): `APPLE_TEAM_ID`,
   `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_PROFILE_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`,
   `ASC_KEY_P8_BASE64`. Never commit these files.

## Each release

1. Bump `native/package.json` version (shared with Android). The build number is the workflow's run number.
2. Actions → iPhone app → Run workflow → tick **Send to TestFlight**.
3. After 10–30 minutes it shows in App Store Connect → TestFlight.

## TestFlight (testing)

- **Internal testers:** up to 100 people added as users of your App Store Connect account. No review.
- **External testers:** up to 10,000, by email or a **public link**. The first build needs a short Beta App Review
  (about a day). Apple has no 12-testers-for-14-days rule.
- Testers install Apple's **TestFlight** app, then open the link.

## App Store listing (same text as Google Play: docs/play-store.md)

- **Category:** Social Networking. **Privacy policy:** https://citizensparty.ca/privacy.
  **Support URL:** https://citizensparty.ca. **Copyright:** 2026 Citizens Party.
- **Screenshots:** 6.9-inch iPhone (1320 × 2868), 3 to 10. Claude makes them with Playwright.
- **Age rating:** answer the questionnaire honestly (user-generated content: yes, with reporting and blocking).
  Pick 18+ to match the party's rule.
- **App Privacy** (the "nutrition label"), same as Google's Data safety: Coarse location (the grid), User ID (the
  public key), Other user content (proposals), Email address and Customer support (only feedback/reports). None used
  for tracking, none linked to identity except feedback email.
- **Sign-in for review:** "No username or password. On first launch tap Welcome back → Restore with my 12 words and
  type: (the reviewer's 12 words). Or tap I'm new here to make a new account; it's approved automatically."
- **Export compliance:** already answered in the app (`ITSAppUsesNonExemptEncryption` = NO: only standard HTTPS and
  signatures).

## Apple review: what they check for this app

- **User-generated content (1.2):** rules agreed at sign-up (the line under "Save my key"), Report this proposal,
  Ignore this member, contact admin@citizensparty.ca, the party can hide a proposal. Done.
- **Account deletion (5.1.1(v)):** Settings → Delete my account. Done.
- **Not just a website (4.2):** a risk for any web-based app. Point out the phone-only parts in the review notes: the
  key kept in the iPhone Keychain, offline copy, scanning a QR from another phone.
- **Who publishes it (5.2.1):** Apple can ask why an individual publishes an organization's app. Answer: you're the
  party's founder and run its accounts during the beta.
- **No mention of Android** inside the iPhone app (it shows "turn on Orbot" instead of "use the Android app").
