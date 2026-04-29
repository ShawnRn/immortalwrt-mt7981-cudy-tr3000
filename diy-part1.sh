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

# Uncomment a feed source
#sed -i 's/^#\(.*helloworld\)/\1/' feeds.conf.default

# Add a feed source
#echo 'src-git helloworld https://github.com/fw876/helloworld' >>feeds.conf.default
#echo 'src-git passwall https://github.com/xiaorouji/openwrt-passwall' >>feeds.conf.default

# MosDNS upstream is a full OpenWrt feed. Do not clone it under package/.
# Current mosdns requires Go 1.24+, so use sbwml's matching golang feed
# before the standard packages feed and let the mosdns feed own the core too.
rm -rf package/luci-app-mosdns
awk '
  /^src-git golang / || /^src-git mosdns / { next }
  /^src-git packages / && !added {
    print "src-git golang https://github.com/sbwml/packages_lang_golang.git;24.x"
    print "src-git mosdns https://github.com/sbwml/luci-app-mosdns;v5"
    added = 1
  }
  { print }
  END {
    if (!added) {
      print "src-git golang https://github.com/sbwml/packages_lang_golang.git;24.x"
      print "src-git mosdns https://github.com/sbwml/luci-app-mosdns;v5"
    }
  }
' feeds.conf.default > feeds.conf.default.tmp && mv feeds.conf.default.tmp feeds.conf.default

# Copy custom local packages into OpenWrt tree so they are available during build
for pkg in luci-compat-keep minieap-gdufs luci-proto-minieap luci-i18n-minieap-zh-cn shawnwrt-defaults shawnwrt-ota luci-app-shawnwrt-ota; do
  if [ -d "$GITHUB_WORKSPACE/package/$pkg" ]; then
    mkdir -p package
    rm -rf "package/$pkg"
    cp -r "$GITHUB_WORKSPACE/package/$pkg" package/
  fi
done

git clone https://github.com/eamonxg/luci-theme-aurora package/luci-theme-aurora
patch -d package/luci-theme-aurora -p1 < "$GITHUB_WORKSPACE/patches/luci-theme-aurora-login-perf.patch"
git clone https://github.com/eamonxg/luci-app-aurora-config package/luci-app-aurora-config
git clone https://github.com/timsaya/luci-app-bandix package/luci-app-bandix
git clone https://github.com/timsaya/openwrt-bandix package/openwrt-bandix
