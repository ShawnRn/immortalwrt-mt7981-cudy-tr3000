#!/bin/bash
#
# https://github.com/P3TERX/Actions-OpenWrt
# File name: diy-part2.sh
# Description: OpenWrt DIY script part 2 (After Update feeds)
#
# Copyright (c) 2019-2024 P3TERX <https://p3terx.com>
#
# This is free software, licensed under the MIT License.
# See /LICENSE for more information.
#

# Modify default IP
#sed -i 's/192.168.1.1/192.168.50.5/g' package/base-files/files/bin/config_generate

# Modify default theme
#sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile

# Modify hostname
#sed -i 's/OpenWrt/P3TERX-Router/g' package/base-files/files/bin/config_generate

# 临时解决Rust问题
sed -i 's/ci-llvm=true/ci-llvm=false/g' feeds/packages/lang/rust/Makefile

# add date in output file name
sed -i -e '/^IMG_PREFIX:=/i BUILD_DATE := $(shell date +%Y%m%d)' \
       -e '/^IMG_PREFIX:=/ s/\($(SUBTARGET)\)/\1-$(BUILD_DATE)/' include/image.mk

# Adapt Cudy TR3000 SN2544 / 512MB flash for the ubootmod/FIT layout.
# /proc/mtd on the target device reports:
#   mtd5 "ubi": offset 0x5c0000, size 0x1da40000
sed -i 's/reg = <0x5c0000 0x7000000>;/reg = <0x5c0000 0x1da40000>;/' \
  target/linux/mediatek/dts/mt7981b-cudy-tr3000-v1-ubootmod.dts

grep -q 'reg = <0x5c0000 0x1da40000>;' \
  target/linux/mediatek/dts/mt7981b-cudy-tr3000-v1-ubootmod.dts
