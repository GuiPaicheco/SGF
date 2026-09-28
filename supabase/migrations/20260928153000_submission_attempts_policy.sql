create policy "submission_attempts_service_only"
on public.submission_attempts
for all
to service_role
using (true)
with check (true);
