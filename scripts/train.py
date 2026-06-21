# -*- coding: utf-8 -*-
"""训练问答匹配模型，并构建向量索引。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import InputExample, SentenceTransformer
from sentence_transformers.sentence_transformer.losses import MultipleNegativesRankingLoss
from torch.utils.data import DataLoader

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from kb_utils import MODEL_DIR, load_records, save_index

BASE_MODEL = "shibing624/text2vec-base-chinese"


def build_examples(records: list[dict]) -> list[InputExample]:
    return [
        InputExample(texts=[item["question"], item["summary"]])
        for item in records
    ]


def train_model(
    records: list[dict],
    epochs: int = 8,
    batch_size: int = 16,
    base_model: str = BASE_MODEL,
) -> SentenceTransformer:
    print(f"加载基座模型: {base_model}")
    model = SentenceTransformer(base_model)

    examples = build_examples(records)
    loader = DataLoader(examples, shuffle=True, batch_size=batch_size)
    loss = MultipleNegativesRankingLoss(model)

    print(f"开始训练: {len(records)} 条样本, epochs={epochs}, batch_size={batch_size}")
    model.fit(
        train_objectives=[(loader, loss)],
        epochs=epochs,
        warmup_steps=max(10, len(records) // batch_size),
        output_path=str(MODEL_DIR),
        show_progress_bar=True,
    )
    return SentenceTransformer(str(MODEL_DIR))


def build_embeddings(model: SentenceTransformer, records: list[dict]) -> np.ndarray:
    questions = [item["question"] for item in records]
    print("构建向量索引...")
    embeddings = model.encode(
        questions,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    return np.asarray(embeddings, dtype=np.float32)


def main() -> None:
    parser = argparse.ArgumentParser(description="训练个人知识库匹配模型")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--base-model", type=str, default=BASE_MODEL)
    args = parser.parse_args()

    records = load_records()
    print(f"已加载 {len(records)} 条问答数据")

    model = train_model(
        records,
        epochs=args.epochs,
        batch_size=args.batch_size,
        base_model=args.base_model,
    )
    embeddings = build_embeddings(model, records)
    save_index(records, embeddings)

    print(f"\n训练完成")
    print(f"模型目录: {MODEL_DIR}")
    print(f"索引文件: {MODEL_DIR / 'index.pkl'}")


if __name__ == "__main__":
    main()
