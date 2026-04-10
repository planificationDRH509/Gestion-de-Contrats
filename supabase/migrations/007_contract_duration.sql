-- Migration: 007_contract_duration.sql
-- Add duration_months to contracts table

alter table contracts add column duration_months integer not null default 12;
