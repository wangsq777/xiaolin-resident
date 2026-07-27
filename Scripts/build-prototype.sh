#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
SDK_PATH="/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk"
CACHE_ROOT="/private/tmp/xiaolin-resident-build"
APP_DIR="${PROJECT_DIR}/dist/小林驻留中.app"

mkdir -p "${CACHE_ROOT}/clang" "${CACHE_ROOT}/swift" "${CACHE_ROOT}/config" "${CACHE_ROOT}/security"

CLANG_MODULE_CACHE_PATH="${CACHE_ROOT}/clang" \
SWIFTPM_MODULECACHE_OVERRIDE="${CACHE_ROOT}/clang" \
SDKROOT="${SDK_PATH}" \
swift build \
    --disable-sandbox \
    --sdk "${SDK_PATH}" \
    --cache-path "${CACHE_ROOT}/swift" \
    --config-path "${CACHE_ROOT}/config" \
    --security-path "${CACHE_ROOT}/security" \
    --package-path "${PROJECT_DIR}"

mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"
cp "${PROJECT_DIR}/.build/arm64-apple-macosx/debug/XiaolinResident" "${APP_DIR}/Contents/MacOS/XiaolinResident"
cp "${PROJECT_DIR}/Support/Prototype-Info.plist" "${APP_DIR}/Contents/Info.plist"

codesign \
    --force \
    --sign - \
    --entitlements "${PROJECT_DIR}/Support/Prototype.entitlements" \
    "${APP_DIR}"

echo "Built ${APP_DIR}"
