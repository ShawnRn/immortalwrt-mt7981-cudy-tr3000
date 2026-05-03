include $(TOPDIR)/rules.mk

PKG_NAME:=shawnwrt-quickstart-binary
PKG_VERSION:=0.12.4
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Shawn Rain

include $(INCLUDE_DIR)/package.mk

QUICKSTART_IPK_URLS:= \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/quickstart_0.11.13-r33_aarch64_cortex-a53.ipk \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/luci-app-quickstart_0.12.4-r1-r30_all.ipk \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/luci-app-store_0.1.32-1-r23_all.ipk \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/taskd_1.0.3-r3_all.ipk \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/luci-lib-taskd_1.0.25-r7_all.ipk \
	https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9/luci-lib-xterm_4.18.0-r2_all.ipk \
	https://mirrors.vsean.net/openwrt/releases/24.10-SNAPSHOT/packages/aarch64_cortex-a53/packages/shadow-common_4.8.1-r3_aarch64_cortex-a53.ipk \
	https://mirrors.vsean.net/openwrt/releases/24.10-SNAPSHOT/packages/aarch64_cortex-a53/packages/shadow-useradd_4.8.1-r3_aarch64_cortex-a53.ipk \
	https://mirrors.vsean.net/openwrt/releases/24.10-SNAPSHOT/packages/aarch64_cortex-a53/packages/shadow-utils_4.8.1-r3_aarch64_cortex-a53.ipk

define Package/shawnwrt-quickstart-binary
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=ShawnWrt bundled QuickStart and iStore binaries
  DEPENDS:=+bash +block-mount +coreutils +coreutils-stty +curl +e2fsprogs +ip-full +kmod-md-mod +kmod-md-raid0 +kmod-md-raid1 +kmod-md-raid10 +libuci-lua +lsblk +luci-app-ttyd +luci-i18n-ttyd-zh-cn +luci-lib-ipkg +luci-lua-runtime +mdadm +mount-utils +opkg +parted +script-utils +smartd +smartmontools +tar +ttyd +ubus +uci
  PROVIDES:=quickstart luci-app-quickstart luci-app-store taskd luci-lib-taskd luci-lib-xterm shadow-common shadow-useradd shadow-utils
  PKGARCH:=aarch64_cortex-a53
endef

define Package/shawnwrt-quickstart-binary/description
  Installs the prebuilt kiddin9 QuickStart, LuCI QuickStart, iStore, taskd,
  luci-lib-taskd and luci-lib-xterm package payloads into the firmware image.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)/ipk $(PKG_BUILD_DIR)/root
	for url in $(QUICKSTART_IPK_URLS); do \
		file="$${url##*/}"; \
		wget -O "$(PKG_BUILD_DIR)/ipk/$$file" "$$url"; \
		tar -xzf "$(PKG_BUILD_DIR)/ipk/$$file" -C "$(PKG_BUILD_DIR)/ipk" ./data.tar.gz; \
		tar -xzf "$(PKG_BUILD_DIR)/ipk/data.tar.gz" -C "$(PKG_BUILD_DIR)/root"; \
		rm -f "$(PKG_BUILD_DIR)/ipk/data.tar.gz"; \
	done
endef

define Build/Compile
endef

define Package/shawnwrt-quickstart-binary/install
	$(CP) $(PKG_BUILD_DIR)/root/. $(1)/
endef

$(eval $(call BuildPackage,shawnwrt-quickstart-binary))
