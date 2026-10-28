-- Migration 011: Add target_manager column to reimbursement_claims
alter table if exists reimbursement_claims
add column if not exists target_manager text default 'Both';
