alter table attachment_private.documents add constraint attachment_location_required
  check (kind='file' or location is not null);
