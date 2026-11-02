// ════════════════════════════════════════════════════════════
// src/lib/certificates/types.ts
// ════════════════════════════════════════════════════════════

import type { CertificateCoordinator, CertificateStatus, EmailDeliveryStatus } from '@/types/database';

export interface ExtraTextField {
  id?: string;
  text: string;
  x?: number; // % from left, default 50
  y: number; // % from top (0-100)
  fontSize?: number; // pt, default 14
  color?: string; // hex, default #374151
  align?: 'center' | 'left' | 'right';
}

export interface TemplateConfig {
  isCustom?: boolean;
  templateImageUrl?: string;
  nameY?: number; // % from top (0-100), default ~49.5
  nameFontSize?: number; // pt, default 34
  nameColor?: string; // hex, default #09090b
  
  titleY?: number; // % from top, default 26.5
  titleFontSize?: number; // pt, default 22
  titleColor?: string; // default #09090b
  showTitle?: boolean; // default true (false if already printed on background)

  bodyY?: number; // % from top, default 58.5
  bodyFontSize?: number; // pt, default 16
  bodyColor?: string; // default #27272a
  showBody?: boolean; // default true

  showActivityPoints?: boolean; // default true
  activityPointsY?: number; // default 67

  dateX?: number; // % from left, default 24
  dateY?: number; // % from top, default 87
  dateColor?: string; // default #374151
  showDate?: boolean; // default true

  certIdX?: number; // % from left, default 4.5
  certIdY?: number; // % from top, default 96
  showCertId?: boolean; // default true

  showQr?: boolean; // default true
  qrX?: number; // % from left, default 89
  qrY?: number; // % from top, default 87
  qrSize?: number; // size in mm, default 17

  extraFields?: ExtraTextField[];
}

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
  customTemplateImage?: string; // base64 or path/url
  templateConfig?: TemplateConfig;
  extraFields?: ExtraTextField[];
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
