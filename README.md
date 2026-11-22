# 提示词润色 · Prompt polish

一个 DeepSeek Harness（DSH）插件：在输入框工具行里加一个「润色」按钮，把当前草稿改写成可直接执行的提示词，并替换回输入框。

- 位置：输入框右侧工具行，模型选择器左边（`conversation.input.right`）。
- 模型：跟随当前会话的 provider + model，思考档位使用该模型的默认值。
- 只改文本：不发送消息，不在对话流里留下任何内容。
- 语言：跟随草稿语言（中文草稿出中文，英文出英文）。
- 仓库：<https://github.com/Lovenndme/dsh-prompt-polish>

## 安装在另一台电脑上

### 前提

- DeepSeek Harness **Desktop 0.2.2-rc.5**（本仓库只在该版本上验证过；更新的版本通常可用，但插槽与 Remote 契约变动时不保证）。
- 该机器上已经配置好至少一个模型 provider（插件会用它发一次改写请求）。
- 能访问 `github.com`，用于克隆仓库。

### 步骤

1. 克隆仓库到任意目录，例如：

   ```sh
   git clone https://github.com/Lovenndme/dsh-prompt-polish.git ~/dsh-plugins/dsh-prompt-polish
   ```

2. 安装这个本地目录，二选一：

   - **界面**：打开 DSH → 左侧 **插件（Plugins）** → **添加插件（Add plugin）** → 选择第 1 步克隆出来的目录（也就是含 `package.json` 的那一层，`~/dsh-plugins/dsh-prompt-polish`）。
   - **对话**：在 DSH 里对 agent 说「安装本地插件目录 `~/dsh-plugins/dsh-prompt-polish`」，它用 `plugin_manager` 的 `install_bundle` 安装同一个目录。

   安装结果里应看到 `application: applied`，插件列表中应出现 **提示词润色 / Prompt polish**，且处于启用状态。

3. **重启一次 DSH**（Host 半在启动时加载；只刷新页面不加载 Host 侧代码），然后重新打开页面。

4. 打开任意会话：输入框右侧、模型选择器左边应出现「润色」按钮。若没有，见下方「排障」。

## 使用

1. 在输入框里写下草稿（哪怕只有一句话）。
2. 点「润色」：
   - 按钮显示「润色中」，完成后变「已润色」，输入框内容被整段替换；
   - 失败时显示「润色失败」，鼠标悬停可看具体原因，**草稿保持原样**。
3. 改完直接发送即可。

也可以用斜杠命令：`/polish <草稿>`。

### 行为与限制

- 草稿为空，或正在发送消息时，按钮不可用。
- 草稿超过 24000 字符会被拒绝；输出上限 4096 tokens，触顶按失败处理（不会把截断结果写回草稿）。
- 只处理文本：草稿里的附件和 `@` 引用芯片不会进入请求，返回结果是纯文本；润色期间如果你改了草稿或按了发送，这次结果会被丢弃。
- 每次点击会额外产生一次模型请求（用你当前会话的模型，计入你的模型额度）。
- 改写使用会话内的 `polish` 命令作为通道：命令生命周期与润色结果写入会话日志，但对话界面不显示对应行；草稿本身不会被记录（`recordInput: false`）。

## 更新与卸载

- 更新：`git -C ~/dsh-plugins/dsh-prompt-polish pull`，然后在 **插件** 页重新加载/重启 DSH。
- 卸载：**插件** 页移除该插件（或让 agent 用 `plugin_manager` 的 `remove_bundle`），再重启 DSH。

## 目录结构

```text
.
├── package.json        # bundle 清单：dsh.bundle.patch + dsh.client 行
├── cordis.patch.yml    # 插入 prompt-polish 这一行 Loader 条目
├── index.js            # Host 半：注册 polish 命令，调用 ctx.llm.stream 做一次改写
├── client.js           # Client 半：润色按钮 + 屏蔽 polish 命令行的渲染
├── locale/en.json      # 插件标题与描述（英文）
├── locale/zh.json      # 插件标题与描述（中文）
└── icon.svg            # 插件图标
```

## 改写规范

`index.js` 里的 `POLISH_INSTRUCTIONS` 规定改写按 DSH 文档常用的提示词套路组织：目标 → 背景 → 要求 → 约束 → 验收；并额外要求：草稿本来就具体时只做同长度清洗、不加小标题；不输出 `<占位符>`；保留路径、命令、URL、代码等既有事实；不虚构工具或文件；只引用真实存在的能力（`read`、`edit`、`write`、`grep`、`glob`、`bash`、`todo_write`、`subagent`、`web_search`、`web_fetch`、`skill`、`office_*`）。

## 排障

- **插件列表里没有**：确认选中的目录里直接有 `package.json`，且 `package.json` 含 `dsh.bundle.patch`。
- **有插件但没有按钮**：重启 DSH 后刷新页面；仍有问题看开发者工具 Console 是否有 `slot entry crashed` 类报错。
- **点按钮没反应 / 一直「润色中」**：多为模型路由不可用（会话未选模型或 provider 未配置）。悬停看提示，或先正常发一条消息确认模型可用。

## 说明

- 仓库内不含任何令牌、私钥、`.env` 或本地路径配置；推送凭据由你自己的 GitHub 登录态处理。
- 本插件没有对第三方服务发起除 LLM provider 之外的网络请求。
