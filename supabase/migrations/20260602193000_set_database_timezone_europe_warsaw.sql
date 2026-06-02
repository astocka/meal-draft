-- Show timestamptz values in Studio/SQL using Europe/Warsaw (CET/CEST with DST).
-- timestamptz is still stored as UTC; only the session display default changes.
ALTER DATABASE postgres SET timezone TO 'Europe/Warsaw';
