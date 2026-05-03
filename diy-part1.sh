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

# Copy custom local packages into OpenWrt tree so they are available during build.
# luci-proto-minieap and luci-i18n-minieap-zh-cn come from the LuCI feed; copying
# local packages with the same names creates duplicate Kconfig symbols.
for pkg in luci-compat-keep minieap-gdufs shawnwrt-defaults shawnwrt-ota luci-app-shawnwrt-ota; do
  if [ -d "$GITHUB_WORKSPACE/package/$pkg" ]; then
    mkdir -p package
    rm -rf "package/$pkg"
    cp -r "$GITHUB_WORKSPACE/package/$pkg" package/
  fi
done

rm -rf package/luci-theme-aurora \
  package/luci-app-aurora-config \
  package/luci-app-bandix \
  package/openwrt-bandix \
  package/luci-proto-minieap \
  package/luci-i18n-minieap-zh-cn

git clone https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
patch -d package/luci-theme-aurora -p1 < "$GITHUB_WORKSPACE/patches/luci-theme-aurora-login-perf.patch"
git clone https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config
git clone https://github.com/timsaya/luci-app-bandix package/luci-app-bandix
git clone https://github.com/timsaya/openwrt-bandix package/openwrt-bandix
