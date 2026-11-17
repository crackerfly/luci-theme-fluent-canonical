#!/bin/sh

set -eu

REPO="LazuliKao/luci-theme-fluent"
RELEASE_TAG="${1:-latest}"
VARIANT="${2:-full}"
case "${VARIANT}" in
   full) PKG_NAME="luci-theme-fluent" ;;
   lite) PKG_NAME="luci-theme-fluent-lite" ;;
   *) echo "Usage: $0 [latest|tag] [full|lite]" >&2; exit 1 ;;
esac
TMP_WORK_DIR=""
PKG_FILE=""
TMP_JSON=""

log() {
   echo "[install.sh] $*"
}

fail() {
   echo "[install.sh] ERROR: $*" >&2
   exit 1
}

need_cmd() {
   command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not found"
}

fetch_file() {
   url="$1"
   dest="$2"
   if command -v uclient-fetch >/dev/null 2>&1; then
      uclient-fetch -q -O "${dest}" "${url}" && return 0
   fi
   if command -v wget >/dev/null 2>&1; then
      wget -qO "${dest}" "${url}" && return 0
   fi
   if command -v curl >/dev/null 2>&1; then
      curl -fsSL --connect-timeout 10 --max-time 60 -o "${dest}" "${url}" && return 0
   fi
   return 1
}

detect_package_manager() {
   if command -v apk >/dev/null 2>&1; then
      PKG_EXT="apk"
      PKG_MGR="apk"
   elif command -v opkg >/dev/null 2>&1; then
      PKG_EXT="ipk"
      PKG_MGR="opkg"
   else
      fail "no supported package manager found (apk/opkg)"
   fi
}

setup_release_source() {
   TMP_BASE="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
   if [ ! -d "${TMP_BASE}" ] || [ ! -w "${TMP_BASE}" ]; then
      TMP_BASE="."
   fi

   TMP_WORK_DIR="$(mktemp -d "${TMP_BASE}/${PKG_NAME}.XXXXXX" 2>/dev/null || mktemp -d -p "${TMP_BASE}" "${PKG_NAME}.XXXXXX")"
   TMP_JSON="${TMP_WORK_DIR}/release.json"

   case "${RELEASE_TAG}" in
      latest)
         API_URL="https://api.github.com/repos/${REPO}/releases/latest"
         ;;
      *)
         API_URL="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}"
         ;;
   esac
}

cleanup() {
   if [ -n "${TMP_WORK_DIR:-}" ] && [ -d "${TMP_WORK_DIR}" ]; then
      rm -rf "${TMP_WORK_DIR}"
   fi
}

fetch_release_metadata() {
   log "Fetching release metadata"
   fetch_file "${API_URL}" "${TMP_JSON}" || fail "failed to fetch release metadata"
}

select_download_url() {
   DOWNLOAD_URL="$(grep -oE '"browser_download_url":[[:space:]]*"[^"]+"' "${TMP_JSON}" \
      | sed -E 's/.*"([^"]+)"/\1/' \
      | grep -E "/${PKG_NAME}(_|-)[^/]*\.${PKG_EXT}$" \
      | head -n 1 || true)"

   [ -n "${DOWNLOAD_URL}" ] || fail "no .${PKG_EXT} asset found for release ${RELEASE_TAG}"
}

download_package() {
   PKG_FILE="${TMP_WORK_DIR}/$(basename "${DOWNLOAD_URL}")"
   log "Downloading $(basename "${PKG_FILE}")"
   fetch_file "${DOWNLOAD_URL}" "${PKG_FILE}" || fail "failed to download package"
   [ -s "${PKG_FILE}" ] || fail "downloaded package is empty"
}

install_package() {
   log "Installing $(basename "${PKG_FILE}")"
   if [ "${PKG_MGR}" = "apk" ]; then
      apk add --allow-untrusted --upgrade "${PKG_FILE}" || fail "apk install failed"
   else
      opkg install "${PKG_FILE}" || fail "opkg install failed"
   fi
   rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/ 2>/dev/null || true
}

if ! command -v uclient-fetch >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1 && ! command -v curl >/dev/null 2>&1; then
   fail "one of uclient-fetch, wget, or curl is required"
fi
need_cmd grep
need_cmd sed
need_cmd head
need_cmd basename
need_cmd mktemp
detect_package_manager
setup_release_source
trap cleanup EXIT INT TERM

log "Detected package manager: ${PKG_MGR} (expecting .${PKG_EXT})"
log "Using release selector: ${RELEASE_TAG} (${VARIANT})"
fetch_release_metadata
select_download_url
download_package
install_package
log "Done"
