-- One-off grant: add 'calls.view' to the live "Sales" DB role.
-- Code-only ROLE_EXTRAS changes are inert for users whose pyra_users.role_id
-- points at a pyra_roles row (buildUserPermissions prefers dbRolePermissions
-- over ROLE_EXTRAS) — see CLAUDE.md "Quote System" lock #7. Idempotent.
UPDATE pyra_roles
SET permissions = array_append(permissions, 'calls.view')
WHERE name = 'Sales' AND NOT ('calls.view' = ANY(permissions));
