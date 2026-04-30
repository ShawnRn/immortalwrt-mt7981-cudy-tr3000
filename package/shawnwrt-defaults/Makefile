include $(TOPDIR)/rules.mk

PKG_NAME:=shawnwrt-defaults
PKG_VERSION:=1
PKG_RELEASE:=2

include $(INCLUDE_DIR)/package.mk

define Package/shawnwrt-defaults
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=Default LAN, hostname and WLAN settings for ShawnWrt
  MAINTAINER:=Shawn Rain
  DEPENDS:=+uci
  PKGARCH:=all
endef

define Package/shawnwrt-defaults/description
  First-boot defaults for the Cudy TR3000 ShawnWrt profile.
endef

define Build/Compile
endef

define Package/shawnwrt-defaults/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-shawnwrt-defaults \
		$(1)/etc/uci-defaults/99-shawnwrt-defaults
	$(INSTALL_DIR) $(1)/etc/opkg/keys
	$(INSTALL_DATA) ./files/etc/opkg/keys/9143bef47f03c381 \
		$(1)/etc/opkg/keys/9143bef47f03c381
endef

$(eval $(call BuildPackage,shawnwrt-defaults))
