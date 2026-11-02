"use client";

import React from "react";
import type { CertificateCoordinator } from "@/types/database";
import type { TemplateConfig } from "@/lib/certificates/types";
import CertificateView from "./CertificateView";

export interface CertificatePreviewProps {
  recipientName: string;
  title?: string;
  achievementText?: string;
  eventName?: string;
  organizationText?: string;
  activityPointsText?: string | null;
  customDescription?: string;
  coordinators?: CertificateCoordinator[];
  dateStr: string;
  certificateId: string;
  status?: "issued" | "revoked";
  qrDataUrl?: string | null;
  className?: string;
  scale?: number;
  customTemplateUrl?: string | null;
  templateConfig?: TemplateConfig | null;
}

export default function CertificatePreview({
  recipientName,
  title,
  achievementText,
  eventName,
  organizationText,
  activityPointsText,
  customDescription,
  dateStr,
  certificateId,
  status = "issued",
  qrDataUrl,
  className = "",
  customTemplateUrl,
  templateConfig,
}: CertificatePreviewProps) {
  return (
    <CertificateView
      recipientName={recipientName}
      title={title}
      achievementText={achievementText}
      eventName={eventName}
      organizationText={organizationText}
      activityPointsText={activityPointsText}
      customDescription={customDescription}
      dateStr={dateStr}
      certificateId={certificateId}
      status={status}
      qrDataUrl={qrDataUrl}
      className={className}
      customTemplateUrl={customTemplateUrl}
      templateConfig={templateConfig}
    />
  );
}

export { CertificateView };
