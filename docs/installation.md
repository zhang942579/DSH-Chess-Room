# 安装、更新和卸载

## 首版包含两个插件

| 目录 | 包名 | 作用 |
|---|---|---|
| dsh-chess-room | @local/dsh-chess-room | Host 1.2.0：规则、模型候选、状态、保存、头像资源 |
| dsh-chess-room-live-client | @local/dsh-chess-room-live-client | Client 1.2.1：页面、鲸娘演出、上下文选择 |

Client 清单显式声明依赖 Host 提供的服务。必须先安装 Host，再安装 Client。DSH 包清单声明兼容 `>=0.2.1-rc.3 <0.3.0`；不同 DSH 版本的插件管理器界面可能略有差异。

## 从 Release 安装

1. 下载 ZIP，解压到你准备长期保留的目录。链接式安装后不可随意移动或删除这个目录。
2. 打开 DSH Plugin Manager，使用其本地 bundle 安装/链接功能，指定 `dsh-chess-room` 的目录；等待管理器报告应用结果。
3. 用相同方式安装 `dsh-chess-room-live-client`。
4. 在 DSH 侧栏打开「DSH 棋室」。若宿主要求重新加载 Client，按当前 DSH 管理器的提示操作；没有自动热更新承诺。

Release 的 Host 仍有 `zod` 运行依赖，由 DSH 的正常 bundle 安装流程处理。两个目录都附带代码 LICENSE、素材许可和第三方声明。不要在 DSH profile 目录手工安装包或编辑其插件清单。

## 从源码安装

在仓库根目录执行 `pnpm install --frozen-lockfile`、`pnpm build` 和 `pnpm package`，然后安装 `dist/DSH-Chess-Room/` 里的两个目录。

## 模型与账号

模型使用 DSH 当前配置；棋室使用独立对弈会话，不需要图片生成服务的密钥。玩家头像/昵称来自宿主账户服务，加载失败时显示默认头像。选择工作区/对话后，有界的已提交文本可作为棋室模型的交流上下文；选项可取消。

## 更新

先保留当前插件目录，再解压新版本到新的固定目录。通过 Plugin Manager 更新或重新链接这两个 bundle；是否需要重新加载页面以宿主提示为准。保存的棋局由 Host 恢复，旧动画不补演。版本升级前建议使用 DSH 自身支持的备份流程保留本地数据。

## 卸载

通过 Plugin Manager 先停用/移除 Client，再停用/移除 Host。不要删除整个 DSH profile。是否清除棋局数据遵循宿主的本地存储管理能力，卸载说明不授权删除用户存档。

## 常见问题

- **只有旧界面**：确认两个 bundle 都已安装，Client 版本为 1.2.1，并完成宿主要求的 Client 重新加载。
- **头像缺失**：确认当前账户登录和原生资源路由可用；匿名请求的 401 不能证明已登录页面加载失败。
- **AI 应手失败**：检查 DSH 模型配置；非法候选、超时或模型不可用时棋室会回退本地合法候选。
- **动画被打断**：棋盘应直接同步已保存状态。动画结束不会再提交棋子。
