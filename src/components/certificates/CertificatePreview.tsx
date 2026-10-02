"use client";

import React from "react";
import type { CertificateCoordinator } from "@/types/database";
import CertificateView from "./CertificateView";

export interface CertificatePreviewProps {
  recipientName: string;
  title?: string;
  achievementText?: string;
  eventName?: string;
  organizationText?: string;
  activityPointsText?: string | null;
  coordinators?: CertificateCoordinator[];
  dateStr: string;
  certificateId: string;
  status?: "issued" | "revoked";
  qrDataUrl?: string | null;
  className?: string;
  scale?: number;
}

export default function CertificatePreview({
  recipientName,
  title,
  achievementText,
  eventName,
  organizationText,
  activityPointsText,
  coordinators,
  dateStr,
  certificateId,
  status = "issued",
  qrDataUrl,
  className = "",
}: CertificatePreviewProps) {
  return (
    <CertificateView
      recipientName={recipientName}
      title={title}
      achievementText={achievementText}
      eventName={eventName}
      organizationText={organizationText}
      activityPointsText={activityPointsText}
      dateStr={dateStr}
      certificateId={certificateId}
      status={status}
      qrDataUrl={qrDataUrl}
      className={className}
    />
  );
}

export { CertificateView };
