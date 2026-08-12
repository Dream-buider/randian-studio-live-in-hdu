# 匹配室友上线与回滚手册

本手册以生产目录 `/srv/live-in-hdu/apps/freshman-mvp` 和 systemd 服务 `live-in-hdu` 为准。室友功能含精确寝室和可选联系方式，必须先完成 HTTPS 与备份门禁，不得在纯 HTTP 公网上开启。

## 在维护电脑上打开管理端

服务器会独立运行，不需要维护电脑长期保持开机。只有需要审核或维护时，在项目目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-production-admin.ps1
```

脚本会通过已授权的 SSH 公钥建立 `127.0.0.1:3211` 到服务器内部 `127.0.0.1:3212` 的安全通道，并打开 `http://127.0.0.1:3211/admin`。它不保存 SSH 密码、TokenDance 密钥或室友匹配密钥。关闭或重启电脑后通道会消失，下次管理时重新运行脚本即可；不影响公网客户端和服务器运行。

## 1. 域名、备案和发布责任

1. `liveinhdu.cn` 必须由老板或团队长期控制的腾讯云账号购买并实名，不要挂在临时成员名下。
2. 中国大陆腾讯云服务器正式绑定域名前，完成 ICP 备案。备案未通过时保持 `ROOMMATE_MATCHING_ENABLED=false`。
3. 备案通过后，把根域名和需要的 `www` 解析到腾讯云公网 IP，再申请有效 TLS 证书。
4. 证书、私钥、API Key 和室友密钥只存服务器，不提交 Git。

## 2. 发布前只读基线

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
systemctl is-active live-in-hdu
systemctl is-enabled live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
sqlite3 runtime/live-in-hdu.db \
  "SELECT 'published',count(*) FROM canonical_answers WHERE status='published'; SELECT 'reviews',count(*) FROM review_tasks;"
git rev-parse HEAD
```

记录当前 commit、已发布答案数和审核任务数。如果生产目录没有 Git 元数据，记录发布包 SHA-256，不要猜测版本。

## 3. 覆盖前创建可回滚代码包

无论生产目录是否有 Git 元数据，覆盖任何文件前都创建代码归档。归档放在项目目录外的 `/srv/live-in-hdu/releases/rollback`，避免归档递归收录自身。归档明确排除环境文件、运行数据库、数据备份、依赖目录和各类密钥文件：

```bash
set -euo pipefail
app=/srv/live-in-hdu/apps/freshman-mvp
rollback_dir=/srv/live-in-hdu/releases/rollback
stamp="$(date +%Y%m%d-%H%M%S)"
archive="$rollback_dir/freshman-mvp-predeploy-$stamp.tar.gz"
listing=''
archive_accepted=0

cleanup_archive_check() {
  rc=$?
  trap - EXIT
  if [ -n "$listing" ]; then rm -f -- "$listing"; fi
  if [ "$archive_accepted" -ne 1 ]; then sudo rm -f -- "$archive" "$archive.sha256"; fi
  exit "$rc"
}
trap cleanup_archive_check EXIT

sudo install -d -m 700 "$rollback_dir"
listing="$(mktemp "$HOME/live-in-hdu-archive-list.XXXXXX")"
chmod 600 "$listing"
cd /srv/live-in-hdu/apps
sudo tar --one-file-system -czf "$archive" \
  --exclude='freshman-mvp/.env*' \
  --exclude='freshman-mvp/runtime' \
  --exclude='freshman-mvp/backups' \
  --exclude='freshman-mvp/node_modules' \
  --exclude='freshman-mvp/secrets' \
  --exclude='freshman-mvp/.git' \
  --exclude='*.db' \
  --exclude='*.sqlite' \
  --exclude='*.sqlite3' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*.crt' \
  freshman-mvp
sudo tar -tzf "$archive" > "$listing"
if grep -E '(^|/)(\.env[^/]*|runtime(/.*)?|backups(/.*)?|node_modules(/.*)?|secrets(/.*)?|\.git(/.*)?|[^/]+\.(db|sqlite|sqlite3|pem|key|crt))$' "$listing"; then
  printf 'ERROR: archive contains a forbidden path; deleting unusable archive.\n' >&2
  exit 1
fi
sudo chmod 600 "$archive"
sudo sha256sum "$archive" | sudo tee "$archive.sha256" >/dev/null
sudo chmod 600 "$archive.sha256"
test "$(sudo stat -c '%a' "$archive")" = '600'
test "$(sudo stat -c '%a' "$archive.sha256")" = '600'
sudo stat -c '%a %n' "$archive" "$archive.sha256"
printf 'CODE_ARCHIVE=%s\n' "$archive"
sudo cat "$archive.sha256"
rm -f -- "$listing"
listing=''
archive_accepted=1
trap - EXIT
```

把 `CODE_ARCHIVE` 绝对路径和输出的 SHA-256 一起写入发布记录。归档列表是仅含路径的 `mktemp` 文件，权限为 600；它在成功后删除，任何失败也由 trap 清理。只有独立 `tar -tzf` 成功、禁入路径扫描为空、权限校验为 600 后归档才会被接受；否则归档和校验文件都会删除。已接受的归档包含当前源码、锁文件和已构建的 `dist`，但不包含任何生产密钥或数据库。

## 4. SQLite 在线备份

使用 SQLite 的 `.backup` 在线备份，不在服务运行时直接 `cp` 数据库：

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
install -d -m 700 backups
stamp="$(date +%Y%m%d-%H%M%S)"
db="$PWD/runtime/live-in-hdu.db"
backup="$PWD/backups/live-in-hdu-$stamp.db"
sqlite3 "$db" ".backup '$backup'"
chmod 600 "$backup"
sqlite3 "$backup" "PRAGMA integrity_check;"
sha256sum "$backup"
sqlite3 "$backup" \
  "SELECT 'published',count(*) FROM canonical_answers WHERE status='published'; SELECT 'reviews',count(*) FROM review_tasks;"
printf 'BACKUP=%s\n' "$backup"
```

`PRAGMA integrity_check` 必须返回 `ok`，并记录备份绝对路径和 SHA-256。备份也可能含用户联系方式，本项目采用 **30 天有限保留**：每天检查备份，只在确认路径是本项目 `backups` 后删除 30 天前文件。

```bash
find /srv/live-in-hdu/apps/freshman-mvp/backups -maxdepth 1 -type f \
  -name 'live-in-hdu-*.db' -mtime +30 -print
# 人工确认上面列表后，才执行：
find /srv/live-in-hdu/apps/freshman-mvp/backups -maxdepth 1 -type f \
  -name 'live-in-hdu-*.db' -mtime +30 -delete
```

## 5. 先关闭功能配置三个独立密钥

先备份环境文件。下面三个 `openssl rand -base64 32` 是三次独立的 32 字节随机生成，直接写入文件，不会把已有密钥显示在终端。本命令只执行一次；重跑前先停止并核对，避免无意轮换后无法解密旧数据。

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
stamp="$(date +%Y%m%d-%H%M%S)"
sudo cp -a .env.local ".env.local.pre-roommates-$stamp"
sudo sed -i \
  -e '/^ROOMMATE_MATCHING_ENABLED=/d' \
  -e '/^ROOMMATE_PUBLIC_ORIGIN=/d' \
  -e '/^ROOMMATE_ENCRYPTION_KEY=/d' \
  -e '/^ROOMMATE_HMAC_KEY=/d' \
  -e '/^ROOMMATE_COOKIE_SECRET=/d' \
  .env.local
sudo bash -c 'umask 077
{
  printf "ROOMMATE_MATCHING_ENABLED=false\n"
  printf "ROOMMATE_PUBLIC_ORIGIN=https://liveinhdu.cn\n"
  printf "ROOMMATE_ENCRYPTION_KEY="; openssl rand -base64 32
  printf "ROOMMATE_HMAC_KEY="; openssl rand -base64 32
  printf "ROOMMATE_COOKIE_SECRET="; openssl rand -base64 32
} >> .env.local'
sudo chmod 600 .env.local
stat -c '%a %n' .env.local
sudo sed -n 's/^\(ROOMMATE_[A-Z_]*\)=.*/\1=[configured]/p' .env.local
```

最后一条只显示变量名和 `[configured]`，不显示值。不要运行 `cat .env.local`。

## 6. 先以 disabled 部署应用

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
npm ci
npm run test:all
npm run build
sudo systemctl restart live-in-hdu
sudo systemctl --no-pager --full status live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
```

这一阶段必须保持 `ROOMMATE_MATCHING_ENABLED=false`。先核对既有问答、审核数量和客户端，再处理 Nginx。

## 7. Nginx、回环绑定和 HTTPS

1. 把 `deploy/nginx/liveinhdu.cn.conf.example` 复制到 `/etc/nginx/sites-available/liveinhdu.cn`。
2. 安装有效证书并替换示例证书路径；不得把证书私钥放进项目目录。
3. 保留对 `/api/admin` 和 `/api/reviews` 及其子路径的精确拒绝规则。Nginx 从回环连接 Node，如果删除这层会破坏公网管理边界。
4. 把 `.env.local` 中 `HOST` 设为 `127.0.0.1`，保留 `PORT=3210`。

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart live-in-hdu
ss -lntp | grep ':3210'
```

`3210` 必须只显示 `127.0.0.1:3210`，不能是 `0.0.0.0:3210` 或 `[::]:3210`。安全组和主机防火墙不再向公网开放 3210；SearXNG 8888 继续只监听回环。

## 8. disabled 健康检查与开启

先检查 HTTPS 和安全边界：

```bash
curl -I http://liveinhdu.cn/
curl -fsS https://liveinhdu.cn/api/health
curl -sS -o /dev/null -w 'admin=%{http_code}\n' https://liveinhdu.cn/api/admin/roommates
curl -sS -o /dev/null -w 'reviews=%{http_code}\n' https://liveinhdu.cn/api/reviews
npm run verify:roommates -- --base-url https://liveinhdu.cn
```

disabled 时最后一条应明确报 `Roommate matching is disabled`，这是预期门禁，不是运行故障。确认证书、安全头、公网 admin/reviews 拒绝和回环绑定后，只修改开关：

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
sudo sed -i 's/^ROOMMATE_MATCHING_ENABLED=.*/ROOMMATE_MATCHING_ENABLED=true/' .env.local
sudo chmod 600 .env.local
sudo systemctl restart live-in-hdu
sudo systemctl is-active live-in-hdu
npm run verify:roommates -- --base-url https://liveinhdu.cn
```

开启后探针必须返回 `Roommate readiness passed`。探针只使用 GET，不登记寝室、不生成会话，输出只含状态码。实际 Cookie 标志由自动化 API 测试和下面的一次性验收共同确认。

## 9. 手机一次性验收

使用一组可删除的测试数据，不填真实学生联系方式：

1. 手机浏览器打开 `https://liveinhdu.cn/roommates`，确认无证书警告。
2. 确认下沙可填写，绍兴显示“寝室分配规则确认中，暂未开放匹配”。
3. 建立一条测试登记，保存登记 ID 和只显示一次的管理码。
4. 确认本人和同寝列表可见，刷新后管理码不再显示。
5. 修改昵称；再用无痕窗口以登记 ID + 管理码恢复，确认新会话有效。
6. 删除测试登记，确认它不再出现，然后在安全管理通道中核对审计状态。
7. 复查原有问题卡、新生指北、聊天问答、TokenDance、联网检索和审核队列。

## 10. 回滚

任一门禁失败时，首先关闭室友功能，不要首先恢复数据库：

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
sudo sed -i 's/^ROOMMATE_MATCHING_ENABLED=.*/ROOMMATE_MATCHING_ENABLED=false/' .env.local
sudo chmod 600 .env.local
sudo systemctl restart live-in-hdu
sudo systemctl is-active live-in-hdu
```

然后使用第 3 节记录的 `CODE_ARCHIVE` 恢复代码。下面的恢复先校验 SHA，再解压到独立临时目录，最后用 `rsync` 覆盖代码；它不覆盖 `.env.local`、`runtime`、`backups`、`node_modules` 或服务器密钥：

```bash
set -euo pipefail
archive=/srv/live-in-hdu/releases/rollback/freshman-mvp-predeploy-YYYYMMDD-HHMMSS.tar.gz
app=/srv/live-in-hdu/apps/freshman-mvp
restore_dir=''
success=0

disable_roommates() {
  cd "$app"
  if sudo grep -q '^ROOMMATE_MATCHING_ENABLED=' .env.local; then
    sudo sed -i 's/^ROOMMATE_MATCHING_ENABLED=.*/ROOMMATE_MATCHING_ENABLED=false/' .env.local
  else
    printf 'ROOMMATE_MATCHING_ENABLED=false\n' | sudo tee -a .env.local >/dev/null
  fi
  sudo chmod 600 .env.local
}

finish_rollback() {
  rc=$?
  trap - EXIT
  if [ "$success" -eq 1 ]; then
    case "$restore_dir" in "$HOME"/live-in-hdu-restore.*) sudo rm -rf -- "$restore_dir" ;; *) exit 1 ;; esac
    printf 'ROLLBACK_OK: code restored, service healthy, temporary files removed.\n'
  else
    disable_roommates || true
    sudo systemctl restart live-in-hdu || true
    printf 'ROLLBACK_FAILED: roommate matching remains disabled; 保留诊断目录 %s\n' "${restore_dir:-not-created}" >&2
  fi
  exit "$rc"
}
trap finish_rollback EXIT

disable_roommates
restore_dir="$(mktemp -d "$HOME/live-in-hdu-restore.XXXXXX")"
case "$restore_dir" in "$HOME"/live-in-hdu-restore.*) ;; *) exit 1 ;; esac
sudo systemctl stop live-in-hdu
sudo sha256sum --check "$archive.sha256"
sudo tar -xzf "$archive" -C "$restore_dir" --no-same-owner
sudo chown -R "$(id -u):$(id -g)" "$restore_dir"
test -f "$restore_dir/freshman-mvp/package-lock.json" || exit 1
sudo rsync -a --delete \
  --exclude='.env*' \
  --exclude='runtime/' \
  --exclude='backups/' \
  --exclude='node_modules/' \
  --exclude='secrets/' \
  --exclude='.git/' \
  "$restore_dir/freshman-mvp/" "$app/"
cd "$app"
npm ci
npm run build
sudo systemctl start live-in-hdu
sudo systemctl is-active live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
success=1
```

`set -euo pipefail` 保证校验、解压、路径防护、覆盖、安装、构建、启动或健康检查任一失败就立即中止。`restore_dir` 由固定父目录下的 `mktemp -d` 生成；只有所有门禁和健康检查成功后才删除。任何失败都会再次关闭室友功能、尝试重启服务并保留诊断目录；此时不能宣布回滚成功，必须根据 `ROLLBACK_FAILED` 路径排查。新增的 roommate 表可以保留但不对外使用。

**只有** `PRAGMA integrity_check` 不再是 `ok`，或已发布答案/审核任务基线计数发生非预期变化时，才停止服务并恢复数据库备份：

```bash
sudo systemctl stop live-in-hdu
sqlite3 /absolute/path/to/recorded-backup.db "PRAGMA integrity_check;"
sudo install -m 600 /absolute/path/to/recorded-backup.db \
  /srv/live-in-hdu/apps/freshman-mvp/runtime/live-in-hdu.db
sudo systemctl start live-in-hdu
sqlite3 /srv/live-in-hdu/apps/freshman-mvp/runtime/live-in-hdu.db "PRAGMA integrity_check;"
```

恢复后再核对已发布答案数、审核任务数和原有客户端；在问题原因消除前保持室友开关关闭。
