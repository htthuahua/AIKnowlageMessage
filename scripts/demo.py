# -*- coding: utf-8 -*-
"""Demo：加载模型，用示例问题测试匹配效果。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from kb_utils import format_answer
from qa_engine import qa_engine

DEFAULT_QUESTIONS = [
    "Dart中如何声明变量？",
    "Flutter怎么配置路由？",
    "Dio网络请求怎么用？",
    "IndexedStack是干什么的？",
    "Dart里var和dynamic区别？",
    "如何回到页面顶部？",
    "JavaScript闭包是什么？",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="个人知识库 Demo")
    parser.add_argument("--question", "-q", type=str, help="单个问题")
    parser.add_argument("--threshold", type=float, default=0.45, help="最低匹配分数")
    args = parser.parse_args()

    qa_engine.load()
    questions = [args.question] if args.question else DEFAULT_QUESTIONS

    for i, question in enumerate(questions, 1):
        print("\n" + "=" * 60)
        print(f"问题 {i}: {question}")
        print("-" * 60)
        result = qa_engine.query(question, threshold=args.threshold)
        if result.catalog and result.questions:
            print(result.summary)
            current_category = None
            for item in result.questions:
                if item["category"] != current_category:
                    current_category = item["category"]
                    print(f"\n【{current_category}】")
                print(f"  · {item['question']}")
        elif result.matched:
            print(format_answer(
                {
                    "id": result.id,
                    "category": result.category,
                    "summary": result.summary,
                    "code": result.code,
                },
                result.score,
            ))
        else:
            print(
                f"【未匹配】相似度 {result.score:.3f} 低于阈值 {args.threshold}\n"
                f"{result.message}"
            )


if __name__ == "__main__":
    main()
