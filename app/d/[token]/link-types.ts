/**
 * The columns page.tsx reads off pyra_document_links before it knows which
 * kind of document the token points at. Shared so the two branch components
 * cannot drift from what the dispatcher actually selects.
 *
 * Note what is NOT here: `token`. Migration 054's table comment is explicit
 * that the token must never be selected into anything list-shaped, and the
 * branches receive it as its own prop from the route params instead.
 */
export interface PublicDocumentLink {
  id: string;
  entity_type: string;
  entity_id: string;
  content_hash: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}
