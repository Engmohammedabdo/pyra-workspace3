-- ═══════════════════════════════════════════════════════════════════
-- Elite Life Migration v2 - Based on ACTUAL Database Inspection
-- Date: 2026-02-04
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Add preferred_language to patients table
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(2) DEFAULT 'ar';

-- Set existing patients to Arabic
UPDATE patients SET preferred_language = 'ar' WHERE preferred_language IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Recreate patient_profiles view
-- Original columns: id, patient_code, name, whatsapp_number, age, gender, 
--   total_visits, total_spent, reliability_score, last_visit_date, 
--   google_review_given, created_at, appointment_count, attended_count, 
--   noshow_count, last_appointment_date, departments_visited
-- Adding: preferred_language
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS patient_profiles;

CREATE VIEW patient_profiles AS
SELECT 
    p.id,
    p.code as patient_code,
    p.name,
    p.whatsapp_number,
    p.age,
    p.gender,
    p.preferred_language,
    p.total_visits,
    p.total_spent,
    p.reliability_score,
    p.last_visit_date,
    p.google_review_given,
    p.created_at,
    COUNT(a.id) as appointment_count,
    COUNT(a.id) FILTER (WHERE a.attended = true) as attended_count,
    COUNT(a.id) FILTER (WHERE a.attended = false AND a.status = 'confirmed' AND a.date < CURRENT_DATE) as noshow_count,
    MAX(a.date) as last_appointment_date,
    STRING_AGG(DISTINCT d.name_ar, ', ') as departments_visited
FROM patients p
LEFT JOIN appointments a ON a.patient_id = p.id
LEFT JOIN departments d ON d.id = a.department_id
GROUP BY p.id, p.code, p.name, p.whatsapp_number, p.age, p.gender, 
         p.preferred_language, p.total_visits, p.total_spent, 
         p.reliability_score, p.last_visit_date, p.google_review_given, p.created_at;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Recreate appointments_needing_reminders view
-- Original columns: id, appointment_code, date, time, reminder_sent_24h, 
--   reminder_sent_today, patient_code, patient_name, whatsapp_number, 
--   doctor_code, doctor_name_ar, service_code, service_name_ar
-- Adding: preferred_language, doctor_name_en, service_name_en
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS appointments_needing_reminders;

CREATE VIEW appointments_needing_reminders AS
SELECT 
    a.id,
    a.code as appointment_code,
    a.date,
    a.time,
    a.reminder_sent_24h,
    a.reminder_sent_today,
    p.code as patient_code,
    p.name as patient_name,
    p.whatsapp_number,
    p.preferred_language,
    doc.code as doctor_code,
    doc.name_ar as doctor_name_ar,
    doc.name_en as doctor_name_en,
    s.code as service_code,
    s.name_ar as service_name_ar,
    s.name_en as service_name_en
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors doc ON doc.id = a.doctor_id
JOIN services s ON s.id = a.service_id
WHERE a.status = 'confirmed'
  AND (
    (a.date = CURRENT_DATE + INTERVAL '1 day' AND a.reminder_sent_24h = false)
    OR 
    (a.date = CURRENT_DATE AND a.reminder_sent_today = false AND a.time > CURRENT_TIME)
  );


-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Create trigger for reliability_score auto-update
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_patient_reliability()
RETURNS TRIGGER AS $$
DECLARE
    patient_noshow_count INTEGER;
    patient_attended_count INTEGER;
    new_reliability VARCHAR(10);
BEGIN
    IF OLD.attended IS DISTINCT FROM NEW.attended THEN
        
        SELECT 
            COUNT(*) FILTER (WHERE attended = false AND status = 'confirmed' AND date < CURRENT_DATE),
            COUNT(*) FILTER (WHERE attended = true)
        INTO patient_noshow_count, patient_attended_count
        FROM appointments 
        WHERE patient_id = NEW.patient_id;
        
        IF patient_noshow_count >= 3 THEN
            new_reliability := 'low';
        ELSIF patient_noshow_count >= 1 THEN
            new_reliability := 'medium';
        ELSIF patient_attended_count >= 3 THEN
            new_reliability := 'high';
        ELSE
            new_reliability := 'medium';
        END IF;
        
        UPDATE patients 
        SET reliability_score = new_reliability,
            updated_at = NOW()
        WHERE id = NEW.patient_id;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reliability ON appointments;

CREATE TRIGGER trigger_update_reliability
    AFTER UPDATE OF attended ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_reliability();


-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Verify
-- ═══════════════════════════════════════════════════════════════════

SELECT 'Step 1: preferred_language column' as step, 
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name = 'patients' AND column_name = 'preferred_language'
       ) THEN '✅ SUCCESS' ELSE '❌ FAILED' END as status;

SELECT 'Step 2: patient_profiles view' as step,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.views WHERE table_name = 'patient_profiles'
       ) THEN '✅ SUCCESS' ELSE '❌ FAILED' END as status;

SELECT 'Step 3: appointments_needing_reminders view' as step,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.views WHERE table_name = 'appointments_needing_reminders'
       ) THEN '✅ SUCCESS' ELSE '❌ FAILED' END as status;

SELECT 'Step 4: reliability trigger' as step,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trigger_update_reliability'
       ) THEN '✅ SUCCESS' ELSE '❌ FAILED' END as status;
