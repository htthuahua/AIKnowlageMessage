# -*- coding: utf-8 -*-
"""将知识库 summary 扩展为更详细、更有信息量的结构化回答（幂等，可重复执行）。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MESSAGE_DIR = ROOT / "message"

SECTION_MARKERS = (
    "【详细解释】",
    "【代码说明】",
    "【实践建议】",
    "【补充信息】",
    "【详细说明】",
)

DETAIL_KEY_LABELS = {
    "model": "模型",
    "detector": "检测器",
    "pose_model": "姿态模型",
    "dataset": "数据集",
    "input_size": "输入尺寸",
    "keypoints_count": "关键点数量",
    "features": "特性",
    "use_case": "适用场景",
    "note": "备注",
    "steps": "步骤",
    "params": "参数",
    "output": "输出",
}

TECH_NOTES: dict[str, str] = {
    "RDB": "定期做内存快照，文件紧凑、恢复较快，适合备份；但快照间隔之间的数据可能丢失。",
    "AOF": "追加写命令日志，数据更安全，可通过 appendfsync 控制刷盘频率；文件更大、恢复更慢。",
    "zookeeper": "Zookeeper 提供分布式协调与注册发现能力，偏 CP 模型，适合传统 Dubbo 集群。",
    "Eureka": "Eureka 是 Spring Cloud Netflix 默认注册中心，AP 模型，强调可用性。",
    "Consul": "Consul 集成服务发现、健康检查和 KV 配置，适合云原生场景。",
    "Nacos": "Nacos 同时支持注册发现与配置管理，是 Spring Cloud Alibaba 核心组件。",
    "Feign": "Feign 是声明式 HTTP 客户端，适合 REST 风格远程调用。",
    "Dubbo": "Dubbo 是高性能 RPC 框架，适合 Java 服务间强类型调用。",
    "var": "var 让编译器根据首次赋值推断类型，适合局部变量快速声明。",
    "final": "final 表示引用不可重新绑定，常用于运行期才能确定的常量。",
    "const": "const 用于编译期常量，值必须在编译时确定。",
    "dynamic": "dynamic 关闭静态类型检查，灵活但容易在运行时暴露类型错误。",
    "Widget": "Widget 是 Flutter 界面最小单元，一切皆 Widget。",
    "runApp": "runApp 会把根 Widget 挂载到屏幕并启动渲染管线。",
    "MaterialApp": "MaterialApp 提供 Material 风格路由、主题和导航能力。",
}

CATEGORY_TIPS: dict[str, str] = {
    "JVM": "理解 JVM 结构有助于排查内存、类加载和线程问题。",
    "微服务架构": "选型时要同时考虑团队技术栈、注册中心运维成本和协议兼容性。",
    "SpringCloud": "Spring Cloud 组件通常与 Boot 版本强绑定，升级前需查兼容矩阵。",
    "Redis": "Redis 以内存为主，需结合持久化、过期策略和 maxmemory 一起设计。",
    "Flutter基础": "Flutter 开发建议先掌握 Widget 树、状态管理和路由三要素。",
    "Dart": "Dart 空安全和类型推断能显著减少运行时异常。",
}


def extract_core_summary(summary: str) -> str:
    """从原始或已扩充文本中提取最核心的一段结论（幂等）。"""
    text = summary.strip()
    if not text:
        return ""

    if not any(token in text for token in ("关于「", "【简要结论】", "【核心回答】", *SECTION_MARKERS)):
        return re.sub(r"\s+", " ", text).strip()

    for marker in SECTION_MARKERS:
        if marker in text:
            text = text.split(marker, 1)[0]

    text = re.sub(r"^关于「.+?」的详细回答：\s*", "", text)
    text = re.sub(r"^【分类】.+?\n+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^(【简要结论】\s*\n?)+", "", text)
    text = re.sub(r"^(【核心回答】\s*\n?)+", "", text)
    text = re.sub(r"完整代码示例见下方代码块.+$", "", text, flags=re.DOTALL)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。；！？])", text)
    return [part.strip() for part in parts if part.strip()]


def split_list_items(text: str) -> list[str]:
    chunks = re.split(r"[、，,；;]", text)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def note_for_term(term: str) -> str:
    return TECH_NOTES.get(term, "")


def expand_usage_clause(clause: str) -> list[str]:
    match = re.match(r"(.+?)使用(.+)", clause)
    if not match:
        return [f"· {clause}"]

    subject, usage = match.group(1).strip(), match.group(2).strip().rstrip("；;。.")
    lines = [f"· {subject}：通常采用 {usage}。"]
    for item in split_list_items(usage):
        note = note_for_term(item)
        lines.append(f"  - {item}：{note or f'在 {subject} 体系中承担服务治理或通信支撑作用。'}")
    return lines


def expand_redis_persistence(sentence: str) -> list[str]:
    lines = [f"· {sentence.rstrip('。')}。"]
    if "RDB" in sentence:
        lines.append(f"  - {TECH_NOTES['RDB']}")
    if "AOF" in sentence:
        lines.append(f"  - {TECH_NOTES['AOF']}")
    if "混合持久化" in sentence or "RDB+AOF" in sentence:
        lines.append("  - Redis 4.0 起可先加载 RDB 快照，再重放 AOF 增量，兼顾恢复速度与数据完整性。")
    if "恢复速度" in sentence:
        lines.append("  - RDB 恢复通常比 AOF 重放更快，因为直接加载二进制快照。")
    if "数据安全" in sentence or "刷盘" in sentence:
        lines.append("  - AOF 可通过 everysec/always 控制持久化强度，always 最安全但性能开销最大。")
    return lines


def expand_sentence(sentence: str, question: str, category: str) -> list[str]:
    sentence = sentence.strip().rstrip("。")
    if not sentence:
        return []

    if category == "Redis" and any(k in sentence for k in ("RDB", "AOF", "持久化", "快照")):
        return expand_redis_persistence(sentence)

    if "使用" in sentence and any(k in question for k in ("对比", "分别", "区别")):
        return expand_usage_clause(sentence)

    lines = [f"· {sentence}。"]
    for term in ("RDB", "AOF", "Dubbo", "Nacos", "Eureka", "var", "final", "const"):
        if term in sentence:
            note = note_for_term(term)
            if note:
                lines.append(f"  - {note}")

    if category in CATEGORY_TIPS and len(lines) == 1:
        lines.append(f"  - {CATEGORY_TIPS[category]}")

    return lines


def expand_core_answer(question: str, core: str, category: str) -> list[str]:
    lines: list[str] = []
    for sentence in split_sentences(core) or [core]:
        lines.extend(expand_sentence(sentence, question, category))
    return lines


def extract_code_comments(code: str) -> list[str]:
    comments: list[str] = []
    seen: set[str] = set()
    for line in code.splitlines():
        stripped = line.strip()
        if stripped.startswith("//"):
            text = stripped[2:].strip()
        elif "#" in stripped and not stripped.startswith("#include"):
            text = stripped.split("#", 1)[1].strip()
        else:
            continue
        if text and text not in seen and len(text) >= 3:
            seen.add(text)
            comments.append(text)
    return comments


def explain_code(code: str, category: str) -> list[str]:
    if not code.strip():
        return []

    lines: list[str] = []
    comments = extract_code_comments(code)
    if comments:
        lines.append("· 配置/注释说明：")
        for comment in comments[:6]:
            lines.append(f"  - {comment}")

    if category:
        lines.append(f"· 可将示例参数替换为你的业务场景后再验证。")
    return lines


def build_practice_section(question: str, category: str) -> list[str]:
    if category == "Redis" or "Redis" in question:
        if "区别" in question or "对比" in question or "持久化" in question:
            return [
                "· 缓存为主、允许少量丢失：可优先考虑 RDB 或混合持久化。",
                "· 数据安全要求高：倾向 AOF（everysec），并结合主从/集群保证可用性。",
                "· 修改 redis.conf 后需重启或执行 CONFIG REWRITE 使配置持久生效。",
            ]
        return [
            "· 设计 key 时带上业务前缀，并设置合理 TTL，避免内存持续增长。",
            "· 线上变更前先在测试环境验证持久化与淘汰策略是否符合预期。",
        ]

    if any(k in question for k in ("对比", "区别", "分别")):
        return [
            "· 对比方案时同时看性能、一致性、运维复杂度和团队熟悉度。",
            "· 不要只看名称，建议结合一个最小 Demo 验证后再定型。",
        ]

    if any(k in question for k in ("如何", "怎么", "怎样", "命令", "配置")):
        return [
            "· 先写最小可运行示例，确认流程正确后再补异常处理和边界情况。",
            "· 改配置或命令参数后，记得观察日志确认已生效。",
        ]

    if any(k in question for k in ("是什么", "什么是", "原理", "机制")):
        return [
            "· 理解概念后，尝试用自己的话复述并各举一个项目场景。",
            "· 排查问题时先确认概念边界，再定位是配置、代码还是环境问题。",
        ]

    if category in CATEGORY_TIPS:
        return [f"· {CATEGORY_TIPS[category]}"]

    return [
        "· 建议把本题要点整理成笔记，并补一个实际项目中的例子。",
        "· 若涉及版本差异，以当前使用框架/库的官方文档为准。",
    ]


def format_details(details: dict | list | str) -> str:
    if isinstance(details, str):
        return details.strip()
    if isinstance(details, list):
        return "\n".join(f"· {item}" for item in details)
    lines: list[str] = []
    for key, value in details.items():
        label = DETAIL_KEY_LABELS.get(key, key)
        if isinstance(value, list):
            lines.append(f"· {label}：{', '.join(str(v) for v in value)}")
        else:
            lines.append(f"· {label}：{value}")
    return "\n".join(lines)


def build_enriched_summary(item: dict) -> str:
    question = item["question"].strip()
    category = item.get("category", "").strip()
    core = extract_core_summary(item.get("summary", ""))
    code = item.get("code", "") or ""
    details = item.get("details")

    if category == "系统" and len(core) < 40:
        return core

    sections: list[str] = [
        f"关于「{question}」的详细回答：",
        "",
        "【简要结论】",
        core,
        "",
        "【详细解释】",
        *expand_core_answer(question, core, category),
    ]

    detail_text = format_details(details) if details else ""
    if detail_text:
        sections.extend(["", "【补充信息】", detail_text])

    code_lines = explain_code(code, category)
    if code_lines:
        sections.extend(["", "【代码说明】", *code_lines])

    practice_lines = build_practice_section(question, category)
    if practice_lines:
        sections.extend(["", "【实践建议】", *practice_lines])

    if code.strip():
        sections.append("")
        sections.append("完整代码示例见下方代码块。")

    return "\n".join(sections).strip()


def enrich_file(path: Path, dry_run: bool = False) -> tuple[int, int]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path} 根节点必须是数组")

    changed = 0
    for item in data:
        new = build_enriched_summary(item)
        if new != item.get("summary", "").strip():
            item["summary"] = new
            changed += 1

    if changed and not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")

    return len(data), changed


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    total = 0
    changed_total = 0

    for path in sorted(MESSAGE_DIR.rglob("*.json")):
        count, changed = enrich_file(path, dry_run=dry_run)
        total += count
        changed_total += changed
        print(f"{path.relative_to(ROOT)}: {count} 条, 更新 {changed} 条")

    mode = "预览" if dry_run else "已写入"
    print(f"\n{mode}完成：共 {total} 条，更新 {changed_total} 条 summary")


if __name__ == "__main__":
    main()
