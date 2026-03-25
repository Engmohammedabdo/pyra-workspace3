-- ═══════════════════════════════════════════════════════════════════
-- Elite Life Database Migrations
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. ADD preferred_language TO patients
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(2) DEFAULT 'ar';

COMMENT ON COLUMN patients.preferred_language IS 'ar = Arabic, en = English';

-- Update existing patients to Arabic (default)
UPDATE patients SET preferred_language = 'ar' WHERE preferred_language IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 2. CREATE TRIGGER FOR reliability_score AUTO-UPDATE
-- ═══════════════════════════════════════════════════════════════════

-- Function to update reliability score
CREATE OR REPLACE FUNCTION update_patient_reliability()
RETURNS TRIGGER AS $$
DECLARE
    patient_noshow_count INTEGER;
    patient_attended_count INTEGER;
    new_reliability VARCHAR(10);
BEGIN
    -- Only process if attended status changed
    IF OLD.attended IS DISTINCT FROM NEW.attended THEN
        
        -- Count patient's no-shows and attendances
        SELECT 
            COUNT(*) FILTER (WHERE attended = false AND status = 'confirmed' AND date < CURRENT_DATE),
            COUNT(*) FILTER (WHERE attended = true)
        INTO patient_noshow_count, patient_attended_count
        FROM appointments 
        WHERE patient_id = NEW.patient_id;
        
        -- Calculate new reliability score
        IF patient_noshow_count >= 3 THEN
            new_reliability := 'low';
        ELSIF patient_noshow_count >= 1 THEN
            new_reliability := 'medium';
        ELSIF patient_attended_count >= 3 THEN
            new_reliability := 'high';
        ELSE
            new_reliability := 'medium';
        END IF;
        
        -- Update patient's reliability score
        UPDATE patients 
        SET reliability_score = new_reliability,
            updated_at = NOW()
        WHERE id = NEW.patient_id;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_reliability ON appointments;
CREATE TRIGGER trigger_update_reliability
    AFTER UPDATE OF attended ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_reliability();


-- ═══════════════════════════════════════════════════════════════════
-- 3. UPDATE patient_profiles VIEW TO INCLUDE preferred_language
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW patient_profiles AS
SELECT 
    p.id,
    p.code as patient_code,
    p.name,
    p.whatsapp_number,
    p.age,
    p.gender,
    p.preferred_language,  -- NEW!
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
GROUP BY p.id;


-- ═══════════════════════════════════════════════════════════════════
-- 4. UPDATE appointments_needing_reminders VIEW TO INCLUDE LANGUAGE
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW appointments_needing_reminders AS
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
    p.preferred_language,  -- NEW!
    d.code as doctor_code,
    d.name_ar as doctor_name_ar,
    d.name_en as doctor_name_en,  -- NEW!
    s.code as service_code,
    s.name_ar as service_name_ar,
    s.name_en as service_name_en  -- NEW!
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors d ON d.id = a.doctor_id
JOIN services s ON s.id = a.service_id
WHERE a.status = 'confirmed'
  AND (
    (a.date = CURRENT_DATE + INTERVAL '1 day' AND a.reminder_sent_24h = false)
    OR 
    (a.date = CURRENT_DATE AND a.reminder_sent_today = false AND a.time > CURRENT_TIME)
  );


-- ═══════════════════════════════════════════════════════════════════
-- 5. UPDATE appointments_needing_review VIEW
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW appointments_needing_review AS
SELECT 
    a.id,
    a.code as appointment_code,
    a.date,
    p.code as patient_code,
    p.name as patient_name,
    p.whatsapp_number,
    p.preferred_language,  -- NEW!
    p.google_review_given,
    d.name_ar as doctor_name_ar,
    s.name_ar as service_name_ar
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors d ON d.id = a.doctor_id
JOIN services s ON s.id = a.service_id
WHERE a.attended = true
  AND a.review_request_sent = false
  AND p.google_review_given = false
  AND a.date <= CURRENT_DATE - INTERVAL '2 hours';


-- ═══════════════════════════════════════════════════════════════════
-- 6. VERIFY CHANGES
-- ═══════════════════════════════════════════════════════════════════

-- Check preferred_language column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'preferred_language';

-- Check trigger exists
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_reliability';

-- Done!
SELECT 'All migrations completed successfully!' as status;
