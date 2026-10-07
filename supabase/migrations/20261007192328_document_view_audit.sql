-- P1-09 / US-ADM-03 AC2: every time an admin opens a KYC document, write one audit row.
-- The app calls this RPC (with the admin's own session) right before creating the 60 s signed URL,
-- so audit_logs keeps a single writer (private.audit) and no service key is used for auditing.

create or replace function public.log_document_view(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();   -- PT403 not_authorized / mfa_required (aal2 only)
  v_doc public.org_documents%rowtype;
begin
  if p_document_id is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_document_id":"required"}';
  end if;

  select * into v_doc from public.org_documents where id = p_document_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if v_doc.file_deleted_at is not null then
    raise exception using errcode = 'PT410', message = 'file_purged';
  end if;

  -- Protects against scripted bulk viewing: 120 opens per admin per hour.
  perform private.check_rate_limit('doc_view:user:' || v_uid::text, 120, interval '1 hour');

  perform private.audit(
    p_action      => 'document.view',
    p_entity_type => 'org_document',
    p_entity_id   => v_doc.id,
    p_org_id      => v_doc.org_id,
    p_after       => jsonb_build_object('doc_type', v_doc.doc_type));
end;
$$;

comment on function public.log_document_view(uuid) is
  'Admin aal2 only. Audits document.view (doc_type only, never the path) before the app issues a 60 s signed URL. Rate limit 120/h per admin. PT410 file_purged after retention purge.';

revoke all on function public.log_document_view(uuid) from public, anon, authenticated;
grant execute on function public.log_document_view(uuid) to authenticated;
