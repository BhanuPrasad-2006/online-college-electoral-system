-- Integrity lock function
-- Prevents concurrent modifications to vote records
CREATE OR REPLACE FUNCTION integrity_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Vote records cannot be modified or deleted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to votes table
CREATE TRIGGER votes_integrity_lock
    BEFORE UPDATE OR DELETE ON votes
    FOR EACH ROW
    EXECUTE FUNCTION integrity_lock();
