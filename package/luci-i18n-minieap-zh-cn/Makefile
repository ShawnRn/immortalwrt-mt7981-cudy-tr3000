include $(TOPDIR)/rules.mk

PKG_NAME:=luci-i18n-minieap-zh-cn
PKG_VERSION:=git-22.012.55164
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-i18n-minieap-zh-cn
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=Translations
  TITLE:=Chinese translation for luci-proto-minieap
  DEPENDS:=+luci-proto-minieap
  PKGARCH:=all
endef

define Package/luci-i18n-minieap-zh-cn/description
  Simplified Chinese translation for LuCI MiniEAP protocol support.
endef

define Build/Compile
endef

define Package/luci-i18n-minieap-zh-cn/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) ./files/usr/lib/lua/luci/i18n/minieap.zh-cn.lmo \
		$(1)/usr/lib/lua/luci/i18n/minieap.zh-cn.lmo
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/luci-i18n-minieap-zh-cn \
		$(1)/etc/uci-defaults/luci-i18n-minieap-zh-cn
endef

$(eval $(call BuildPackage,luci-i18n-minieap-zh-cn))
