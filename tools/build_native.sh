#!/usr/bin/env bash
# Build the Citizens Party Android test APKs (debug + signed release).
#
#   tools/build_native.sh            build web app, sync Capacitor, build both APKs
#   tools/build_native.sh --debug    debug APK only (skips the release keystore)
#   tools/build_native.sh --ios      (on a Mac) build web app + icons, sync native/ios; no Android
#
# Output: dist/downloads/citizensparty-<version>.apk          (signed release, for the website)
#         dist/downloads/citizensparty-<version>-debug.apk
#         dist/play/citizensparty-<version>.aab                 (signed app bundle for Google Play; not on the website)
# Version comes from native/package.json. Safe to re-run.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="$REPO/native"
OUT="$REPO/dist/downloads"
DEBUG_ONLY=0; IOS=0
case "${1:-}" in
  --debug) DEBUG_ONLY=1 ;;
  --ios) IOS=1 ;;
  "") ;;
  *) echo "usage: $0 [--debug|--ios]" >&2; exit 2 ;;
esac

# Toolchain (installed under ~/.local/opt; override by exporting these first).
# JDK 24: tor-android (Tor for ballots) is built with it
if [[ $IOS -eq 0 ]]; then export JAVA_HOME="${JAVA_HOME_24:-$HOME/.local/opt/jdk24}"; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="${JAVA_HOME:-/nonexistent}/bin:$HOME/.local/opt/node/bin:$ANDROID_HOME/platform-tools:$PATH"
for tool in node npm python3; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done
if [[ $IOS -eq 0 ]]; then
  command -v java >/dev/null || { echo "missing: java (JDK 24)" >&2; exit 1; }
  [[ -d "$ANDROID_HOME/platforms" ]] || { echo "Android SDK not found at $ANDROID_HOME" >&2; exit 1; }
fi

VERSION="$(python3 -c "import json;print(json.load(open('$NATIVE/package.json'))['version'])")"
echo "== Citizens Party native build $VERSION"

# 1. Web app -> native/www. Built with --native: no party key inside; the app reads it from citizensparty.ca.
python3 "$REPO/tools/build.py" --native --no-host --out "$REPO/dist/native-build"
rm -rf "$NATIVE/www"
mkdir -p "$NATIVE/www"
cp -a "$REPO/dist/native-build/app/." "$NATIVE/www/"

# 2. Capacitor: deps, platforms (only if missing), icons, sync.
cd "$NATIVE"
if [[ ! -d node_modules/@capacitor/cli ]]; then npm ci --no-fund --no-audit; fi
if [[ $IOS -eq 1 ]]; then
  [[ -d ios ]] || npx cap add ios
  python3 "$NATIVE/scripts/make_icons.py"
  npx cap sync ios
  echo "== native/ios synced. Next: cd native && npx cap open ios"
  exit 0
fi
[[ -d android ]] || npx cap add android
python3 "$NATIVE/scripts/make_icons.py"
npx cap sync android
echo "sdk.dir=$ANDROID_HOME" > "$NATIVE/android/local.properties"

# 3. Release keystore (created once, outside the repo).
KDIR="$HOME/.citizensparty"
KS="$KDIR/android-release.jks"
KENV="$KDIR/android-keystore.env"
TASKS=(assembleDebug)
if [[ $DEBUG_ONLY -eq 0 ]]; then
  if [[ ! -f "$KS" ]]; then
    mkdir -p "$KDIR"; chmod 700 "$KDIR"
    PASS="$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
    keytool -genkeypair -v -keystore "$KS" -storetype PKCS12 -alias citizensparty \
      -keyalg RSA -keysize 4096 -validity 10000 -storepass "$PASS" -keypass "$PASS" \
      -dname "CN=Citizens Party, O=Citizens Party, L=Vancouver, ST=BC, C=CA" >/dev/null
    (umask 077
     printf 'CP_KEYSTORE=%s\nCP_KEYSTORE_PASSWORD=%s\nCP_KEY_ALIAS=citizensparty\nCP_KEY_PASSWORD=%s\n' \
       "$KS" "$PASS" "$PASS" > "$KENV")
    chmod 600 "$KS" "$KENV"
    echo "== created release keystore $KS (back it up: losing it means testers must uninstall to update)"
  fi
  set -a; source "$KENV"; set +a
  TASKS+=(assembleRelease)
fi

# 4. Gradle. JDK 24's optimizing compiler (C2) crashes Gradle on this machine since Oct 29 (SIGSEGV in
# RegionNode::Ideal), so every Java process in the build uses the simpler compiler (a little slower, same output).
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--XX:TieredStopAtLevel=1}"
cd "$NATIVE/android"
./gradlew --no-daemon -q "${TASKS[@]}"

# Google Play: an app bundle, signed with the same key (our upload key). Play sends each phone only its own copy of
# Tor, so the bundle carries the Intel copies too (Chromebooks, emulators); the 25 MB website limit doesn't apply.
if [[ $DEBUG_ONLY -eq 0 ]]; then ./gradlew --no-daemon -q -PallAbis bundleRelease; fi

# 5. Collect outputs.
mkdir -p "$OUT"
APKS="$NATIVE/android/app/build/outputs/apk"
cp "$APKS/debug/app-debug.apk" "$OUT/citizensparty-$VERSION-debug.apk"
if [[ $DEBUG_ONLY -eq 0 ]]; then
  cp "$APKS/release/app-release.apk" "$OUT/citizensparty-$VERSION.apk"
fi
if [[ $DEBUG_ONLY -eq 0 ]]; then
  mkdir -p "$REPO/dist/play"
  cp "$NATIVE/android/app/build/outputs/bundle/release/app-release.aab" "$REPO/dist/play/citizensparty-$VERSION.aab"
  ls -lh "$REPO/dist/play/citizensparty-$VERSION.aab"
fi
chmod 644 "$OUT"/citizensparty-"$VERSION"*.apk
ls -lh "$OUT"/citizensparty-"$VERSION"*.apk
echo "== Next: python3 tools/deploy.py (puts the new APK on citizensparty.ca/download)"
