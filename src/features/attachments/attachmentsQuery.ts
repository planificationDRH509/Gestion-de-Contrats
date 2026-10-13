import type { AuthUser } from '../auth/auth';
import { manageAttachments, type Attachment, type AttachmentPerson } from './attachmentsRepository';

export function personAttachmentsQuery(user: AuthUser | null, person: AttachmentPerson) {
  return {
    queryKey: ['person-attachments', user?.id, person.workspaceId, person.applicantId?.trim() || person.nif?.trim() || null],
    enabled: !!user,
    retry: false,
    networkMode: 'always' as const,
    staleTime: 30_000,
    queryFn: async () => await manageAttachments(user!, person, 'list') as Attachment[]
  };
}
