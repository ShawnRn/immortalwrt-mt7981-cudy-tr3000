include $(TOPDIR)/rules.mk

PKG_NAME:=minieap-gdufs
PKG_VERSION:=0.93
PKG_RELEASE:=6

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/jimlee2048/minieap-gdufs.git
PKG_SOURCE_VERSION:=bfac72bcff636904a2d7c470cb12d4ff26c180f2
PKG_MIRROR_HASH:=skip

include $(INCLUDE_DIR)/package.mk

define Build/Prepare
	$(call Build/Prepare/Default)
	grep -q 'minieap_init_func\.lds' $(PKG_BUILD_DIR)/Makefile || \
		$(SED) '/^COMMON_LDFLAGS :=/a COMMON_LDFLAGS += -T minieap_init_func.lds' \
			$(PKG_BUILD_DIR)/Makefile
endef

define Package/minieap-gdufs
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Extensible 802.1x client with GDUFS/Ruijie plugin
  DEPENDS:=@TARGET_mediatek_filogic +libc
  PROVIDES:=minieap
endef

define Package/minieap-gdufs/description
  MiniEAP client and netifd protocol scripts for GDUFS/Ruijie 802.1x.
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR) \
		CC="$(TARGET_CC)" \
		CUSTOM_CFLAGS="$(TARGET_CFLAGS) $(TARGET_CPPFLAGS)" \
		CUSTOM_LDFLAGS="$(TARGET_LDFLAGS)" \
		ENABLE_ICONV=false \
		ENABLE_GBCONV=false \
		LIBICONV_STANDALONE=false \
		minieap
endef

define Package/minieap-gdufs/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/minieap $(1)/usr/sbin/minieap
	$(INSTALL_DIR) $(1)/lib/netifd $(1)/lib/netifd/proto
	$(INSTALL_BIN) ./files/lib/netifd/minieap.script $(1)/lib/netifd/minieap.script
	$(INSTALL_BIN) ./files/lib/netifd/proto/minieap.sh $(1)/lib/netifd/proto/minieap.sh
endef

$(eval $(call BuildPackage,minieap-gdufs))
