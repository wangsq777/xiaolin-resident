# 小林驻留中 · Windows 动态巡逻站桌宠

这是“小林驻留中”的 Windows 10/11 版本，以 Electron 桌宠为基础整理。功能与 macOS 版本保持一致，但不包含 Swift、Xcode、macOS 权限文件或 macOS 构建脚本。

## 当前功能

- 打开林家谦的 Instagram 与 Threads 官方主页，并在本机记录巡逻时间。
- 休息、工作、伤心、摸鱼和免打扰五种手动状态。
- 伤心状态下展开安慰小窗，轮换本地安慰语，点击人物出现爱心回应。
- 喝水、久坐活动和眼睛休息提醒。
- 安静时段、夜间睡眠、窗口位置记忆和鼠标穿透。
- Windows 系统托盘、桌面常驻和系统通知。

应用不会自动抓取社交平台帖子，也不会保存密码、Cookie 或登录状态。

## 开发运行

推荐环境：

- Windows 10 或 Windows 11，64 位
- Node.js 22 或更高版本
- PowerShell、Windows Terminal 或命令提示符

首次运行：

```powershell
cd windows
npm install
npm start
```

macOS 的 `node_modules` 不能复制到 Windows 使用，必须在 Windows 电脑上重新安装依赖。

## 检查与测试

```powershell
npm run check
npm test
npm run smoke:ui
```

`smoke:ui` 会临时打开应用进行界面检查，完成后自动退出。

## 构建 Windows 安装包

生成带安装向导的 64 位 `.exe`：

```powershell
npm run build:win
```

生成免安装便携版：

```powershell
npm run build:win:portable
```

构建结果位于 `windows/dist/`。当前构建未配置代码签名，在其他电脑上首次打开时可能出现 Windows SmartScreen 提示；正式分发前建议申请代码签名证书。

## Windows 适配说明

- 使用独立的应用标识，保证通知和任务栏归属正确。
- 主窗口自动隐藏传统菜单栏，保持与桌宠界面一致。
- 关怀设置保存在 Electron 的 Windows 用户数据目录中。
- 打包后 BGM 文件夹位于用户的“音乐”目录；开发模式使用项目内的 `BGM/`。
- 安装版创建开始菜单和桌面快捷方式，支持用户选择安装目录。

## 隐私边界

- 只打开项目中预设的 Instagram 与 Threads 官方主页。
- 不使用第三方抓取服务，不需要社交平台 Token。
- 不读取帖子内容，不保存账号密码或 Cookie。
- 巡逻记录、提醒记录和设置全部保存在本机。
- 不调用摄像头或麦克风。

## 与 macOS 版同步

Windows 和 macOS 是两个独立目录。共用功能、角色素材或文案修改后，应同步更新另一版本并分别运行测试。macOS 版本位于 [../macos/](../macos/)。
