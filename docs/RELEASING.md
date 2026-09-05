# 发布新版本：GitHub Actions 使用指南

GitHub Actions 是 GitHub 提供的自动运行脚本的服务。仓库里的 `.github/workflows/release.yml` 已配置好发布流程：推送版本标签后，GitHub 会在 Windows 和 macOS 机器上运行检查、测试、打包，全部成功后创建一个 **Release 草稿**。你检查下载文件后点击发布，用户才会看到更新。

## 0.2.0 的更新方式

- 首页底部点击“检查更新”，打开更新面板，再点击面板中的“检查更新”。
- Windows：发现新版 → 下载更新 → 重启并更新。进度和窗口位置保存后启动安装程序。普通退出不会自动安装更新。
- macOS：检查新版本后跳转 GitHub Release，选择适合自己芯片的 DMG，退出旧应用后替换安装。当前没有配置 Apple 签名/公证，因此暂不提供应用内自动安装。
- 开发模式 `npm run dev` 显示开发模式说明，不下载或替换程序。
- 不提供 Windows 便携版。发布给用户的是 NSIS 安装版。
- 更新不修改原始 TXT，应用数据目录和 appId 保持不变。建议发布前备份测试机的应用数据。

## 首次发布流程（v0.2.0 历史示例）

1. 在 GitHub 打开本仓库，点击顶部 **Actions**。如果出现启用工作流的提示，启用它。
2. 本地将代码（包括工作流文件）提交、推送到 `main`。以下为最初 `0.2.0` 的示例；当前版本请使用 `package.json` 中的版本号，不要重新推送旧标签。如果代码已提交，可跳过提交命令。

   ```bash
   git add .
   git commit -m "feat: add version updates and release workflow"
   git push origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. 回到 GitHub → **Actions** → **Build release**，打开刚刚出现的运行记录。Windows 和 macOS 两项打包会同时运行，可能需要数分钟。
4. 如果某一项变红，点开对应任务，再点红色步骤查看错误日志。全部成功才会生成草稿。检查日志时不要公开账号凭据。
5. 打开仓库首页右侧 **Releases**，找到 `墨隐阅读 v0.2.0` 的 **Draft**，点击编辑。
6. 确认附件中有 Windows `*-Setup.exe`、两个架构的 macOS DMG/ZIP，以及 `latest.yml` 等更新文件。可先下载草稿附件试运行；也可在 Actions 运行页底部下载 `release-windows` / `release-macos` 构建产物。
7. 填写本次更新说明。不要勾选预发布（Pre-release），点击 **Publish release**。确保仓库公开，未登录的用户也能下载附件。

无需手动创建个人 Token：工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，仅在创建发布草稿的任务中请求 `contents: write` 权限。Token 不进入客户端。若组织策略禁止 Actions 写入 Release，需要在组织/仓库 Actions 策略里允许这项权限。

## 下一次发布，例如 v0.2.1

```bash
# 同步修改 package.json 和 package-lock.json，不自动打标签
npm version 0.2.1 --no-git-tag-version
npm run typecheck
npm test
npm run build
git add .
git commit -m "release: v0.2.1"
git push origin main
git tag v0.2.1
git push origin v0.2.1
```

之后重复 Actions 检查 → Release 草稿验收 → Publish release。标签必须与包版本一致，例如 `v0.2.1` 对应 `0.2.1`，不一致会提前终止工作流。

不要覆盖已发布版本的附件或移动已发布标签。若发现问题，修复后递增版本再发布。失败的任务可以在 Actions 中选择 **Re-run failed jobs**；如果要修改源代码，应创建新版本标签。

## 更新文件与发布验收

安装包从 0.2.1 起统一使用 ASCII 前缀 `moying-novels`（例如 `moying-novels-0.2.1-arm64.dmg`、`moying-novels-0.2.1-x64-Setup.exe`），避免 GitHub 过滤中文附件名后与更新元数据不一致。不要在生成后手动重命名；应修改打包配置后重新构建，保持 `latest*.yml` 中的文件名一致。应用显示名称仍为“墨隐阅读”。

- Windows 自动更新依赖同一 Release 中的 `latest.yml` 和它引用的安装文件；`.blockmap` 用于差分下载。不要手改这些文件，也不要只上传 EXE。
- macOS 提供 `x64`（Intel）和 `arm64`（Apple Silicon）DMG/ZIP。两个架构在同一个任务中打包，避免更新元数据被不同任务相互覆盖。
- 当前构建未配置开发者签名证书。Windows 可能显示未知发布者提示；macOS 从 0.2.1 使用 ad-hoc 签名，但仍可能被 Gatekeeper 拦截，不能将它当成已获 Apple 认证、公证的分发方案。配置 Apple Developer ID 签名、公证后，还需要接入并验证 macOS 自动安装。
- 没有可用的正式 Release、无法访问 GitHub、下载失败时，应用会显示提示，允许重试或打开发布页。
- 一次完整更新验收需要两套真实安装包：安装 `0.2.0`，发布更高版本（例如 `0.2.1`），在 `0.2.0` 里检查、下载、重启安装，确认版本号和阅读进度。单元测试和 `npm run dev` 不代表这一流程已实机通过。
- 本次只新增发布能力，不会因普通 `git push origin main` 自动发布；必须推送版本标签才会运行。

参考：[electron-builder 更新文档](https://www.electron.build/v26/docs/features/auto-update/)、[GitHub 工作流运行说明](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs)。

## macOS 签名与首次运行

0.2.0 的 macOS 包跳过了重新签名，可能出现 `code has no resources but signature indicates they must be present`。这是签名完整性错误，不等于普通的“未知开发者”提示。请安装后续修复版本，不要通过关闭系统安全保护来强行打开旧包。

从 0.2.1 开始，配置 `mac.identity: "-"` 显式进行 ad-hoc 签名；保持 Hardened Runtime 开启，主应用和子组件使用 `build/entitlements.mac.plist`，包含 Electron 所需 JIT 和库加载权限。这不需要付费证书，也不提供 Apple 开发者身份认证或公证。

Actions 的 **Verify macOS release archives and runtime** 步骤会解压两个架构的 ZIP、只读挂载 DMG，对里面的应用运行 `codesign --verify --deep --strict`，检查二进制架构，并对运行机器的原生架构进行 Electron 加载测试。任一失败都会阻止上传与发布草稿。此检查不是 Gatekeeper 放行证明，也不替代真实 Mac 上的界面验收。`spctl` 仍可能因未公证而拒绝应用，不将它作为 ad-hoc 构建的成功条件。

安装时选择 `arm64`（M 系列芯片）或 `x64`（Intel）的 DMG，将应用拖到“应用程序”，退出旧版本后替换。仅从自己的可信 Release 下载；如果系统提供“系统设置 → 隐私与安全 → 仍要打开”，可按系统提示确认。没有此入口或仍提示损坏时，先在 Mac 终端检查：

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/墨隐阅读.app"
spctl --assess --type execute --verbose=4 "/Applications/墨隐阅读.app"
```

记录 macOS 版本、安装包文件名和输出以便排查。不要全局关闭 Gatekeeper。未来接入正式签名时，需要把 `identity: "-"` 改为 Developer ID 身份，配置证书和公证凭据，并重新进行分发验收。
