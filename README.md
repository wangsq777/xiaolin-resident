# 小林驻留中 · 跨平台关怀桌宠

一款围绕林家谦动态巡逻与日常陪伴设计的 Electron 桌面宠物，支持 macOS 与 Windows。应用不会自动爬取 Instagram 或 Threads，而是陪用户亲自打开官方主页、记录巡逻时间，并通过不同人物形象、关怀提醒和轻量互动安静地留在桌面上。

当前版本为 `v0.6.0`「动态巡逻站」。

## 核心功能

- **动态巡逻站**：一键打开林家谦的 [Instagram](https://www.instagram.com/terencelam0903/) 与 [Threads](https://www.threads.com/@terencelam0903) 官方主页，桌宠切换为“巡逻中”形象，并在本机记录巡逻时间与次数。
- **五种手动状态**：休息、工作、伤心、摸鱼、免打扰；另有巡逻、喝水、活动身体、护眼、睡眠、开心等短暂场景形象。
- **伤心安慰模式**：展开安慰小窗，拥抱形象缓慢呼吸，安慰语每 9 秒轮换，单击人物换一句并出现爱心回应。
- **日常关怀提醒**：喝水、久坐活动、眼睛休息三类提醒，支持间隔设置、稍后提醒和今日完成记录。
- **安静陪伴**：跨午夜安静时段（如 23:00–08:00）、夜间睡眠、窗口位置记忆、鼠标穿透模式、系统托盘常驻。

所有数据保存在本机，不登录社交平台账号。

## 版本目录

| 目录 | 用途 |
| --- | --- |
| [`macos/`](./macos/) | 当前已经完成并经过界面验证的 macOS 版本，同时保留早期 Swift/Xcode 原型 |
| [`windows/`](./windows/) | 以 Electron 版本为基础整理的 Windows 10/11 版本，可开发运行并打包为安装程序或便携版 |

两套版本拥有各自的 `package.json`、源码、素材、测试和说明文档。请进入对应目录后再执行命令。

### macOS

需要 Node.js 22 或更高版本。

```bash
cd macos
npm install
npm start
```

检查代码、运行测试与界面检查：

```bash
npm run check
npm test
npm run smoke:ui
```

详细说明见 [macOS 版项目介绍](./macos/README.md)。

### Windows

推荐 Windows 10/11 64 位、Node.js 22 或更高版本。

```powershell
cd windows
npm install
npm start
```

构建安装包或便携版：

```powershell
npm run build:win            # NSIS 安装程序（64 位）
npm run build:win:portable   # 免安装便携版
```

构建结果位于 `windows/dist/`。当前未配置代码签名，首次打开可能出现 SmartScreen 提示。

详细说明见 [Windows 版项目介绍](./windows/README.md)。

## 隐私边界

- 只打开项目中预设的 Instagram 与 Threads 官方主页。
- 不使用第三方抓取服务，不需要社交平台 Token。
- 不读取帖子内容，不保存账号密码、Cookie 或登录状态。
- 巡逻记录、提醒记录和设置全部保存在本机。
- 不调用摄像头或麦克风。

## 维护约定

- `.git` 保留在最外层，同时管理两个系统版本。
- `node_modules`、构建产物和界面检查截图不会在两个版本间复制或提交。
- macOS 的依赖不能直接用于 Windows；首次使用 Windows 版时必须在 Windows 电脑上重新执行 `npm install`。
- 共用功能修改后，需要分别在两个目录中验证并同步更新，避免平台差异影响窗口、通知、托盘或打包行为。
