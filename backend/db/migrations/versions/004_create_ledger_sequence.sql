-- 004_create_ledger_sequence.sql
-- Creates an atomic PostgreSQL sequence for vote ledger_sequence allocation.
-- This replaces the unsafe SELECT MAX(ledger_sequence) + 1 approach that
-- causes duplicate sequences under concurrent voting load.
-- Run this once in Supabase SQL editor before deploying the vote route changes.

CREATE SEQUENCE IF NOT EXISTS votes_ledger_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
