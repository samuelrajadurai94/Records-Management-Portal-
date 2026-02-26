"""
services/Metadata_tagging.py
-----------------------------
Text extraction service for files that were not processed during segregation.
Uses OCR + PyMuPDF to extract text and update the DB.
"""

import os
import tempfile
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

import fitz          # PyMuPDF
import ocrmypdf
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Metatagging packages
import os
import re
import pandas as pd
from pathlib import Path
from typing import Optional
import time
import re
import json
import time
import base64
import tempfile
from datetime import datetime, timezone
from typing import List, Optional, Dict
import requests
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

import models
from services.box_service import box_service
from services.segregation import _remove_symbols, _check_readability, STOPLIST
from services.metadata_pydantic_schema_list import *





Total_schema_list_name_strings = [ADStatus_Statement_listData,ARC_Statement_listData,BSI_Report_listData,
                     ETOPS_Statement_listData,NonExceedance_Statement_listData,FanBladeStatement_listData,
                     Hours_Cycles_Statement_listData,HPTBladeStatement_listData,InstallRemovalStatement_listData,
                     LDNDStatement_listData,LLPStatusStatement_listData,ManufacturerDelivery_listData,
                     IncidentAccidentStatement_listData,Oilfuelused_Statement_listData,PMADER_Statement_listData,
                     Preservation_Statement_listData,LRUQECStatement_listData,SBStatus_Statement_listData,
                     ThrustRating_Statement_listData,Commercial_Statement_listData]

# Configurable thread pool size (default 4 workers)
META_WORKERS = int(os.getenv("META_WORKERS", "4"))

# In-memory job status: engine_id -> { status, total, completed }
_extraction_status: dict[int, dict] = {}
_extraction_lock = threading.Lock()


def get_extraction_status(engine_id: int) -> dict:
    return _extraction_status.get(engine_id, {"status": "idle", "total": 0, "completed": 0})


def Extract_text_ocmp(pdf_bytes: bytes, filename: str) -> dict:
    """
    Extract text from PDF bytes using PyMuPDF, run OCR if needed.
    Returns result dict with raw_text, cleaned_text, status, reason.
    """
    result = {
        "text_extraction_status": "",
        "raw_text": "",
        "cleaned_text": "",
        "reason": "",
    }

    try:
        pdf_doc = fitz.open(stream=BytesIO(pdf_bytes), filetype="pdf")
        page_texts = []
        all_text = ""
        for i in range(min(len(pdf_doc), 50)):
            t = pdf_doc[i].get_text("text")
            page_texts.append(t)
            all_text += t
        num_pages = len(pdf_doc)
        pdf_doc.close()

        clean = _remove_symbols(all_text)
        readable, score, valid = _check_readability(clean)
        final_valid = [w for w in valid if w.lower() not in STOPLIST]

        if not all_text.strip() or len(final_valid) < 3:
            # Try OCR
            in_path = out_path = None
            with tempfile.NamedTemporaryFile(suffix="_in.pdf", delete=False) as fin:
                fin.write(pdf_bytes)
                in_path = fin.name
            with tempfile.NamedTemporaryFile(suffix="_out.pdf", delete=False) as fout:
                out_path = fout.name
            try:
                ocrmypdf.ocr(
                    in_path, out_path,
                    deskew=True, rotate_pages=True, force_ocr=True,
                    progress_bar=False,
                    pages = f"1-{min(num_pages, 50)}",
                    jobs=1, tesseract_timeout=300
                )
                ocr_doc = fitz.open(out_path)
                ocr_text = ""
                for i in range(min(num_pages, 50)):
                    t = ocr_doc[i].get_text("text")
                    ocr_text += t
                ocr_doc.close()

                clean = _remove_symbols(ocr_text)
                readable, score, valid = _check_readability(clean)

                result["raw_text"]     = ocr_text
                result["cleaned_text"] = clean

                if readable and len(valid) > 10:
                    result["text_extraction_status"] = "OCR readable"
                    result["reason"] = f"OCR ratio: {score:.2f}"
                else:
                    result["text_extraction_status"] = "OCR not readable"
                    result["reason"] = f"OCR ratio: {score:.2f}"
            except Exception as e:
                result["text_extraction_status"] = "OCR error"
                result["reason"] = str(e)
            finally:
                for p in [in_path, out_path]:
                    if p:
                        try:
                            os.remove(p)
                        except Exception:
                            pass
        else:
            result["raw_text"]     = all_text
            result["cleaned_text"] = clean

            if readable and len(final_valid) > 10:
                result["text_extraction_status"] = "PDF readable"
                result["reason"] = f"PDF ratio: {score:.2f}"
            else:
                result["text_extraction_status"] = "PDF not readable"
                result["reason"] = f"PDF ratio: {score:.2f}"

    except Exception as e:
        result["text_extraction_status"] = "Error"
        result["reason"] = str(e)

    return result


# ─────────────────────────────────────────────────────────────
# Single-file worker (thread-safe, no DB access)
# ─────────────────────────────────────────────────────────────
def _extract_single_file(row_id: int, box_file_id: str, box_file_name: str) -> dict:
    """
    Download a single file from Box and extract text.
    Returns dict with row_id and extraction results.
    """
    try:
        pdf_bytes = box_service.client.downloads.download_file(box_file_id).read()
        result = Extract_text_ocmp(pdf_bytes, box_file_name)
        result["row_id"] = row_id
        return result
    except Exception as e:
        return {
            "row_id": row_id,
            "raw_text": "",
            "cleaned_text": "",
            "text_extraction_status": "Download error",
            "reason": str(e),
        }

excluded_categories = [
    "8. Engine Condition-Trend Monitoring Report",
    "23. In-House Modifications(If applicable)",
    "10. Last Test Cell-MPA Report"
    "20. LLP BTB Trace",
    "14. Shop Visit Records",
    "9. Oil Consumption Reports",
    "7. Field repairs Statement"
]

# ─────────────────────────────────────────────────────────────
# MAIN: PERFORM TEXT EXTRACTION (multithreaded)
# ─────────────────────────────────────────────────────────────
def perform_text_extraction(engine_id: int, db: Session):
    """
    Filter segregation results where raw_text is empty/null and
    status is NOT 'Non-PDF non-media'. Download each PDF from Box,
    extract text with OCR, and update the DB rows.
    """
    with _extraction_lock:
        _extraction_status[engine_id] = {"status": "running", "total": 0, "completed": 0}

    try:
        # Filter rows: PDF files only, where raw_text is null or empty
        from sqlalchemy import func
        # rows = (
        #     db.query(models.SegregationResult)
        #     .filter(
        #         models.SegregationResult.engine_id == engine_id,
        #         or_(
        #             models.SegregationResult.raw_text == None,
        #             models.SegregationResult.raw_text == "",
        #         ),
        #         func.lower(models.SegregationResult.box_file_name).like("%.pdf"),
        #     )
        #     .all()
        # )
        rows = (
            db.query(models.SegregationResult)
            .filter(
                models.SegregationResult.engine_id == engine_id,
                or_(
                    models.SegregationResult.raw_text == None,
                    models.SegregationResult.raw_text == "",
                ),
                func.lower(models.SegregationResult.box_file_name).like("%.pdf"),
                ~models.SegregationResult.category.in_(excluded_categories)  # ← Exclude these
            )
            .all()
        )

        total = len(rows)
        print(f"[MetadataExtraction] Engine {engine_id}: found {total} files needing text extraction")

        with _extraction_lock:
            _extraction_status[engine_id]["total"] = total

        if total == 0:
            with _extraction_lock:
                _extraction_status[engine_id] = {"status": "done", "total": 0, "completed": 0}
            return

        # Build work items (id, box_file_id, box_file_name)
        work_items = [(r.id, r.box_file_id, r.box_file_name) for r in rows]

        # Lock for thread-safe DB writes (one commit per file)
        _db_write_lock = threading.Lock()
        completed = 0

        with ThreadPoolExecutor(max_workers=META_WORKERS) as executor:
            future_to_item = {
                executor.submit(_extract_single_file, rid, bfid, bfname): (rid, bfname)
                for rid, bfid, bfname in work_items
            }

            for future in as_completed(future_to_item):
                rid, bfname = future_to_item[future]
                try:
                    result = future.result()
                except Exception as e:
                    print(f"[MetadataExtraction] Thread error for {bfname}: {e}")
                    result = {
                        "row_id": rid,
                        "raw_text": "",
                        "cleaned_text": "",
                        "text_extraction_status": "Thread error",
                        "reason": str(e),
                    }

                # ── Write to DB immediately (thread-safe via lock) ──
                with _db_write_lock:
                    try:
                        row = db.query(models.SegregationResult).filter(
                            models.SegregationResult.id == result["row_id"]
                        ).first()
                        if row:
                            row.raw_text     = result["raw_text"]
                            row.cleaned_text = result["cleaned_text"]
                            row.text_extraction_status       = result["text_extraction_status"]
                            row.reason       = result["reason"]
                            db.commit()
                    except Exception as db_err:
                        db.rollback()
                        print(f"[MetadataExtraction] DB write failed for {bfname}: {db_err}")

                completed += 1
                with _extraction_lock:
                    _extraction_status[engine_id]["completed"] = completed
                if completed % 5 == 0 or completed == total:
                    print(f"[MetadataExtraction] Engine {engine_id}: {completed}/{total} files extracted")

        print(f"[MetadataExtraction] Engine {engine_id}: ✔ Done — {completed} files updated")

        with _extraction_lock:
            _extraction_status[engine_id] = {"status": "done", "total": total, "completed": total}

    except Exception as e:
        with _extraction_lock:
            _extraction_status[engine_id] = {"status": "error", "total": 0, "completed": 0}
        print(f"[MetadataExtraction] Failed for engine {engine_id}: {e}")
        import traceback
        traceback.print_exc()



def Metadata_extraction_with_gemini(document_content: str,schema_list) -> Optional[BaseModel]:
    """Calls Gemini API to extract structured data based on Pydantic schema."""
    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY_PAID1"])
        
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema= schema_list,
        )

        
        prompt = (
            "You are a Data Extraction Specialist. "
            "Extract all fields specified by the JSON schema from the aviation document provided below. "
            "If any field is not present in the document, use 'N/A'. "
            "The output must strictly conform to the provided JSON schema."
            "Document Content:\n" + document_content
            
        )

        response = client.models.generate_content(
            model=   "gemini-2.5-flash", #"gemma-3-12b",
            contents=[document_content, prompt],
            config=config
        )

        if not response.text or not response.text.strip():
            print("Empty LLM response for this document")
            return build_empty_model(schema_list)

        return schema_list.model_validate_json(response.text)

    except Exception as e:
        print(f"Error processing with Gemini API: {e}")
        return build_empty_model(schema_list)

def process_single_pdf_to_json(pdf_path: str, schema_cls) -> dict:
    """
    Process a single PDF file and return structured JSON output using raw_text.
    (Kept for compatibility; prefer _tag_single_row for DB-based tagging.)
    """
    return build_empty_model(schema_cls).model_dump(exclude_none=False)


# ─────────────────────────────────────────────────────────────
# SCHEMA MAPPING: category → Pydantic schema
# ─────────────────────────────────────────────────────────────
Pydantic_Schema_mapping_dict = {
    '1. Certified statement of total time in service (Hrs & Cycles)': Hours_Cycles_Statement_listData,
    '11. ETOPs compliance report':                ETOPS_Statement_listData,
    '22. SB':                                     SBStatus_Statement_listData,
    '12. Manufacturer delivery docs':             ManufacturerDelivery_listData,
    '13. Logbook & Install-Removal History':      InstallRemovalStatement_listData,
    '15. Engine Last Release Certificate':        ARC_Statement_listData,
    '16. Last Borescope Inspection':              BSI_Report_listData,
    '17. Commercial':                             Commercial_Statement_listData,
    '18. Preservation':                           Preservation_Statement_listData,
    '19. LLP Summary':                            LLPStatusStatement_listData,
    '2. Non-Incident-Accident Statement':         IncidentAccidentStatement_listData,
    '21. AD':                                     ADStatus_Statement_listData,
    '24. Fan Blades':                             FanBladeStatement_listData,
    '25. HPT Blades':                             HPTBladeStatement_listData,
    '26. QEC-LRU Inventory':                      LRUQECStatement_listData,
    '27. LDND-MPD':                               LDNDStatement_listData,
    '3. Non-exceedance Statement':                NonExceedance_Statement_listData,
    '4. Power-Thrust rating Statement':           ThrustRating_Statement_listData,
    '5. PMA-DER Statement':                       PMADER_Statement_listData,
    '6. Oil-Fluid used Statement':                Oilfuelused_Statement_listData,
}

# ─────────────────────────────────────────────────────────────
# IN-MEMORY STATUS for Metadata Tagging
# ─────────────────────────────────────────────────────────────
_tagging_status: dict[int, dict] = {}
_tagging_lock = threading.Lock()


def get_tagging_status(engine_id: int) -> dict:
    return _tagging_status.get(engine_id, {"status": "idle", "total": 0, "completed": 0, "error": None})


# ─────────────────────────────────────────────────────────────
# HELPER: Send ONE row's raw_text to Gemini
# ─────────────────────────────────────────────────────────────
def _tag_single_row(row_id: int, raw_text: str, schema_cls) -> dict:
    """Call Gemini with raw_text using the given schema and return a result dict."""
    try:
        result_model = Metadata_extraction_with_gemini(raw_text, schema_cls)
        if result_model is None:
            return {
                "row_id": row_id,
                "metadata_json": build_empty_model(schema_cls).model_dump(exclude_none=False),
                "error": "Gemini returned None",
            }
        return {"row_id": row_id, "metadata_json": result_model.model_dump(exclude_none=False), "error": None}
    except Exception as e:
        return {"row_id": row_id, "metadata_json": {}, "error": str(e)}


# ─────────────────────────────────────────────────────────────
# MAIN: PERFORM METADATA TAGGING (multithreaded)
# ─────────────────────────────────────────────────────────────
def perform_metadata_tagging(engine_id: int, db: Session):
    """
    For each SegregationResult row that:
      • belongs to engine_id
      • has non-empty raw_text
      • has a category present in Pydantic_Schema_mapping_dict
    … call Gemini with the appropriate schema and save the JSON output
    to the metadata_json column (one DB commit per file for resumability).
    """
    with _tagging_lock:
        _tagging_status[engine_id] = {"status": "running", "total": 0, "completed": 0, "error": None}

    try:
        mapped_categories = list(Pydantic_Schema_mapping_dict.keys())

        rows = (
            db.query(models.SegregationResult)
            .filter(
                models.SegregationResult.engine_id == engine_id,
                models.SegregationResult.category.in_(mapped_categories),
                models.SegregationResult.raw_text != None,
                models.SegregationResult.raw_text != "",
            )
            .all()
        )

        total = len(rows)
        print(f"[MetadataTagging] Engine {engine_id}: {total} rows to tag")

        with _tagging_lock:
            _tagging_status[engine_id]["total"] = total

        if total == 0:
            with _tagging_lock:
                _tagging_status[engine_id] = {"status": "done", "total": 0, "completed": 0, "error": None}
            return

        work_items = [
            (r.id, r.raw_text, Pydantic_Schema_mapping_dict[r.category])
            for r in rows
        ]

        _db_write_lock = threading.Lock()
        completed = 0

        with ThreadPoolExecutor(max_workers=META_WORKERS) as executor:
            future_to_rid = {
                executor.submit(_tag_single_row, rid, raw_text, schema_cls): rid
                for rid, raw_text, schema_cls in work_items
            }

            for future in as_completed(future_to_rid):
                rid = future_to_rid[future]
                try:
                    result = future.result()
                except Exception as e:
                    result = {"row_id": rid, "metadata_json": {}, "error": str(e)}

                with _db_write_lock:
                    try:
                        row = db.query(models.SegregationResult).filter(
                            models.SegregationResult.id == result["row_id"]
                        ).first()
                        if row:
                            row.metadata_json = result["metadata_json"]
                            db.commit()
                        if result["error"]:
                            print(f"[MetadataTagging] Row {rid} warn: {result['error']}")
                    except Exception as db_err:
                        db.rollback()
                        print(f"[MetadataTagging] DB write failed for row {rid}: {db_err}")

                completed += 1
                with _tagging_lock:
                    _tagging_status[engine_id]["completed"] = completed
                if completed % 5 == 0 or completed == total:
                    print(f"[MetadataTagging] Engine {engine_id}: {completed}/{total} tagged")

        print(f"[MetadataTagging] Engine {engine_id}: ✔ Done — {completed} files tagged")
        with _tagging_lock:
            _tagging_status[engine_id] = {"status": "done", "total": total, "completed": total, "error": None}

    except Exception as e:
        import traceback
        err_msg = str(e)
        traceback.print_exc()
        with _tagging_lock:
            _tagging_status[engine_id] = {"status": "error", "total": 0, "completed": 0, "error": err_msg}
        print(f"[MetadataTagging] Failed for engine {engine_id}: {e}")


# ─────────────────────────────────────────────────────────────
# SINGLE-FILE ON-DEMAND PROCESSING
# ─────────────────────────────────────────────────────────────
def process_single_file(result_id: int, db: Session) -> dict:
    """
    On-demand synchronous processing for a single SegregationResult row:
      1. If raw_text is empty → download from Box + extract text → save to DB
      2. If category has a Pydantic schema → call Gemini → save metadata_json to DB
    Returns a summary dict with the resulting metadata_json and status flags.
    """
    row = db.query(models.SegregationResult).filter(
        models.SegregationResult.id == result_id
    ).first()

    if not row:
        return {"error": "File record not found", "metadata_json": None}

    has_schema = row.category in Pydantic_Schema_mapping_dict
    extraction_done = False

    # ── Step 1: Extract text if missing ──────────────────────────────────
    if not row.raw_text or row.raw_text.strip() == "":
        print(f"[SingleFile] Row {result_id}: no text — downloading from Box...")
        ext_result = _extract_single_file(row.id, row.box_file_id, row.box_file_name)
        try:
            row.raw_text = ext_result.get("raw_text", "")
            row.cleaned_text = ext_result.get("cleaned_text", "")
            row.text_extraction_status = ext_result.get("text_extraction_status", "")
            row.reason = ext_result.get("reason", "")
            db.commit()
            extraction_done = True
            print(f"[SingleFile] Row {result_id}: text extracted — status: {row.text_extraction_status}")
        except Exception as e:
            db.rollback()
            return {"error": f"Text extraction failed: {e}", "metadata_json": None}

    # ── Step 2: Tag with Gemini if schema available ───────────────────────
    if has_schema and row.raw_text and row.raw_text.strip():
        schema_cls = Pydantic_Schema_mapping_dict[row.category]
        print(f"[SingleFile] Row {result_id}: tagging with Gemini ({row.category})...")
        tag_result = _tag_single_row(result_id, row.raw_text, schema_cls)
        try:
            row.metadata_json = tag_result["metadata_json"]
            db.commit()
            print(f"[SingleFile] Row {result_id}: tagging done.")
        except Exception as e:
            db.rollback()
            return {"error": f"Metadata tagging failed: {e}", "metadata_json": None}

    # ── Refresh and return ────────────────────────────────────────────────
    db.refresh(row)
    return {
        "error": None,
        "metadata_json": row.metadata_json,
        "has_text": bool(row.raw_text and row.raw_text.strip()),
        "has_schema": has_schema,
        "extraction_done": extraction_done,
        "text_extraction_status": row.text_extraction_status or "",
    }


