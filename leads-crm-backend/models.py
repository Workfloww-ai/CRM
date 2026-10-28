from pydantic import BaseModel
from typing import Optional


class LeadCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    title: Optional[str] = None
    org: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    status: str = "New"
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    org: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    status: Optional[str] = None
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"

class NoteCreate(BaseModel):
    content: str


class InvestorCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: str = "New"
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class InvestorUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class FractionalLeaderCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: str = "New"
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class FractionalLeaderUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class TrainingPartnerCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    organization: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: str = "New"
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class TrainingPartnerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_2: Optional[str] = None
    organization: Optional[str] = None
    industry: Optional[str] = None
    function: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    next_action: Optional[str] = None
    next_action_assignee: Optional[str] = None
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"


class CompetitorCreate(BaseModel):
    name: str
    website: Optional[str] = None
    status: str = "New"


class CompetitorUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    status: Optional[str] = None


# =========================================================================
# FLOWWIES HRMS MODELS
# =========================================================================

class ProfileSelfUpdate(BaseModel):
    dob: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None


class TeamMemberAdminUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None  # manager | employee
    hrms_role: Optional[str] = None  # manager | employee
    role_id: Optional[str] = None
    department: Optional[str] = None
    secondary_department: Optional[str] = None
    departments: Optional[list[str]] = None  # ['Growth', 'Tech']
    manager_id: Optional[str] = None
    can_access_crm: Optional[bool] = None
    is_active: Optional[bool] = None
    emp_code: Optional[str] = None
    dob: Optional[str] = None
    date_joined: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None


class TeamMemberCreate(BaseModel):
    full_name: str
    email: str
    role: str = "employee"  # manager | employee
    departments: Optional[list[str]] = ["Tech"]
    manager_id: Optional[str] = None
    dob: Optional[str] = None
    casual_days: Optional[int] = 12
    sick_days: Optional[int] = 8
    earned_days: Optional[int] = 15



class LeaveRequestCreate(BaseModel):
    leave_type: str  # Casual | Sick | Earned
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    reason: str


class LeaveDecision(BaseModel):
    status: str  # approved | declined


class ReimbursementClaimCreate(BaseModel):
    title: str
    amount: float
    receipt_storage_path: Optional[str] = None
    receipt_file_name: Optional[str] = None
    is_image: Optional[bool] = False
    target_manager: Optional[str] = "Both"


class ClaimDecision(BaseModel):
    status: str  # approved | declined


class PolicyCreate(BaseModel):
    title: str
    punchline: Optional[str] = ""
    body: str
    sort_order: Optional[int] = 0


class PolicyUpdate(BaseModel):
    title: Optional[str] = None
    punchline: Optional[str] = None
    body: str


class TalentNominationCreate(BaseModel):
    nominee_id: str
    why_text: str


class TalentCrownCreate(BaseModel):
    nomination_id: Optional[str] = None
    user_id: str
    month_year: str
    why_text: str


class HolidayCreate(BaseModel):
    name: str
    holiday_date: str  # YYYY-MM-DD
    year: Optional[int] = None


class HolidayBulkUpload(BaseModel):
    holidays: list[HolidayCreate]