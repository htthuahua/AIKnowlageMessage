# -*- coding: utf-8 -*-
"""训练问答匹配模型，并构建向量索引。"""
from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from pathlib import Path

import numpy as np
from sentence_transformers import InputExample, SentenceTransformer
from sentence_transformers.base.evaluation.evaluator import BaseEvaluator
from sentence_transformers.sentence_transformer.losses import MultipleNegativesRankingLoss
from torch.utils.data import DataLoader

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from kb_utils import MODEL_DIR, load_records, resolve_train_model_path, save_index

BASE_MODEL = "shibing624/text2vec-base-chinese"


class _ProgressTickEvaluator(BaseEvaluator):
    """仅用于按步触发 fit 回调，不做真实评估。"""

    def __init__(self) -> None:
        super().__init__()
        self.primary_metric = "score"

    def __call__(
        self,
        model: SentenceTransformer,
        output_path: str | None = None,
        epoch: int = -1,
        steps: int = -1,
    ) -> dict[str, float]:
        # 必须返回带 primary_metric 键的字典，否则 fit callback 不会触发
        return {"score": 0.0}


def build_examples(records: list[dict]) -> list[InputExample]:
    return [
        InputExample(texts=[item["question"], item["summary"]])
        for item in records
    ]


ProgressCallback = Callable[..., None]


def train_model(
    records: list[dict],
    epochs: int = 8,
    batch_size: int = 16,
    base_model: str = BASE_MODEL,
    progress_callback: ProgressCallback | None = None,
    show_progress_bar: bool = True,
) -> SentenceTransformer:
    def report(
        phase: str,
        percent: int,
        message: str,
        epoch: int = 0,
        total_epochs: int = 0,
        step: int = 0,
        total_steps: int = 0,
    ) -> None:
        print(f"[训练 {percent:>3}%] {message}", flush=True)
        if progress_callback:
            progress_callback(
                phase,
                percent,
                message,
                epoch,
                total_epochs,
                step,
                total_steps,
            )

    if progress_callback:
        report("load_model", 8, "正在加载模型...")
    model_path, is_local = resolve_train_model_path(base_model)
    if is_local:
        print(f"加载本地模型: {MODEL_DIR}")
        if progress_callback:
            report("load_model", 8, f"加载本地模型（无需联网）...")
        model = SentenceTransformer(model_path, local_files_only=True)
    else:
        print(f"加载基座模型: {base_model}")
        if progress_callback:
            report("load_model", 8, f"加载基座模型: {base_model}（需联网）...")
        model = SentenceTransformer(model_path)

    examples = build_examples(records)
    loader = DataLoader(examples, shuffle=True, batch_size=batch_size)
    loss = MultipleNegativesRankingLoss(model)
    steps_per_epoch = max(1, len(loader))
    total_steps = steps_per_epoch * epochs
    evaluation_steps = 1 if progress_callback else 0
    progress_evaluator = _ProgressTickEvaluator() if progress_callback else None

    def fit_callback(_score: float, epoch: int, global_step: int) -> None:
        done = min(max(global_step, 0), total_steps)
        percent = 12 + int((done / total_steps) * 68)
        current_epoch = min(int(epoch) + 1, epochs)
        report(
            "training",
            percent,
            f"微调第 {current_epoch}/{epochs} 轮，步数 {done}/{total_steps}（{len(records)} 条样本）",
            current_epoch,
            epochs,
            done,
            total_steps,
        )

    print(f"开始训练: {len(records)} 条样本, epochs={epochs}, batch_size={batch_size}", flush=True)
    if progress_callback:
        print(
            f"每轮 {steps_per_epoch} 步，共 {total_steps} 步；每 {evaluation_steps} 步更新进度",
            flush=True,
        )
        report("training", 12, f"开始微调（共 {epochs} 轮，{total_steps} 步）...", 0, epochs)
    model.fit(
        train_objectives=[(loader, loss)],
        epochs=epochs,
        warmup_steps=max(10, len(records) // batch_size),
        output_path=str(MODEL_DIR),
        evaluator=progress_evaluator,
        evaluation_steps=evaluation_steps,
        save_best_model=False,
        show_progress_bar=show_progress_bar,
        callback=fit_callback if progress_callback else None,
    )
    model.save(str(MODEL_DIR))
    if progress_callback:
        report("training", 80, "微调完成，正在加载模型...", epochs, epochs)
    return SentenceTransformer(str(MODEL_DIR), local_files_only=True)


def build_embeddings(
    model: SentenceTransformer,
    records: list[dict],
    progress_callback: ProgressCallback | None = None,
    show_progress_bar: bool = True,
) -> np.ndarray:
    questions = [item["question"] for item in records]
    if progress_callback:
        progress_callback("embedding", 82, f"构建向量索引（{len(questions)} 条问题）...", 0, 0)
    print("构建向量索引...")
    embeddings = model.encode(
        questions,
        batch_size=32,
        show_progress_bar=show_progress_bar,
        normalize_embeddings=True,
    )
    if progress_callback:
        progress_callback("embedding", 90, "向量索引构建完成", 0, 0)
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
