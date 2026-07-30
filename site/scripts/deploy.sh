#!/usr/bin/env bash
#
# 官网部署脚本：构建 → 备份线上版本 → 上传 → 替换
#
# 用法：
#   DEPLOY_PASS='<root密码>' bash scripts/deploy.sh
#
# 环境变量：
#   DEPLOY_HOST  服务器地址（默认 47.116.189.8）
#   DEPLOY_USER  登录用户（默认 root）
#   DEPLOY_PASS  登录密码（必填，勿写进仓库）
#   DEPLOY_PATH  站点目录（默认 /var/www/halou/site）
#
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-47.116.189.8}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/halou/site}"
BACKUP_DIR="/var/www/halou/backup"

if [ -z "${DEPLOY_PASS:-}" ]; then
  echo "✗ 请设置 DEPLOY_PASS 环境变量（服务器密码）" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> 1/4 构建"
npm run build

echo "==> 2/4 打包"
TGZ=$(mktemp /tmp/site-XXXX.tgz)
tar czf "$TGZ" -C dist .
echo "    产物大小：$(du -h "$TGZ" | cut -f1)"

# 用 SSH_ASKPASS 免交互传密码，避免 sshpass 依赖
ASKPASS=$(mktemp)
printf '#!/bin/bash\necho %q\n' "$DEPLOY_PASS" > "$ASKPASS"
chmod +x "$ASKPASS"
trap 'rm -f "$ASKPASS" "$TGZ"' EXIT

SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
          -o PreferredAuthentications=password -o PubkeyAuthentication=no)

echo "==> 3/4 上传并部署（含备份）"
base64 -w0 "$TGZ" | SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force setsid -w \
  ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "
    set -e
    mkdir -p '$BACKUP_DIR'
    # 备份当前线上版本
    if [ -d '$DEPLOY_PATH' ] && [ -n \"\$(ls -A '$DEPLOY_PATH' 2>/dev/null)\" ]; then
      tar czf '$BACKUP_DIR/site-'\$(date +%Y%m%d-%H%M%S)'.tgz' -C '$DEPLOY_PATH' .
      ls -t '$BACKUP_DIR'/site-*.tgz | tail -n +6 | xargs -r rm --  # 只留最近 5 份
    fi
    cat > /tmp/_site.b64
    base64 -d /tmp/_site.b64 > /tmp/_site.tgz
    rm -rf '$DEPLOY_PATH'/*
    tar xzf /tmp/_site.tgz -C '$DEPLOY_PATH'
    chown -R www-data:www-data /var/www/halou
    rm -f /tmp/_site.b64 /tmp/_site.tgz
    echo '    部署完成'
  " 2>&1 | grep -v "Permanently added" || true

echo "==> 4/4 验证"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://www.halou.net.cn/)
echo "    https://www.halou.net.cn → HTTP $CODE"
[ "$CODE" = "200" ] && echo "✓ 上线成功" || { echo "✗ 异常，请检查"; exit 1; }
