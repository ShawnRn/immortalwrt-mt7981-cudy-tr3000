include $(TOPDIR)/rules.mk

PKG_NAME:=shawnwrt-ota
PKG_VERSION:=1.0.4
PKG_RELEASE:=r1

include $(INCLUDE_DIR)/package.mk

define Package/shawnwrt-ota
  SECTION:=admin
  CATEGORY:=Administration
  TITLE:=ShawnWrt OTA updater
  MAINTAINER:=Shawn Rain
  DEPENDS:=+curl +jsonfilter +libubus +busybox
  PKGARCH:=all
endef

define Package/shawnwrt-ota/description
  OTA helper for ShawnWrt TR3000 512MB and Qihoo 360T7 builds.
endef

define Build/Compile
endef

define Package/shawnwrt-ota/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/shawnwrt-ota $(1)/usr/bin/shawnwrt-ota
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-shawnwrt-ota-finalize $(1)/etc/uci-defaults/99-shawnwrt-ota-finalize
endef

$(eval $(call BuildPackage,shawnwrt-ota))
