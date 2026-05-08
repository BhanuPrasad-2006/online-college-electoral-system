-- Development seed data
-- Insert test users
INSERT INTO voters (id, email, password_hash, name, roll_number, department, year, role, is_verified)
VALUES
    (gen_random_uuid(), 'admin@college.edu', '$2b$12$placeholder', 'Admin User', '00ADM001', 'Administration', 4, 'admin', true),
    (gen_random_uuid(), 'student1@college.edu', '$2b$12$placeholder', 'Rahul Verma', '21CS101', 'Computer Science', 3, 'student', true),
    (gen_random_uuid(), 'student2@college.edu', '$2b$12$placeholder', 'Priya Patel', '21ECE102', 'Electronics', 3, 'student', true),
    (gen_random_uuid(), 'candidate1@college.edu', '$2b$12$placeholder', 'Ananya Sharma', '20CS050', 'Computer Science', 4, 'candidate', true);

-- Insert test election
INSERT INTO elections (id, title, description, status, start_time, end_time, created_by)
VALUES (
    gen_random_uuid(),
    'Student Council Election 2025',
    'Annual student council election for the academic year 2025-2026',
    'active',
    NOW(),
    NOW() + INTERVAL '24 hours',
    (SELECT id FROM voters WHERE role = 'admin' LIMIT 1)
);
