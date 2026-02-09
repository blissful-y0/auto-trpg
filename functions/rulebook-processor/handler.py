# PDF → 텍스트 추출 Lambda 핸들러
# PyMuPDF로 디지털 PDF 처리, 페이지별 텍스트 + 메타데이터 반환

import json
import os
import tempfile
from typing import Any

import boto3
import fitz  # PyMuPDF


s3 = boto3.client("s3")

BUCKET = os.environ.get("S3_BUCKET", "auto-trpg-rulebooks")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """PDF 텍스트 추출 핸들러

    event:
        rulebook_id: 규칙서 ID
        s3_key: S3 오브젝트 키
    """
    rulebook_id = event.get("rulebook_id", "")
    s3_key = event.get("s3_key", "")

    if not rulebook_id or not s3_key:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "rulebook_id와 s3_key가 필요합니다"}),
        }

    try:
        # S3에서 PDF 다운로드
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            s3.download_fileobj(BUCKET, s3_key, tmp)
            tmp_path = tmp.name

        # PyMuPDF로 텍스트 추출
        pages = extract_text(tmp_path)

        # 임시 파일 정리
        os.unlink(tmp_path)

        # 전체 텍스트 결합
        full_text = "\n\n".join(p["text"] for p in pages if p["text"].strip())

        # 결과를 S3에 저장
        result_key = f"processed/{rulebook_id}/text.json"
        result_data = {
            "rulebook_id": rulebook_id,
            "total_pages": len(pages),
            "pages": pages,
            "full_text": full_text,
        }

        s3.put_object(
            Bucket=BUCKET,
            Key=result_key,
            Body=json.dumps(result_data, ensure_ascii=False),
            ContentType="application/json",
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "rulebook_id": rulebook_id,
                    "total_pages": len(pages),
                    "text_length": len(full_text),
                    "result_key": result_key,
                },
                ensure_ascii=False,
            ),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False),
        }


def extract_text(pdf_path: str) -> list[dict[str, Any]]:
    """PDF에서 페이지별 텍스트 추출"""
    pages: list[dict[str, Any]] = []

    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")

        # 테이블 영역 감지 (구조 보존용)
        tables = page.find_tables()
        table_data = []
        if tables and tables.tables:
            for table in tables.tables:
                table_data.append(table.extract())

        pages.append(
            {
                "page_number": page_num + 1,
                "text": text,
                "tables": table_data,
                "width": page.rect.width,
                "height": page.rect.height,
            }
        )

    doc.close()
    return pages
