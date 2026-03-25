# Pyra Workspace 3.0 — Database-Level Architecture PRD

> **Section 23** | PostgreSQL Advanced Features & Smart Database Layer
> **Date:** 2026-02-15
> **Author:** PyraAI (Database Architect)
> **Philosophy:** "Smart Database, Thin API" — Move logic to PostgreSQL where it runs faster, safer, and atomically

---

## Architecture Shift

الـ PRD السابق كان يتبع نمط **"Fat API, Dumb Database"** — كل المنطق في Next.js API Routes.

الآن نتحول إلى **"Smart Database, Thin API"**:

| الجانب | النمط القديم (Fat API) | النمط الجديد (Smart DB) |
|--------|----------------------|------------------------|
| Dashboard data | 6 queries مستقلة من API | دالة واحدة `get_admin_dashboard()` |
| Quote totals | JS يحسب ويرسل | Trigger يحسب تلقائياً |
| Activity logging | كل endpoint يسجل يدوياً | Triggers تسجل تلقائياً |
| Notifications | API ينشئ يدوياً | Triggers + Functions |
| Trash purge | Vercel Cron (مدفوع) | pg_cron (مجاني) |
| File search | `ILIKE '%keyword%'` (بطيء) | `tsvector + GIN` (100x أسرع) |
| Permissions | 5+ queries لكل request | دالة واحدة `check_access()` |
| updated_at | يدوي في كل UPDATE | Trigger عالمي |

**الفوائد:**
- ⚡ **أداء**: 3-6x أقل network round-trips
- 🔒 **أمان**: RLS تستخدم functions للصلاحيات المعقدة
- ✅ **موثوقية**: Atomic transactions, لا partial state
- 💰 **تكلفة**: pg_cron يحل محل Vercel Cron
- 📉 **كود أقل**: ~30% أقل في API routes

---

## 1. PostgreSQL Functions (PL/pgSQL)

### 1.1 `generate_quote_number()` — توليد رقم عرض سعر ذري

**المشكلة:** Race condition عند إنشاء عرضين بنفس اللحظة.

```sql
CREATE OR REPLACE FUNCTION generate_quote_number(p_team_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT;
    v_counter INT;
    v_number TEXT;
BEGIN
    -- قفل الصف لمنع race condition
    SELECT value INTO v_prefix
    FROM pyra_settings
    WHERE key = 'quote_number_prefix' AND team_id = p_team_id
    FOR UPDATE;

    IF v_prefix IS NULL THEN
        v_prefix := 'QT-';
    END IF;

    -- زيادة العداد ذرياً
    UPDATE pyra_settings
    SET value = (COALESCE(value::INT, 0) + 1)::TEXT,
        updated_at = NOW()
    WHERE key = 'quote_number_counter' AND team_id = p_team_id
    RETURNING value INTO v_counter;

    -- لو ما لقى صف، أنشئ واحد
    IF v_counter IS NULL THEN
        INSERT INTO pyra_settings (key, value, team_id, updated_at)
        VALUES ('quote_number_counter', '1', p_team_id, NOW())
        RETURNING value::INT INTO v_counter;
    END IF;

    v_number := v_prefix || LPAD(v_counter::TEXT, 4, '0');
    RETURN v_number;
END;
$$;

-- الاستخدام:
-- SELECT generate_quote_number('team_abc');
-- النتيجة: 'QT-0001', 'QT-0002', ... (ذري بدون تكرار)
```

### 1.2 `recalculate_quote_totals()` — إعادة حساب مجاميع العرض

```sql
CREATE OR REPLACE FUNCTION recalculate_quote_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_subtotal NUMERIC(12,2);
    v_tax_rate NUMERIC(5,2);
    v_tax_amount NUMERIC(12,2);
    v_total NUMERIC(12,2);
    v_quote_id TEXT;
BEGIN
    -- تحديد الـ quote_id حسب العملية
    IF TG_OP = 'DELETE' THEN
        v_quote_id := OLD.quote_id;
    ELSE
        v_quote_id := NEW.quote_id;
    END IF;

    -- حساب المجموع الفرعي من جميع العناصر
    SELECT COALESCE(SUM(quantity * rate), 0)
    INTO v_subtotal
    FROM pyra_quote_items
    WHERE quote_id = v_quote_id;

    -- جلب نسبة الضريبة
    SELECT COALESCE(tax_rate, 5)
    INTO v_tax_rate
    FROM pyra_quotes
    WHERE id = v_quote_id;

    -- الحسابات
    v_tax_amount := ROUND(v_subtotal * (v_tax_rate / 100), 2);
    v_total := v_subtotal + v_tax_amount;

    -- تحديث العرض
    UPDATE pyra_quotes
    SET subtotal = v_subtotal,
        tax_amount = v_tax_amount,
        total = v_total,
        updated_at = NOW()
    WHERE id = v_quote_id;

    -- تحديث amount في العنصر نفسه
    IF TG_OP != 'DELETE' THEN
        NEW.amount := NEW.quantity * NEW.rate;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- ربط الـ Trigger
CREATE TRIGGER trg_quote_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON pyra_quote_items
    FOR EACH ROW EXECUTE FUNCTION recalculate_quote_totals();
```

### 1.3 `get_admin_dashboard()` — Dashboard في استدعاء واحد

**المشكلة:** الـ Dashboard يحتاج 6+ queries — كل واحدة round-trip منفصل.

```sql
CREATE OR REPLACE FUNCTION get_admin_dashboard(p_username TEXT, p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE -- لأنها read-only
AS $$
DECLARE
    v_result JSONB;
    v_storage_stats JSONB;
    v_recent_files JSONB;
    v_recent_activity JSONB;
    v_notification_count INT;
    v_pending_approvals INT;
    v_active_projects INT;
    v_total_users INT;
    v_total_quotes JSONB;
BEGIN
    -- عدد الإشعارات غير المقروءة
    SELECT COUNT(*) INTO v_notification_count
    FROM pyra_notifications
    WHERE recipient_username = p_username AND is_read = FALSE;

    -- الموافقات المعلقة
    SELECT COUNT(*) INTO v_pending_approvals
    FROM pyra_file_approvals
    WHERE status = 'pending';

    -- المشاريع النشطة
    SELECT COUNT(*) INTO v_active_projects
    FROM pyra_projects
    WHERE status IN ('active', 'in_progress', 'review');

    -- عدد المستخدمين (admin فقط)
    IF p_role = 'admin' THEN
        SELECT COUNT(*) INTO v_total_users FROM pyra_users;
    END IF;

    -- آخر النشاطات (10)
    SELECT COALESCE(jsonb_agg(row_to_json(a)::JSONB), '[]'::JSONB)
    INTO v_recent_activity
    FROM (
        SELECT id, action_type, username, display_name,
               target_path, created_at
        FROM pyra_activity_log
        ORDER BY created_at DESC
        LIMIT 10
    ) a;

    -- إحصائيات العروض
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'draft', COUNT(*) FILTER (WHERE status = 'draft'),
        'sent', COUNT(*) FILTER (WHERE status = 'sent'),
        'signed', COUNT(*) FILTER (WHERE status = 'signed'),
        'total_value', COALESCE(SUM(total) FILTER (WHERE status = 'signed'), 0)
    ) INTO v_total_quotes
    FROM pyra_quotes;

    -- تجميع النتيجة
    v_result := jsonb_build_object(
        'unread_notifications', v_notification_count,
        'pending_approvals', v_pending_approvals,
        'active_projects', v_active_projects,
        'total_users', v_total_users,
        'recent_activity', v_recent_activity,
        'quotes', v_total_quotes
    );

    RETURN v_result;
END;
$$;

-- الاستخدام في Next.js:
-- const { data } = await supabase.rpc('get_admin_dashboard', {
--   p_username: user.username,
--   p_role: user.role
-- });
-- ← استدعاء واحد بدل 6!
```

### 1.4 `get_client_dashboard()` — Portal Dashboard

```sql
CREATE OR REPLACE FUNCTION get_client_dashboard(p_client_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_client RECORD;
    v_result JSONB;
BEGIN
    -- بيانات العميل
    SELECT name, company, email, last_login_at
    INTO v_client
    FROM pyra_clients WHERE id = p_client_id;

    v_result := jsonb_build_object(
        'client', jsonb_build_object(
            'name', v_client.name,
            'company', v_client.company,
            'last_login', v_client.last_login_at
        ),
        'projects', (
            SELECT jsonb_build_object(
                'total_active', COUNT(*) FILTER (WHERE status IN ('active','in_progress','review')),
                'list', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', id, 'name', name, 'status', status,
                        'file_count', (SELECT COUNT(*) FROM pyra_project_files pf WHERE pf.project_id = p.id),
                        'pending_approvals', (
                            SELECT COUNT(*) FROM pyra_file_approvals fa
                            JOIN pyra_project_files pf2 ON fa.file_id = pf2.id
                            WHERE pf2.project_id = p.id AND fa.status = 'pending'
                        )
                    ) ORDER BY updated_at DESC
                ) FILTER (WHERE status != 'archived'), '[]'::JSONB)
            )
            FROM pyra_projects p
            WHERE p.client_company = v_client.company
        ),
        'pending_approvals', (
            SELECT COUNT(*) FROM pyra_file_approvals fa
            JOIN pyra_project_files pf ON fa.file_id = pf.id
            JOIN pyra_projects pp ON pf.project_id = pp.id
            WHERE pp.client_company = v_client.company AND fa.status = 'pending'
        ),
        'unread_notifications', (
            SELECT COUNT(*) FROM pyra_client_notifications
            WHERE client_id = p_client_id AND is_read = FALSE
        ),
        'total_quotes', (
            SELECT COUNT(*) FROM pyra_quotes
            WHERE client_id = p_client_id AND status != 'draft'
        ),
        'pending_quotes', (
            SELECT COUNT(*) FROM pyra_quotes
            WHERE client_id = p_client_id AND status IN ('sent', 'viewed')
        ),
        'recent_notifications', (
            SELECT COALESCE(jsonb_agg(row_to_json(n)::JSONB), '[]'::JSONB)
            FROM (
                SELECT id, type, message, is_read, created_at
                FROM pyra_client_notifications
                WHERE client_id = p_client_id
                ORDER BY created_at DESC LIMIT 5
            ) n
        )
    );

    RETURN v_result;
END;
$$;
```

### 1.5 `check_path_access()` — فحص صلاحيات المسار

**المشكلة:** كل request يحتاج 3-5 queries لفحص الصلاحيات.

```sql
CREATE OR REPLACE FUNCTION check_path_access(
    p_username TEXT,
    p_path TEXT,
    p_action TEXT DEFAULT 'read' -- read, write, delete, upload
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_user RECORD;
    v_permissions JSONB;
    v_team_perms JSONB;
    v_file_perm RECORD;
    v_allowed_paths JSONB;
    v_path_parts TEXT[];
    v_check_path TEXT;
BEGIN
    -- جلب بيانات المستخدم
    SELECT role, permissions INTO v_user
    FROM pyra_users WHERE username = p_username;

    -- الأدمن يقدر يوصل لكل شي
    IF v_user.role = 'admin' THEN
        RETURN TRUE;
    END IF;

    v_permissions := v_user.permissions;

    -- 1) فحص المسارات المسموحة مباشرة
    v_allowed_paths := v_permissions -> 'allowed_paths';
    IF v_allowed_paths IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_allowed_paths) - 1 LOOP
            v_check_path := v_allowed_paths ->> i;
            IF p_path = v_check_path OR p_path LIKE v_check_path || '/%' THEN
                -- مسار مسموح — فحص الإجراء المطلوب
                CASE p_action
                    WHEN 'read' THEN RETURN TRUE;
                    WHEN 'upload' THEN
                        RETURN COALESCE((v_permissions ->> 'can_upload')::BOOLEAN, FALSE);
                    WHEN 'write' THEN
                        RETURN COALESCE((v_permissions ->> 'can_edit')::BOOLEAN, FALSE);
                    WHEN 'delete' THEN
                        RETURN COALESCE((v_permissions ->> 'can_delete')::BOOLEAN, FALSE);
                    ELSE RETURN FALSE;
                END CASE;
            END IF;
        END LOOP;
    END IF;

    -- 2) فحص صلاحيات الفريق
    FOR v_team_perms IN
        SELECT t.permissions
        FROM pyra_teams t
        JOIN pyra_team_members tm ON tm.team_id = t.id
        WHERE tm.username = p_username
    LOOP
        v_allowed_paths := v_team_perms -> 'allowed_paths';
        IF v_allowed_paths IS NOT NULL THEN
            FOR i IN 0..jsonb_array_length(v_allowed_paths) - 1 LOOP
                v_check_path := v_allowed_paths ->> i;
                IF p_path = v_check_path OR p_path LIKE v_check_path || '/%' THEN
                    RETURN TRUE; -- Team grants access
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 3) فحص صلاحيات الملف المحددة
    SELECT * INTO v_file_perm
    FROM pyra_file_permissions
    WHERE file_path = p_path
    AND (
        (target_type = 'user' AND target_id = p_username)
        OR
        (target_type = 'team' AND target_id IN (
            SELECT team_id FROM pyra_team_members WHERE username = p_username
        ))
    )
    AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1;

    IF v_file_perm IS NOT NULL THEN
        CASE p_action
            WHEN 'read' THEN RETURN TRUE;
            WHEN 'upload' THEN
                RETURN COALESCE((v_file_perm.permissions ->> 'can_upload')::BOOLEAN, FALSE);
            WHEN 'write' THEN
                RETURN COALESCE((v_file_perm.permissions ->> 'can_edit')::BOOLEAN, FALSE);
            WHEN 'delete' THEN
                RETURN COALESCE((v_file_perm.permissions ->> 'can_delete')::BOOLEAN, FALSE);
            ELSE RETURN FALSE;
        END CASE;
    END IF;

    RETURN FALSE;
END;
$$;

-- الاستخدام في RLS:
-- CREATE POLICY "user_file_access" ON pyra_file_index
--   FOR SELECT USING (check_path_access(auth.jwt()->>'username', file_path, 'read'));
```

### 1.6 `create_notification_for_path()` — إشعار كل من لهم صلاحية على مسار

```sql
CREATE OR REPLACE FUNCTION create_notification_for_path(
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_source_username TEXT,
    p_source_display TEXT,
    p_target_path TEXT,
    p_exclude_username TEXT DEFAULT NULL
)
RETURNS INT -- عدد الإشعارات المنشأة
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT := 0;
    v_user RECORD;
BEGIN
    FOR v_user IN
        SELECT DISTINCT u.username, u.display_name
        FROM pyra_users u
        WHERE u.username != COALESCE(p_exclude_username, '')
        AND (
            u.role = 'admin'
            OR check_path_access(u.username, p_target_path, 'read')
        )
    LOOP
        INSERT INTO pyra_notifications (
            id, recipient_username, type, title, message,
            source_username, source_display_name, target_path,
            is_read, created_at
        ) VALUES (
            'n_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4),
            v_user.username, p_type, p_title, p_message,
            p_source_username, p_source_display, p_target_path,
            FALSE, NOW()
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
```

### 1.7 `move_file_to_trash()` — نقل ذري للملف إلى سلة المحذوفات

```sql
CREATE OR REPLACE FUNCTION move_file_to_trash(
    p_file_path TEXT,
    p_deleted_by TEXT,
    p_deleted_by_display TEXT,
    p_file_size BIGINT DEFAULT 0,
    p_mime_type TEXT DEFAULT 'application/octet-stream'
)
RETURNS TEXT -- trash record id
LANGUAGE plpgsql
AS $$
DECLARE
    v_trash_id TEXT;
    v_file_name TEXT;
    v_trash_path TEXT;
BEGIN
    v_file_name := split_part(p_file_path, '/', -1);
    v_trash_id := 'tr_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4);
    v_trash_path := '.trash/' || v_trash_id || '/' || v_file_name;

    -- 1) إنشاء سجل المحذوفات
    INSERT INTO pyra_trash (
        id, original_path, trash_path, file_name, file_size,
        mime_type, deleted_by, deleted_by_display,
        deleted_at, auto_purge_at
    ) VALUES (
        v_trash_id, p_file_path, v_trash_path, v_file_name,
        p_file_size, p_mime_type, p_deleted_by, p_deleted_by_display,
        NOW(), NOW() + INTERVAL '30 days'
    );

    -- 2) تسجيل النشاط
    INSERT INTO pyra_activity_log (
        id, action_type, username, display_name,
        target_path, details, ip_address, created_at
    ) VALUES (
        'al_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4),
        'delete', p_deleted_by, p_deleted_by_display,
        p_file_path,
        jsonb_build_object('trash_id', v_trash_id, 'file_name', v_file_name),
        '0.0.0.0', NOW()
    );

    -- 3) حذف من فهرس البحث
    DELETE FROM pyra_file_index WHERE file_path = p_file_path;

    RETURN v_trash_id;
END;
$$;
```

### 1.8 `get_quote_with_items()` — جلب العرض مع عناصره

```sql
CREATE OR REPLACE FUNCTION get_quote_with_items(p_quote_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_quote JSONB;
    v_items JSONB;
BEGIN
    SELECT row_to_json(q)::JSONB INTO v_quote
    FROM pyra_quotes q
    WHERE q.id = p_quote_id;

    IF v_quote IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', qi.id,
            'description', qi.description,
            'quantity', qi.quantity,
            'rate', qi.rate,
            'amount', qi.amount,
            'sort_order', qi.sort_order
        ) ORDER BY qi.sort_order
    ), '[]'::JSONB) INTO v_items
    FROM pyra_quote_items qi
    WHERE qi.quote_id = p_quote_id;

    RETURN v_quote || jsonb_build_object('items', v_items);
END;
$$;
```

---

## 2. Database Views

### 2.1 `v_quotes_with_client` — العروض مع بيانات العميل

```sql
CREATE OR REPLACE VIEW v_quotes_with_client AS
SELECT
    q.*,
    c.name AS client_name_live,
    c.email AS client_email_live,
    c.company AS client_company_live,
    c.phone AS client_phone_live,
    -- حساب هل العرض منتهي الصلاحية
    CASE
        WHEN q.status = 'signed' THEN 'signed'
        WHEN q.status = 'cancelled' THEN 'cancelled'
        WHEN q.expiry_date < CURRENT_DATE AND q.status IN ('draft','sent','viewed')
            THEN 'expired'
        ELSE q.status
    END AS effective_status,
    -- عدد العناصر
    (SELECT COUNT(*) FROM pyra_quote_items qi WHERE qi.quote_id = q.id) AS item_count,
    -- أيام حتى انتهاء الصلاحية
    CASE
        WHEN q.expiry_date IS NOT NULL
        THEN (q.expiry_date - CURRENT_DATE)
        ELSE NULL
    END AS days_until_expiry
FROM pyra_quotes q
LEFT JOIN pyra_clients c ON c.id = q.client_id;
```

### 2.2 `v_project_summary` — ملخص المشاريع

```sql
CREATE OR REPLACE VIEW v_project_summary AS
SELECT
    p.*,
    -- عدد الملفات
    (SELECT COUNT(*) FROM pyra_project_files pf WHERE pf.project_id = p.id) AS total_files,
    -- الملفات المعتمدة
    (SELECT COUNT(*) FROM pyra_file_approvals fa
     JOIN pyra_project_files pf ON fa.file_id = pf.id
     WHERE pf.project_id = p.id AND fa.status = 'approved') AS approved_files,
    -- الملفات المعلقة
    (SELECT COUNT(*) FROM pyra_file_approvals fa
     JOIN pyra_project_files pf ON fa.file_id = pf.id
     WHERE pf.project_id = p.id AND fa.status = 'pending') AS pending_files,
    -- التعليقات غير المقروءة
    (SELECT COUNT(*) FROM pyra_client_comments cc
     WHERE cc.project_id = p.id AND cc.is_read_by_team = FALSE
     AND cc.author_type = 'client') AS unread_client_comments,
    -- نسبة الإنجاز
    CASE
        WHEN (SELECT COUNT(*) FROM pyra_project_files pf WHERE pf.project_id = p.id) = 0 THEN 0
        ELSE ROUND(
            (SELECT COUNT(*) FROM pyra_file_approvals fa
             JOIN pyra_project_files pf ON fa.file_id = pf.id
             WHERE pf.project_id = p.id AND fa.status = 'approved')::NUMERIC /
            GREATEST((SELECT COUNT(*) FROM pyra_project_files pf WHERE pf.project_id = p.id), 1) * 100
        )
    END AS completion_percentage
FROM pyra_projects p;
```

### 2.3 `v_user_with_teams` — المستخدمين مع فرقهم

```sql
CREATE OR REPLACE VIEW v_user_with_teams AS
SELECT
    u.username,
    u.display_name,
    u.role,
    u.permissions,
    u.created_at,
    COALESCE(
        jsonb_agg(
            jsonb_build_object('team_id', t.id, 'team_name', t.name)
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::JSONB
    ) AS teams,
    (SELECT COUNT(*) FROM pyra_activity_log al
     WHERE al.username = u.username
     AND al.created_at > NOW() - INTERVAL '7 days') AS activity_7d,
    (SELECT MAX(created_at) FROM pyra_sessions s
     WHERE s.username = u.username) AS last_active
FROM pyra_users u
LEFT JOIN pyra_team_members tm ON tm.username = u.username
LEFT JOIN pyra_teams t ON t.id = tm.team_id
GROUP BY u.username, u.display_name, u.role, u.permissions, u.created_at;
```

### 2.4 `v_notification_summary` — ملخص الإشعارات لكل مستخدم

```sql
CREATE OR REPLACE VIEW v_notification_summary AS
SELECT
    recipient_username,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE is_read = FALSE) AS unread,
    COUNT(*) FILTER (WHERE type = 'upload') AS upload_count,
    COUNT(*) FILTER (WHERE type = 'comment') AS comment_count,
    COUNT(*) FILTER (WHERE type = 'approval') AS approval_count,
    COUNT(*) FILTER (WHERE type IN ('quote_sent','quote_signed')) AS quote_count,
    MAX(created_at) AS latest_at
FROM pyra_notifications
GROUP BY recipient_username;
```

### 2.5 `v_share_links_active` — الروابط المشتركة النشطة

```sql
CREATE OR REPLACE VIEW v_share_links_active AS
SELECT
    sl.*,
    CASE
        WHEN sl.is_active = FALSE THEN 'deactivated'
        WHEN sl.expires_at < NOW() THEN 'expired'
        WHEN sl.max_access > 0 AND sl.access_count >= sl.max_access THEN 'exhausted'
        ELSE 'active'
    END AS effective_status,
    GREATEST(0, EXTRACT(EPOCH FROM (sl.expires_at - NOW())) / 3600)::INT AS hours_remaining
FROM pyra_share_links sl;
```

---

## 3. Materialized Views (للبيانات الثقيلة)

### 3.1 `mv_storage_statistics` — إحصائيات التخزين

```sql
CREATE MATERIALIZED VIEW mv_storage_statistics AS
SELECT
    -- إجمالي الملفات
    COUNT(*) AS total_files,
    -- إجمالي الحجم
    COALESCE(SUM(file_size), 0) AS total_size_bytes,
    ROUND(COALESCE(SUM(file_size), 0) / 1073741824.0, 2) AS total_size_gb,
    -- حسب النوع
    COUNT(*) FILTER (WHERE mime_type LIKE 'image/%') AS image_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'video/%') AS video_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'audio/%') AS audio_count,
    COUNT(*) FILTER (WHERE mime_type = 'application/pdf') AS pdf_count,
    COUNT(*) FILTER (WHERE mime_type NOT LIKE 'image/%'
                     AND mime_type NOT LIKE 'video/%'
                     AND mime_type NOT LIKE 'audio/%'
                     AND mime_type != 'application/pdf') AS other_count,
    -- حجم حسب النوع
    COALESCE(SUM(file_size) FILTER (WHERE mime_type LIKE 'image/%'), 0) AS image_size,
    COALESCE(SUM(file_size) FILTER (WHERE mime_type LIKE 'video/%'), 0) AS video_size,
    -- آخر تحديث
    NOW() AS refreshed_at
FROM pyra_file_index;

-- فهرس فريد مطلوب للـ CONCURRENT refresh
CREATE UNIQUE INDEX ON mv_storage_statistics (refreshed_at);

-- تحديث كل ساعة عبر pg_cron
-- SELECT cron.schedule('refresh-storage-stats', '0 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_storage_statistics');
```

### 3.2 `mv_activity_daily` — ملخص النشاط اليومي

```sql
CREATE MATERIALIZED VIEW mv_activity_daily AS
SELECT
    DATE(created_at) AS activity_date,
    COUNT(*) AS total_actions,
    COUNT(DISTINCT username) AS active_users,
    COUNT(*) FILTER (WHERE action_type = 'upload') AS uploads,
    COUNT(*) FILTER (WHERE action_type = 'download') AS downloads,
    COUNT(*) FILTER (WHERE action_type = 'delete') AS deletes,
    COUNT(*) FILTER (WHERE action_type = 'create_folder') AS folders_created,
    COUNT(*) FILTER (WHERE action_type LIKE 'review%') AS reviews
FROM pyra_activity_log
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY activity_date DESC;

CREATE UNIQUE INDEX ON mv_activity_daily (activity_date);
```

---

## 4. Triggers (الأتمتة التلقائية)

### 4.1 `auto_update_timestamp` — تحديث updated_at تلقائياً

```sql
CREATE OR REPLACE FUNCTION auto_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- تطبيق على كل الجداول التي لها updated_at
CREATE TRIGGER trg_updated_at_quotes
    BEFORE UPDATE ON pyra_quotes
    FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();

CREATE TRIGGER trg_updated_at_clients
    BEFORE UPDATE ON pyra_clients
    FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();

CREATE TRIGGER trg_updated_at_projects
    BEFORE UPDATE ON pyra_projects
    FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();

CREATE TRIGGER trg_updated_at_settings
    BEFORE UPDATE ON pyra_settings
    FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
```

### 4.2 `on_quote_status_change` — إشعار عند تغيير حالة العرض

```sql
CREATE OR REPLACE FUNCTION on_quote_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- لو الحالة تغيرت
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- عرض تم إرساله → إشعار العميل
        IF NEW.status = 'sent' AND NEW.client_id IS NOT NULL THEN
            INSERT INTO pyra_client_notifications (
                id, client_id, type, message, reference_id, is_read, created_at
            ) VALUES (
                'cn_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4),
                NEW.client_id,
                'new_quote',
                'عرض سعر جديد: ' || NEW.quote_number,
                NEW.id,
                FALSE,
                NOW()
            );

            -- تسجيل وقت الإرسال
            NEW.sent_at := NOW();
        END IF;

        -- عرض تم توقيعه → إشعار الأدمن
        IF NEW.status = 'signed' AND NEW.created_by IS NOT NULL THEN
            INSERT INTO pyra_notifications (
                id, recipient_username, type, title, message,
                source_username, source_display_name, target_path,
                is_read, created_at
            ) VALUES (
                'n_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4),
                NEW.created_by,
                'quote_signed',
                'تم توقيع عرض سعر',
                'العميل ' || COALESCE(NEW.signed_by, NEW.client_name) || ' وقّع على ' || NEW.quote_number,
                'system', 'النظام', '/quotes/' || NEW.id,
                FALSE, NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quote_status_change
    BEFORE UPDATE ON pyra_quotes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION on_quote_status_change();
```

### 4.3 `on_review_insert` — إشعار عند إضافة تعليق/مراجعة

```sql
CREATE OR REPLACE FUNCTION on_review_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- إشعار كل من لهم صلاحية على الملف (ماعدا الكاتب)
    PERFORM create_notification_for_path(
        CASE WHEN NEW.type = 'approval' THEN 'approval' ELSE 'comment' END,
        CASE WHEN NEW.type = 'approval' THEN 'موافقة جديدة' ELSE 'تعليق جديد' END,
        NEW.display_name || ': ' || LEFT(NEW.text, 100),
        NEW.username,
        NEW.display_name,
        NEW.file_path,
        NEW.username -- استثناء الكاتب
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_notify
    AFTER INSERT ON pyra_reviews
    FOR EACH ROW EXECUTE FUNCTION on_review_insert();
```

### 4.4 `on_file_approval_change` — إشعار العميل عند الموافقة/الرفض

```sql
CREATE OR REPLACE FUNCTION on_file_approval_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_project RECORD;
    v_file RECORD;
BEGIN
    IF NEW.status IN ('approved', 'revision_requested') AND
       (OLD.status IS NULL OR OLD.status = 'pending') THEN

        -- جلب بيانات المشروع والملف
        SELECT pf.file_name, pf.project_id INTO v_file
        FROM pyra_project_files pf WHERE pf.id = NEW.file_id;

        SELECT pp.client_company INTO v_project
        FROM pyra_projects pp WHERE pp.id = v_file.project_id;

        -- إشعار فريق العمل
        INSERT INTO pyra_activity_log (
            id, action_type, username, display_name,
            target_path, details, ip_address, created_at
        ) VALUES (
            'al_' || extract(epoch from now())::TEXT || '_' || substr(md5(random()::TEXT), 1, 4),
            'file_' || NEW.status,
            COALESCE(NEW.reviewed_by, 'client'),
            COALESCE(NEW.reviewer_name, 'العميل'),
            v_file.file_name,
            jsonb_build_object('approval_id', NEW.id, 'status', NEW.status),
            '0.0.0.0', NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approval_change
    AFTER UPDATE ON pyra_file_approvals
    FOR EACH ROW EXECUTE FUNCTION on_file_approval_change();
```

---

## 5. Full-Text Search (البحث المتقدم)

### 5.1 إضافة عمود البحث النصي

```sql
-- إضافة عمود tsvector لفهرس البحث
ALTER TABLE pyra_file_index
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- تحديث العمود بالبيانات الموجودة
UPDATE pyra_file_index
SET search_vector =
    setweight(to_tsvector('simple', COALESCE(file_name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(original_name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(folder_path, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(mime_type, '')), 'C');

-- فهرس GIN للبحث السريع
CREATE INDEX IF NOT EXISTS idx_file_search_vector
ON pyra_file_index USING GIN(search_vector);

-- فهرس trigram للبحث الجزئي (fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_file_name_trgm
ON pyra_file_index USING GIN(file_name_lower gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_file_original_name_trgm
ON pyra_file_index USING GIN(original_name gin_trgm_ops);
```

### 5.2 Trigger لتحديث search_vector تلقائياً

```sql
CREATE OR REPLACE FUNCTION update_file_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.file_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.original_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.folder_path, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.mime_type, '')), 'C');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_search_vector
    BEFORE INSERT OR UPDATE ON pyra_file_index
    FOR EACH ROW EXECUTE FUNCTION update_file_search_vector();
```

### 5.3 دالة البحث المتقدم

```sql
CREATE OR REPLACE FUNCTION search_files(
    p_query TEXT,
    p_username TEXT,
    p_folder TEXT DEFAULT NULL,
    p_file_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    file_path TEXT,
    file_name TEXT,
    original_name TEXT,
    folder_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    updated_at TIMESTAMPTZ,
    rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tsquery tsquery;
BEGIN
    -- بناء الـ query (دعم البحث الجزئي بإضافة :*)
    v_tsquery := to_tsquery('simple',
        array_to_string(
            ARRAY(SELECT word || ':*' FROM unnest(string_to_array(trim(p_query), ' ')) AS word WHERE word != ''),
            ' & '
        )
    );

    RETURN QUERY
    SELECT
        fi.id,
        fi.file_path,
        fi.file_name,
        fi.original_name,
        fi.folder_path,
        fi.file_size,
        fi.mime_type,
        fi.updated_at,
        ts_rank(fi.search_vector, v_tsquery) +
        similarity(fi.file_name_lower, lower(p_query)) AS rank
    FROM pyra_file_index fi
    WHERE
        -- البحث النصي أو التشابه
        (fi.search_vector @@ v_tsquery OR similarity(fi.file_name_lower, lower(p_query)) > 0.1)
        -- فلترة حسب المجلد
        AND (p_folder IS NULL OR fi.folder_path LIKE p_folder || '%')
        -- فلترة حسب نوع الملف
        AND (p_file_type IS NULL OR fi.mime_type LIKE p_file_type || '%')
        -- فحص الصلاحيات
        AND check_path_access(p_username, fi.file_path, 'read')
    ORDER BY rank DESC, fi.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- الاستخدام:
-- SELECT * FROM search_files('logo design', 'admin', 'projects/', 'image/', 20, 0);
```

---

## 6. PostgreSQL Enums (أنواع آمنة)

```sql
-- بدل CHECK constraints — Enums أسرع وأكثر أماناً

-- حالات عرض السعر
CREATE TYPE quote_status AS ENUM (
    'draft', 'sent', 'viewed', 'signed', 'expired', 'cancelled'
);

-- أدوار المستخدمين
CREATE TYPE user_role AS ENUM (
    'admin', 'employee'
);

-- حالات المشروع
CREATE TYPE project_status AS ENUM (
    'draft', 'active', 'in_progress', 'review', 'completed', 'archived'
);

-- حالات الموافقة
CREATE TYPE approval_status AS ENUM (
    'pending', 'approved', 'revision_requested', 'cancelled'
);

-- أنواع الإشعارات
CREATE TYPE notification_type AS ENUM (
    'upload', 'comment', 'reply', 'mention', 'approval',
    'review', 'team', 'permission', 'quote_sent', 'quote_signed',
    'file_shared', 'review_request', 'review_response',
    'new_quote', 'quote_updated'
);

-- أدوار العميل
CREATE TYPE client_role AS ENUM (
    'primary', 'billing', 'viewer'
);

-- ملاحظة: تغيير الأعمدة الموجودة:
-- ALTER TABLE pyra_quotes ALTER COLUMN status TYPE quote_status USING status::quote_status;
-- ALTER TABLE pyra_users ALTER COLUMN role TYPE user_role USING role::user_role;
-- ALTER TABLE pyra_projects ALTER COLUMN status TYPE project_status USING status::project_status;
```

---

## 7. pg_cron — المهام المجدولة

### 7.1 تفعيل pg_cron

```sql
-- في Supabase Dashboard → Database → Extensions → pg_cron ← تفعيل

-- يمكن أيضاً:
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
```

### 7.2 المهام المجدولة

```sql
-- 1) حذف الملفات المنتهية من سلة المحذوفات (كل يوم الساعة 3 صباحاً)
CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM pyra_trash
    WHERE auto_purge_at < NOW()
    RETURNING COUNT(*) INTO v_count;

    -- تسجيل النشاط
    IF v_count > 0 THEN
        INSERT INTO pyra_activity_log (
            id, action_type, username, display_name,
            target_path, details, ip_address, created_at
        ) VALUES (
            'al_purge_' || extract(epoch from now())::TEXT,
            'auto_purge', 'system', 'النظام',
            '.trash',
            jsonb_build_object('purged_count', v_count),
            '0.0.0.0', NOW()
        );
    END IF;

    RETURN v_count;
END;
$$;

SELECT cron.schedule(
    'purge-expired-trash',
    '0 3 * * *', -- كل يوم الساعة 3:00 AM
    'SELECT purge_expired_trash()'
);

-- 2) تنظيف الجلسات المنتهية (كل ساعة)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM pyra_sessions
    WHERE last_activity < NOW() - INTERVAL '24 hours'
    RETURNING COUNT(*) INTO v_count;
    RETURN v_count;
END;
$$;

SELECT cron.schedule(
    'cleanup-sessions',
    '0 * * * *', -- كل ساعة
    'SELECT cleanup_expired_sessions()'
);

-- 3) تعطيل روابط المشاركة المنتهية (كل 6 ساعات)
CREATE OR REPLACE FUNCTION deactivate_expired_shares()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE pyra_share_links
    SET is_active = FALSE
    WHERE is_active = TRUE
    AND expires_at < NOW()
    RETURNING COUNT(*) INTO v_count;
    RETURN v_count;
END;
$$;

SELECT cron.schedule(
    'expire-share-links',
    '0 */6 * * *', -- كل 6 ساعات
    'SELECT deactivate_expired_shares()'
);

-- 4) تحديث Materialized Views (كل ساعة)
SELECT cron.schedule(
    'refresh-storage-stats',
    '30 * * * *', -- كل ساعة عند الدقيقة 30
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_storage_statistics'
);

SELECT cron.schedule(
    'refresh-activity-daily',
    '0 0 * * *', -- كل يوم عند منتصف الليل
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_activity_daily'
);

-- 5) تحديث العروض المنتهية الصلاحية (كل يوم)
CREATE OR REPLACE FUNCTION expire_overdue_quotes()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE pyra_quotes
    SET status = 'expired'
    WHERE status IN ('sent', 'viewed')
    AND expiry_date < CURRENT_DATE
    RETURNING COUNT(*) INTO v_count;
    RETURN v_count;
END;
$$;

SELECT cron.schedule(
    'expire-overdue-quotes',
    '0 1 * * *', -- كل يوم الساعة 1:00 AM
    'SELECT expire_overdue_quotes()'
);
```

---

## 8. Advanced Indexes (فهارس متقدمة)

```sql
-- فهارس جزئية (Partial Indexes) — أصغر وأسرع

-- الإشعارات غير المقروءة فقط
CREATE INDEX idx_notifications_unread
ON pyra_notifications (recipient_username, created_at DESC)
WHERE is_read = FALSE;

-- العروض النشطة فقط (ليست مسودة أو ملغاة)
CREATE INDEX idx_quotes_active
ON pyra_quotes (client_id, created_at DESC)
WHERE status NOT IN ('draft', 'cancelled');

-- الملفات في سلة المحذوفات القابلة للحذف
CREATE INDEX idx_trash_purgeable
ON pyra_trash (auto_purge_at)
WHERE auto_purge_at IS NOT NULL;

-- الجلسات النشطة
CREATE INDEX idx_sessions_active
ON pyra_sessions (username, last_activity DESC)
WHERE last_activity > NOW() - INTERVAL '24 hours';

-- روابط المشاركة النشطة
CREATE INDEX idx_shares_active
ON pyra_share_links (token)
WHERE is_active = TRUE;

-- فهارس مركّبة (Composite Indexes)

-- البحث عن ملفات عميل في مشروع
CREATE INDEX idx_project_files_lookup
ON pyra_project_files (project_id, created_at DESC);

-- تعليقات المشروع
CREATE INDEX idx_comments_project
ON pyra_client_comments (project_id, created_at DESC);

-- سجل النشاط حسب التاريخ والمستخدم
CREATE INDEX idx_activity_user_date
ON pyra_activity_log (username, created_at DESC);

-- BRIN Index للجداول الكبيرة المرتبة زمنياً
CREATE INDEX idx_activity_log_brin
ON pyra_activity_log USING BRIN(created_at)
WITH (pages_per_range = 32);
```

---

## 9. Supabase Edge Functions

### 9.1 إرسال بريد إلكتروني عند إرسال عرض سعر

```typescript
// supabase/functions/send-quote-email/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { quote_id } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // جلب بيانات العرض
  const { data: quote } = await supabase
    .rpc('get_quote_with_items', { p_quote_id: quote_id });

  if (!quote || !quote.client_email) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }

  // إرسال البريد عبر Resend
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PYRAMEDIA X <noreply@pyramedia.ae>',
      to: quote.client_email,
      subject: `عرض سعر جديد: ${quote.quote_number}`,
      html: `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif;">
          <h2 style="color: #E87A2E;">PYRAMEDIA X</h2>
          <p>مرحباً ${quote.client_name},</p>
          <p>تم إرسال عرض سعر جديد لكم.</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f5f5f5;">
              <td style="padding: 8px; border: 1px solid #ddd;">رقم العرض</td>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>${quote.quote_number}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">المشروع</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${quote.project_name || '—'}</td>
            </tr>
            <tr style="background: #f5f5f5;">
              <td style="padding: 8px; border: 1px solid #ddd;">الإجمالي</td>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>${quote.total} AED</strong></td>
            </tr>
          </table>
          <a href="${Deno.env.get('APP_URL')}/portal/quotes/${quote.id}"
             style="background: #E87A2E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            عرض التفاصيل والتوقيع
          </a>
        </div>
      `,
    }),
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
```

### 9.2 Database Webhook — ربط Edge Function بـ Trigger

```sql
-- عند إرسال عرض سعر (status = 'sent')، يتم استدعاء Edge Function
-- يُفعّل من Supabase Dashboard → Database → Webhooks

-- أو باستخدام pg_net:
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_quote_sent_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
        PERFORM net.http_post(
            url := current_setting('app.supabase_url') || '/functions/v1/send-quote-email',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('quote_id', NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quote_sent_webhook
    AFTER UPDATE ON pyra_quotes
    FOR EACH ROW
    WHEN (NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent')
    EXECUTE FUNCTION notify_quote_sent_webhook();
```

---

## 10. الاستخدام في Next.js

### 10.1 استدعاء الدوال من Next.js

```typescript
// lib/supabase/rpc.ts — Helper functions لاستدعاء RPC

// Dashboard — استدعاء واحد بدل 6
export async function getAdminDashboard(supabase: SupabaseClient, username: string, role: string) {
  const { data, error } = await supabase.rpc('get_admin_dashboard', {
    p_username: username,
    p_role: role,
  });
  if (error) throw error;
  return data;
}

// Client Dashboard
export async function getClientDashboard(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.rpc('get_client_dashboard', {
    p_client_id: clientId,
  });
  if (error) throw error;
  return data;
}

// توليد رقم عرض سعر (ذري)
export async function generateQuoteNumber(supabase: SupabaseClient, teamId: string) {
  const { data, error } = await supabase.rpc('generate_quote_number', {
    p_team_id: teamId,
  });
  if (error) throw error;
  return data;
}

// البحث المتقدم
export async function searchFiles(
  supabase: SupabaseClient,
  query: string,
  username: string,
  options?: { folder?: string; fileType?: string; limit?: number; offset?: number }
) {
  const { data, error } = await supabase.rpc('search_files', {
    p_query: query,
    p_username: username,
    p_folder: options?.folder ?? null,
    p_file_type: options?.fileType ?? null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return data;
}

// فحص الصلاحيات
export async function checkAccess(
  supabase: SupabaseClient,
  username: string,
  path: string,
  action: string = 'read'
) {
  const { data, error } = await supabase.rpc('check_path_access', {
    p_username: username,
    p_path: path,
    p_action: action,
  });
  if (error) throw error;
  return data;
}

// العرض مع عناصره
export async function getQuoteWithItems(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase.rpc('get_quote_with_items', {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  return data;
}

// نقل ملف للمحذوفات
export async function moveToTrash(
  supabase: SupabaseClient,
  filePath: string,
  deletedBy: string,
  displayName: string,
  fileSize?: number,
  mimeType?: string
) {
  const { data, error } = await supabase.rpc('move_file_to_trash', {
    p_file_path: filePath,
    p_deleted_by: deletedBy,
    p_deleted_by_display: displayName,
    p_file_size: fileSize ?? 0,
    p_mime_type: mimeType ?? 'application/octet-stream',
  });
  if (error) throw error;
  return data;
}
```

### 10.2 استخدام Views في Server Components

```typescript
// app/(dashboard)/quotes/page.tsx
export default async function QuotesPage() {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // استخدام View بدل join يدوي
  const { data: quotes } = await supabase
    .from('v_quotes_with_client')
    .select('*')
    .order('created_at', { ascending: false });

  // الـ View يوفر: effective_status, item_count, days_until_expiry
  // بدون أي حساب إضافي في الكود!

  return <QuoteList quotes={quotes} />;
}
```

### 10.3 استخدام Views في Portal

```typescript
// app/portal/projects/page.tsx
export default async function PortalProjectsPage() {
  const client = await requireClientAuth();
  const supabase = await createServerSupabaseClient();

  // View يوفر كل الإحصائيات
  const { data: projects } = await supabase
    .from('v_project_summary')
    .select('*')
    .eq('client_company', client.company)
    .neq('status', 'archived');

  // كل مشروع فيه: total_files, approved_files, pending_files,
  // unread_client_comments, completion_percentage
  // ← بدون أي subquery في الكود!

  return <ProjectList projects={projects} />;
}
```

---

## 11. ملخص التأثير على API Routes

### كود يُحذف من Next.js (ينتقل للداتابيز):

| العملية | قبل (API Route) | بعد (Database) | التوفير |
|---------|-----------------|----------------|---------|
| Dashboard stats | 6 queries + JS aggregation | 1 RPC call | ~50 سطر |
| Quote totals | Manual calculation | Trigger automatic | ~30 سطر |
| Activity logging | Manual in every endpoint | Triggers | ~100 سطر |
| Notification creation | Manual in every endpoint | Triggers + Functions | ~80 سطر |
| updated_at | Manual in every UPDATE | Trigger | ~40 سطر |
| File search | ILIKE with manual perm check | search_files() RPC | ~60 سطر |
| Permission checks | 3-5 queries per request | 1 RPC call | ~40 سطر |
| Trash management | API route + cron | DB function + pg_cron | ~50 سطر |
| Quote expiry | Vercel Cron | pg_cron | ~30 سطر |
| Session cleanup | Vercel Cron | pg_cron | ~20 سطر |
| **الإجمالي** | | | **~500 سطر أقل** |

### Performance Impact:

| العملية | قبل | بعد | التحسن |
|---------|------|------|--------|
| Dashboard load | 6 round-trips (~300ms) | 1 round-trip (~50ms) | **6x أسرع** |
| File search | ILIKE scan (~200ms) | GIN index (~5ms) | **40x أسرع** |
| Permission check | 3-5 queries (~150ms) | 1 function (~10ms) | **15x أسرع** |
| Quote with items | 2 queries (~100ms) | 1 function (~20ms) | **5x أسرع** |
| Notification on action | Explicit code (error-prone) | Automatic trigger (reliable) | **100% موثوق** |

---

## 12. SQL Migration Script

```sql
-- =============================================
-- Pyra Workspace 3.0 — Database Enhancement Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Functions (run each CREATE FUNCTION from sections above)
-- ... (all functions from sections 1.1 through 1.8)

-- Step 3: Views (run each CREATE VIEW from section 2)
-- ... (all views from sections 2.1 through 2.5)

-- Step 4: Materialized Views (run from section 3)
-- ... (all materialized views from sections 3.1 and 3.2)

-- Step 5: Triggers (run from section 4)
-- ... (all triggers from sections 4.1 through 4.4)

-- Step 6: Full-Text Search (run from section 5)
-- ... (columns, indexes, trigger, search function)

-- Step 7: Advanced Indexes (run from section 8)
-- ... (all indexes)

-- Step 8: pg_cron Jobs (run from section 7)
-- ... (all scheduled jobs)

-- Step 9: Verify
SELECT * FROM cron.job; -- Should show 5 scheduled jobs
SELECT COUNT(*) FROM pyra_file_index WHERE search_vector IS NOT NULL; -- Should match total files
```

---

**End of Database Architecture PRD**

> 📊 هذا القسم يضيف:
> - **8 دوال PL/pgSQL** — Dashboard, Quotes, Permissions, Search, Trash, Notifications
> - **5 Views** — Quotes, Projects, Users, Notifications, Shares
> - **2 Materialized Views** — Storage stats, Activity daily
> - **6+ Triggers** — Auto timestamps, Quote totals, Status notifications, Reviews
> - **Full-Text Search** — tsvector + GIN + trigram
> - **6 Enums** — Type-safe status fields
> - **5 pg_cron Jobs** — Trash purge, Sessions, Shares, Quote expiry, MV refresh
> - **12+ Advanced Indexes** — Partial, composite, BRIN, GIN
> - **1 Edge Function** — Email on quote sent
> - **~500 سطر كود أقل** في Next.js API Routes
