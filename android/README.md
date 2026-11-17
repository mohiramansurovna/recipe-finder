# Recipe Graph Android client

This Android application is a native Kotlin/Jetpack Compose client for the Recipe Graph API. It follows the product requirements in `docs/prd.md` and the implementation artifact in `../_bmad-output/implementation-artifacts/spec-android-figma-client.md`.

## Layout

- `android/` — Android project root
- `android/app/` — application module
- `android/app/src/main/...` — Compose UI, API client, and data models

## Local configuration

The local development API defaults to `http://10.0.2.2:8080` for the Android emulator. Override it at build time:

```sh
./gradlew assembleDebug -PapiBaseUrl=http://10.0.2.2:8080
```

Use an `https://` URL for the demo build. Cleartext traffic is allowed only for `10.0.2.2` and `localhost`; public demo builds must use synthetic disposable accounts only and must not contain personal data.

## Features included

- Registration, verification, and resend flows
- Sign-in with Keystore-encrypted token storage, session restore, one-time refresh on expired sessions, sign-out, and account deletion with confirmation
- Ingredient parsing and correction before search
- Ranked recipe search with pagination and cursor reuse
- Recipe detail, anonymous ratings, personal ratings (1-5), and favorites against the account API
- Device-local theme preference storage
- Clear loading, validation, empty, unavailable, and not-found states
- Accessibility labels and responsive 360 dp-safe layout behavior

## Run

The Android toolchain (JDK 17, SDK, emulator) is installed on Windows, not in WSL: WSL's default memory cap is too small for Gradle plus an emulator alongside Docker and Neo4j. The backend still runs in WSL/Docker; the Windows emulator reaches it at `http://10.0.2.2:8080` through WSL's localhost forwarding. Gradle on a `\\wsl$` path is slow, so build from a Windows-side copy of `android/` (for example `robocopy <repo>\android C:\dev\recipe-finder-android /MIR /XD build .gradle /XF local.properties`) and keep git in WSL. Target is Android 13 (minSdk 33).

After installing the Android SDK and Java 17+, run:

```bash
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

With an emulator or device attached, run the Compose navigation tests:

```bash
./gradlew connectedDebugAndroidTest
```

Signed-in screens are only reachable with a real session from `POST /api/accounts/sign-in`; the app never simulates a session or success. Tokens are stored encrypted with an Android Keystore key and are cleared when refresh is rejected, on sign-out, and on account deletion. Use synthetic disposable accounts only.
