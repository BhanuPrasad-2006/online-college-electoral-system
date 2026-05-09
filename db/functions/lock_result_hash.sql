-- Lock result hash — immutable result integrity trigger
-- Fires when election status changes to 'completed', computes and locks the final result hash.

-- Result locks table (if not exists)
CREATE TABLE IF NOT EXISTS result_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) UNIQUE,
    result_hash TEXT NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by UUID
);

-- Prevent modification of result locks
CREATE OR REPLACE FUNCTION prevent_result_lock_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Result locks cannot be modified or deleted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER result_locks_immutable
    BEFORE UPDATE OR DELETE ON result_locks
    FOR EACH ROW
    EXECUTE FUNCTION prevent_result_lock_modification();

-- Auto-lock results when election completes
CREATE OR REPLACE FUNCTION lock_result_on_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Compute the final result hash
        SELECT generate_result_hash(NEW.id) INTO v_hash;

        -- Insert immutable lock record
        INSERT INTO result_locks (election_id, result_hash)
        VALUES (NEW.id, v_hash)
        ON CONFLICT (election_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER election_result_lock
    AFTER UPDATE ON elections
    FOR EACH ROW
    EXECUTE FUNCTION lock_result_on_complete();
