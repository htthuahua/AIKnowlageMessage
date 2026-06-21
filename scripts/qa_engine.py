# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
from sentence_transformers import SentenceTransformer

from kb_utils import INDEX_PATH, MODEL_DIR, ensure_index, load_index, load_records

_CATALOG_RE = re.compile(
    r"(你会什么|你能做什么|你能回答什么|你知道什么|你懂什么|你会哪些|"
    r"有哪些问题|支持什么问题|问题列表|全部问题|所有问题|能问什么|可以问什么|"
    r"what can you do|what do you know)",
    re.IGNORECASE,
)

_CATALOG_PHRASES = (
    "你会什么",
    "你能做什么",
    "你能回答什么",
    "你知道什么",
    "你懂什么",
    "你会哪些",
    "有哪些问题",
    "支持什么问题",
    "问题列表",
    "全部问题",
    "所有问题",
    "能问什么",
    "可以问什么",
)

_IDENTITY_PHRASES = (
    "你是谁",
    "你是什么",
    "介绍一下你自己",
    "介绍你自己",
    "你是哪位",
)


@dataclass
class QueryResult:
    matched: bool
    score: float
    question: str
    id: str = ""
    category: str = ""
    summary: str = ""
    code: str = ""
    message: str = ""
    catalog: bool = False
    questions: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        data = {
            "matched": self.matched,
            "score": round(float(self.score), 3),
            "question": self.question,
            "id": self.id,
            "category": self.category,
            "summary": self.summary,
            "code": self.code,
            "message": self.message,
            "catalog": self.catalog,
        }
        if self.questions:
            data["questions"] = self.questions
        return data


class KnowledgeQA:
    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None
        self._index_mtime: float | None = None
        self._records: list[dict] | None = None
        self._embeddings: np.ndarray | None = None

    def _current_index_mtime(self) -> float | None:
        return INDEX_PATH.stat().st_mtime if INDEX_PATH.exists() else None

    def _index_changed(self) -> bool:
        return self._current_index_mtime() != self._index_mtime

    def _reload_model(self) -> None:
        if not MODEL_DIR.exists():
            raise FileNotFoundError(
                f"模型不存在: {MODEL_DIR}\n请先运行: python scripts/train.py"
            )
        self._model = SentenceTransformer(str(MODEL_DIR))
        self._records, self._embeddings = ensure_index(self._model)
        self._index_mtime = self._current_index_mtime()

    def load(self) -> None:
        if self._model is None or self._index_changed():
            self._reload_model()

    def _ensure_ready(self) -> None:
        if self._model is None or self._index_changed():
            self._reload_model()
            return
        payload = load_index()
        self._records = payload["records"]
        self._embeddings = np.asarray(payload["embeddings"], dtype=np.float32)

    @property
    def model(self) -> SentenceTransformer:
        self._ensure_ready()
        return self._model  # type: ignore[return-value]

    @staticmethod
    def _normalize_question(question: str) -> str:
        text = question.strip().rstrip("？?。!！")
        return text.replace(" ", "")

    @staticmethod
    def _find_exact_record(records: list[dict], question: str) -> dict | None:
        target = KnowledgeQA._normalize_question(question)
        for record in records:
            if KnowledgeQA._normalize_question(record["question"]) == target:
                return record
        return None

    @classmethod
    def _is_catalog_question(cls, question: str) -> bool:
        text = cls._normalize_question(question)
        lowered = text.lower()
        if any(phrase in text for phrase in _CATALOG_PHRASES):
            return True
        if "what can you do" in lowered or "what do you know" in lowered:
            return True
        return bool(_CATALOG_RE.search(text))

    @classmethod
    def _is_identity_question(cls, question: str) -> bool:
        if cls._is_catalog_question(question):
            return False
        text = cls._normalize_question(question)
        return any(phrase in text for phrase in _IDENTITY_PHRASES)

    @staticmethod
    def _find_identity_record(records: list[dict], question: str) -> dict | None:
        text = KnowledgeQA._normalize_question(question)
        system_records = [record for record in records if record.get("category") == "系统"]
        for record in system_records:
            record_question = KnowledgeQA._normalize_question(record["question"])
            if record_question == text or text in record_question or record_question in text:
                return record
        return system_records[0] if system_records else None

    @staticmethod
    def _build_catalog(question: str, records: list[dict]) -> QueryResult:
        grouped: dict[str, list[dict]] = {}
        for record in records:
            category = record.get("category") or "其他"
            grouped.setdefault(category, []).append(
                {
                    "id": record["id"],
                    "question": record["question"],
                    "category": category,
                }
            )

        questions: list[dict] = []
        for category in sorted(grouped):
            questions.extend(grouped[category])

        return QueryResult(
            matched=True,
            score=1.0,
            question=question,
            summary=(
                f"我是你的个人知识库助手，目前收录了 {len(records)} 条问答。"
                "你可以直接问我下面这些问题，或用自己的话描述："
            ),
            message="问题目录",
            catalog=True,
            questions=questions,
        )

    def query(self, question: str, threshold: float = 0.45) -> QueryResult:
        question = question.strip()
        if not question:
            return QueryResult(
                matched=False,
                score=0.0,
                question=question,
                message="请输入问题。",
            )

        self._ensure_ready()
        records = self._records or load_records()
        embeddings = self._embeddings
        if embeddings is None:
            payload = load_index()
            embeddings = np.asarray(payload["embeddings"], dtype=np.float32)

        if self._is_catalog_question(question):
            return self._build_catalog(question, records)

        if self._is_identity_question(question):
            record = self._find_identity_record(records, question)
            if record:
                return QueryResult(
                    matched=True,
                    score=1.0,
                    question=question,
                    id=record["id"],
                    category=record.get("category", ""),
                    summary=record["summary"],
                    code=record.get("code", ""),
                    message="身份介绍",
                )

        exact = self._find_exact_record(records, question)
        if exact:
            return QueryResult(
                matched=True,
                score=1.0,
                question=question,
                id=exact["id"],
                category=exact.get("category", ""),
                summary=exact["summary"],
                code=exact.get("code", ""),
                message="精确匹配",
            )

        q_emb = self.model.encode([question], normalize_embeddings=True)
        q_emb = np.asarray(q_emb, dtype=np.float32)
        scores = (embeddings @ q_emb.T).reshape(-1)

        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])
        if not np.isfinite(best_score):
            best_score = 0.0

        record = records[best_idx]

        if best_score < threshold:
            return QueryResult(
                matched=False,
                score=best_score,
                question=question,
                message=f"知识库中可能没有与「{question}」相关的内容。",
            )

        return QueryResult(
            matched=True,
            score=best_score,
            question=question,
            id=record["id"],
            category=record.get("category", ""),
            summary=record["summary"],
            code=record.get("code", ""),
            message="匹配成功",
        )


qa_engine = KnowledgeQA()
