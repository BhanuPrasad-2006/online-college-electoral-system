-- Generate result hash for election verification
CREATE OR REPLACE FUNCTION generate_result_hash(p_election_id UUID)
RETURNS TEXT AS $$
DECLARE
    result_hash TEXT;
BEGIN
    SELECT md5(string_agg(vote_hash, '' ORDER BY created_at))
    INTO result_hash
    FROM votes
    WHERE election_id = p_election_id;

    RETURN result_hash;
END;
$$ LANGUAGE plpgsql;
