# my_edit
my edit


实现一个文本编辑器

1、实现文本编辑器基本功能，包括文件、文件夹管理，文本查找、替换，文本高亮等；
2、实现 json 格式化、markdown 实时预览；
3、支持选中文本执行 curl 命令；
4、支持 python、node 脚本调试和运行；


技术栈：

前端：原生 JavaScript + CodeMirror 5 + marked.js（零框架依赖）
后端：Rust 2021 + Tauri v2 + reqwest
平台：macOS 10.15+（DMG / APP 格式）



📝核心编辑

多标签编辑 — 同时打开多个文件，通过标签页快速切换

语法高亮 — 支持 15+ 种语言：JavaScript/JSX/TypeScript/TSX、Python、Rust、Go、HTML、CSS、Markdown、YAML、SQL、Shell、XML 等

代码折叠 — Ctrl+Q 折叠/展开代码块

括号匹配与自动闭合 — 输入时自动补全配对符号

注释切换 — ⌘/ 一键注释/取消注释

查找与替换 — ⌘F 查找、⌘H 替换、⌘G 跳转到行，支持正则、大小写、全词匹配

全局跨文件搜索 — ⌘⇧F 在当前项目目录下递归搜索关键词，结果按文件分组展示，点击跳转定位

当前行高亮 — 编辑时高亮光标所在行

Monokai 深色主题 — 经典暗色配色，护眼舒适

📂 文件管理

文件树侧边栏 — 打开文件夹后展示完整目录结构，支持展开/折叠

拖拽移动 — 在文件树中拖拽文件或文件夹到目标目录

右键菜单 — 新建文件/文件夹、重命名、删除

多文件打开 — ⌘O 支持多选，同时打开多个文件

未保存提醒 — 标签页上的橙色圆点标记未保存状态

退出保护 — 关闭应用前自动检测并提示保存未修改文件

另存为 & 全部保存 — ⌘⇧S 另存为，⌘⌥S 一键保存所有修改

📖 Markdown 实时预览

⌘⇧E 开启左右分屏预览

编辑即时渲染，所见即所得

完整支持 GFM（GitHub Flavored Markdown）：表格、任务列表、代码块、引用等

深色主题适配的渲染样式

🔧 JSON 工具集

内置专业级 JSON 处理工具（菜单栏 → JSON），操作对象为选中文本或全文：

功能	快捷键	说明
格式化	⌘⇧J	美化 JSON，缩进 2 空格
压缩	⌘⇧M	删除所有空白，输出一行
验证	⌘⇧V	检查 JSON 语法，错误时提示详情
Python → JSON	—	将 Python 字典（True/False/None/单引号）转为 JSON
JSON → Python	—	反向转换为 Python 对象表示
排序键	—	递归排序所有 JSON 键（字母序）
🌐 HTTP 请求（curl 集成）

在编辑器中直接编写 curl 命令，⌘⇧R 发送请求

支持 GET / POST / PUT / PATCH / DELETE / HEAD 方法

自动解析 curl 参数：-X（方法）、-H（请求头）、-d（请求体）

支持多行 curl 命令（反斜杠续行）

SSE 流式响应 — 实时追加显示返回数据，适合调试流式 API

响应结果自动展示状态码、耗时、响应头，JSON 自动格式化

🐍 Python 代码执行

⌘⇧B 运行选中代码或全文

实时流式输出 stdout / stderr

显示退出码与执行耗时

输出在专用标签页中展示

🔍 全局搜索

⌘⇧F 在当前打开的目录下跨文件搜索

支持正则表达式、区分大小写、全词匹配三种模式

搜索结果按文件分组，显示匹配行号与上下文

点击结果自动打开文件并跳转到对应行

自动跳过 .git、node_modules、target 等目录和二进制文件

Sublime Text 风格搜索面板 UI

🎨 命令面板

⌘⇧P 呼出命令面板

模糊搜索所有可用命令

键盘上下箭头导航，Enter 执行


功能	macOS	通用
新建文件	⌘N	Ctrl+N
打开文件	⌘O	Ctrl+O
打开文件夹	⌘⇧O	Ctrl+Shift+O
保存	⌘S	Ctrl+S
另存为	⌘⇧S	Ctrl+Shift+S
全部保存	⌘⌥S	Ctrl+Alt+S
关闭标签页	⌘W	Ctrl+W
切换侧边栏	⌘B	Ctrl+B
查找	⌘F	Ctrl+F
替换	⌘H	Ctrl+H
跳转到行	⌘G	Ctrl+G
在文件中查找	⌘⇧F	Ctrl+Shift+F
注释切换	⌘/	Ctrl+/
命令面板	⌘⇧P	Ctrl+Shift+P
JSON 格式化	⌘⇧J	Ctrl+Shift+J
JSON 压缩	⌘⇧M	Ctrl+Shift+M
JSON 验证	⌘⇧V	Ctrl+Shift+V
HTTP 请求	⌘⇧R	Ctrl+Shift+R
运行 Python	⌘⇧B	Ctrl+Shift+B
Markdown 预览	⌘⇧E	Ctrl+Shift+E