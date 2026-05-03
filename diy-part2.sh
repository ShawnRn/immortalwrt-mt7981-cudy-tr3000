#!/bin/bash
#
# File name: diy-part2.sh
# Description: ShawnWrt DIY script part 2 (After Update feeds)
#
# Copyright (c) 2019-2024 P3TERX <https://p3terx.com>
# ShawnWrt customizations maintained by Shawn Rain.
#
# This is free software, licensed under the MIT License.
# See /LICENSE for more information.
#

# Modify default IP
#sed -i 's/192.168.1.1/192.168.50.5/g' package/base-files/files/bin/config_generate

# Modify default theme
#sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile

# Modify hostname
# Hostname is handled by the ShawnWrt defaults package.

# 临时解决Rust问题
sed -i 's/ci-llvm=true/ci-llvm=false/g' feeds/packages/lang/rust/Makefile

# ShawnWrt keeps ttyd out of inherited target defaults. QuickStart is selected
# explicitly in the ShawnWrt configs and may pull ttyd back in as its own
# dependency.
sed -i 's/[[:space:]]luci-app-ttyd[[:space:]]*/ /g' \
  target/linux/mediatek/Makefile
sed -i 's/[[:space:]]+luci-app-ttyd[[:space:]]*/ /g' \
  package/mtk/applications/luci-app-turboacc-mtk/Makefile

# The mt798x tree defaults to luci-light, which pulls uHTTPd. ShawnWrt uses
# luci-nginx/uWSGI on port 80, so remove the default uHTTPd collection.
sed -i '/luci-light/d' include/target.mk
sed -i 's/DEPENDS:=+luci$/DEPENDS:=+luci-nginx/' \
  package/emortal/default-settings/Makefile

# add date in output file name
sed -i -e '/^IMG_PREFIX:=/i BUILD_DATE := $(shell date +%Y%m%d)' \
       -e '/^IMG_PREFIX:=/ s/\($(SUBTARGET)\)/\1-$(BUILD_DATE)/' include/image.mk

# Add the dedicated TR3000 512MB/NMBM target used with the multi-layout U-Boot.
MOD_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")" && pwd)}"
cat "$MOD_ROOT/openwrt-mod/cudy-tr3000-512.mk" >> \
  target/linux/mediatek/image/filogic.mk
cp "$MOD_ROOT/openwrt-mod/mt7981b-cudy-tr3000-512mb-v1.dts" \
  target/linux/mediatek/dts/
