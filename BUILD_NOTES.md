# X-Spider 改造说明（v2.3.0）

基于 MiningCattiva/x-spider（commit 252a900，v2.2.2）改造。未推送 GitHub、未发布。

## 改了哪些文件

### 1. 默认归类 + 隐藏变量 + 文字开关

- `src/interfaces/Settings.ts`：新增 `Settings_V3` 并把 `Settings` 指向 V3。`download` 下新增 6 个布尔字段：`classifyByAuthor`、`classifyByType`、`classifyByDate`、`fileNameWithDate`、`fileNameWithAuthor`、`fileNameWithPostId`。旧的 `dirTemplate`/`fileNameTemplate` 字段保留，只为兼容旧配置文件，UI 和下载逻辑都不再使用。
- `src/constants/settings.ts`：默认值——按作者开、按类型开、按日期关；文件名带日期开、带作者开、带推文编号开。`CURRENT_SETTINGS_VERSION` 从 2 升到 3。
- `src/stores/settings.ts`：`migrate` 增加 version < 3 分支：旧设置缺少新字段时补上默认值（已有值不覆盖）；顺带加了 `state.download` 为空时的保护。
- `src/stores/download.ts`（`prepareDownloadTask`）：不再读模板字符串，改为按开关现拼模板再走原有 `resolveVariables`：
  - 文件夹段顺序：作者 → 日期（仅日期）→ 类型，用反斜杠连接；全关时为空，平铺在保存路径下。
  - 文件名段：日期、作者按开关以空格连接，末段固定带序号防重名——开推文编号时为“编号-序号.扩展名”，关时为“序号.扩展名”。
  - 每个开关都写了缺省回退（`?? 默认值`），旧配置漏字段也不会反向。
- `src/constants/file-name-template.ts`：`MEDIA_TYPE` 映射为中文——photo→图片、video→视频、animated_gif→动图，未知值回退原值。文件夹名和文件名里用到类型时都是中文。
- `src/pages/Settings.tsx`：删掉「文件夹模板」「文件名模板」两个输入框，新增 6 个 antd Switch 开关（写法同原「跳过相同文件」）：按作者分文件夹（每个账号一个文件夹）/ 按类型分文件夹（图片、视频、动图分开存放）/ 按日期分文件夹（再按发布日期分，格式 年-月-日）/ 文件名带日期 / 文件名带作者名 / 文件名带推文编号（关掉后文件名更短，但重名风险变高）。保存路径和「跳过相同文件」保留。
- 删除已无引用的旧组件：`src/components/settings/FileNameTemplateInput.tsx`、`VariablePicker.tsx`、`TemplateExample.tsx`（它们是唯一还会把变量名展示到界面上的地方）。

### 2. 登录简化

- 新增 `src-tauri/src/browser_login.rs`（不加新依赖）：
  - `start_browser_login(profile_dir)`：按 Edge（x86、x64 两个路径）→ Chrome（两个路径）顺序找浏览器，找到后用 `std::process::Command` 带 `--remote-debugging-port=9229`、`--user-data-dir=<profile_dir>`、`--no-first-run`、`--no-default-browser-check` 启动并打开 `https://x.com/i/flow/login`；启动前先建好 profile 目录、重复启动先 kill 旧进程；子进程存 `static Mutex<Option<Child>>`；找不到浏览器返回中文错误说明。
  - `stop_browser_login()`：kill 并清掉子进程。
  - `cdp_ws_url()`：async 命令，用已有的 reqwest GET `http://127.0.0.1:9229/json/version`，解析返回 `webSocketDebuggerUrl`。
- `src-tauri/src/main.rs`：注册上面 3 个命令（`mod browser_login;` + generate_handler 列表）。
- 新增 `src/utils/browser-login.ts`（import 风格与 `src/ipc/network.ts` 一致，用 `@tauri-apps/api` 的 `invoke`/`path`）：
  - `startBrowserLogin()`：用 `path.appDataDir()` 拼 `browser_profile` 后 invoke 启动命令；`stopBrowserLogin()` 包装 stop 命令。
  - `getCookiesViaCdp()`：invoke 拿 ws 地址 → 原生 WebSocket → 发送 `Storage.getCookies`（id=1）→ 等 id=1 响应（5 秒超时）→ 返回 cookies 数组。
  - `waitForLoginCookies(shouldStop)`：每 2 秒轮询，最长 5 分钟；从 domain 含 twitter.com / x.com 的 cookie 里找齐 `auth_token` 和 `ct0` 后，用原有 `stringifyCookie` 拼成 cookieString 返回；被取消或超时返回 null；轮询异常吞掉继续。
- `src/components/Account.tsx`：登录弹窗重做，标题「登录 X」。上方一句说明 + 主按钮「打开浏览器登录」；点击后进入等待状态（「等待登录中…在打开的窗口里完成登录即可」+「取消」按钮，取消会 stop 浏览器并中止轮询）；拿到 cookie 后用原有 `getAccountInfo` 校验，成功则保存、关弹窗、关浏览器并提示已登录的用户名。下方分隔线 + 兜底区：一个 TextArea（整串 Cookie 粘贴）+「保存并校验」按钮——自动去掉 `cookie:` 前缀，用原有 `parseCookie` 取 `auth_token`/`ct0`，缺任一报错，同样走 `getAccountInfo` 校验后保存。旧的两个输入框表单和按 F12 找 Cookie 的说明已全部删除，无用 import 已清理。

### 3. 版本号

- `package.json`：version 2.2.2 → 2.3.0。

## 验证结果

### 前端构建（通过）

环境：本机无 pnpm，先 `npm i -g pnpm@9.0.0` 装好，再在项目根目录执行。`pnpm install` 成功（37.8s，husky prepare 正常）。`pnpm build`（即 `tsc && vite build`）全过，输出摘要原文：

```
> x-spider@2.3.0 build
> tsc && vite build
vite v5.2.9 building for production...
✓ 3554 modules transformed.
dist/index.html                       0.40 kB │ gzip:   0.27 kB
dist/assets/index-DdYFlObn.css       14.71 kB │ gzip:   3.58 kB
dist/assets/index-CN2xG1ES.js     1,020.63 kB │ gzip: 326.76 kB
✓ built in 11.51s
```

（构建时有一条 chunk 超过 500 kB 的体积警告，是原项目就有的，与本次改动无关。）

### grep 自查（通过）

- `src/pages/Settings.tsx`、`src/components/Account.tsx` 里 grep `%POST/%USER/%MEDIA/...` 等变量占位符：无。
- `Account.tsx` 里 grep F12 / 开发者工具相关说明：无。
- `git diff --stat` 共 12 个文件有改动 + 2 个新增文件（`browser_login.rs`、`browser-login.ts`）+ 3 个删除的旧组件文件；无无关文件被改（注：rustfmt 曾顺带重排 `src-tauri/src/network.rs` 的缩进，已 checkout 还原）。

### Rust 检查（部分受限）

- 本机原本没有 Rust 工具链，临时用 rustup 装了 stable + rustfmt 组件。
- `rustfmt --edition 2021` 对 `browser_login.rs` 和 `main.rs` 执行成功（rustfmt 需要完整解析源码，语法层面已过），格式已按 rustfmt 输出落盘。
- `cargo check` 未能完成，卡在依赖拉取阶段、还没进入编译：原项目在 Cargo.toml 里用的定制 reqwest 是 GitHub git 依赖（`github.com/MiningCattiva/reqwest` rev fe4fa64…），本机拉取时返回 HTTP 401、报 `revision not found / network failure`。这是原项目既有依赖的获取问题，不是本次新代码引入的；且即便拉到依赖，Linux 上还缺 Tauri 1.x 需要的系统库（webkit2gtk 等）。Rust 侧最终以 GitHub Windows 构建为准。
- 已逐行自查：三个命令都有 `#[tauri::command]`，签名与前端 invoke 参数对应（Rust `profile_dir` ↔ 前端 `profileDir`，Tauri 1 自动转换）；`main.rs` 注册列表完整；`static Mutex<Option<Child>>` 用法、借用与错误返回（`Result<_, String>` + 中文说明）无明显问题；未新增任何 Rust 依赖（CDP 的 WebSocket 在前端用原生 API 实现）。

## 还没验证的风险点

1. **CDP 登录链只能在 Windows 真机验**：Edge/Chrome 以调试端口 + 专属 profile 启动、用户在窗口里登录、`Storage.getCookies` 读到 HttpOnly 的 `auth_token`——这条链在本机（Linux）无法实测，需要 Windows 真机跑一遍。原理与 dy 下载器的浏览器登录相同，但 X 登录页可能有额外验证（验证码、二次验证），需用户在弹出的浏览器窗口里自行完成，程序只负责等 cookie 出现。
2. **浏览器进程管理**：`stop_browser_login` kill 的是启动器子进程；Edge/Chrome 在某些情况下会把窗口转交给已存在的同 profile 进程，kill 后窗口可能不关。影响仅是窗口残留，不影响登录结果保存；真机验时留意。
3. **9229 端口占用**：若用户机器上 9229 已被别的程序占用，`cdp_ws_url` 会连错或失败，前端轮询会一直等到 5 分钟超时并报错。概率低，真机遇到再换端口。
4. **设置迁移**：zustand persist 的 migrate 只在版本号不一致时触发；已用内存级自查逻辑正确，但旧版（v2）真实配置文件升级到 v3 的迁移效果，要等 Windows 安装包在真机覆盖安装后确认一次。
5. **归类路径**：文件夹多层拼接走的是原有 `path.join(保存路径, 模板解析结果)` 逻辑，反斜杠分隔在 Windows 上成立；aria2 建多层目录的行为与原版模板用法一致，未另行实测。

## 追加修复（2026-11-15，构建前发现）

- 原版 `src-tauri/Cargo.toml` 依赖作者自改的 reqwest git 仓库（MiningCattiva/reqwest），该仓库现已 404 不存在，原版按原样已无法构建。改为官方 crates.io reqwest 0.11（json+gzip）。
- 官方版没有原 fork 的 `get_system_proxy_map`，`src-tauri/src/network.rs` 的 `network_get_system_proxy_url` 改为自实现：先读环境变量代理，再在 Windows 下读注册表 HKCU Internet Settings 的系统代理（新增 windows-only 依赖 winreg 0.52），返回 host:port 给前端（前端拼 http:// 前缀给 aria2 用），行为与原版一致。
- 新增 `.github/workflows/build-windows-test.yml`：手动触发的 Windows 构建，只产出 NSIS 安装包 artifact，不发 Release、不改版本号。
- Rust 本地验证：rustfmt 解析通过（语法层）；本机 Linux 缺 Tauri 4.0 系统库无法完整 cargo check，以 GitHub Windows 构建为最终验证。

## 便携版（v2.3.1，2026-11-16）

- 版本 2.3.0 → 2.3.1。
- 新增 `src/utils/data-dir.ts`：启动时看 exe 同目录有没有 `portable.txt`——有则进入便携模式，设置/登录状态改存 exe 同目录的 `data` 文件夹；没有则和原来一样存 AppData（安装版行为不变）。
- `tauri-file-storage.ts` 改用上面的数据目录；便携模式下若 data 里还没有文件，会回退读一次 AppData 里的旧设置/登录（老用户换便携版不用重配，之后写入都进 data）。
- 浏览器登录的专用浏览器资料目录也跟着走数据目录（便携模式下在 data/browser_profile）。
- 构建流程新增便携包：把 target/release 的 x-spider.exe + aria2c.exe + 空的 portable.txt 打成 X-Spider-v2.3.1-Portable.zip，解压双击 x-spider.exe 即用，不安装、不写注册表。安装包同步照常产出（2.3.1）。
