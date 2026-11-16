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
- Sign-in gate that blocks signed-in flows when the session API is unavailable
- Ingredient parsing and correction before search
- Ranked recipe search with pagination and cursor reuse
- Recipe detail, anonymous ratings, and favorites actions that report unavailable backend routes clearly
- Device-local theme preference storage
- Clear loading, validation, empty, unavailable, and not-found states
- Accessibility labels and responsive 360 dp-safe layout behavior

## Run

After installing the Android SDK and Java 17+, run:

```bash
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

With an emulator or device attached, run the Compose navigation tests:

```bash
./gradlew connectedDebugAndroidTest
```

The project intentionally does not fabricate session or favorite endpoints. Unsupported account actions show an explicit unavailable state rather than a fake success.
