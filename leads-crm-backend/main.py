from boto3 import client

from typing import Optional
from db.queries import (
    get_all_leads,
    get_leads_page,
    create_lead as db_create_lead,
    create_activity,
    update_lead as db_update_lead,
    get_lead_status,
    delete_lead as db_delete_lead,
    get_profile_role,
    get_profile,
    get_lead_activities as db_get_lead_activities,
    get_all_investors, get_investors_page, create_investor, update_investor, delete_investor,
    get_all_fractional_leaders, get_fractional_leaders_page, create_fractional_leader, update_fractional_leader, delete_fractional_leader,
    get_all_training_partners, get_training_partners_page, create_training_partner, update_training_partner, delete_training_partner
)
from db.queries import upload_file_to_storage, create_attachment_record, get_lead_attachments, get_attachment, get_signed_attachment_url, delete_file_from_storage, delete_attachment_record
from models import (
    LeadCreate, LeadUpdate, NoteCreate,
    InvestorCreate, InvestorUpdate,
    FractionalLeaderCreate, FractionalLeaderUpdate,
    TrainingPartnerCreate, TrainingPartnerUpdate
)
from auth.permissions import require_admin, require_super_admin
from auth.dependencies import get_current_user
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import csv
import io
import json
from fastapi import UploadFile, File
from fastapi import Request
from db.client import get_client_for_user



from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from fastapi.responses import Response
from openpyxl import load_workbook
import os
import re

app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException as StarletteHTTPException

from fastapi import BackgroundTasks
from services.company_reports import run_company_scrape
from db.queries import get_company_reports, get_company_report, create_company_report

@app.post("/companies/{company_name}/scrape")
@limiter.limit("5/minute")
def scrape_company(request: Request, company_name: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    result = create_company_report(client, company_name, user.id)
    report = result.data[0]

    background_tasks.add_task(run_company_scrape, report["id"], company_name, user.token)

    return report


@app.get("/companies/{company_name}/reports")
@limiter.limit("60/minute")
def list_company_reports(request: Request, company_name: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_company_reports(client, company_name)
    return response.data


@app.get("/company-reports/{report_id}")
@limiter.limit("60/minute")
def get_report_status(request: Request, report_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_company_report(client, report_id)
    return response.data


@app.get("/company-reports/{report_id}/download")
@limiter.limit("60/minute")
def download_company_report(request: Request, report_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    record = get_company_report(client, report_id)
    if record.data["status"] != "done":
        raise HTTPException(status_code=400, detail="Report not ready yet")
    signed_url = client.storage.from_("company-reports").create_signed_url(record.data["storage_path"], 60)
    return {"url": signed_url["signedURL"]}

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={'Access-Control-Allow-Origin': '*'}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={'detail': str(exc)}, headers={'Access-Control-Allow-Origin': '*'})

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://crm.workfloww.ai,https://crm-git-main-workfloww.vercel.app")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize_filename(filename: str) -> str:
    filename = filename.replace("/", "").replace("\\", "")
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    return filename[:200]  # cap length too, just in case

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Leads CRM backend is running"}

@app.get("/leads")
@limiter.limit("60/minute")
def get_leads(
    request: Request,
    page: int = 1, 
    page_size: int = 20,
    search: Optional[str] = None,
    name: Optional[str] = None,
    org: Optional[str] = None,
    title: Optional[str] = None,
    location: Optional[str] = None,
    industry: Optional[str] = None,
    function: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user=Depends(get_current_user)
):
    sort_desc = sort_dir == "desc" if sort_dir else False
    
    db_sort_by = "due_date"
    if sort_by == "name":
        db_sort_by = "first_name"
    elif sort_by == "org":
        db_sort_by = "org"
    elif sort_by == "status":
        db_sort_by = "status"

    client = get_client_for_user(user.token)
    response = get_leads_page(client, page, page_size, search, name, org, title, location, industry, function, db_sort_by, sort_desc)
    return {"leads": response.data, "total": response.count, "page": page, "page_size": page_size}

@app.post("/leads")
@limiter.limit("60/minute")
def create_lead(request: Request, lead: LeadCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = db_create_lead(client, lead.model_dump())
    new_lead = response.data[0]

    create_activity(client, {
        "lead_id": new_lead["id"],
        "user_id": user.id,
        "type": "created",
        "content": "Lead created",
    })

    return response.data

@app.patch("/leads/{lead_id}")
@limiter.limit("60/minute")
def update_lead(request: Request, lead_id: str, lead: LeadUpdate, user=Depends(get_current_user)):
    update_data = lead.model_dump(exclude_unset=True)
    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    client = get_client_for_user(user.token)
    if "status" in update_data:
        old_lead = get_lead_status(client, lead_id)
        old_status = old_lead.data["status"]
        new_status = update_data["status"]

        if old_status != new_status:
            create_activity(client, {
                "lead_id": lead_id,
                "user_id": user.id,
                "type": "status_change",
                "content": f"Status changed from {old_status} to {new_status}",
                "metadata": {"from": old_status, "to": new_status},
            })

    response = db_update_lead(client, lead_id, update_data)
    return response.data

@app.delete("/leads/{lead_id}")
@limiter.limit("60/minute")
def delete_lead(request: Request, lead_id: str, user=Depends(require_admin)):
    client = get_client_for_user(user.token)
    response = db_delete_lead(client, lead_id)
    return {"deleted": True, "id": lead_id}

@app.get("/me")
@limiter.limit("60/minute")
def get_me(request: Request, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    profile = get_profile(client, user.id)
    return profile.data

@app.get("/leads/{lead_id}/activities")
@limiter.limit("60/minute")
def get_lead_activities(request: Request, lead_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = db_get_lead_activities(client, lead_id)
    return response.data

@app.post("/leads/{lead_id}/notes")
@limiter.limit("60/minute")
def create_note(request: Request, lead_id: str, note: NoteCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    create_activity(client, {
        "lead_id": lead_id,
        "user_id": user.id,
        "type": "note",
        "content": note.content,
    })
    return {"status": "ok"}

@app.get("/leads/export")
@limiter.limit("5/minute")
def export_leads(request: Request, export_type: Optional[str] = None, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_all_leads(client)
    leads = response.data

    export_field_map = {
        "number": "phone",
        "email": "email",
        "status": "status"
    }

    output = io.StringIO()
    if export_type:
        types = [t.strip() for t in export_type.split(',')]
        selected_fields = [export_field_map[t] for t in types if t in export_field_map]
        
        if selected_fields:
            export_columns = ["name", "title", "org", "function", "location"] + selected_fields
            writer = csv.DictWriter(output, fieldnames=export_columns)
            writer.writeheader()
            for lead in leads:
                name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
                row = {
                    "name": name,
                    "title": lead.get("title", ""),
                    "org": lead.get("org", ""),
                    "function": lead.get("function", ""),
                    "location": lead.get("location", "")
                }
                for field in selected_fields:
                    row[field] = lead.get(field, "")
                writer.writerow(row)
        else:
            writer = csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS)
            writer.writeheader()
            for lead in leads:
                writer.writerow({k: lead.get(k, "") for k in writer.fieldnames})
    else:
        writer = csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        for lead in leads:
            writer.writerow({k: lead.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"},
    )

REQUIRED_COLUMNS = [
    "first_name", "last_name", "title", "org", "email", "phone", "phone_2",
    "linkedin", "location", "industry", "function", "status", "next_action", "due_date",
    "revenue", "currency"
]
VALID_STATUSES = {"New", "Contacted", "Follow-up", "Won", "Lost"}

@app.get("/leads/import-template")
@limiter.limit("5/minute")
def import_template(request: Request, user=Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(REQUIRED_COLUMNS)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_import_template.csv"},
    )

LINKEDIN_COLUMN_MAP = {
    "First Name": "first_name",
    "Last Name": "last_name",
    "Title": "title",
    "Company": "org",
    "Email": "email",
    "Phone Number 1": "phone",
    "Phone Number 2": "phone_2",
    "Phone Number": "phone",
    "Profile Url": "linkedin",
}
LINKEDIN_REQUIRED_HEADERS = {"First Name", "Last Name", "Company"}


def normalize_linkedin_row(raw_row: dict) -> dict:
    mapped = {col: None for col in REQUIRED_COLUMNS}
    for linkedin_col, internal_col in LINKEDIN_COLUMN_MAP.items():
        val = raw_row.get(linkedin_col)
        if val is not None and val != "":
            mapped[internal_col] = val
    mapped["status"] = "New"  # LinkedIn exports don't have a status column
    return mapped


def cell_to_str(value):
    return "" if value is None else str(value).strip()


def map_row_to_expected(raw_row_dict, expected_keys):
    mapped = {}
    norm_dict = {}
    for k, v in raw_row_dict.items():
        if k is None:
            continue
        norm_key = str(k).strip().lower().replace(" ", "_")
        norm_dict[norm_key] = v
        if norm_key == "linkedin_":
            norm_dict["linkedin"] = v

    aliases = {
        "organization": ["company", "domain", "org"],
        "company": ["organization", "domain", "org"],
        "domain": ["company", "organization", "org"]
    }

    for ek in expected_keys:
        if ek in norm_dict:
            mapped[ek] = norm_dict[ek]
        else:
            found = False
            if ek in aliases:
                for alias in aliases[ek]:
                    if alias in norm_dict:
                        mapped[ek] = norm_dict[alias]
                        found = True
                        break
            if not found:
                mapped[ek] = None
    return mapped



@app.post("/leads/import")
def import_leads(file: UploadFile = File(...), user=Depends(get_current_user)):
    if file.filename.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(file.file.read()))
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
    else:
        content = file.file.read().decode("utf-8-sig")
        all_rows = list(csv.reader(io.StringIO(content)))

    if not all_rows:
        raise HTTPException(status_code=400, detail="File is empty")

    raw_headers = [h for h in list(all_rows[0]) if h and str(h).strip()]
    data_rows = all_rows[1:]
    header_set = set(h for h in raw_headers if h is not None)

    if raw_headers == REQUIRED_COLUMNS:
        reader = [dict(zip(REQUIRED_COLUMNS, row)) for row in data_rows]
    elif LINKEDIN_REQUIRED_HEADERS.issubset(header_set):
        raw_dicts = [dict(zip(raw_headers, row)) for row in data_rows]
        reader = [normalize_linkedin_row(r) for r in raw_dicts]
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unrecognized file format. Headers must match either the app template {REQUIRED_COLUMNS} "
                   f"or a LinkedIn export (needs at least: {sorted(LINKEDIN_REQUIRED_HEADERS)}). Got: {raw_headers}"
        )

    client = get_client_for_user(user.token)
    def process_stream():
        imported = []
        errors = []
        total = len(reader)
        
        if total == 0:
            yield json.dumps({"type": "complete", "imported_count": 0, "errors": []}) + "\n"
            return

        existing_records_response = get_all_leads(client)
        existing_names = set(
            (cell_to_str(r.get("first_name")).lower(), cell_to_str(r.get("last_name")).lower())
            for r in existing_records_response.data
        )

        for i, row in enumerate(reader, start=2):
            first_name = cell_to_str(row.get("first_name"))
            last_name = cell_to_str(row.get("last_name"))
            status = cell_to_str(row.get("status")) or "New"

            if not first_name:
                is_empty_row = not any(cell_to_str(v) for v in row.values())
                if not is_empty_row:
                    errors.append(f"Row {i}: 'first_name' is required")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            name_tuple = (first_name.lower(), last_name.lower())
            if name_tuple in existing_names:
                # Silently skip duplicates
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue
            existing_names.add(name_tuple)


            if status not in VALID_STATUSES:
                errors.append(f"Row {i}: '{status}' is not a valid status {sorted(VALID_STATUSES)}, row rejected")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            lead_data = {col: (cell_to_str(row.get(col)) or None) for col in REQUIRED_COLUMNS}
            lead_data["first_name"] = first_name
            lead_data["status"] = status

            try:
                result = db_create_lead(client, lead_data)
                new_lead = result.data[0]

                create_activity(client, {
                    "lead_id": new_lead["id"],
                    "user_id": user.id,
                    "type": "created",
                    "content": "Lead created via import",
                })

                imported.append(new_lead["id"])
            except Exception as e:
                errors.append(f"Row {i}: DB error - {str(e)}")
            
            yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"

        yield json.dumps({"type": "complete", "imported_count": len(imported), "errors": errors}) + "\n"

    return StreamingResponse(process_stream(), media_type="application/x-ndjson")

@app.post("/leads/{lead_id}/attachments")
def upload_attachment(lead_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    file_bytes = file.file.read()
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
    safe_filename = sanitize_filename(file.filename)
    storage_path = f"{lead_id}/{safe_filename}"

    upload_file_to_storage(client, storage_path, file_bytes, file.content_type)

    result = create_attachment_record(client, {
        "lead_id": lead_id,
        "file_name": file.filename,
        "storage_path": storage_path,
        "uploaded_by": user.id,
    })

    create_activity(client, {
        "lead_id": lead_id,
        "user_id": user.id,
        "type": "note",
        "content": f"Attached file: {file.filename}",
    })

    return result.data


@app.get("/leads/{lead_id}/attachments")
def list_attachments(lead_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_lead_attachments(client, lead_id)
    return response.data


@app.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    record = get_attachment(client, attachment_id)
    storage_path = record.data["storage_path"]

    signed_url = get_signed_attachment_url(client, storage_path)

    return {"url": signed_url["signedURL"]}


@app.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    record = get_attachment(client, attachment_id)
    storage_path = record.data["storage_path"]

    delete_file_from_storage(client, storage_path)
    delete_attachment_record(client, attachment_id)

    return {"deleted": True}

@app.get("/leads/import-template-xlsx")
@limiter.limit("5/minute")
def import_template_xlsx(request: Request, user=Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"

    ws.append(REQUIRED_COLUMNS)

    for col_idx, header in enumerate(REQUIRED_COLUMNS, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

    status_col_index = REQUIRED_COLUMNS.index("status") + 1
    status_col_letter = ws.cell(row=1, column=status_col_index).column_letter

    dv = DataValidation(
        type="list",
        formula1=f'"{",".join(sorted(VALID_STATUSES))}"',
        allow_blank=False,
    )
    dv.error = "Please select a valid status from the dropdown."
    dv.errorTitle = "Invalid Status"
    ws.add_data_validation(dv)
    dv.add(f"{status_col_letter}2:{status_col_letter}1000")

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=leads_import_template.xlsx"},
    )


# --- Investors ---

@app.get("/investors")
@limiter.limit("60/minute")
def get_investors(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user=Depends(require_super_admin)
):
    sort_desc = sort_dir == "desc" if sort_dir else False
    db_sort_by = "due_date"
    if sort_by == "name":
        db_sort_by = "first_name"
    elif sort_by == "status":
        db_sort_by = "status"

    client = get_client_for_user(user.token)
    response = get_investors_page(client, page, page_size, search, db_sort_by, sort_desc)
    return {"data": response.data, "total": response.count, "page": page, "page_size": page_size}

@app.post("/investors")
@limiter.limit("60/minute")
def create_investor_route(request: Request, data: InvestorCreate, user=Depends(require_super_admin)):
    client = get_client_for_user(user.token)
    response = create_investor(client, data.model_dump())
    return response.data

@app.patch("/investors/{id}")
@limiter.limit("60/minute")
def update_investor_route(request: Request, id: str, data: InvestorUpdate, user=Depends(require_super_admin)):
    update_data = data.model_dump(exclude_unset=True)
    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    client = get_client_for_user(user.token)
    response = update_investor(client, id, update_data)
    return response.data

@app.delete("/investors/{id}")
@limiter.limit("60/minute")
def delete_investor_route(request: Request, id: str, user=Depends(require_super_admin)):
    client = get_client_for_user(user.token)
    response = delete_investor(client, id)
    return {"deleted": True, "id": id}



@app.get("/investors/export")
@limiter.limit("5/minute")
def export_investors(request: Request, user=Depends(require_super_admin)):
    client = get_client_for_user(user.token)
    response = get_all_investors(client)
    data = response.data

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'company', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date'])
    writer.writeheader()
    for row in data:
        writer.writerow({k: row.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=investors_export.csv"},
    )

@app.get("/investors/import-template")
@limiter.limit("5/minute")
def import_template_investors(request: Request, user=Depends(require_super_admin)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'company', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date'])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=investors_import_template.csv"},
    )

@app.get("/investors/import-template-xlsx")
@limiter.limit("5/minute")
def import_template_xlsx_investors(request: Request, user=Depends(require_super_admin)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Investor"
    cols = ['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'company', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date']
    ws.append(cols)

    for col_idx, header in enumerate(cols, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

    status_col_index = cols.index("status") + 1
    status_col_letter = ws.cell(row=1, column=status_col_index).column_letter

    dv = DataValidation(
        type="list",
        formula1=f'"{",".join(sorted(VALID_STATUSES))}"',
        allow_blank=False,
    )
    dv.error = "Please select a valid status from the dropdown."
    dv.errorTitle = "Invalid Status"
    ws.add_data_validation(dv)
    dv.add(f"{status_col_letter}2:{status_col_letter}1000")

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=investors_import_template.xlsx"},
    )

@app.post("/investors/import")
def import_investors(file: UploadFile = File(...), user=Depends(require_super_admin)):
    if file.filename.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(file.file.read()))
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
    else:
        content = file.file.read().decode("utf-8-sig")
        all_rows = list(csv.reader(io.StringIO(content)))

    if not all_rows:
        raise HTTPException(status_code=400, detail="File is empty")

    raw_headers = [h for h in list(all_rows[0]) if h and str(h).strip()]
    data_rows = all_rows[1:]
    
    expected = ['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'company', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date']
    
    raw_dicts = [dict(zip(raw_headers, row[:len(raw_headers)])) for row in data_rows]
    reader = [map_row_to_expected(r, expected) for r in raw_dicts]
    client = get_client_for_user(user.token)

    def process_stream():
        imported = []
        errors = []
        total = len(reader)
        
        if total == 0:
            yield json.dumps({"type": "complete", "imported_count": 0, "errors": []}) + "\n"
            return

        existing_records_response = get_all_investors(client)
        existing_names = set(
            (cell_to_str(r.get("first_name")).lower(), cell_to_str(r.get("last_name")).lower())
            for r in existing_records_response.data
        )

        for i, row in enumerate(reader, start=2):
            first_name = cell_to_str(row.get("first_name"))
            last_name = cell_to_str(row.get("last_name"))
            status = cell_to_str(row.get("status")) or "New"

            if not first_name:
                is_empty_row = not any(cell_to_str(v) for v in row.values())
                if not is_empty_row:
                    errors.append(f"Row {i}: 'first_name' is required")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            name_tuple = (first_name.lower(), last_name.lower())
            if name_tuple in existing_names:
                # Silently skip duplicates
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue
            existing_names.add(name_tuple)


            if status not in VALID_STATUSES:
                errors.append(f"Row {i}: '{status}' is not a valid status")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            item_data = {col: (cell_to_str(row.get(col)) or None) for col in expected}
            item_data["first_name"] = first_name
            item_data["status"] = status

            try:
                result = create_investor(client, item_data)
                new_item = result.data[0]
                create_investor_activity(client, {
                    "investor_id": new_item["id"],
                    "user_id": user.id,
                    "type": "created",
                    "content": "Imported from CSV/XLSX"
                })
                imported.append(new_item["id"])
            except Exception as e:
                errors.append(f"Row {i}: DB error - {str(e)}")
            
            yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"

        yield json.dumps({"type": "complete", "imported_count": len(imported), "errors": errors}) + "\n"

    return StreamingResponse(process_stream(), media_type="application/x-ndjson")
# --- Fractional Leaders ---

@app.get("/fractional-leaders")
@limiter.limit("60/minute")
def get_fractional_leaders(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user=Depends(get_current_user)
):
    sort_desc = sort_dir == "desc" if sort_dir else False
    db_sort_by = "due_date"
    if sort_by == "name":
        db_sort_by = "first_name"
    elif sort_by == "status":
        db_sort_by = "status"

    client = get_client_for_user(user.token)
    response = get_fractional_leaders_page(client, page, page_size, search, db_sort_by, sort_desc)
    return {"data": response.data, "total": response.count, "page": page, "page_size": page_size}

@app.post("/fractional-leaders")
@limiter.limit("60/minute")
def create_fractional_leader_route(request: Request, data: FractionalLeaderCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = create_fractional_leader(client, data.model_dump())
    new_leader = response.data[0]
    create_fractional_leader_activity(client, {
        "leader_id": new_leader["id"],
        "user_id": user.id,
        "type": "created",
        "content": "Added to CRM"
    })
    return response.data

@app.patch("/fractional-leaders/{id}")
@limiter.limit("60/minute")
def update_fractional_leader_route(request: Request, id: str, data: FractionalLeaderUpdate, user=Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    client = get_client_for_user(user.token)
    response = update_fractional_leader(client, id, update_data)
    return response.data

@app.delete("/fractional-leaders/{id}")
@limiter.limit("60/minute")
def delete_fractional_leader_route(request: Request, id: str, user=Depends(require_admin)):
    client = get_client_for_user(user.token)
    response = delete_fractional_leader(client, id)
    return {"deleted": True, "id": id}



@app.get("/fractional-leaders/export")
@limiter.limit("5/minute")
def export_fractional_leaders(request: Request, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_all_fractional_leaders(client)
    data = response.data

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'domain', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date'])
    writer.writeheader()
    for row in data:
        writer.writerow({k: row.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=fractional_leaders_export.csv"},
    )

@app.get("/fractional-leaders/import-template")
@limiter.limit("5/minute")
def import_template_fractional_leaders(request: Request, user=Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'domain', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date'])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=fractional_leaders_import_template.csv"},
    )

@app.get("/fractional-leaders/import-template-xlsx")
@limiter.limit("5/minute")
def import_template_xlsx_fractional_leaders(request: Request, user=Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Fractional_Leader"
    cols = ['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'domain', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date']
    ws.append(cols)

    for col_idx, header in enumerate(cols, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

    status_col_index = cols.index("status") + 1
    status_col_letter = ws.cell(row=1, column=status_col_index).column_letter

    dv = DataValidation(
        type="list",
        formula1=f'"{",".join(sorted(VALID_STATUSES))}"',
        allow_blank=False,
    )
    dv.error = "Please select a valid status from the dropdown."
    dv.errorTitle = "Invalid Status"
    ws.add_data_validation(dv)
    dv.add(f"{status_col_letter}2:{status_col_letter}1000")

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=fractional_leaders_import_template.xlsx"},
    )

@app.post("/fractional-leaders/import")
def import_fractional_leaders(file: UploadFile = File(...), user=Depends(get_current_user)):
    if file.filename.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(file.file.read()))
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
    else:
        content = file.file.read().decode("utf-8-sig")
        all_rows = list(csv.reader(io.StringIO(content)))

    if not all_rows:
        raise HTTPException(status_code=400, detail="File is empty")

    raw_headers = [h for h in list(all_rows[0]) if h and str(h).strip()]
    data_rows = all_rows[1:]
    
    expected = ['first_name', 'last_name', 'title', 'email', 'phone', 'phone_2', 'domain', 'industry', 'function', 'linkedin', 'location', 'revenue', 'currency', 'status', 'next_action', 'due_date']
    
    raw_dicts = [dict(zip(raw_headers, row[:len(raw_headers)])) for row in data_rows]
    reader = [map_row_to_expected(r, expected) for r in raw_dicts]
    client = get_client_for_user(user.token)

    def process_stream():
        imported = []
        errors = []
        total = len(reader)
        
        if total == 0:
            yield json.dumps({"type": "complete", "imported_count": 0, "errors": []}) + "\n"
            return

        existing_records_response = get_all_fractional_leaders(client)
        existing_names = set(
            (cell_to_str(r.get("first_name")).lower(), cell_to_str(r.get("last_name")).lower())
            for r in existing_records_response.data
        )

        for i, row in enumerate(reader, start=2):
            first_name = cell_to_str(row.get("first_name"))
            last_name = cell_to_str(row.get("last_name"))
            status = cell_to_str(row.get("status")) or "New"

            if not first_name:
                is_empty_row = not any(cell_to_str(v) for v in row.values())
                if not is_empty_row:
                    errors.append(f"Row {i}: 'first_name' is required")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            name_tuple = (first_name.lower(), last_name.lower())
            if name_tuple in existing_names:
                # Silently skip duplicates
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue
            existing_names.add(name_tuple)


            if status not in VALID_STATUSES:
                errors.append(f"Row {i}: '{status}' is not a valid status")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            item_data = {col: (cell_to_str(row.get(col)) or None) for col in expected}
            item_data["first_name"] = first_name
            item_data["status"] = status

            try:
                result = create_fractional_leader(client, item_data)
                new_item = result.data[0]
                create_fractional_leader_activity(client, {
                    "leader_id": new_item["id"],
                    "user_id": user.id,
                    "type": "created",
                    "content": "Imported from CSV/XLSX"
                })
                imported.append(new_item["id"])
            except Exception as e:
                errors.append(f"Row {i}: DB error - {str(e)}")
            
            yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"

        yield json.dumps({"type": "complete", "imported_count": len(imported), "errors": errors}) + "\n"

    return StreamingResponse(process_stream(), media_type="application/x-ndjson")
# --- Training Partners ---

@app.get("/training-partners")
@limiter.limit("60/minute")
def get_training_partners(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    user=Depends(get_current_user)
):
    sort_desc = sort_dir == "desc" if sort_dir else False
    db_sort_by = "due_date"
    if sort_by == "name":
        db_sort_by = "first_name"
    elif sort_by == "status":
        db_sort_by = "status"

    client = get_client_for_user(user.token)
    response = get_training_partners_page(client, page, page_size, search, db_sort_by, sort_desc)
    return {"data": response.data, "total": response.count, "page": page, "page_size": page_size}

@app.post("/training-partners")
@limiter.limit("60/minute")
def create_training_partner_route(request: Request, data: TrainingPartnerCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = create_training_partner(client, data.model_dump())
    new_item = response.data[0]
    create_training_partner_activity(client, {
        "training_partner_id": new_item["id"],
        "user_id": user.id,
        "type": "created",
        "content": "Added to CRM"
    })
    return response.data

@app.patch("/training-partners/{id}")
@limiter.limit("60/minute")
def update_training_partner_route(request: Request, id: str, data: TrainingPartnerUpdate, user=Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    client = get_client_for_user(user.token)
    response = update_training_partner(client, id, update_data)
    return response.data

@app.delete("/training-partners/{id}")
@limiter.limit("60/minute")
def delete_training_partner_route(request: Request, id: str, user=Depends(require_admin)):
    client = get_client_for_user(user.token)
    response = delete_training_partner(client, id)
    return {"deleted": True, "id": id}
@app.get("/training-partners/export")
@limiter.limit("5/minute")
def export_training_partners(request: Request, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_all_training_partners(client)
    data = response.data

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['first_name', 'last_name', 'title', 'organization', 'email', 'phone', 'phone_2', 'linkedin', 'location', 'industry', 'function', 'status', 'next_action', 'due_date', 'revenue', 'currency'])
    writer.writeheader()
    for row in data:
        writer.writerow({k: row.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=training_partners_export.csv"},
    )

@app.get("/training-partners/import-template")
@limiter.limit("5/minute")
def import_template_training_partners(request: Request, user=Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['first_name', 'last_name', 'title', 'organization', 'email', 'phone', 'phone_2', 'linkedin', 'location', 'industry', 'function', 'status', 'next_action', 'due_date', 'revenue', 'currency'])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=training_partners_import_template.csv"},
    )

@app.get("/training-partners/import-template-xlsx")
@limiter.limit("5/minute")
def import_template_xlsx_training_partners(request: Request, user=Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Training_Partner"
    cols = ['first_name', 'last_name', 'title', 'organization', 'email', 'phone', 'phone_2', 'linkedin', 'location', 'industry', 'function', 'status', 'next_action', 'due_date', 'revenue', 'currency']
    ws.append(cols)

    for col_idx, header in enumerate(cols, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

    status_col_index = cols.index("status") + 1
    status_col_letter = ws.cell(row=1, column=status_col_index).column_letter

    dv = DataValidation(
        type="list",
        formula1=f'"{",".join(sorted(VALID_STATUSES))}"',
        allow_blank=False,
    )
    dv.error = "Please select a valid status from the dropdown."
    dv.errorTitle = "Invalid Status"
    ws.add_data_validation(dv)
    dv.add(f"{status_col_letter}2:{status_col_letter}1000")

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=training_partners_import_template.xlsx"},
    )

@app.post("/training-partners/import")
def import_training_partners(file: UploadFile = File(...), user=Depends(get_current_user)):
    if file.filename.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(file.file.read()))
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
    else:
        content = file.file.read().decode("utf-8-sig")
        all_rows = list(csv.reader(io.StringIO(content)))

    if not all_rows:
        raise HTTPException(status_code=400, detail="File is empty")

    raw_headers = [h for h in list(all_rows[0]) if h and str(h).strip()]
    data_rows = all_rows[1:]
    
    expected = ['first_name', 'last_name', 'title', 'organization', 'email', 'phone', 'phone_2', 'linkedin', 'location', 'industry', 'function', 'status', 'next_action', 'due_date', 'revenue', 'currency']
    
    raw_dicts = [dict(zip(raw_headers, row[:len(raw_headers)])) for row in data_rows]
    reader = [map_row_to_expected(r, expected) for r in raw_dicts]
    client = get_client_for_user(user.token)

    def process_stream():
        imported = []
        errors = []
        total = len(reader)
        
        if total == 0:
            yield json.dumps({"type": "complete", "imported_count": 0, "errors": []}) + "\n"
            return

        existing_records_response = get_all_training_partners(client)
        existing_names = set(
            (cell_to_str(r.get("first_name")).lower(), cell_to_str(r.get("last_name")).lower())
            for r in existing_records_response.data
        )

        for i, row in enumerate(reader, start=2):
            first_name = cell_to_str(row.get("first_name"))
            last_name = cell_to_str(row.get("last_name"))
            status = cell_to_str(row.get("status")) or "New"

            if not first_name:
                is_empty_row = not any(cell_to_str(v) for v in row.values())
                if not is_empty_row:
                    errors.append(f"Row {i}: 'first_name' is required")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            name_tuple = (first_name.lower(), last_name.lower())
            if name_tuple in existing_names:
                # Silently skip duplicates
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue
            existing_names.add(name_tuple)


            if status not in VALID_STATUSES:
                errors.append(f"Row {i}: '{status}' is not a valid status")
                yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"
                continue

            item_data = {col: (cell_to_str(row.get(col)) or None) for col in expected}
            item_data["first_name"] = first_name
            item_data["status"] = status

            try:
                result = create_training_partner(client, item_data)
                new_item = result.data[0]
                create_training_partner_activity(client, {
                    "training_partner_id": new_item["id"],
                    "user_id": user.id,
                    "type": "created",
                    "content": "Imported from CSV/XLSX"
                })
                imported.append(new_item["id"])
            except Exception as e:
                errors.append(f"Row {i}: DB error - {str(e)}")
            
            yield json.dumps({"type": "progress", "processed": i - 1, "total": total, "percentage": int((i - 1) / total * 100)}) + "\n"

        yield json.dumps({"type": "complete", "imported_count": len(imported), "errors": errors}) + "\n"

    return StreamingResponse(process_stream(), media_type="application/x-ndjson")


from db.queries import get_fractional_leader_activities, create_fractional_leader_activity

@app.get("/fractional-leaders/{leader_id}/activities")
@limiter.limit("60/minute")
def get_fl_activities(request: Request, leader_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_fractional_leader_activities(client, leader_id)
    return response.data

@app.post("/fractional-leaders/{leader_id}/notes")
@limiter.limit("20/minute")
def add_fl_note(request: Request, leader_id: str, data: dict, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    activity = {
        "leader_id": leader_id,
        "user_id": user.id,
        "type": "note",
        "content": data.get("content", "")
    }
    create_fractional_leader_activity(client, activity)
    return {"status": "ok"}

@app.get("/fractional-leaders/{leader_id}/attachments")
@limiter.limit("60/minute")
def get_fl_attachments(request: Request, leader_id: str, user=Depends(get_current_user)):
    return []

@app.post("/fractional-leaders/{leader_id}/attachments")
@limiter.limit("20/minute")
def add_fl_attachment(request: Request, leader_id: str, user=Depends(get_current_user)):
    return []

from db.queries import get_investor_activities, create_investor_activity, get_training_partner_activities, create_training_partner_activity

@app.get("/investors/{investor_id}/activities")
@limiter.limit("60/minute")
def get_inv_acts(request: Request, investor_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_investor_activities(client, investor_id)
    return response.data

@app.post("/investors/{investor_id}/notes")
@limiter.limit("20/minute")
def add_inv_note(request: Request, investor_id: str, data: dict, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    create_investor_activity(client, {
        "investor_id": investor_id, "user_id": user.id, "type": "note", "content": data.get("content", "")
    })
    return {"status": "ok"}

@app.get("/investors/{investor_id}/attachments")
def get_inv_atts(): return []

@app.post("/investors/{investor_id}/attachments")
def add_inv_atts(): return []

@app.get("/training-partners/{training_partner_id}/activities")
@limiter.limit("60/minute")
def get_tp_acts(request: Request, training_partner_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    response = get_training_partner_activities(client, training_partner_id)
    return response.data

@app.post("/training-partners/{training_partner_id}/notes")
@limiter.limit("20/minute")
def add_tp_note(request: Request, training_partner_id: str, data: dict, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    create_training_partner_activity(client, {
        "training_partner_id": training_partner_id, "user_id": user.id, "type": "note", "content": data.get("content", "")
    })
    return {"status": "ok"}

@app.get("/training-partners/{training_partner_id}/attachments")
def get_tp_atts(): return []

@app.post("/training-partners/{training_partner_id}/attachments")
def add_tp_atts(): return []

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
