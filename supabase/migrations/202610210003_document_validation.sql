begin;
-- PostgreSQL CHECK accepts NULL; missing JSON fields must explicitly fail.
alter table public.design_pages drop constraint design_pages_document_check;
alter table public.design_pages add constraint design_pages_document_check check (
  coalesce(jsonb_typeof(document) = 'object'
    and document->>'version' = '1'
    and jsonb_typeof(document->'nodes') = 'array', false)
);
commit;
