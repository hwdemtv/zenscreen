> [!WARNING]
> 该项目仍处于测试阶段，可能存在一些 Bug（但希望你能有良好的体验！）。

<p align="center">
  <img src="public/openscreen.png" alt="ZenScreen Logo" width="64" />
</p>

# <p align="center">ZenScreen</p>

<p align="center"><strong>ZenScreen 是 Screen Studio 的免费开源替代方案——禅系录屏编辑器。</strong></p>

如果你不想为 Screen Studio 每月支付 29 美元，但又想要一个更简洁的版本，能完成大多数人需要的功能——制作精美的产品演示和教程视频——那么这个免费应用就是为你准备的。ZenScreen 并不提供 Screen Studio 的所有功能，但基本功能一应俱全！

Screen Studio 是一款非常棒的产品，这绝对不是它的 1:1 克隆。ZenScreen 是一个更简洁的方案，只保留核心功能，适合想要自主控制且不想付费的用户。如果你需要所有高级功能，最好的选择是支持 Screen Studio（他们真的很棒，哈哈）。但如果你只是想要一个免费（没有套路）且开源的工具，这个项目就能满足需求！

ZenScreen 100% 免费用于个人和商业用途。使用它、修改它、分发它。

<p align="center">
	<img src="public/preview3.png" alt="ZenScreen 应用预览 1" style="height: 320px; margin-right: 12px;" />
	<img src="public/preview4.png" alt="ZenScreen 应用预览 2" style="height: 320px; margin-right: 12px;" />
</p>

## 核心功能

- 录制整个屏幕或特定窗口
- 添加自动缩放或手动缩放（可自定义缩放深度）
- 录制麦克风音频和系统音频
- 自定义缩放的持续时间和位置
- 裁剪视频录制内容以隐藏部分区域
- 在壁纸、纯色、渐变或自定义背景之间选择
- 运动模糊效果，让平移和缩放更流畅
- 添加标注（文本、箭头、图片）
- 剪辑视频片段
- 自定义不同片段的播放速度
- 以不同的宽高比和分辨率导出

## 安装

从 [GitHub Releases](https://github.com/huwei/zenscreen/releases) 页面下载适合你平台的最新安装程序。

### macOS

如果你遇到 macOS Gatekeeper 阻止应用运行的问题（因为该应用没有开发者证书），你可以在安装后在终端运行以下命令来绕过：

```bash
xattr -rd com.apple.quarantine /Applications/ZenScreen.app
```

注意：需要在 **系统设置 > 隐私与安全性** 中为你的终端授予"完全磁盘访问"权限，然后运行上述命令。

运行此命令后，前往 **系统偏好设置 > 安全性与隐私**，授予"屏幕录制"和"辅助功能"所需的权限。权限授予后，即可启动应用。

### Linux

从发布页面下载 `.AppImage` 文件。添加可执行权限并运行：

```bash
chmod +x ZenScreen-Linux-*.AppImage
./ZenScreen-Linux-*.AppImage
```

根据你的桌面环境，可能需要授予屏幕录制权限。

**注意：** 如果应用因"沙盒"错误无法启动，请使用 --no-sandbox 参数运行：
```bash
./ZenScreen-Linux-*.AppImage --no-sandbox
```

### 局限性

系统音频捕获依赖 Electron 的 [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)，存在一些平台特定的限制：

- **macOS**：需要 macOS 13+。在 macOS 14.2+ 上，系统会提示你授予音频捕获权限。macOS 12 及以下版本不支持系统音频捕获（麦克风仍然可用）。
- **Windows**：开箱即用。
- **Linux**：需要 PipeWire（Ubuntu 22.04+、Fedora 34+ 默认安装）。较旧的仅 PulseAudio 环境可能不支持系统音频捕获（麦克风应该仍然可用）。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- PixiJS
- dnd-timeline

## 致谢

本项目 Fork 自 [OpenScreen](https://github.com/siddharthvaddem/openscreen)，感谢原作者的开源贡献。

## 许可证

本项目基于 [MIT 许可证](./LICENSE) 授权。
