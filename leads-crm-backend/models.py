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
    due_date: Optional[str] = None
    revenue: Optional[float] = None
    currency: Optional[str] = "INR"