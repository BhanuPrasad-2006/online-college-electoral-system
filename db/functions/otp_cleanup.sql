-- OTP cleanup — periodic cleanup of expired OTP records
-- Run via pg_cron or scheduled job to prevent table bloat.

CREATE OR REPLACE FUNCTION cleanup_expired_otps(expiry_minutes INTEGER DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM otp_requests
    WHERE created_at < (now() - (expiry_minutes || ' minutes')::INTERVAL)
      AND is_used = false;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: schedule via pg_cron (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-otps', '*/15 * * * *', $$SELECT cleanup_expired_otps()$$);
