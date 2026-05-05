# ShawnWrt Local Build Guide

This guide explains how to build ShawnWrt firmware locally on any Mac.

The local build path uses Docker through Colima. OpenWrt itself runs inside an
Ubuntu 24.04 Linux container, and the full OpenWrt build tree lives in Docker
named volumes. Only final firmware artifacts are copied back to the repo.

That design is intentional: building OpenWrt directly on macOS or on a
macOS-mounted Docker directory can fail on filesystem semantics, timestamps,
permissions, Go bootstrap, or package patching.

## What You Can Build

The local script supports the same two daily-use targets as GitHub Actions:

| Target | Device | Output keyword |
|---|---|---|
| `512m` | Cudy TR3000 512MB v1 | `cudy_tr3000-512mb-v1` |
| `360t7` | Qihoo 360T7 stock layout | `qihoo_360t7` |
| `all` | Both devices | both keywords |

## Requirements

Recommended Mac:

- Apple Silicon Mac with at least 16 GB memory, or a recent Intel Mac.
- At least 120 GB free disk space. 160 GB is more comfortable.
- Stable network access. The first build downloads a lot of source packages.

Required software:

- Homebrew
- Colima
- Docker CLI
- Git
- rsync

Install Homebrew if needed:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Install build dependencies:

```sh
brew install colima docker git rsync
```

## Fresh Mac Quick Start

Clone the firmware repo:

```sh
mkdir -p ~/Builds
cd ~/Builds
git clone https://github.com/ShawnRn/immortalwrt-mt7981-cudy-tr3000.git
cd immortalwrt-mt7981-cudy-tr3000
```

Run a preflight check:

```sh
./scripts/local-docker-build.sh doctor
```

Build both routers:

```sh
./scripts/local-docker-build.sh all
```

Build only TR3000 512MB:

```sh
./scripts/local-docker-build.sh 512m
```

Build only 360T7:

```sh
./scripts/local-docker-build.sh 360t7
```

## Output Location

Artifacts are written to:

```text
artifacts/local-builds/
```

Example output directories:

```text
artifacts/local-builds/512m-local-20260501-010000/
artifacts/local-builds/360t7-local-20260501-013000/
```

Inside each output directory, use the sysupgrade image:

```text
immortalwrt-mediatek-filogic-YYYYMMDD-cudy_tr3000-512mb-v1-squashfs-sysupgrade.bin
immortalwrt-mediatek-filogic-YYYYMMDD-qihoo_360t7-squashfs-sysupgrade.bin
```

The directory also contains:

- `sha256sums`
- device manifest
- `config.buildinfo`
- `feeds.buildinfo`
- `version.buildinfo`
- `profiles.json`
- `build.log`

## What The Script Does

`scripts/local-docker-build.sh` performs the whole build pipeline:

1. Checks macOS dependencies.
2. Starts Colima if it is not already running.
3. Builds a reusable Ubuntu 24.04 OpenWrt builder image.
4. Builds a second image with Ubuntu's Go toolchain for arm64 Go bootstrap.
5. Creates Docker named volumes for:
   - OpenWrt source/build tree
   - OpenWrt `dl` downloads
   - ccache storage
6. Copies this repo into the Docker build volume.
7. Clones `padavanonly/immortalwrt-mt798x-6.6` branch `openwrt-24.10-6.6`.
8. Pre-warms the MTK `datconf-6bb733f7.tar.bz2` source package.
9. Runs:
   - `diy-part1.sh`
   - `./scripts/feeds update -a`
   - `./scripts/feeds install -a`
   - `diy-part2.sh`
   - target config copy
   - `make defconfig`
   - `make -j$(nproc)`
10. Copies final sysupgrade images and metadata back to `artifacts/local-builds/`.

## Why Docker Named Volumes

Do not put the full OpenWrt build tree on a normal macOS directory and bind it
into Docker. During testing, that path hit failures such as:

- package patch temp-file permission errors
- `tar` / `utime` operation failures
- ccache permission oddities
- Go bootstrap problems on macOS arm64

The script uses Docker named volumes instead:

```text
shawnwrt_local_openwrt_24_10
shawnwrt_local_dl
shawnwrt_local_ccache
```

These volumes live inside Colima's Linux VM, so OpenWrt sees a real Linux
filesystem.

## Useful Environment Variables

Tune Colima resources:

```sh
COLIMA_CPU=10 COLIMA_MEMORY=14 COLIMA_DISK=220 ./scripts/local-docker-build.sh all
```

Automatically install missing Homebrew packages:

```sh
AUTO_INSTALL=1 ./scripts/local-docker-build.sh doctor
```

Use custom Docker volume names:

```sh
VOLUME=shawnwrt_test_openwrt DL_VOLUME=shawnwrt_test_dl CCACHE_VOLUME=shawnwrt_test_ccache \
  ./scripts/local-docker-build.sh 512m
```

Use a different OpenWrt source branch:

```sh
OPENWRT_BRANCH=openwrt-24.10-6.6 ./scripts/local-docker-build.sh all
```

## Updating And Rebuilding

Pull the latest ShawnWrt repo changes:

```sh
git pull
```

Then rebuild:

```sh
./scripts/local-docker-build.sh all
```

The script resets the OpenWrt source tree inside Docker to the configured
upstream branch before each build, then reapplies this repo's scripts and
packages.

## Cleaning Local Build Cache

To remove the Docker build volumes:

```sh
./scripts/local-docker-build.sh clean
```

This deletes the OpenWrt build tree, downloaded source cache, and ccache volume.
The next build will be a full fresh build again.

To remove output artifacts only:

```sh
rm -rf artifacts/local-builds
```

## Expected Build Time

First build on an Apple Silicon Mac can take a long time because it compiles:

- OpenWrt host tools
- Go host toolchain pieces
- Rust/LLVM host toolchain pieces
- Linux kernel and MTK Wi-Fi packages
- LuCI, OpenClash, Nginx/uWSGI, Tailscale, and other selected packages

After the first successful build, Docker volumes allow later builds to reuse
downloads and compiled state. Building the second target after the first target
is much faster than a cold build.

## Common Problems

### `Missing dependency: colima` or `docker`

Install dependencies:

```sh
brew install colima docker
```

Or let the script install Homebrew packages:

```sh
AUTO_INSTALL=1 ./scripts/local-docker-build.sh doctor
```

### Colima Runs Out Of Disk

Increase the VM disk size before building:

```sh
colima stop
colima delete
COLIMA_DISK=220 ./scripts/local-docker-build.sh doctor
```

Then rebuild.

### `datconf-6bb733f7.tar.bz2` Missing

The script handles this automatically by packaging compatible source from:

```text
padavanonly/gl-mt7981/package/datconf/src
```

If the network was interrupted, run the same build command again.

### Go Bootstrap Fails

The script injects:

```text
CONFIG_GOLANG_EXTERNAL_BOOTSTRAP_ROOT="/usr/lib/go-1.22"
```

inside the Docker build only. Do not add this path to GitHub Actions configs,
because GitHub runners may have different toolchain paths.

### Build Fails Midway

Keep the output directory and inspect:

```text
artifacts/local-builds/<target-timestamp>/build.log
```

Then rerun the same command. OpenWrt normally resumes from the latest compiled
state inside Docker volumes.

## Flashing Reminder

Use only the sysupgrade image that matches the device:

| Device | File keyword |
|---|---|
| Cudy TR3000 512MB v1 | `cudy_tr3000-512mb-v1` |
| Qihoo 360T7 | `qihoo_360t7` |

Do not cross-flash images between devices or partition layouts.
