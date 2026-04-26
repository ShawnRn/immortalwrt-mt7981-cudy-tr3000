include $(TOPDIR)/rules.mk

PKG_NAME:=luci-proto-minieap
PKG_VERSION:=2.1
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-proto-minieap
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=Protocols
  TITLE:=LuCI support for MiniEAP
  DEPENDS:=+minieap-gdufs +luci-base +luci-lua-runtime
  PKGARCH:=all
endef

define Package/luci-proto-minieap/description
  LuCI protocol support for MiniEAP.
endef

define Build/Compile
endef

define Package/luci-proto-minieap/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi/admin_network
	$(INSTALL_DATA) ./files/usr/lib/lua/luci/model/cbi/admin_network/proto_minieap.lua \
		$(1)/usr/lib/lua/luci/model/cbi/admin_network/proto_minieap.lua
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/network
	$(INSTALL_DATA) ./files/usr/lib/lua/luci/model/network/proto_minieap.lua \
		$(1)/usr/lib/lua/luci/model/network/proto_minieap.lua
	$(INSTALL_DIR) $(1)/www/luci-static/resources/protocol
	$(INSTALL_DATA) ./files/www/luci-static/resources/protocol/minieap.js \
		$(1)/www/luci-static/resources/protocol/minieap.js
endef

$(eval $(call BuildPackage,luci-proto-minieap))
