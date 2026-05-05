#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
OPENWRT_URL="${OPENWRT_URL:-https://github.com/padavanonly/immortalwrt-mt798x-6.6}"
OPENWRT_BRANCH="${OPENWRT_BRANCH:-openwrt-24.10-6.6}"
IMAGE_BASE="${IMAGE_BASE:-shawnwrt-openwrt-builder:24.04}"
IMAGE="${IMAGE:-shawnwrt-openwrt-builder:24.04-go}"
VOLUME="${VOLUME:-shawnwrt_local_openwrt_24_10}"
DL_VOLUME="${DL_VOLUME:-shawnwrt_local_dl}"
CCACHE_VOLUME="${CCACHE_VOLUME:-shawnwrt_local_ccache}"
COLIMA_CPU="${COLIMA_CPU:-$(sysctl -n hw.ncpu 2>/dev/null || echo 8)}"
COLIMA_MEMORY="${COLIMA_MEMORY:-10}"
COLIMA_DISK="${COLIMA_DISK:-160}"
AUTO_INSTALL="${AUTO_INSTALL:-0}"

case "$TARGET" in
  512m|360t7|all|clean|doctor) ;;
  *)
    echo "Usage: $0 [512m|360t7|all|doctor|clean]" >&2
    exit 2
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifacts_dir="$repo_root/artifacts/local-builds"

have() {
  command -v "$1" >/dev/null 2>&1
}

need() {
  if have "$1"; then
    return 0
  fi

  if [[ "$AUTO_INSTALL" == "1" && "$1" != "brew" ]]; then
    brew install "$1"
    return 0
  fi

  echo "Missing dependency: $1" >&2
  if [[ "$1" == "brew" ]]; then
    echo "Install Homebrew first: https://brew.sh" >&2
  else
    echo "Install it with: brew install $1" >&2
    echo "Or rerun with AUTO_INSTALL=1 to let this script install Homebrew packages." >&2
  fi
  exit 1
}

ensure_deps() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This helper is intended for macOS. Use GitHub Actions or a Linux builder on other systems." >&2
    exit 1
  fi

  need brew
  need colima
  need docker
  need git
  need rsync
}

start_colima() {
  if colima status >/dev/null 2>&1; then
    return 0
  fi

  colima start \
    --cpu "$COLIMA_CPU" \
    --memory "$COLIMA_MEMORY" \
    --disk "$COLIMA_DISK" \
    --vm-type=vz
}

build_images() {
  docker image inspect "$IMAGE_BASE" >/dev/null 2>&1 || docker build -t "$IMAGE_BASE" - <<'DOCKER'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential clang flex bison g++ gawk gcc gettext git libncurses-dev libssl-dev \
    python3 python3-dev python3-distutils-extra python3-pyelftools python3-setuptools \
    rsync unzip zlib1g-dev file wget curl zstd swig time qemu-utils ccache ca-certificates \
    libelf-dev libfuse-dev libglib2.0-dev liblzma-dev libtool autoconf automake patch pkg-config \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1001 builder
USER builder
WORKDIR /work
DOCKER

  docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build --build-arg BASE_IMAGE="$IMAGE_BASE" -t "$IMAGE" - <<'DOCKER'
ARG BASE_IMAGE=shawnwrt-openwrt-builder:24.04
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends golang-go && rm -rf /var/lib/apt/lists/*
USER builder
DOCKER
}

ensure_volumes() {
  docker volume create "$VOLUME" >/dev/null
  docker volume create "$DL_VOLUME" >/dev/null
  docker volume create "$CCACHE_VOLUME" >/dev/null
  docker run --rm --user root \
    -v "$VOLUME:/build" \
    -v "$DL_VOLUME:/dl" \
    -v "$CCACHE_VOLUME:/ccache" \
    "$IMAGE" bash -lc 'chown -R builder:builder /build /dl /ccache'
}

sync_repo_into_volume() {
  docker run --rm \
    -v "$VOLUME:/build" \
    -v "$DL_VOLUME:/dl" \
    -v "$CCACHE_VOLUME:/ccache" \
    -v "$repo_root:/hostrepo:ro" \
    -e CCACHE_DIR=/ccache \
    "$IMAGE" bash -lc "
      set -euo pipefail
      git config --global --add safe.directory '*'
      mkdir -p /build/repo
      rsync -a --delete \
        --exclude=.git/ \
        --exclude=openwrt/ \
        --exclude=artifacts/ \
        --exclude=firmware_collection/ \
        --exclude=tmp/ \
        /hostrepo/ /build/repo/
      if [ ! -d /build/openwrt/.git ]; then
        git clone '$OPENWRT_URL' -b '$OPENWRT_BRANCH' --single-branch --filter=blob:none /build/openwrt
      fi
      cd /build/openwrt
      git fetch --depth=1 origin '$OPENWRT_BRANCH'
      git reset --hard origin/'$OPENWRT_BRANCH'
      rm -rf dl
      ln -s /dl dl
    "
}

ensure_datconf_source() {
  docker run --rm --user root \
    -v "$DL_VOLUME:/dl" \
    "$IMAGE" bash -lc '
      set -euo pipefail
      test -s /dl/datconf-6bb733f7.tar.bz2 && exit 0
      tmp=$(mktemp -d)
      git clone --filter=blob:none --depth=1 https://github.com/padavanonly/gl-mt7981 "$tmp/gl"
      cd "$tmp/gl/package/datconf/src"
      tar -cjf /dl/datconf-6bb733f7.tar.bz2 --transform="s,^,datconf/," .
      rm -rf "$tmp"
      sha256sum /dl/datconf-6bb733f7.tar.bz2
    '
}

build_one() {
  local name="$1"
  local config="$2"
  local pattern="$3"
  local out="$artifacts_dir/$name-$(date +%Y%m%d-%H%M%S)"
  local log="$out/build.log"

  mkdir -p "$out"

  docker run --rm \
    -v "$VOLUME:/build" \
    -v "$DL_VOLUME:/dl" \
    -v "$CCACHE_VOLUME:/ccache" \
    -v "$out:/out" \
    -e CCACHE_DIR=/ccache \
    -e CCACHE_DISABLE=1 \
    -e GITHUB_WORKSPACE=/build/repo \
    "$IMAGE" bash -lc "
      set -euo pipefail
      git config --global --add safe.directory '*'
      cd /build/openwrt
      bash /build/repo/diy-part1.sh
      ./scripts/feeds update -a
      ./scripts/feeds install -a
      bash /build/repo/diy-part2.sh
      BUILD_TIME=\$(date +%Y%m%d-%H%M)
      RELEASE_TAG=\"ImmortalWrt-\$BUILD_TIME\"
      mkdir -p files/etc
      printf '%s\n' \"\$RELEASE_TAG\" > files/etc/shawnwrt_version
      echo \"Injected ShawnWrt version: \$RELEASE_TAG\"
      cp /build/repo/config/$config .config
      sed -i 's|^CONFIG_GOLANG_EXTERNAL_BOOTSTRAP_ROOT=.*|CONFIG_GOLANG_EXTERNAL_BOOTSTRAP_ROOT=\"/usr/lib/go-1.22\"|' .config
      make defconfig
      make -j\$(nproc)
      cd /build/openwrt/bin/targets/mediatek/filogic
      cp -f $pattern *.buildinfo profiles.json sha256sums /out/
    " 2>&1 | tee "$log"

  echo
  echo "Build output: $out"
  find "$out" -maxdepth 1 -type f \( -name '*sysupgrade.bin' -o -name '*.manifest' -o -name 'sha256sums' \) -print
}

doctor() {
  ensure_deps
  start_colima
  docker version
  docker run --rm ubuntu:24.04 uname -a
  echo "OK: local Docker builder prerequisites are ready."
}

clean() {
  echo "Removing Docker volumes:"
  echo "  $VOLUME"
  echo "  $DL_VOLUME"
  echo "  $CCACHE_VOLUME"
  docker volume rm "$VOLUME" "$DL_VOLUME" "$CCACHE_VOLUME" 2>/dev/null || true
}

if [[ "$TARGET" == "doctor" ]]; then
  doctor
  exit 0
fi

if [[ "$TARGET" == "clean" ]]; then
  ensure_deps
  start_colima
  clean
  exit 0
fi

ensure_deps
start_colima
build_images
ensure_volumes
sync_repo_into_volume
ensure_datconf_source

if [[ "$TARGET" == "512m" || "$TARGET" == "all" ]]; then
  build_one "512m-local" "512muboot.config" "immortalwrt-mediatek-filogic-*cudy_tr3000-512mb-v1*"
fi

if [[ "$TARGET" == "360t7" || "$TARGET" == "all" ]]; then
  build_one "360t7-local" "360t7.config" "immortalwrt-mediatek-filogic-*qihoo_360t7*"
fi
