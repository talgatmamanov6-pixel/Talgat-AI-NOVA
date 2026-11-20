#!/usr/bin/env bash
set -euo pipefail
collect_proof() {
 mkdir -p android-proof
 adb pull /sdcard/Download/talgat-proof android-proof/ || true
 adb shell screencap -p /sdcard/android-final.png || true
 adb pull /sdcard/android-final.png android-proof/ || true
}
trap collect_proof EXIT
gradle --no-daemon connectedDebugAndroidTest
