// ════════════════════════════════════════════════════════════
// src/lib/certificates/types.ts
// ════════════════════════════════════════════════════════════

import type { CertificateCoordinator, CertificateStatus, EmailDeliveryStatus } from '@/types/database';

export interface CertificateData {
  certificateId: string;
  memberId?: string | null;
  github: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  title: string;
  achievementText: string;
  eventName: string;
  organizationText: string;
  activityPointsText?: string | null;
  institutionName?: string;
  institutionSubtext?: string;
  presentedToText?: string;
  customDescription?: string;
  coordinators: CertificateCoordinator[];
  dateStr?: string;
  issuedAt?: string;
  issuedBy?: string;
  verificationUrl?: string;
  status?: CertificateStatus;
}

export const DEFAULT_COORDINATORS: CertificateCoordinator[] = [
  {
    name: 'PROF. NAMRATHA M.',
    title: 'FACULTY CLUB COORDINATOR',
    org: 'TEAMCODELOCKED',
    signatureText: 'Namratha M',
  },
  {
    name: 'PANNAG K',
    title: 'STUDENT CLUB COORDINATOR',
    org: 'TEAMCODELOCKED',
    signatureText: 'PannagK',
  },
  {
    name: 'AAKANSHYA AGARWAL',
    title: 'STUDENT CLUB COORDINATOR',
    org: 'TEAMCODELOCKED',
    signatureText: 'Aakanshya',
  },
];

export const CERTIFICATE_TYPES = [
  { id: 'achievement', label: 'Certificate of Achievement', defaultTitle: 'CERTIFICATE OF ACHIEVEMENT' },
  { id: 'participation', label: 'Certificate of Participation', defaultTitle: 'CERTIFICATE OF PARTICIPATION' },
  { id: 'excellence', label: 'Certificate of Excellence', defaultTitle: 'CERTIFICATE OF EXCELLENCE' },
  { id: 'appreciation', label: 'Certificate of Appreciation', defaultTitle: 'CERTIFICATE OF APPRECIATION' },
];
