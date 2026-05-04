# ShawnWrt Firmware Builder

ShawnWrt is a personal ImmortalWrt firmware build project maintained by **Shawn Rain**.

It currently targets:

- **Cudy TR3000 512MB v1** with the SN2544/new-flash 512MiB NAND layout and `mod-490m` U-Boot partition strategy.
- **Qihoo 360T7** with its original stock layout.

The firmware is built automatically with GitHub Actions from:

- ImmortalWrt source: <https://github.com/padavanonly/immortalwrt-mt798x-6.6>
- Branch: `openwrt-24.10-6.6`

## Build Profiles

Use the **ShawnWrt Firmware Builder** workflow.

Recommended profile:

```text
Device: ShawnRouters
```

`ShawnRouters` builds both daily-use targets:

| Workflow option | Device | Output image keyword |
|---|---|---|
| `512M-Mod490` | Cudy TR3000 512MB v1 | `cudy_tr3000-512mb-v1` |
| `360T7-Stock` | Qihoo 360T7 | `qihoo_360t7` |

The weekly scheduled build runs every Monday at 04:00 Asia/Shanghai and builds `ShawnRouters`. The update checker runs shortly after and triggers another `ShawnRouters` build only when the upstream ImmortalWrt source changes.

## Local Mac Builds

You can also build on any Mac with Docker/Colima:

```sh
./scripts/local-docker-build.sh doctor
./scripts/local-docker-build.sh all
```

Single-device builds:

```sh
./scripts/local-docker-build.sh 512m
./scripts/local-docker-build.sh 360t7
```

The local builder keeps the OpenWrt tree inside Docker named volumes and copies
only final firmware artifacts to `artifacts/local-builds/`. See
[`LOCAL_BUILD.md`](LOCAL_BUILD.md) for a full first-run guide, dependency setup,
cache cleanup, and troubleshooting.

## TR3000 512MB Layout

The current Cudy TR3000 unit uses the SN2544/new-flash 512MiB NAND layout:

| MTD | Name | Size |
|---|---|---|
| `mtd0` | `BL2` | `0x00100000` |
| `mtd1` | `u-boot-env` | `0x00080000` |
| `mtd2` | `Factory` | `0x00200000` |
| `mtd3` | `bdinfo` | `0x00040000` |
| `mtd4` | `FIP` | `0x00200000` |
| `mtd5` | `ubi` | starts at `0x5c0000` |

For this unit, ShawnWrt favors the fixed-parts multi-layout U-Boot flow. The matching U-Boot WebUI layout is `mod-490m`, with `501760k(ubi)`.

Do not reuse another router's `Factory` or `bdinfo` backup on this device.

## Included Defaults

The ShawnWrt images include first-boot defaults for the dorm/router profile:

- Hostname: `ShawnWrt`
- LAN IP: `192.168.10.1`
- LAN domain: `shawnwrt.lan`
- Wi-Fi SSID: `Everyday is Holiday.`
- OpenClash
- MiniEAP GDUFS package
- LuCI Aurora theme/config
- ShawnWrt QuickStart homepage bundled from source
- TurboACC MTK
- LuCI on Nginx/uWSGI for both TR3000 512MB and 360T7
- LuCI status channel analysis from ImmortalWrt's `luci-mod-status`
- UPnP, watchcat, DDNS, ksmbd, htop, jq and other daily admin tools

`SmartDNS`, LuCI SmartDNS, MosDNS, LuCI MosDNS, and `luci-app-diskman` are
intentionally excluded from the compile-time image. QuickStart needs `ttyd`, so
`ttyd`, `luci-app-ttyd`, and `luci-i18n-ttyd-zh-cn` are bundled by default.

QuickStart is bundled as the local `luci-app-shawnwrt-quickstart` source
package from ShawnWrt Packages. It keeps only the homepage, removes iStore,
NetworkGuide, NAS, RAID, quickwifi, and online installer dependencies, and
ships a small local status API for the dashboard. The status API includes
`cpuTemperature`, reading CPU thermal zones first and falling back to
`ubus call luci getTempInfo`, otherwise QuickStart shows 0 C.

MiniEAP should use the local `minieap-gdufs` package only. Do not also select
feed `luci-proto-minieap` or `luci-i18n-minieap-zh-cn`, because those packages
install the same netifd protocol scripts and fail during rootfs package install.

## OTA

ShawnWrt includes a small OTA helper and LuCI page:

- CLI: `shawnwrt-ota`
- LuCI: **System -> ShawnWrt OTA**
- Standalone ShawnWrt Packages repo: <https://github.com/ShawnRn/shawnwrt-packages>
- Built-in opkg feed: `src/gz shawnwrt_packages https://raw.githubusercontent.com/ShawnRn/shawnwrt-packages/opkg`
- Built-in third-party package feed: `src/gz kiddin9 https://dl.openwrt.ai/releases/24.10/packages/aarch64_cortex-a53/kiddin9`

The OTA helper:

- Detects the local board.
- Finds the matching sysupgrade image from this repo's latest GitHub Release.
- Verifies the GitHub SHA256 digest.
- Runs `sysupgrade -T` before installation.
- Records the installed release tag so the LuCI page can clearly show `Already up to date` or `Update available`.

Useful commands:

```sh
shawnwrt-ota status
shawnwrt-ota test
shawnwrt-ota install
```

`install` preserves configuration and reboots the router.

## Release Assets

Release assets are sysupgrade images. Pick the file by device keyword:

| Device | File contains |
|---|---|
| Cudy TR3000 512MB v1 | `cudy_tr3000-512mb-v1` |
| Qihoo 360T7 | `qihoo_360t7` |

## U-Boot

The U-Boot workflow is integrated into this firmware builder and builds from Shawn Rain's U-Boot repo:

<https://github.com/ShawnRn/bl-mt798x-dhcpd>

For ShawnWrt TR3000 512MB daily use, keep firmware and U-Boot partition expectations aligned. Mixing unrelated U-Boot/FIP layouts and sysupgrade images is the main brick risk.

## USB Power Control

The upstream source enables USB power by default. Reference commit:

<https://github.com/padavanonly/immortalwrt-mt798x-6.6/commit/86356f8a2f796e5808fda25ce3e3bf6b3cc3278e>

Disable USB power:

```sh
echo 0 > /sys/class/gpio/modem_power/value
```

Enable USB power:

```sh
echo 1 > /sys/class/gpio/modem_power/value
```

## Credits

Maintained by **Shawn Rain** as the ShawnWrt firmware builder.

Based on and/or using work from:

- [padavanonly/immortalwrt-mt798x-6.6](https://github.com/padavanonly/immortalwrt-mt798x-6.6)
- [ShawnRn/bl-mt798x-dhcpd](https://github.com/ShawnRn/bl-mt798x-dhcpd)
- [weekdaycare/immortalwrt-mt7981-cudy-tr3000](https://github.com/weekdaycare/immortalwrt-mt7981-cudy-tr3000)
- [weekdaycare/bl-mt798x-dhcpd](https://github.com/weekdaycare/bl-mt798x-dhcpd)
- [hanwckf/bl-mt798x](https://github.com/hanwckf/bl-mt798x)
- [P3TERX/Actions-OpenWrt](https://github.com/P3TERX/Actions-OpenWrt)
- [OpenWrt](https://github.com/openwrt/openwrt)
- [ImmortalWrt](https://github.com/immortalwrt/immortalwrt)
- [GitHub Actions](https://github.com/features/actions)

## License

This repository keeps the upstream MIT-style GitHub Actions/OpenWrt build workflow lineage and project credits. ShawnWrt customizations are maintained by **Shawn Rain**.
