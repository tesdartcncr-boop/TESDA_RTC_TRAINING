-- SQL Seed Data for Trainer Portal Database
-- Copy and paste these statements into your Supabase SQL editor

-- Create verified_admin_emails table for admin OTP login
CREATE TABLE IF NOT EXISTS verified_admin_emails (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert verified admin emails
INSERT INTO verified_admin_emails (email, is_active) VALUES
('jorvincesoriano3@gmail.com', true);

-- Insert Admin Users
INSERT INTO users (username, email, password_hash, user_type, is_active, created_at) VALUES
('admin', 'admin@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'admin', true, NOW()),
('admin2', 'admin2@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'admin', true, NOW());

-- Insert Trainer Users
INSERT INTO users (username, email, password_hash, user_type, is_active, created_at) VALUES
('trainer1', 'trainer1@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer2', 'trainer2@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer3', 'trainer3@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer4', 'trainer4@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer5', 'trainer5@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer6', 'trainer6@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer7', 'trainer7@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer8', 'trainer8@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer9', 'trainer9@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW()),
('trainer10', 'trainer10@trainerportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LrUpm', 'trainer', true, NOW());

-- Insert Trainers
INSERT INTO trainers (user_id, username, trainer_name, qualifications, tm_number, tm_expiration, nttc_number, nttc_expiration, is_active, created_at) VALUES
(3, 'trainer1', 'John Smith', 'BSc in Computer Science, 5 years experience in software development', 'TM2023001', '2024-12-31', 'NTTC2023001', '2024-06-30', true, NOW()),
(4, 'trainer2', 'Sarah Johnson', 'MSc in Information Technology, Certified AWS Solutions Architect', 'TM2023002', '2025-03-15', 'NTTC2023002', '2024-09-30', true, NOW()),
(5, 'trainer3', 'Michael Chen', 'PhD in Machine Learning, 10 years AI research experience', 'TM2023003', '2024-08-20', 'NTTC2023003', '2025-01-15', true, NOW()),
(6, 'trainer4', 'Emily Davis', 'BSc in Data Science, Certified Data Analyst', 'TM2023004', '2024-11-10', 'NTTC2023004', '2024-07-31', true, NOW()),
(7, 'trainer5', 'Robert Wilson', 'MSc in Cybersecurity, CISSP Certified', 'TM2023005', '2025-02-28', 'NTTC2023005', '2024-10-15', true, NOW()),
(8, 'trainer6', 'Lisa Anderson', 'BSc in Web Development, Full Stack Developer', 'TM2023006', '2024-09-25', 'NTTC2023006', '2024-12-31', true, NOW()),
(9, 'trainer7', 'James Taylor', 'MSc in Cloud Computing, Azure Certified', 'TM2023007', '2025-01-20', 'NTTC2023007', '2024-08-10', true, NOW()),
(10, 'trainer8', 'Maria Garcia', 'BSc in Mobile Development, iOS and Android Expert', 'TM2023008', '2024-10-30', 'NTTC2023008', '2025-03-31', true, NOW()),
(11, 'trainer9', 'David Brown', 'PhD in Database Systems, Oracle Certified Professional', 'TM2023009', '2024-12-15', 'NTTC2023009', '2024-11-20', true, NOW()),
(12, 'trainer10', 'Jennifer Martinez', 'MSc in DevOps, Kubernetes Certified', 'TM2023010', '2025-04-10', 'NTTC2023010', '2024-09-05', true, NOW());

-- Insert Programs
INSERT INTO programs (name, description, type, hours, is_active, created_by, created_at) VALUES
('Advanced Web Development', 'Comprehensive course covering modern web technologies including React, Node.js, and MongoDB', 'Institution', 40, true, 1, NOW()),
('Data Science Fundamentals', 'Introduction to data science concepts, Python programming, and machine learning basics', 'Institution', 48, true, 1, NOW()),
('Cybersecurity Essentials', 'Learn fundamental cybersecurity concepts, network security, and ethical hacking', 'Institution', 36, true, 1, NOW()),
('Mobile App Development', 'Create native mobile applications for iOS and Android platforms', 'Institution', 44, true, 1, NOW()),
('Cloud Computing with AWS', 'Master AWS services and cloud architecture principles', 'Institution', 32, true, 1, NOW()),
('Community Health Workshop', 'Basic health awareness and first aid training for community workers', 'Community-Based', 16, true, 1, NOW()),
('Digital Literacy Program', 'Teaching basic computer skills to elderly and underserved communities', 'Community-Based', 20, true, 1, NOW()),
('Youth Coding Bootcamp', 'Weekend coding camp for high school students interested in technology', 'Community-Based', 24, true, 1, NOW()),
('Small Business Digital Marketing', 'Helping small business owners establish online presence', 'Community-Based', 12, true, 1, NOW()),
('Financial Literacy for Adults', 'Basic financial management and investment principles', 'Community-Based', 8, true, 1, NOW()),
('AI and Machine Learning Workshop', 'Introduction to artificial intelligence and ML algorithms', 'Others', 28, true, 1, NOW()),
('Blockchain Technology Overview', 'Understanding blockchain principles and applications', 'Others', 16, true, 1, NOW()),
('IoT Device Programming', 'Programming Internet of Things devices and sensors', 'Others', 24, true, 1, NOW()),
('Game Development Basics', 'Introduction to game design and development using Unity', 'Others', 32, true, 1, NOW()),
('Robotics and Automation', 'Basic robotics concepts and automation programming', 'Others', 36, true, 1, NOW());

-- Insert Sample Notifications
INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES
(3, 'Welcome to Trainer Portal', 'Your trainer account has been successfully created. Please update your profile.', false, NOW()),
(4, 'New Program Assignment', 'You have been assigned to the Advanced Web Development program.', false, NOW()),
(5, 'Profile Update Required', 'Please update your TM certification details before the end of the month.', false, NOW()),
(6, 'Training Schedule Update', 'Your training schedule for next week has been updated.', false, NOW()),
(7, 'Certificate Renewal Reminder', 'Your NTTC certificate will expire in 30 days. Please renew soon.', false, NOW()),
(8, 'New Student Enrollment', '5 new students have enrolled in your Mobile App Development course.', false, NOW()),
(9, 'Meeting Invitation', 'Team meeting scheduled for tomorrow at 2:00 PM.', false, NOW()),
(10, 'Performance Review', 'Your quarterly performance review is scheduled for next week.', false, NOW()),
(11, 'Training Materials Update', 'New training materials are available for your courses.', false, NOW()),
(12, 'System Maintenance Notice', 'The system will be under maintenance this weekend.', false, NOW());

-- Insert Sample OTP Verifications (for testing)
INSERT INTO otp_verifications (email, otp_code, is_verified, expires_at, created_at) VALUES
('admin@trainerportal.com', '123456', true, NOW() + INTERVAL '10 minutes', NOW()),
('trainer1@trainerportal.com', '654321', true, NOW() + INTERVAL '10 minutes', NOW()),
('test@gmail.com', '111111', false, NOW() + INTERVAL '10 minutes', NOW());

-- Additional sample data for testing
INSERT INTO programs (name, description, type, hours, is_active, created_by, created_at) VALUES
('Python Programming Basics', 'Learn Python programming from scratch with hands-on projects', 'Institution', 30, true, 1, NOW()),
('Database Design and Management', 'Comprehensive database design using SQL and NoSQL technologies', 'Institution', 35, true, 1, NOW()),
('DevOps Practices', 'Learn continuous integration, deployment, and infrastructure as code', 'Institution', 42, true, 1, NOW()),
('UI/UX Design Principles', 'Master user interface and user experience design concepts', 'Institution', 28, true, 1, NOW()),
('Agile Project Management', 'Learn Scrum and Kanban methodologies for project management', 'Institution', 20, true, 1, NOW()),
('Environmental Awareness', 'Community workshop on environmental conservation and sustainability', 'Community-Based', 6, true, 1, NOW()),
('Senior Citizens Tech Training', 'Basic technology training for elderly community members', 'Community-Based', 10, true, 1, NOW()),
('Entrepreneurship Skills', 'Business planning and entrepreneurial mindset development', 'Community-Based', 15, true, 1, NOW()),
('Mental Health Awareness', 'Community workshop on mental health and wellness', 'Community-Based', 8, true, 1, NOW()),
('Career Development Workshop', 'Resume building and interview skills training', 'Community-Based', 12, true, 1, NOW()),
('Advanced Analytics', 'Deep dive into statistical analysis and data visualization', 'Others', 25, true, 1, NOW()),
('Quantum Computing Introduction', 'Basic concepts of quantum computing and quantum algorithms', 'Others', 18, true, 1, NOW()),
('Augmented Reality Development', 'Creating AR applications using Unity and ARCore', 'Others', 30, true, 1, NOW()),
('Ethical Hacking Advanced', 'Advanced penetration testing and security assessment techniques', 'Others', 40, true, 1, NOW()),
('Digital Forensics', 'Computer forensics and incident response procedures', 'Others', 32, true, 1, NOW());

-- More trainer profiles for comprehensive testing
INSERT INTO trainers (user_id, username, trainer_name, qualifications, tm_number, tm_expiration, nttc_number, nttc_expiration, is_active, created_at) VALUES
(13, 'trainer11', 'Kevin Lee', 'BSc in Software Engineering, Agile Certified Practitioner', 'TM2023011', '2025-05-20', 'NTTC2023011', '2024-12-15', true, NOW()),
(14, 'trainer12', 'Amanda White', 'MSc in Information Systems, PMP Certified', 'TM2023012', '2024-07-30', 'NTTC2023012', '2025-02-28', true, NOW()),
(15, 'trainer13', 'Christopher Moore', 'PhD in Artificial Intelligence, TensorFlow Certified', 'TM2023013', '2025-03-10', 'NTTC2023013', '2024-10-20', true, NOW());

-- Additional notifications for testing
INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES
(13, 'Account Verification', 'Please verify your email address to complete account setup.', false, NOW()),
(14, 'Training Materials', 'New training materials have been uploaded to your dashboard.', false, NOW()),
(15, 'Schedule Change', 'Your training schedule for next month has been updated.', false, NOW());
