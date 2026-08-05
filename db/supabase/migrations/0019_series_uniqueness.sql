alter table public.meetings
  add constraint meetings_series_start_unique unique (series_id, scheduled_start);
