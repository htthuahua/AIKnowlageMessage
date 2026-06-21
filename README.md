# 个人知识库问答系统

基于 **Sentence-BERT 语义匹配** 的本地个人知识库助手。将你自己的问答 JSON 训练成专属检索模型，通过 Web 对话、3D「知识之城」可视化浏览，并支持在线上传、编辑与删除知识点。

---

## 系统简介

本系统不是通用大语言模型，而是 **「检索 + 精准回答」** 架构：

1. 知识以结构化 JSON 存储在 `message/` 目录
2. 使用中文向量模型 `shibing624/text2vec-base-chinese` 微调，学习「问题 ↔ 摘要」的语义关系
3. 用户提问时，系统在向量空间中找最相似的知识点，返回你预先写好的 **摘要与代码**，不凭空生成

适合场景：技术笔记、面试题库、项目 FAQ、个人学习沉淀——**答案可控、可审计、可本地离线运行**。

---

## 核心优势

| 优势 | 说明 |
|------|------|
| **数据完全私有** | 知识库、模型、索引均在本地，无需上传云端 |
| **答案可信赖** | 返回内容来自你自己的 JSON，不会出现模型「胡编」 |
| **语义检索** | 换种问法也能匹配（训练后效果更好），支持相似度阈值过滤 |
| **即时可用** | 上传知识点后立刻重建索引，无需等待训练即可检索 |
| **自动增量训练** | 累计上传 50 条后后台自动微调模型，越用越准 |
| **可视化管理** | Web 界面上传 / 编辑 / 删除；3D 知识之城按知识库映射楼宇与小车 |
| **多知识库分区** | `message/` 下每个文件夹对应一个知识库（一座「楼宇」） |
| **轻量部署** | Flask + 本地模型，单机即可运行，资源占用可控 |

---

## 系统架构

```
message/**/*.json          问答数据源（根节点为数组）
        │
        ▼
scripts/train.py           微调 SentenceTransformer + 构建向量索引
        │
        ▼
models/kb_matcher/         训练后的匹配模型
models/kb_matcher/index.pkl  问题向量索引
        │
        ▼
scripts/qa_engine.py       检索引擎（精确匹配 → 向量相似度）
        │
        ▼
scripts/web_app.py         Flask Web 服务
web/templates + static/    对话 UI · 上传管理 · 知识之城 3D
```

### 问答流程

```
用户提问
   ├─ 完全相同的问法？ ──→ 100% 命中，直接返回 summary
   ├─ 「你会什么」类？ ──→ 返回问题目录
   └─ 否则 ──→ 向量相似度检索
                  ├─ 分数 ≥ 0.45 → 返回最相似条目的 summary / code
                  └─ 分数 < 0.45 → 提示未匹配
```

### 知识之城 3D

- 每个知识库文件夹 → **一座楼宇**（多种造型、随机亮窗）
- 每条知识点 → **一辆外环知识小车**（可点击查看详情）
- 每环最多 **12 座楼宇**；超出则自动生成下一个 **知识小区**（独立环岛 + 外环 + 路网）
- 每个小区外环的小车 **只对应本小区楼宇** 内的知识点

---

## 环境创建

### 前置要求

- **操作系统**：Windows 10/11（亦可在 Linux/macOS 使用相同 conda 步骤）
- **Anaconda** 或 Miniconda
- 建议 **8 GB+ 内存**；首次训练需下载基座模型（约数百 MB）

### 方式一：使用 environment.yml（推荐）

在项目根目录 `UserOnlyModle/` 下执行：

```powershell
cd D:\UserOnlyModle

# 创建 conda 环境
conda env create -f environment.yml

# 激活环境
conda activate user-kb-model
```

`environment.yml` 已包含：

- Python 3.10
- torch
- sentence-transformers ≥ 2.7.0
- flask
- faiss-cpu、numpy、datasets、accelerate 等

### 方式二：手动创建

```powershell
conda create -n user-kb-model python=3.10 -y
conda activate user-kb-model
pip install torch sentence-transformers>=2.7.0 flask faiss-cpu numpy datasets accelerate
```

### 验证安装

```powershell
conda activate user-kb-model
python -c "import torch; import sentence_transformers; import flask; print('OK')"
```

---

## 快速开始

### 1. 首次训练（必须）

确保 `message/` 下已有 JSON 问答数据，然后：

```powershell
conda activate user-kb-model
cd D:\UserOnlyModle
python scripts/train.py --epochs 8
```

或使用项目自带批处理（训练 5 轮 + 运行 Demo）：

```powershell
run_demo.bat
```

训练完成后生成：

- `models/kb_matcher/` — 微调模型
- `models/kb_matcher/index.pkl` — 向量索引

### 2. 启动 Web 服务

```powershell
conda activate user-kb-model
python scripts/web_app.py
```

浏览器打开：**http://127.0.0.1:5000**

### 3. 命令行问答（可选）

```powershell
python scripts/demo.py
python scripts/demo.py -q "Redis的持久化方式有哪些？"
python scripts/ask.py
```

---

## 数据格式

`message/` 下按知识库分文件夹，每个 JSON 文件根节点为 **数组**：

```json
[
  {
    "id": "openclaw_kb_001",
    "question": "OpenClaw 是什么？有什么作用？",
    "summary": "OpenClaw 是一个本地 Agent……",
    "category": "OpenClaw-简介",
    "code": ""
  }
]
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一编号 |
| `question` | 是 | 标准问法 |
| `summary` | 是 | 回答摘要（检索命中后返回的内容） |
| `category` | 否 | 分类标签 |
| `code` | 否 | 代码示例 |

当前项目已包含 Java、Flutter、Redis、Qt、OpenClaw 等多个主题知识库。

---

## Web 功能说明

### 对话问答

- 输入自然语言问题，Enter 发送
- 匹配成功显示摘要、分类、相似度、代码块（可复制）
- 默认相似度阈值 **0.45**

### 上传知识点

入口：侧边栏 / 顶栏 / 首页卡片 **「上传知识点」**

- 选择已有知识库或 **新建知识库**
- 填写问题、摘要、分类、代码
- 保存至 `message/{知识库}/knowledge.json`
- **累计 50 条** 上传后自动触发后台训练

### 知识库管理

- 按知识库筛选、关键词搜索
- **编辑** / **删除** 错误条目
- 修改后立即重建索引，问答实时生效

### 知识之城 3D

- Three.js 渲染：中心环岛、楼宇环、外环道路、路灯与植被
- 点击 **楼宇** → 查看该知识库下所有问题
- 点击 **知识小车** → 查看单条知识点详情
- 新建知识库上传成功后，重新进入 3D 地图可见 **新楼宇**

---

## HTTP API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | Web 主页面 |
| POST | `/api/ask` | 问答检索 |
| GET | `/api/health` | 服务与模型状态 |
| GET | `/api/knowledge-map` | 3D 地图楼宇与知识点数据 |
| GET | `/api/knowledge-bases` | 知识库列表 |
| POST | `/api/upload` | 上传知识点 |
| GET | `/api/upload/history` | 上传历史 |
| GET | `/api/upload/status` | 训练进度（距自动训练还差几条） |
| GET | `/api/knowledge-records` | 查询记录（支持 `kb_id`、`q`） |
| PUT | `/api/knowledge-records/<id>` | 修改记录 |
| DELETE | `/api/knowledge-records/<id>` | 删除记录 |

---

## 目录结构

```
UserOnlyModle/
├── message/                 # 问答 JSON 数据源（按知识库分文件夹）
├── models/kb_matcher/       # 训练产物：模型 + index.pkl
├── data/                    # 运行时数据（上传历史、训练计数、知识库元信息）
├── scripts/
│   ├── train.py             # 训练脚本
│   ├── qa_engine.py         # 检索引擎
│   ├── kb_utils.py          # 数据加载与索引工具
│   ├── kb_upload.py         # 上传 / 编辑 / 删除 / 自动训练
│   ├── web_app.py           # Flask Web 入口
│   ├── demo.py              # 命令行 Demo
│   └── ask.py               # 交互式问答
├── web/
│   ├── templates/index.html
│   └── static/
│       ├── app.js           # 对话与上传 UI
│       ├── city3d.js        # 知识之城 3D
│       └── style.css
├── environment.yml          # Conda 环境定义
├── run_demo.bat             # Windows 一键训练 + Demo
└── README.md                # 本文档
```

---

## 上传 vs 训练：区别说明

| | 上传后立刻可答 | 自动/手动训练后 |
|--|----------------|-----------------|
| **答案内容** | 你写的 summary | 相同 |
| **是否生成新话** | 否 | 否 |
| **新题能否搜到** | 能（已进索引） | 能 |
| **换说法提问** | 依赖当前模型，可能未匹配 | 语义空间更贴合你的库，命中率更高 |

- **上传** = 写入 JSON + 用现有模型重建索引（秒级）
- **训练** = 微调 embedding 模型，提升「找相似问题」的能力（分钟级）

手动全量训练：

```powershell
python scripts/train.py --epochs 8 --batch-size 16
```

---

## 常见问题

**Q: 页面功能不更新？**  
A: 重启 `web_app.py`，浏览器 **Ctrl+F5** 强刷。

**Q: 提示模型未就绪？**  
A: 先运行 `python scripts/train.py`。

**Q: 中文知识库名称？**  
A: 文件夹 ID 会自动转为 `kb_xxxxxxxx`，显示名保存在 `data/kb_meta.json`。

**Q: 如何调整匹配灵敏度？**  
A: 对话 API 传 `threshold`（默认 0.45），越低越宽松，越高越严格。

---

## 技术栈

- **后端**：Python 3.10 · Flask
- **模型**：Sentence-Transformers · PyTorch · text2vec-base-chinese
- **检索**：余弦相似度向量匹配 + 精确问句匹配
- **前端**：原生 HTML/CSS/JS · Three.js（3D 知识之城）

---

## 许可证与说明

本项目为个人知识库学习与检索工具。基座模型 `shibing624/text2vec-base-chinese` 请遵循其原始许可证。知识库内容版权归数据所有者所有。
