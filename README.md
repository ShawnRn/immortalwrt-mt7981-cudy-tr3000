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
- MiniEAP GDUFS packages
- LuCI Aurora theme/config
- Bandix
- TurboACC MTK
- LuCI on Nginx/uWSGI for both TR3000 512MB and 360T7
- UPnP, watchcat, DDNS, ksmbd, htop, jq and other daily admin tools

`SmartDNS`, LuCI SmartDNS, MosDNS, LuCI MosDNS, `ttyd`, `luci-app-ttyd`, and
`luci-app-diskman` are intentionally excluded. SSH covers terminal access, and
removing DiskMan avoids a slow optional compile path that is not important for
this router profile.

## OTA

ShawnWrt includes a small OTA helper and LuCI page:

- CLI: `shawnwrt-ota`
- LuCI: **System -> ShawnWrt OTA**
- Standalone OTA package repo: <https://github.com/ShawnRn/shawnwrt-ota>
- Built-in opkg feed: `src/gz shawnwrt_ota https://raw.githubusercontent.com/ShawnRn/shawnwrt-ota/opkg`

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
