# Windows 0.11.1 社区运行时补丁

这里是对 **官方 DSH Desktop Windows 0.11.1 的精确基线**提供的社区 ASAR 补丁，不是官方签名更新安装包，也不是 macOS 0.10.0 资源的移植安装器。上游签名 `DSH Desktop.exe` 不变；脚本不改 Electron fuse，不修改模型配置或账号凭证。

## 三项功能

1. Changed-file 二进制卡片直接打开右侧栏整文件；binary diff 页面保留「打开整文件」按钮。文本 diff、workspace 相对路径解析保持原行为。
2. 本地视频 MP4 / WebM / M4V / MOV / OGV / OGG / AVI / MKV 使用内置播放器和 authenticated `/api/file-stream` 路由；支持 Windows 本机盘符、反斜杠、空格及中文路径。编码不受内置播放器支持时，可使用原有系统应用按钮。UNC 网络共享路径仍遵守上游限制：播放器 URL helper 拒绝，不新增 SMB 访问能力。
3. 视频流支持 Range / HEAD / MIME 和有限块读取；沿用应用原有 filesystem resolve/访问策略，不增加账号、模型或权限配置。

适用性由 `manifest.json` 和 `patch-asar.cjs` 联合校验：Desktop / Harness 版本、EXE / ASAR 整包 hash、三个目标文件的 baseline / modified hash 均精确匹配才接受。

| 基线 | SHA256 |
|---|---|
| `resources/app.asar` | `c6ad1d6a90b2f52154be97210c0e32cbbedc471822d3fe2f3f74b21c619b1007` |
| `DSH Desktop.exe` | `1cc3999dc6730e5e846631e9ae122bbcada1acf4b853677322bf30851dbcd419` |

## 前提

- Windows PowerShell 5.1+ 或 PowerShell 7+，并安装 **Node.js 22+**；`node` 在 PATH，或使用 `-NodePath 'C:\path\node.exe'`。
- 默认安装位置：`C:\Program Files\DSH Desktop`。替换 Program Files 下的 ASAR 需要以管理员身份打开 PowerShell。
- 先从应用菜单正常退出 DSH Desktop；脚本按目标 InstallDir 内的精确 `ExecutablePath` 检查运行进程，既不 kill 也不自动启动应用。
- 备份空间应容纳原 ASAR、候选 ASAR、EXE 备份以及 `.dsh` 和 `%APPDATA%\dsh-desktop` 的完整快照。profile 目录含 junction / symlink 时，脚本先停止，不跟随链接复制外部目录。
- 下载本目录所有文件（包括 `manifest.json`、三个 payload `.js`、`patch-asar.cjs` 和两个 PowerShell 脚本）。只拿 `.patch` 文件不足以安装。

## Prepare：只备份、构建、校验

在本补丁目录的 PowerShell 终端执行：

```powershell
.\apply-windows.ps1 -BackupDir 'C:\DSH-Backups\windows-0.11.1-preview'
```

省略 `-BackupDir` 时会在 `%LOCALAPPDATA%\DSHDesktopOverlayBackups` 建立带时间和随机 ID 的独立目录。BackupDir 应是新的空目录，且在安装目录和两个源 profile 目录之外；保留失败备份，重试使用新的目录。

默认 **Prepare 不替换安装**。产物：

- `original-app.asar`、`baseline-exe.bin`：原件只读副本；EXE 备份仅供独立验证，不会替换程序 EXE。
- `candidate-app.asar`：三个目标 JS 的候选 ASAR；原 payload bytes 保留，重新计算变更项 integrity / metadata。
- `payload/`：自包含的 manifest、JS、patch 工具；以及备份根目录中的 `rollback-windows.ps1`。
- `profiles/dot-dsh`、`profiles/dsh-desktop`：存在的用户目录完整备份；脚本对比内容摘要，不在报告中输出凭证或配置内容。
- `prepare.json` / `latest-verify.json` / `candidate-app.asar.verification.json`：精确 hash、build / verify 命令参数、原样 stdout/stderr 和退出码。

所有 patch 工具调用都传 `--exe`。遇到未来版本的 EXE、不匹配基线，或开启 embedded ASAR integrity 的发行版，流程停止；不绕过 integrity、不改 fuse。

## 验证回滚机制：仅临时 fixture

```powershell
& 'C:\DSH-Backups\windows-0.11.1-preview\rollback-windows.ps1' `
  -BackupDir 'C:\DSH-Backups\windows-0.11.1-preview' -TestFixture
```

这一步只读取备份目录，在系统临时目录复制基线、真实演练 `System.IO.File.Replace` 安装候选、再恢复原件并检查三个 hash。它不读取/写入真实安装或当前用户目录，输出临时 fixture 和验证记录路径；不递归删除目录。

## Apply：显式替换 ASAR

保持 DSH Desktop 关闭，复用 Prepare 的同一个 BackupDir：

```powershell
.\apply-windows.ps1 -BackupDir 'C:\DSH-Backups\windows-0.11.1-preview' -Apply
```

脚本再次校验基线、候选、工具、EXE hash 和运行状态，再把候选复制到 `resources` 内同目录 staging 文件并使用 `System.IO.File.Replace` 原子替换 `app.asar`；回读 hash 并写 `apply.json`。EXE 和真实用户目录都不修改。也可以对新的空 BackupDir 一次执行 Prepare + `-Apply`，但推荐先完成 fixture 验证。

之后由用户正常启动应用，并执行应用健康检查、二进制文件/本地视频预览及历史会话验收；脚本本身不声称完成服务或播放验收。

## 回滚：默认验证，显式执行

正常退出 DSH Desktop，然后：

```powershell
# 只核对备份、候选、当前安装，不替换。
& 'C:\DSH-Backups\windows-0.11.1-preview\rollback-windows.ps1' `
  -BackupDir 'C:\DSH-Backups\windows-0.11.1-preview'

# 显式恢复原 app.asar；保留更新后产生的新会话和当前用户配置。
& 'C:\DSH-Backups\windows-0.11.1-preview\rollback-windows.ps1' `
  -BackupDir 'C:\DSH-Backups\windows-0.11.1-preview' -Execute
```

回滚只恢复 ASAR，不自动覆盖 profile 备份，不丢弃新会话。完整用户目录备份仅供确有需要时单独评估恢复。已安装原件时执行回滚为幂等 `already-restored`；不匹配基线或候选的 ASAR 会停止，避免覆盖另一次官方更新。

## 源码与 CI

源码修改先形成候选快照，再在远端隔离环境执行测试；本机不运行服务、模型或耗时验收。轻量和 ASAR 测试：

```sh
node test-preview.cjs
node test-media-stream.cjs
node test-asar.cjs
```

检查 manifest / payload hash 后，用真实基线可单独构建与验证（两条命令都必须传 `--exe`）：

```powershell
node .\patch-asar.cjs build --asar ORIGINAL --output CANDIDATE --dir . --exe EXE
node .\patch-asar.cjs verify --asar ORIGINAL --candidate CANDIDATE --dir . --exe EXE
```

这里 `ORIGINAL` / `CANDIDATE` / `EXE` 是文件路径参数。安装脚本已自动传入对应绝对路径并保存完整命令记录。正式接受候选应以远端 CI 和 Windows 安装后健康/媒体验收记录为准，而不是只看脚本生成成功。

### 手工差异回放

若在远端隔离基线目录中回放组合差异（含差异对应的原始相对路径），使用以下参数保留 LF 原始字节：

```sh
git -c core.autocrlf=false apply --no-index -p1 DIFF
```

`DIFF` 是 `windows-preview.diff` 的路径。默认 `core.autocrlf=true` 可能把 JS 改成 CRLF，导致精确 payload hash 失配。本目录 `.gitattributes` 的 `* -text` 也用于保留已验证的文件字节。正常安装应使用上述 PowerShell + ASAR 流程，不把文本差异直接应用到生产安装目录。