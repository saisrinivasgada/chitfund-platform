#!/usr/bin/env bash
set -euo pipefail

# Expo SDK 54 / React Native 0.81 requires this NDK. Keep Gradle's first
# configuration from depending on one potentially corrupt SDK archive download.
qa_ndk_revision="27.1.12297006"
qa_sdk_root="${ANDROID_HOME:?ANDROID_HOME is required}"
qa_log_dir="${RUNNER_TEMP:?RUNNER_TEMP is required}"
qa_ndk_dir="$qa_sdk_root/ndk/$qa_ndk_revision"
qa_sdk_manager="$qa_sdk_root/cmdline-tools/latest/bin/sdkmanager"

valid_ndk() {
  [[ -f "$qa_ndk_dir/source.properties" ]] &&
    grep -Fxq "Pkg.Revision = $qa_ndk_revision" "$qa_ndk_dir/source.properties" &&
    [[ -x "$qa_ndk_dir/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" ]]
}

if valid_ndk; then
  echo "Using verified Android NDK $qa_ndk_revision"
  exit 0
fi

for qa_attempt in 1 2 3; do
  echo "Installing Android NDK $qa_ndk_revision (attempt $qa_attempt of 3)"
  # This script runs on a disposable CI runner, before Gradle starts. Remove
  # incomplete toolchain files and SDK download staging, not source/build files.
  rm -rf "$qa_ndk_dir" "$qa_sdk_root/.temp"
  if "$qa_sdk_manager" "ndk;$qa_ndk_revision" > "$qa_log_dir/chitwise-ndk-install-$qa_attempt.log" 2>&1 && valid_ndk; then
    echo "Android NDK installation verified"
    exit 0
  fi
  cat "$qa_log_dir/chitwise-ndk-install-$qa_attempt.log"
done

echo "Android NDK installation failed after 3 attempts" >&2
exit 1
