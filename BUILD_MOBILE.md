# Building the FieldOps Mobile APK

## Prerequisites
- Android Studio installed (provides the bundled JDK)
- Node 22+ (`nvm install 22 && nvm use 22`)

## Setup your Railway API URL

Edit `apps/web/.env.mobile` and replace the placeholder:
```
VITE_API_URL=https://YOUR-APP.up.railway.app
```

## Build a debug APK (for testing / sideloading)

```bash
# 1. Use Node 22
nvm use 22

# 2. Build the web app with mobile env vars
cd apps/web
npm run build:mobile

# 3. Sync to Android
npx cap sync android

# 4. Build the APK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd android
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Build a release APK (for distribution)

```bash
cd android
./gradlew assembleRelease
```

Release APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

To sign it for the Play Store, you'll need a keystore. Run:
```bash
keytool -genkey -v -keystore fieldops.keystore -alias fieldops -keyalg RSA -keysize 2048 -validity 10000
```

Then add signing config to `android/app/build.gradle`.

## One-liner rebuild (after code changes)

```bash
nvm use 22
cd apps/web
npm run cap:build
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd android && ./gradlew assembleDebug
```
