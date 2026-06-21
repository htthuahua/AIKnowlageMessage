# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from kb_utils import MESSAGE_DIR, ROOT, load_records, rebuild_index, save_index

DATA_DIR = ROOT / "data"
HISTORY_PATH = DATA_DIR / "upload_history.json"
STATE_PATH = DATA_DIR / "upload_state.json"
META_PATH = DATA_DIR / "kb_meta.json"
TRAIN_THRESHOLD = 50

_train_lock = threading.Lock()
_training = False

FOLDER_LABELS = {
    "exam": "Exam 题库",
    "java": "Java 生态",
    "redis": "Redis",
    "flutter": "Flutter",
    "qt": "Qt",
    "conda": "Conda / MMPose",
    "dart": "Dart",
    "httpclient": "HttpClient",
    "javadesign": "Java 设计模式",
    "openclaw": "OpenClaw",
    "qt3d": "Qt3D",
    "skeleton": "Skeleton",
    "fit": "FIT",
    "react": "React",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data) -> None:
    _ensure_data_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_kb_meta() -> dict:
    return _load_json(META_PATH, {})


def save_kb_meta(meta: dict) -> None:
    _save_json(META_PATH, meta)


def get_folder_label(folder_id: str) -> str:
    meta = load_kb_meta()
    if folder_id in meta:
        return meta[folder_id].get("name") or folder_id
    return FOLDER_LABELS.get(folder_id, folder_id)


def sanitize_kb_id(kb_id: str) -> str:
    import hashlib

    text = kb_id.strip().lower()
    text = re.sub(r"[^a-z0-9_\-]", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        digest = hashlib.md5(kb_id.strip().encode("utf-8")).hexdigest()[:8]
        text = f"kb_{digest}"
    return text


def list_knowledge_bases() -> list[dict]:
    bases: dict[str, dict] = {}
    if MESSAGE_DIR.exists():
        for path in sorted(MESSAGE_DIR.rglob("*.json")):
            parts = path.relative_to(MESSAGE_DIR).parts
            if not parts:
                continue
            kb_id = parts[0]
            if kb_id not in bases:
                bases[kb_id] = {
                    "id": kb_id,
                    "name": get_folder_label(kb_id),
                    "count": 0,
                    "is_custom": kb_id in load_kb_meta(),
                }
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    bases[kb_id]["count"] += len(data)
            except Exception:
                pass
    return sorted(bases.values(), key=lambda item: item["name"])


def _kb_folder(kb_id: str) -> Path:
    return MESSAGE_DIR / kb_id


def _next_record_id(kb_id: str) -> str:
    prefix = f"{kb_id}_kb_"
    numbers: list[int] = []
    for record in load_records():
        rid = record.get("id", "")
        if not rid.startswith(prefix):
            continue
        suffix = rid[len(prefix) :]
        if suffix.isdigit():
            numbers.append(int(suffix))
    return f"{prefix}{(max(numbers, default=0) + 1):03d}"


def _kb_main_file(kb_id: str) -> Path:
    folder = _kb_folder(kb_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "knowledge.json"


def _kb_id_from_path(path: Path) -> str:
    parts = path.relative_to(MESSAGE_DIR).parts
    return parts[0] if parts else ""


def find_record_by_id(record_id: str) -> tuple[Path, int, dict] | None:
    record_id = record_id.strip()
    if not record_id or not MESSAGE_DIR.exists():
        return None
    for path in sorted(MESSAGE_DIR.rglob("*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, list):
            continue
        for index, item in enumerate(data):
            if item.get("id") == record_id:
                return path, index, item
    return None


def list_kb_records(
    kb_id: str | None = None,
    query: str = "",
    limit: int = 200,
) -> list[dict]:
    kb_filter = sanitize_kb_id(kb_id) if kb_id else ""
    needle = query.strip().lower()
    records = load_records()
    result: list[dict] = []
    for record in records:
        source = record.get("source", "")
        parts = source.split("/")
        folder = parts[1] if len(parts) > 1 else ""
        if kb_filter and folder != kb_filter:
            continue
        if needle:
            haystack = " ".join(
                [
                    record.get("question", ""),
                    record.get("summary", ""),
                    record.get("category", ""),
                    record.get("id", ""),
                ]
            ).lower()
            if needle not in haystack:
                continue
        result.append(
            {
                "id": record["id"],
                "question": record["question"],
                "summary": record.get("summary", ""),
                "category": record.get("category", ""),
                "code": record.get("code", ""),
                "kb_id": folder,
                "kb_name": get_folder_label(folder),
                "source": source,
            }
        )
    return result[:limit]


def update_record(
    record_id: str,
    question: str,
    summary: str,
    category: str = "",
    code: str = "",
    qa_engine=None,
) -> dict:
    if not question.strip():
        raise ValueError("问题不能为空")
    if not summary.strip():
        raise ValueError("回答摘要不能为空")

    located = find_record_by_id(record_id)
    if not located:
        raise ValueError("记录不存在或已被删除")

    path, index, _old = located
    updated = {
        "id": record_id,
        "question": question.strip(),
        "summary": summary.strip(),
        "category": (category or "其他").strip(),
        "code": (code or "").strip(),
    }

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("数据格式错误")
    data[index] = updated
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if qa_engine is not None:
        refresh_index_after_upload(qa_engine)

    kb_id = _kb_id_from_path(path)
    return {
        "ok": True,
        "record": updated,
        "kb_id": kb_id,
        "kb_name": get_folder_label(kb_id),
    }


def delete_record(record_id: str, qa_engine=None) -> dict:
    located = find_record_by_id(record_id)
    if not located:
        raise ValueError("记录不存在或已被删除")

    path, index, old = located
    kb_id = _kb_id_from_path(path)

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("数据格式错误")
    data.pop(index)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if qa_engine is not None:
        refresh_index_after_upload(qa_engine)

    return {
        "ok": True,
        "deleted_id": record_id,
        "question": old.get("question", ""),
        "kb_id": kb_id,
        "kb_name": get_folder_label(kb_id),
    }


def append_record_to_kb(
    kb_id: str,
    question: str,
    summary: str,
    category: str = "",
    code: str = "",
    kb_name: str | None = None,
) -> tuple[dict, bool]:
    kb_id = sanitize_kb_id(kb_id)
    if not kb_id:
        raise ValueError("知识库标识无效")

    folder = _kb_folder(kb_id)
    is_new_building = not folder.exists() or not any(folder.glob("*.json"))

    if is_new_building:
        if not kb_name or not kb_name.strip():
            raise ValueError("新建知识库需要填写名称")
        meta = load_kb_meta()
        meta[kb_id] = {"name": kb_name.strip(), "created_at": _now_iso()}
        save_kb_meta(meta)
    elif kb_name and kb_name.strip():
        meta = load_kb_meta()
        entry = meta.get(kb_id, {})
        entry["name"] = kb_name.strip()
        meta[kb_id] = entry
        save_kb_meta(meta)

    record = {
        "id": _next_record_id(kb_id),
        "question": question.strip(),
        "summary": summary.strip(),
        "category": (category or "其他").strip(),
        "code": (code or "").strip(),
    }

    path = _kb_main_file(kb_id)
    items: list[dict] = []
    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            items = data
    items.append(record)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    return record, is_new_building


def load_upload_state() -> dict:
    state = _load_json(
        STATE_PATH,
        {"pending_since_train": 0, "last_train_at": None, "total_uploads": 0},
    )
    state.setdefault("pending_since_train", 0)
    state.setdefault("total_uploads", 0)
    return state


def save_upload_state(state: dict) -> None:
    _save_json(STATE_PATH, state)


def append_history(entry: dict) -> None:
    history = _load_json(HISTORY_PATH, [])
    history.insert(0, entry)
    history = history[:200]
    _save_json(HISTORY_PATH, history)


def get_upload_history(limit: int = 50) -> list[dict]:
    history = _load_json(HISTORY_PATH, [])
    return history[:limit]


def get_upload_status() -> dict:
    global _training
    state = load_upload_state()
    return {
        "pending_since_train": state.get("pending_since_train", 0),
        "threshold": TRAIN_THRESHOLD,
        "training": _training,
        "last_train_at": state.get("last_train_at"),
        "total_uploads": state.get("total_uploads", 0),
    }


def _run_training(qa_engine) -> None:
    global _training
    from train import build_embeddings, train_model

    try:
        records = load_records()
        model = train_model(records, epochs=5, batch_size=16)
        embeddings = build_embeddings(model, records)
        save_index(records, embeddings)
        qa_engine._reload_model()
        state = load_upload_state()
        state["pending_since_train"] = 0
        state["last_train_at"] = _now_iso()
        save_upload_state(state)
    finally:
        _training = False


def refresh_index_after_upload(qa_engine) -> None:
    qa_engine.load()
    qa_engine._records, qa_engine._embeddings = rebuild_index(qa_engine.model)
    qa_engine._index_mtime = qa_engine._current_index_mtime()


def upload_knowledge(
    kb_id: str,
    question: str,
    summary: str,
    category: str = "",
    code: str = "",
    kb_name: str | None = None,
    qa_engine=None,
) -> dict:
    global _training

    if not question.strip():
        raise ValueError("问题不能为空")
    if not summary.strip():
        raise ValueError("回答摘要不能为空")

    record, is_new_building = append_record_to_kb(
        kb_id, question, summary, category, code, kb_name
    )

    if qa_engine is not None:
        refresh_index_after_upload(qa_engine)

    state = load_upload_state()
    state["pending_since_train"] = int(state.get("pending_since_train", 0)) + 1
    state["total_uploads"] = int(state.get("total_uploads", 0)) + 1
    save_upload_state(state)

    history_entry = {
        "id": str(uuid.uuid4()),
        "time": _now_iso(),
        "kb_id": sanitize_kb_id(kb_id),
        "kb_name": get_folder_label(sanitize_kb_id(kb_id)),
        "record_id": record["id"],
        "question": record["question"],
        "category": record["category"],
        "is_new_building": is_new_building,
    }
    append_history(history_entry)

    training_started = False
    if state["pending_since_train"] >= TRAIN_THRESHOLD and not _training:
        with _train_lock:
            if not _training:
                _training = True
                training_started = True
                thread = threading.Thread(
                    target=_run_training,
                    args=(qa_engine,),
                    daemon=True,
                )
                thread.start()

    return {
        "ok": True,
        "record": record,
        "kb_id": sanitize_kb_id(kb_id),
        "kb_name": get_folder_label(sanitize_kb_id(kb_id)),
        "is_new_building": is_new_building,
        "pending_since_train": state["pending_since_train"],
        "train_threshold": TRAIN_THRESHOLD,
        "training_started": training_started,
        "training": _training,
    }
