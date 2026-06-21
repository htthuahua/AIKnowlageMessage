# -*- coding: utf-8 -*-
"""交互式提问 Demo。"""
from __future__ import annotations

import sys
from pathlib import Path

from sentence_transformers import SentenceTransformer

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from demo import ask
from kb_utils import MODEL_DIR


def main() -> None:
    if not MODEL_DIR.exists():
        print("模型不存在，请先运行: python scripts/train.py")
        sys.exit(1)

    model = SentenceTransformer(str(MODEL_DIR))
    print("个人知识库 Demo 已启动，输入问题后回车；输入 exit 退出。")

    while True:
        try:
            question = input("\n你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见。")
            break

        if not question:
            continue
        if question.lower() in {"exit", "quit", "q"}:
            print("再见。")
            break

        print("\n知识库:")
        print(ask(model, question))


if __name__ == "__main__":
    main()
