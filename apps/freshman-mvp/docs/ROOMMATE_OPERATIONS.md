# 匹配室友上线与回滚手册

本手册以生产目录 `/srv/live-in-hdu/apps/freshman-mvp` 和 systemd 服务 `live-in-hdu` 为准。室友功能含精确寝室和可选联系方式，必须先完成 HTTPS 与备份门禁，不得在纯 HTTP 公网上开启。

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

## 3. SQLite 在线备份

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

## 4. 先关闭功能配置三个独立密钥

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

## 5. 先以 disabled 部署应用

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

## 6. Nginx、回环绑定和 HTTPS

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

## 7. disabled 健康检查与开启

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

## 8. 手机一次性验收

使用一组可删除的测试数据，不填真实学生联系方式：

1. 手机浏览器打开 `https://liveinhdu.cn/roommates`，确认无证书警告。
2. 确认下沙可填写，绍兴显示“寝室分配规则确认中，暂未开放匹配”。
3. 建立一条测试登记，保存登记 ID 和只显示一次的管理码。
4. 确认本人和同寝列表可见，刷新后管理码不再显示。
5. 修改昵称；再用无痕窗口以登记 ID + 管理码恢复，确认新会话有效。
6. 删除测试登记，确认它不再出现，然后在安全管理通道中核对审计状态。
7. 复查原有问题卡、新生指北、聊天问答、TokenDance、联网检索和审核队列。

## 9. 回滚

任一门禁失败时，首先关闭室友功能，不要首先恢复数据库：

```bash
cd /srv/live-in-hdu/apps/freshman-mvp
sudo sed -i 's/^ROOMMATE_MATCHING_ENABLED=.*/ROOMMATE_MATCHING_ENABLED=false/' .env.local
sudo chmod 600 .env.local
sudo systemctl restart live-in-hdu
sudo systemctl is-active live-in-hdu
```

然后恢复发布前已记录的代码 commit/发布包，重新构建并重启。新增的 roommate 表可以保留但不对外使用。

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
