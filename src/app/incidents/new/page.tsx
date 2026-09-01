import { redirect } from 'next/navigation';

/**
 * /incidents/new and /chat were two front doors to the same journey -- both
 * post to /api/chat and both create the incident from the conversation. The
 * design collapses them. (design 1j)
 */
export default function NewIncidentPage() {
  redirect('/chat');
}
