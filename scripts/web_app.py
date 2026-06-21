# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
from pathlib import Path

from flask import Flask, jsonify, render_template, request

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from kb_utils import MODEL_DIR, load_records
from kb_upload import (
    delete_record,
    get_folder_label,
    get_upload_history,
    get_upload_status,
    list_kb_records,
    list_knowledge_bases,
    update_record,
    upload_knowledge,
)
from qa_engine import qa_engine

app = Flask(
    __name__,
    template_folder=str(ROOT / "web" / "templates"),
    static_folder=str(ROOT / "web" / "static"),
)


@app.get("/")
def index():
    return render_template("index.html")


@app.after_request
def disable_static_cache(response):
    if request.path == "/" or request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.post("/api/ask")
def ask_api():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    threshold = float(data.get("threshold") or 0.45)

    try:
        result = qa_engine.query(question, threshold=threshold)
        return jsonify(result.to_dict())
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc), "matched": False}), 500
    except Exception as exc:
        return jsonify({"error": f"查询失败: {exc}", "matched": False}), 500


@app.get("/api/health")
def health():
    ready = MODEL_DIR.exists()
    count = 0
    if ready:
        try:
            count = len(load_records())
        except Exception:
            count = 0
    return jsonify({"status": "ok", "model_ready": ready, "record_count": count})


@app.get("/api/knowledge-bases")
def knowledge_bases_api():
    try:
        return jsonify({"bases": list_knowledge_bases()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/upload/status")
def upload_status_api():
    try:
        status = get_upload_status()
        status["record_count"] = len(load_records())
        return jsonify(status)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/upload/history")
def upload_history_api():
    try:
        return jsonify({"history": get_upload_history()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/upload")
def upload_api():
    data = request.get_json(silent=True) or {}
    kb_id = (data.get("kb_id") or "").strip()
    kb_name = (data.get("kb_name") or "").strip()
    question = (data.get("question") or "").strip()
    summary = (data.get("summary") or "").strip()
    category = (data.get("category") or "").strip()
    code = (data.get("code") or "").strip()

    if not kb_id and not kb_name:
        return jsonify({"error": "请选择或新建知识库"}), 400
    if not kb_id:
        kb_id = kb_name

    try:
        result = upload_knowledge(
            kb_id=kb_id,
            question=question,
            summary=summary,
            category=category,
            code=code,
            kb_name=kb_name or None,
            qa_engine=qa_engine,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"上传失败: {exc}"}), 500


@app.get("/api/knowledge-records")
def knowledge_records_api():
    kb_id = (request.args.get("kb_id") or "").strip()
    query = (request.args.get("q") or "").strip()
    limit = min(int(request.args.get("limit") or 200), 500)
    try:
        records = list_kb_records(kb_id=kb_id or None, query=query, limit=limit)
        return jsonify({"records": records, "total": len(records)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.put("/api/knowledge-records/<record_id>")
def update_record_api(record_id: str):
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    summary = (data.get("summary") or "").strip()
    category = (data.get("category") or "").strip()
    code = (data.get("code") or "").strip()
    try:
        result = update_record(
            record_id=record_id,
            question=question,
            summary=summary,
            category=category,
            code=code,
            qa_engine=qa_engine,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"修改失败: {exc}"}), 500


@app.delete("/api/knowledge-records/<record_id>")
def delete_record_api(record_id: str):
    try:
        result = delete_record(record_id=record_id, qa_engine=qa_engine)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"删除失败: {exc}"}), 500


@app.get("/api/knowledge-map")
def knowledge_map():
    try:
        records = load_records()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    buildings: dict[str, dict] = {}
    for record in records:
        source = record.get("source", "")
        parts = source.split("/")
        folder = parts[1] if len(parts) > 1 else "other"
        if folder not in buildings:
            buildings[folder] = {
                "id": folder,
                "name": get_folder_label(folder),
                "count": 0,
                "categories": {},
                "questions": [],
            }
        entry = buildings[folder]
        entry["count"] += 1
        category = record.get("category") or "其他"
        entry["categories"][category] = entry["categories"].get(category, 0) + 1
        entry["questions"].append(
            {
                "id": record["id"],
                "question": record["question"],
                "category": category,
                "summary": record.get("summary", ""),
                "code": record.get("code", ""),
                "buildingId": folder,
                "buildingName": get_folder_label(folder),
            }
        )

    result = sorted(buildings.values(), key=lambda item: item["count"], reverse=True)
    for item in result:
        item["categories"] = [
            {"name": name, "count": count}
            for name, count in sorted(
                item["categories"].items(), key=lambda pair: pair[1], reverse=True
            )
        ]

    return jsonify({"total": len(records), "buildings": result})


def main() -> None:
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("PYTHONUTF8", "1")

    print("正在加载模型与索引...")
    qa_engine.load()
    records = qa_engine._records or load_records()
    print(f"知识库条目: {len(records)}")
    print("个人知识库 Web 已启动: http://127.0.0.1:5000")
    print("直接运行: python scripts/web_app.py")
    app.run(host="127.0.0.1", port=5000, debug=False)


if __name__ == "__main__":
    main()
