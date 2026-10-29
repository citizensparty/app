# Native test builds (Capacitor)

`native/` wraps the static web app (`dist/app`, copied to `native/www` at build time) with Capacitor 8.
appId `ca.citizensparty.app`, name "Citizens Party", served from `https://localhost` (androidScheme https),
so WebCrypto, IndexedDB and the service worker work as on the web.

## Android (Linux)

```
tools/build_native.sh            # web build + cap sync + debug and signed release APKs
tools/build_native.sh --debug    # debug APK only
```

Output: `dist/downloads/citizensparty-<version>.apk` (release, signed) and `...-<version>-debug.apk`.
Version comes from `native/package.json` (`0.1.0` gives versionName 0.1.0, versionCode 100). Bump it for every
tester release, or Android refuses the update.

Toolchain the script expects: JDK 21 at `~/.local/opt/jdk21`, Android SDK at `~/.local/opt/android-sdk`
(platform 36, build-tools 36.0.0), Node at `~/.local/opt/node`.
The release keystore is `~/.citizensparty/android-release.jks`, password in `~/.citizensparty/android-keystore.env`
(both chmod 600, never in the repo). Back them up: a lost key means testers must uninstall to update.

Icons and splash screens are regenerated on every build from `app/icons/icon-512.png` and
`app/icons/maskable-512.png` by `native/scripts/make_icons.py` (teal `#0F6E66`).

## Secure storage (for the device private key)

Plugin: `@aparajita/capacitor-secure-storage` (Android Keystore, iOS Keychain). The app has no bundler, so call
the native bridge directly. Values are strings only (store a JWK as JSON; a non-extractable CryptoKey cannot go here):

```js
const SS = window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins.SecureStorage;
await SS.internalSetItem({ prefixedKey: "citizens_key", data: JSON.stringify(jwk), sync: false });
const { data } = await SS.internalGetItem({ prefixedKey: "citizens_key" });   // null/"" if absent
await SS.internalRemoveItem({ prefixedKey: "citizens_key" });
const { keys } = await SS.internalGetPrefixedKeys({ prefix: "citizens_" });
```

Note: IndexedDB with a non-extractable WebCrypto key also works inside the Android WebView (verified).

## iOS (needs a Mac)

`native/ios/` is generated (Swift Package Manager, no CocoaPods). On a Mac:

1. Install Xcode from the App Store, open it once, accept the license. Install Node 22 and Python 3 with Pillow.
2. `tools/build_native.sh --ios` (builds the web app into `native/www`, runs `npm ci` and `npx cap sync ios`).
3. `cd native && npx cap open ios`.
4. In Xcode: target App, Signing & Capabilities, pick your Team (needs an Apple Developer account, $99/yr).
5. Choose "Any iOS Device", then Product, Archive. In the Organizer: Distribute App, App Store Connect, Upload.
6. In App Store Connect, add testers under TestFlight. Testers install the TestFlight app and accept the invite.

Until then, iPhone testers install the PWA from Safari (Share, then Add to Home Screen).
