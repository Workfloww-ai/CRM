# Flowwies HRMS Frontend (`flowwies/`)

Enterprise HRMS frontend for Workfloww.ai, replicating the design and UX of `Flowwies — Not if, but when.html`.

## Stack
- **Framework**: Next.js 16 (App Router, Turbopack, TypeScript)
- **Styling**: Tailwind CSS + Custom Design Tokens (`--v: #5B3DF5`, `--vt2: #DCD3FF`, `--bt: #DDEAFF`, DM Sans typography)
- **Icons**: Lucide React
- **Auth**: Supabase Auth (JWT Bearer Token passed to FastAPI backend)
- **Backend API**: `http://localhost:8000/hrms` (FastAPI backend in `leads-crm-backend/`)

## Key Modules
1. **Header & Navigation**:
   - `CRM ↗` button: Conditionally rendered only for Growth team members (`can_access_crm = true` or `department = 'Growth'`) and leadership (Shilpa & Manish). Strictly hidden for Tech members.
   - `People & Access`: Visible only to HR Admins (`is_admin = true`).
2. **Leave & Calendar**:
   - Casual / Sick / Earned balance counters.
   - Approvals queue for Managers & Admins (Shilpa & Manish).
   - Interactive monthly calendar with company holidays and employee leaves.
3. **Reimbursements**:
   - Bill / receipt claim form with image/pdf metadata.
   - Manager approval + HR Admin "Mark as paid" action with beneficiary bank/UPI details.
4. **Pay & Cover**:
   - Employee payslips download list.
   - Group Medical Insurance (GMC) card and e-card actions.
5. **Rules & Policies**:
   - Accordion policies with inline editing for HR Admins.
6. **Talent & Hall of Flex**:
   - Talent of the Month with cheer button.
   - Colleague nominations queue + Admin "Crown" action archiving to the Hall of Flex wall.
7. **People & Access**:
   - Admin table to assign roles (`employee`, `manager`, `admin`), teams, reports-to managers, and toggle CRM access.

## Running Locally
```bash
cd flowwies
npm run dev
```
Port: `http://localhost:3001`
