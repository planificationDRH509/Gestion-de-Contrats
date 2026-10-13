import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import type { AttachmentPerson } from './attachmentsRepository';
import { personAttachmentsQuery } from './attachmentsQuery';
import './attachments.css';

export function PersonAttachmentsButton({person, onClick, className = ''}: {person: AttachmentPerson; onClick: () => void; className?: string}) {
  const {user} = useAuth();
  const {data} = useQuery(personAttachmentsQuery(user, person));
  const hasAttachments = !!data?.length;

  return <button type="button"
    className={`icon-btn person-attachments-trigger ${className}${hasAttachments ? ' has-attachments' : ''}`}
    aria-label="Pièces jointes" title="Pièces jointes" onClick={onClick}>
    <span className="material-symbols-rounded">attach_file</span>
  </button>;
}
