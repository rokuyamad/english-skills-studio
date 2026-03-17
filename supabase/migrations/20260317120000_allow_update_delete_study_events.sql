drop policy if exists "study_events_update_own" on public.study_events;
create policy "study_events_update_own"
on public.study_events for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "study_events_delete_own" on public.study_events;
create policy "study_events_delete_own"
on public.study_events for delete
using (auth.uid() = user_id);
