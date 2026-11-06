# 开发指南

## 结构

```text
packages/
  dsh-chess-room/
    host/       棋局权威、规则、对话、模型与保存
    stage/      几何、演出控制器、帧动画
    assets/     表情和专用动作
    tests/      离线回归与最小历史清单 fixtures
    vendor/     Apache-2.0 清单验证器与原源码
  dsh-chess-room-live-client/
    context-feature/src/       1.2.1 上下文选择与页面源码
    context-feature/baseline/  已发布 1.2.0 演出基线
scripts/    统一构建、测试、公开内容检查、打包
```

## 构建策略

公开首版的 `pnpm build` 使用经过散列验证的 1.2.0 演出前缀和可编辑的 1.2.1 页面/上下文源码，生成 `client-context-121.js`。这样可以复现当前版本，避免把暂停中的 1.3.0 美术改动误带入首版。

旧入口、旧 Client 产物和部分旧构建脚本仍为现有回归提供基线；它们不是推荐的当前发布命令。`scripts/build-client-generation-fix.mjs` 是后续美术更新的历史构建入口，不能用它替代根目录的公开版本构建。

Node.js 24.9+、pnpm 11。`pnpm build` 可重复执行；`pnpm test` 自动运行 Host 和当前 Client 两组测试；`pnpm check` 检查公开源文件中的常见秘密和个人路径，同时验证声明的动作 PNG；`pnpm package` 生成两个可安装目录和散列清单。

构建后的 Client 内嵌图片较大，属于本次授权分发的美术数据。新的角色素材可以通过 assets 清单接入，但不能仅替换文件名而忽略手掌锚点、左右方向、释放时刻与动作节拍。

## 棋局与动画边界

Host 对候选棋步核验棋局 ID、版本、回合和落点，并先保存再发布唯一 moveId。Client 只呈现这些已确认事件。

放子时在接触点取消手中棋子的可视状态并显示棋盘上的已确认棋子。三拳使用单击片段与三次独立接触事件。朝向、坐标变换和气泡文字分离。取消、超时、断连、新局、悔棋及卸载都必须结束旧演出并恢复权威棋盘。

## 额外图像检查

```sh
python -m pip install -r requirements-dev.txt
python packages/dsh-chess-room/tests/verify-ai-pixels.py
python -m unittest discover -s packages/dsh-chess-room/tests -p 'test_normalize_ai_refresh.py'
```

这些检查使用已有图片与合成测试输入，不调用生成服务。新的付费生成应作为独立美术任务，不属于安装或 CI 流程。

## 许可

编辑自有代码沿用 MIT。改动 vendor 时保留 Apache-2.0 原文、来源和变更说明。美术与内嵌图像适用独立 ASSET-LICENSE.md，贡献代码不能代替图片授权。
