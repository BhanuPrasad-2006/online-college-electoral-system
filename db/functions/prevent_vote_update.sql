-- Prevent vote updates trigger
CREATE OR REPLACE FUNCTION prevent_vote_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Votes are immutable and cannot be updated';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_vote_updates
    BEFORE UPDATE ON votes
    FOR EACH ROW
    EXECUTE FUNCTION prevent_vote_update();
