-- Test seed data (minimal)
INSERT INTO voters (id, email, password_hash, name, roll_number, department, year, role, is_verified)
VALUES
    (gen_random_uuid(), 'test_admin@test.edu', '$2b$12$placeholder', 'Test Admin', '00TST001', 'Test', 1, 'admin', true),
    (gen_random_uuid(), 'test_student@test.edu', '$2b$12$placeholder', 'Test Student', '21TST001', 'Test', 1, 'student', true);
