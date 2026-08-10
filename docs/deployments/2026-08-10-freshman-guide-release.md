# 2026-08-10 《杭电新生指北》问答接入发布记录

## 发布基线

- 服务器：`124.222.171.40`
- 应用目录：`/srv/live-in-hdu/apps/freshman-mvp`
- systemd 服务：`live-in-hdu`
- 初始部署源码 SHA：`99e5282`（记录当时实际上传构建，不表示后续 hotfix 已部署）
- 当前部署源码 SHA：`f24e7f7e809a4536e94f907b3a3659b636121d90`
- 发布前数据库：`published=24`，`pending=17`
- 第 24 个已发布问题经只读核对为此前人工审核发布的“宿舍晚上几点熄灯？”，不是异常数据。

## 回滚材料

- 回滚目录：`/srv/live-in-hdu/backups/20260810T010438Z`
- 数据库备份：`/srv/live-in-hdu/backups/20260810T010438Z/live-in-hdu.db`
- 数据库备份大小：`204800` bytes
- 校验清单：`/srv/live-in-hdu/backups/20260810T010438Z/SHA256SUMS`（59 行）
- 上一版构建：`/srv/live-in-hdu/apps/freshman-mvp/dist.previous-20260810T010438Z`
- 最终 hotfix 回滚目录：`/srv/live-in-hdu/backups/20260810T043813Z`
- 最终 hotfix 上一版构建：`/srv/live-in-hdu/apps/freshman-mvp/dist.previous-20260810T043813Z`

## 发布结果

- 服务状态：`active`
- 健康检查：`freshmanGuide.status=available`
- 私有指南块数：39
- 指南文件：`/srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md`，权限 `600`
- `.env.local` 权限：`600`
- SearXNG：仍只监听 `127.0.0.1:8888`
- 发布后数据库：`published=24`，`pending=17`

## 验收证据

- 公网客户端 `/`：HTTP 200
- 公网管理页外壳 `/admin`：HTTP 200
- 公网管理数据接口 `/api/reviews`：HTTP 403
- 六个固定相关问题均返回 `knowledge` 或 `preset` 路由、1–3 个受控飞书链接且无未核验提示。
- 预设问题“宿舍一般是几人间？基础条件怎么样？”的线上回答以当前已发布完整答案逐字开头，之后才追加指南补充。
- 无关问题继续走原有下游链路的行为由本地路由回归覆盖；为避免污染真实审核队列，未在生产环境提交无关测试问题。
- 最终发布候选验证：服务端 246 通过、2 跳过、0 失败；前端 76/76；生产构建通过；客户端正文/变量名/密钥形态扫描均为 0；真实私有指南验证通过。
- 最终 hotfix 在真实指南中验证了 9 个正例与 3 个负例；三个报到材料问法均只命中“杭电到达篇”，不再混入“地铁优惠”，航电钉父标题无正文时仍由正确子块承接。
- 线上已验证“宿舍一般是几人间？基础条件怎么样？”保持人工审核答案逐字前缀，再追加指北补充。
- 最终 hotfix 后再次确认公网边界为 `/` 200、`/admin` 200、`/api/reviews` 403，数据库计数仍为 `published=24`、`pending=17`。

## 回滚原则

如后续发现发布级故障，先核对工作目录、回滚目录前缀和数据库路径，再停止服务并恢复上述 `dist`、`.env.local` 与 SQLite 在线备份；不得重建或清空数据库。
