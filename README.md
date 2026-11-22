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
- 能访问 `github.com`（方式 A 需要；网络不通就用方式 B 把文件带过去）。

### 方式 A：直接装 GitHub 仓库（最快）

DSH 的 **添加插件** 输入框接受「npm 包名 / GitHub 仓库地址 / 本地绝对路径」三种写法，所以不用先克隆：

1. 打开 DSH，左侧 **插件（Plugins）**
2. 点 **添加插件（Add plugin）**
3. 粘贴仓库地址：

   ```text
   https://github.com/Lovenndme/dsh-prompt-polish
   ```

4. 点 **安装**，等提示 **已安装**（安装期间显示「插件安装中…」）
5. **重启一次 DSH**（Host 半在启动时加载；只刷新页面不加载 Host 侧代码）
6. 打开任意会话：输入框右侧、模型选择器左边出现 **润色** 按钮

### 方式 B：下载后装本地目录（离线 / 方式 A 失败时）

1. 取得目录，二选一：

   ```sh
   git clone https://github.com/Lovenndme/dsh-prompt-polish.git ~/dsh-plugins/dsh-prompt-polish
   ```

   或在 GitHub 页面点 **Code → Download ZIP**，解压到任意位置。

2. **插件 → 添加插件** → 粘贴该目录的**绝对路径**（必须是直接含 `package.json` 的那一层，例如 `/Users/<用户名>/dsh-plugins/dsh-prompt-polish`）。
3. 同样 **重启一次 DSH**。

### 方式 C：让 agent 装

对那台机器上的 DSH 说一句即可：

> 安装插件 `https://github.com/Lovenndme/dsh-prompt-polish`

agent 会用 `plugin_manager` 的 `install_bundle` 做同样的事（本地目录同理），装完仍要重启 DSH。

安装成功的标志：插件列表里出现 **提示词润色 / Prompt polish** 且处于启用状态；重启后会话里出现「润色」按钮。若没有，见下方「排障」。

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

- 更新（方式 A 装的）：插件页卸载，再用 **添加插件** 重新粘贴地址。Git 安装按当时 `main` 的最新提交打包；要固定版本就在地址后加 `#<提交号>`，例如 `https://github.com/Lovenndme/dsh-prompt-polish#333bf17`。Git 安装的包不会出现在「可更新版本」列表里，需要手动重装。
- 更新（方式 B 装的）：`git -C ~/dsh-plugins/dsh-prompt-polish pull`，然后重启 DSH。
- 卸载：插件页移除该插件（或让 agent 用 `plugin_manager` 的 `remove_bundle`），再重启 DSH。

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

- **插件列表里没有**：方式 A 要确认地址指向仓库根目录（那里直接有 `package.json` 并含 `dsh.bundle.patch`）；方式 B 要确认贴的是绝对路径、且该目录里直接有 `package.json`，不是它的上一层。
- **安装报「该插件已安装」**：先在插件页卸载旧版本再装。
- **有插件但没有按钮**：重启 DSH 后刷新页面；仍有问题看开发者工具 Console 是否有 `slot entry crashed` 类报错。
- **点按钮没反应 / 一直「润色中」**：多为模型路由不可用（会话未选模型或 provider 未配置）。悬停看提示，或先正常发一条消息确认模型可用。

## 说明

- 仓库内不含任何令牌、私钥、`.env` 或本地路径配置；推送凭据由你自己的 GitHub 登录态处理。
- 本插件没有对第三方服务发起除 LLM provider 之外的网络请求。
