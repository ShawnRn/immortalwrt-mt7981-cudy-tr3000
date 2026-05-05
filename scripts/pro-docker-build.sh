#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
PRO_HOST="${PRO_HOST:-100.103.86.124}"
REMOTE_ROOT="${REMOTE_ROOT:-Builds/shawnwrt-pro-build}"
VOLUME="${VOLUME:-shawnwrt_openwrt_24_10}"
DL_VOLUME="${DL_VOLUME:-shawnwrt_dl}"
CCACHE_VOLUME="${CCACHE_VOLUME:-shawnwrt_ccache}"
IMAGE="${IMAGE:-shawnwrt-openwrt-builder:24.04-go}"
SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
  -o "ProxyCommand=tailscale nc %h %p"
)
RSYNC_SSH='ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ProxyCommand="tailscale nc %h %p"'

case "$TARGET" in
  512m|360t7|all) ;;
  *)
    echo "Usage: $0 [512m|360t7|all]" >&2
    exit 2
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

remote() {
  ssh "${SSH_OPTS[@]}" "$PRO_HOST" "export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:\$PATH; $*"
}

sync_repo() {
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='openwrt/' \
    --exclude='artifacts/' \
    --exclude='firmware_collection/' \
    --exclude='tmp/' \
    -e "$RSYNC_SSH" \
    "$repo_root/" "$PRO_HOST:$REMOTE_ROOT/repo/"
}

ensure_builder() {
  remote "colima status >/dev/null 2>&1 || colima start --cpu 8 --memory 10 --disk 120 --vm-type=vz --mount /Volumes/ShawnWrtBuild:w"
  remote "docker image inspect shawnwrt-openwrt-builder:24.04 >/dev/null 2>&1 || docker build -t shawnwrt-openwrt-builder:24.04 - <<'DOCKER'
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
DOCKER"
  remote "docker image inspect $IMAGE >/dev/null 2>&1 || docker build -t $IMAGE - <<'DOCKER'
FROM shawnwrt-openwrt-builder:24.04
USER root
RUN apt-get update && apt-get install -y --no-install-recommends golang-go && rm -rf /var/lib/apt/lists/*
USER builder
DOCKER"
  remote "docker volume create $VOLUME >/dev/null; docker volume create $DL_VOLUME >/dev/null; docker volume create $CCACHE_VOLUME >/dev/null"
  remote "docker run --rm --user root -v $VOLUME:/build -v $DL_VOLUME:/dl -v $CCACHE_VOLUME:/ccache $IMAGE bash -lc 'chown -R builder:builder /build /dl /ccache'"
}

ensure_remote_tree() {
  remote "test -d /Volumes/ShawnWrtBuild || { echo '/Volumes/ShawnWrtBuild is not mounted on Pro' >&2; exit 1; }"
  remote "LW=/Volumes/ShawnWrtBuild/linux-workdir; mkdir -p \"\$LW/repo\"; rsync -a --delete --exclude=.git/ --exclude=openwrt/ --exclude=artifacts/ --exclude=firmware_collection/ --exclude=tmp/ \"\$HOME/$REMOTE_ROOT/repo/\" \"\$LW/repo/\"; chmod -R a+rwX \"\$LW/repo\""
  remote "LW=/Volumes/ShawnWrtBuild/linux-workdir; docker run --rm -v $VOLUME:/build -v $DL_VOLUME:/dl -v $CCACHE_VOLUME:/ccache -v \"\$LW/repo:/hostrepo:ro\" -e CCACHE_DIR=/ccache $IMAGE bash -lc 'set -euo pipefail; git config --global --add safe.directory \"*\"; mkdir -p /build/repo; rsync -a --delete --exclude=.git/ --exclude=openwrt/ --exclude=artifacts/ --exclude=firmware_collection/ --exclude=tmp/ /hostrepo/ /build/repo/; if [ ! -d /build/openwrt/.git ]; then git clone https://github.com/padavanonly/immortalwrt-mt798x-6.6 -b openwrt-24.10-6.6 --single-branch --filter=blob:none /build/openwrt; fi; cd /build/openwrt; rm -rf dl; ln -s /dl dl'"
}

ensure_datconf_source() {
  remote "docker run --rm --user root -v $DL_VOLUME:/dl $IMAGE bash -lc 'set -euo pipefail; test -s /dl/datconf-6bb733f7.tar.bz2 && exit 0; tmp=\$(mktemp -d); git clone --filter=blob:none --depth=1 https://github.com/padavanonly/gl-mt7981 \"\$tmp/gl\"; cd \"\$tmp/gl/package/datconf/src\"; tar -cjf /dl/datconf-6bb733f7.tar.bz2 --transform=\"s,^,datconf/,\" .; rm -rf \"\$tmp\"; sha256sum /dl/datconf-6bb733f7.tar.bz2'"
}

build_one() {
  local name="$1"
  local config="$2"
  local pattern="$3"

  remote "LW=/Volumes/ShawnWrtBuild/linux-workdir; LOG=\"\$LW/volume-build-$name-\$(date +%Y%m%d-%H%M%S).log\"; docker run --rm -v $VOLUME:/build -v $DL_VOLUME:/dl -v $CCACHE_VOLUME:/ccache -v \"\$LW:/hostout\" -e CCACHE_DIR=/ccache -e CCACHE_DISABLE=1 -e GITHUB_WORKSPACE=/build/repo $IMAGE bash -lc 'set -euo pipefail; git config --global --add safe.directory \"*\"; cd /build/openwrt; bash /build/repo/diy-part1.sh; ./scripts/feeds update -a; ./scripts/feeds install -a; bash /build/repo/diy-part2.sh; BUILD_TIME=\$(date +%Y%m%d-%H%M); RELEASE_TAG=\"ImmortalWrt-\$BUILD_TIME\"; mkdir -p files/etc; printf \"%s\n\" \"\$RELEASE_TAG\" > files/etc/shawnwrt_version; echo \"Injected ShawnWrt version: \$RELEASE_TAG\"; cp /build/repo/config/$config .config; sed -i \"s|^CONFIG_GOLANG_EXTERNAL_BOOTSTRAP_ROOT=.*|CONFIG_GOLANG_EXTERNAL_BOOTSTRAP_ROOT=\\\"/usr/lib/go-1.22\\\"|\" .config; make defconfig; make -j\$(nproc)' 2>&1 | tee \"\$LOG\"; echo \"LOG=\$LOG\""
  remote "LW=/Volumes/ShawnWrtBuild/linux-workdir; OUT=\"\$LW/firmware-$name-\$(date +%Y%m%d-%H%M%S)\"; mkdir -p \"\$OUT\"; docker run --rm -v $VOLUME:/build -v \"\$OUT:/out\" $IMAGE bash -lc 'set -euo pipefail; cd /build/openwrt/bin/targets/mediatek/filogic; cp -f $pattern *.buildinfo profiles.json sha256sums /out/'; echo \"OUT=\$OUT\"; ls -lh \"\$OUT\""
}

sync_repo
ensure_builder
ensure_remote_tree
ensure_datconf_source

if [[ "$TARGET" == "512m" || "$TARGET" == "all" ]]; then
  build_one "512m-pro" "512muboot.config" "immortalwrt-mediatek-filogic-*cudy_tr3000-512mb-v1*"
fi

if [[ "$TARGET" == "360t7" || "$TARGET" == "all" ]]; then
  build_one "360t7-pro" "360t7.config" "immortalwrt-mediatek-filogic-*qihoo_360t7*"
fi
