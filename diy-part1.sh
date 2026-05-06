#!/bin/bash
#
# File name: diy-part1.sh
# Description: ShawnWrt DIY script part 1 (Before Update feeds)
#
# Copyright (c) 2019-2024 P3TERX <https://p3terx.com>
# ShawnWrt customizations maintained by Shawn Rain.
#
# This is free software, licensed under the MIT License.
# See /LICENSE for more information.
#
set -euo pipefail

# Uncomment a feed source
#sed -i 's/^#\(.*helloworld\)/\1/' feeds.conf.default

# Add a feed source
#echo 'src-git helloworld https://github.com/fw876/helloworld' >>feeds.conf.default
#echo 'src-git passwall https://github.com/xiaorouji/openwrt-passwall' >>feeds.conf.default

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE must point to the firmware repo root}"

# ─ ShawnWrt packages from the canonical packages repository ──
# All ShawnWrt plugins (channel-analysis, ota, index) live in
# ShawnRn/shawnwrt-packages. The firmware build clones the main
# branch and copies the OpenWrt packages out of it.
PKG_REPO="https://github.com/ShawnRn/shawnwrt-packages.git"
PKG_BRANCH="main"
PKG_TMP="$(mktemp -d)"

cleanup_pkg() { rm -rf "$PKG_TMP"; }
trap cleanup_pkg EXIT

git clone -q --depth 1 -b "$PKG_BRANCH" "$PKG_REPO" "$PKG_TMP"

for pkg in \
  shawnwrt-ota \
  luci-app-shawnwrt-ota \
  luci-app-shawnwrt-channel-analysis \
  luci-app-shawnwrt-index; do
  if [ -d "$PKG_TMP/openwrt/$pkg" ]; then
    mkdir -p package
    rm -rf "package/$pkg"
    cp -r "$PKG_TMP/openwrt/$pkg" "package/$pkg"
  fi
done

# ── Firmware-local packages (not in ShawnWrt-Packages) ──
# These are firmware-specific and maintained only in the firmware repo.
for pkg in \
  luci-compat-keep \
  luci-proto-minieap \
  luci-i18n-minieap-zh-cn \
  minieap-gdufs \
  shawnwrt-defaults \
  luci-app-shawnwrt-quickstart; do
  if [ -d "$GITHUB_WORKSPACE/package/$pkg" ]; then
    mkdir -p package
    rm -rf "package/$pkg"
    cp -r "$GITHUB_WORKSPACE/package/$pkg" package/
  fi
done

rm -rf package/luci-theme-aurora \
  package/luci-app-aurora-config

git clone https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
patch -d package/luci-theme-aurora -p1 < "$GITHUB_WORKSPACE/patches/luci-theme-aurora-login-perf.patch"
git clone https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config
