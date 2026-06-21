# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MESSAGE_DIR = ROOT / "message"
MODEL_DIR = ROOT / "models" / "kb_matcher"
INDEX_PATH = MODEL_DIR / "index.pkl"


def load_records() -> list[dict]:
    records: list[dict] = []
    for path in sorted(MESSAGE_DIR.rglob("*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError(f"{path} 根节点必须是数组")
        for item in data:
            records.append(
                {
                    "id": item["id"],
                    "question": item["question"].strip(),
                    "summary": item["summary"].strip(),
                    "category": item.get("category", ""),
                    "code": item.get("code", ""),
                    "source": str(path.relative_to(ROOT)).replace("\\", "/"),
                }
            )
    if not records:
        raise FileNotFoundError(f"未在 {MESSAGE_DIR} 找到任何 json 数据")
    return records


def save_index(records: list[dict], embeddings) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"records": records, "embeddings": embeddings}
    with open(INDEX_PATH, "wb") as f:
        pickle.dump(payload, f)


def refresh_index_records(payload: dict) -> dict:
    """用 JSON 最新内容刷新索引里的 records，保持与原索引相同顺序。"""
    fresh_by_id = {item["id"]: item for item in load_records()}
    records: list[dict] = []
    for old in payload["records"]:
        if old["id"] in fresh_by_id:
            records.append(fresh_by_id[old["id"]])
        else:
            records.append(old)
    payload["records"] = records
    return payload


def index_is_valid(payload: dict, records: list[dict]) -> bool:
    embeddings = payload.get("embeddings")
    if embeddings is None:
        return False
    embeddings = np.asarray(embeddings)
    if len(payload.get("records", [])) != len(records):
        return False
    if embeddings.shape[0] != len(records):
        return False
    if embeddings.ndim != 2 or embeddings.shape[1] == 0:
        return False
    if float(np.linalg.norm(embeddings[0])) < 0.1:
        return False
    return True


def rebuild_index(model) -> tuple[list[dict], np.ndarray]:
    records = load_records()
    questions = [item["question"] for item in records]
    embeddings = model.encode(
        questions,
        batch_size=32,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    embeddings = np.asarray(embeddings, dtype=np.float32)
    save_index(records, embeddings)
    return records, embeddings


def ensure_index(model) -> tuple[list[dict], np.ndarray]:
    records = load_records()
    if INDEX_PATH.exists():
        with open(INDEX_PATH, "rb") as f:
            payload = pickle.load(f)
        payload = refresh_index_records(payload)
        if index_is_valid(payload, payload["records"]):
            save_index(payload["records"], payload["embeddings"])
            return payload["records"], np.asarray(payload["embeddings"], dtype=np.float32)
    return rebuild_index(model)


def load_index():
    if not INDEX_PATH.exists():
        raise FileNotFoundError(
            f"索引不存在: {INDEX_PATH}\n请先运行: python scripts/train.py"
        )
    with open(INDEX_PATH, "rb") as f:
        payload = pickle.load(f)
    return refresh_index_records(payload)


def format_answer(record: dict, score: float) -> str:
    lines = [
        f"【匹配度】{score:.3f}",
        f"【编号】{record['id']}",
        f"【分类】{record['category']}",
        f"【总结】{record['summary']}",
    ]
    if record.get("code"):
        lines.append("【代码】")
        lines.append(record["code"])
    return "\n".join(lines)
