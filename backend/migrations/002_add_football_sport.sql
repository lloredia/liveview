-- Add Football (NFL) sport for schedule sync and match detail
INSERT INTO sports (id, name, sport_type) VALUES
    ('a0000000-0000-0000-0000-000000000005', 'Football', 'football')
ON CONFLICT (name) DO NOTHING;
