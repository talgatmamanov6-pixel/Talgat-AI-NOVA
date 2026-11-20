# Talgat AI Android 2.1

Personal installable Android build, Android 7.0+ (including Samsung Android 13).
The app opens https://talgat-ai.netlify.app over HTTPS. AI, voice, image generation
and server exports require internet and the existing hosted service. No model or
API secret is embedded in the APK.

Features: launcher icon, keyboard-safe layout, microphone permission requested
when recording, Android document picker for uploads, Save As for generated blobs,
ZIP/Office/text/image outputs up to 12 MB, and native print/PDF dialog. The file
bridge accepts messages only from the exact service origin and main frame.
External links open outside the app. TLS errors are never bypassed.

Build: JDK 17, Gradle 8.9, Android SDK 35:
`gradle testDebugUnitTest lintDebug assembleDebug`
`gradle connectedDebugAndroidTest` with an Android emulator.

The downloadable personal/test APK uses Android debug signing. It is not a Play
Store release. A future build signed by a different key cannot replace an already
installed version; preserve the signing key for stable updates. App data is local
to this app and is not imported automatically from Chrome. Uninstalling clears it.

The workflow records unit tests, lint, emulator live-page/microphone/file-dialog
checks, signature verification and SHA-256. Emulator checks do not replace a test
on the user's physical phone or prove live microphone quality.
