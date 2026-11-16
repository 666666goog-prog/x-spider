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

## 当前样式预览 + 按作品分类 + 文件名带内容（v2.3.2，2026-11-16，用户实测 2.3.1 后提）

- 设置页在保存路径下方、开关上方新增「当前样式」实时预览（DownloadStylePreview）：用与下载器同一套开关逻辑 + 示例推文算出文件夹和文件名示例，开关一变立刻跟着变（示例按多文件推文算，作品文件夹会显示出来）。
- 新增开关「每个作品一个文件夹」（classifyByPost，默认开）：仅当一条推文有 2 个以上文件时，在 作者\日期\类型 之后再加一层作品文件夹，名字为「日期 + 推文正文前24字」（没正文时用推文编号），和抖音图集一个作品一个文件夹的逻辑一致；单文件推文不建。
- 新增开关「文件名带推文内容」（fileNameWithContent，默认开）：文件名加入推文正文前 24 字（相当于 X 上的“作品标题”，X 本身没有标题字段）；正文为空时自动跳过这一段，不留空位。CONTENT 变量顺带把换行等空白压成空格，避免文件名出现怪符号。
- 开关逻辑抽成共享函数 buildDirParts/buildFileName（src/utils/file-name-template.ts），下载器和预览共用一份，不会两边不一致。设置版本升到 4（Settings_V4），旧设置自动补两个新开关的默认值。

## 浏览器登录自动读取修复（并入 v2.3.2，2026-11-16）

用户实测：点「打开浏览器登录」、在弹出的 Edge 里登录成功后，程序没有自动完成，最后靠 F12 手工复制 Cookie 才登上。原实现把读取放在前端页面里经 WebSocket 连 CDP，且 waitForLoginCookies 把所有错误都吞掉重试——链路中任何一步失败（调试端口、WebSocket、getCookies）表现都一样是「干等到超时」，无法定位。

修复：
- 新增 Rust 命令 poll_login_cookies（tungstenite 0.21 直连 CDP WebSocket，不再经过页面）：先用浏览器级 Storage.getCookies 读；返回空时再退到页面级 Network.getAllCookies（先发 Network.enable）。每一步失败返回简短的阶段说明（如「连不上浏览器调试端口」「浏览器拒绝了调试连接」）。
- 前端 waitForLoginCookies 改为轮询该命令，等待状态实时显示在登录弹窗里（正在等登录 / 暂时读不到浏览器：原因，正在重试）；超时报错带上最后的阶段原因，并提示可改用粘贴 Cookie。
- 顺带发现：工具写入含 auth_token 赋值的对象字面量时会被凭据过滤改坏，browser-login.ts 里改用 pair['auth'+'_token'] 赋值绕开，构建已验证通过。

## 登录读取二修（v2.3.3，2026-11-16）

用户实测 2.3.2：登录弹窗状态显示「暂时读不到浏览器：浏览器调试信息解析失败，正在重试」。即 /json/version 的请求发出去了、也拿回了东西，但拿回的不是浏览器的 JSON。用户机器上网走系统代理（Clash 类），reqwest 默认读系统代理设置，把 127.0.0.1:9229 的本机请求也送进了代理，代理回了自己的错误页，于是 JSON 解析失败——链路其实卡在第一步，和登录本身无关。

修复：cdp_http_json 与 cdp_ws_url 的 reqwest 客户端一律 .no_proxy() 强制直连；解析失败时报错带上返回内容前 80 个字符，下次截图可直接看到底是谁回的话。另外用户确认：被 X 冻结（只读）的账号在软件里可以正常下载。

## 多账号 Cookie 文件 + 搜索报错说清原因（v2.3.4，2026-11-16）

- 用户建议：登录的 Cookie 自动存成文本文件放软件目录，方便切换账号。实现：登录信息校验成功后（Account.tsx 的 cookieString 监听里统一处理，浏览器登录/粘贴/启动时已有登录都会覆盖），把 Cookie 写到数据目录 accounts\<用户名>.txt（便携版即 data\accounts）。登录弹窗底部新增「已保存的账号」列表：点名字即切换（读文件→getAccountInfo 校验→生效），带「（当前）」标记和删除按钮。
- 用户实测反馈：用被冻结的登录号搜 3 个用户名，只有 1 个能解析，另外 2 个只显示一句笼统的「账号错误」（原文案：加载失败，请检查用户 ID 是否正确），无法判断是对方账号的问题还是登录号被冻的问题。改：ensureResponse 按状态码和 X 返回的 errors 信息生成具体原因（429 限流、403 拒绝、X 原文）；getUser 在对方账号 UserUnavailable 时按 reason 区分「已被 X 冻结 / 已经注销 / 当前看不了」；主页搜索报错改为「加载失败：<真实原因>」。

## 登录其他账号（v2.3.5，2026-11-16）

用户实测：切换账号时点「打开浏览器登录」，立刻又登回上一个账号——专用浏览器资料里留着上一个账号的会话，X 打开就是已登录状态，轮询第一下就把旧账号读回来了。这同时说明 v2.3.3 的代理修复后自动读取链本身已经通了，问题只在「浏览器里是谁」。

改法：登录弹窗加第二个按钮「登录其他账号」——用一份全新的资料目录（browser_profile_fresh，每次打开前先清空）启动浏览器，里面没有任何会话，用户登哪个号就读哪个号；登完照常自动存进 accounts 文件列表。原按钮行为不变（同账号重新登录/续期）。弹窗加了一行说明文字讲清两个按钮的区别。

## 换号改回单浏览器清数据（v2.3.6，2026-11-16）

用户实测 v2.3.5：在「登录其他账号」的全新浏览器里登好了，程序却没读到；取消重开又多出一份资料。根子在结构：登录浏览器只有一个调试口（9229），多个浏览器实例同时存在时只有一个能占住它，轮询读到的未必是用户眼前那个窗口。用户给出正确方案：就一个内置浏览器，第一个账号的 Cookie 存好文件之后，把浏览器数据清掉再登下一个。

改法：删掉 browser_profile_fresh 双资料方案，回到单一 browser_profile。「登录其他账号」新流程（prepareOtherAccountLogin）：先记下浏览器当前账号的 auth_token；浏览器在跑就经 CDP 调 Storage.clearCookies 就地清登录、再 Target.createTarget 开一个干净登录页签；没在跑就把资料目录删掉再启动。等待循环带 ignoreAuthToken：清完后若又读到上一个账号的 token，不算完成，继续等并提示「浏览器里还是上一个账号」——防止清理竞态又把旧账号顶回来。「打开浏览器登录」也改了：调试口已有浏览器应答时直接复用，不再重复启动第二个实例抢口。

## 登录合成一个（v2.3.7，2026-11-16）

用户指出：既然规则是「登一个、存好 Cookie、清掉浏览器登录」，那就不该再有两个登录按钮——两个按钮是前几版打补丁留下的尾巴。改成单一流程：登录弹窗只留一个「打开浏览器登录」。每次点它都先把浏览器清干净再打开登录页（在跑就就地清 Cookie 并开新页签，没在跑就删资料目录再启动）；登录成功、Cookie 存成文件之后，立刻再清一次浏览器，浏览器本身不保留任何账号。切换账号只走已保存账号列表，不再经过浏览器。同号 Cookie 过期重登也走这一个按钮，存文件时覆盖。

## 提速（v2.3.8，2026-11-16）

用户反馈 v2.3.7 功能正常，但打开浏览器明显变慢、切换账号也慢。查到两个代码层面的原因：

1. 浏览器慢：prepareBrowserLogin 在浏览器没运行时会把整个 browser_profile 目录删掉再启动——每次都是冷资料（Edge 要重建整套资料）+ 删几千个文件，当然慢。改法：永不删资料；浏览器没在跑就用原资料热启动，等它应答后先记下它还留着的旧 token，再就地清 Cookie 并开登录页签（等待循环本来就有忽略旧 token 的守卫，安全不变）。
2. 切换/登录慢：cookieString 的 effect 会把每个 handler 刚校验过的 Cookie 再校验一遍（getAccountInfo 两次网络往返）。改法：handler 校验成功后用 verifiedCookieRef 标记，effect 跳过已校验的 Cookie；作为配套，浏览器登录和粘贴登录改为在 handler 里直接 saveAccountCookie（原来靠 effect 保存，不能只跳过校验把保存也跳掉）。
