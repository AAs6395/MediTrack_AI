-- Create Database
CREATE DATABASE IF NOT EXISTS medical_tracker;
USE medical_tracker;

-- Medications Table
CREATE TABLE IF NOT EXISTS medications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    time TIME NOT NULL,
    taken BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date_time DATETIME NOT NULL,
    notes TEXT,
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Vital Signs Table
CREATE TABLE IF NOT EXISTS vitals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blood_pressure VARCHAR(20),
    heart_rate INT,
    temperature DECIMAL(4,1),
    blood_sugar INT,
    recorded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    date_time DATETIME NOT NULL,
    location VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_medication_time ON medications(time);
CREATE INDEX idx_reminder_datetime ON reminders(date_time);
CREATE INDEX idx_vitals_recorded ON vitals(recorded_date);
CREATE INDEX idx_appointment_datetime ON appointments(date_time);

-- Insert sample data for demonstration
INSERT INTO medications (name, dosage, frequency, time) VALUES
('Aspirin', '500mg', 'Once daily', '09:00:00'),
('Vitamin D', '1000 IU', 'Once daily', '08:00:00');

INSERT INTO reminders (title, date_time, notes) VALUES
('Doctor Appointment', '2025-10-15 10:00:00', 'Annual checkup with Dr. Smith'),
('Lab Test Results', '2025-10-20 14:00:00', 'Pick up blood test results');

INSERT INTO vitals (blood_pressure, heart_rate, temperature, blood_sugar) VALUES
('120/80', 72, 98.6, 95),
('118/78', 68, 98.4, 92);

INSERT INTO appointments (doctor, type, date_time, location) VALUES
('Dr. Smith', 'Check-up', '2025-10-15 10:00:00', '123 Medical Center, Room 205'),
('Dr. Johnson', 'Follow-up', '2025-10-25 15:30:00', '456 Health Clinic, 3rd Floor');