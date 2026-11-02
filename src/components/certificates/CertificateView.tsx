"use client";

import React from "react";
import type { TemplateConfig } from "@/lib/certificates/types";

export interface CertificateViewProps {
  institutionName?: string;
  institutionSubtext?: string;
  title?: string;
  presentedToText?: string;
  recipientName?: string;
  placement?: string;
  contestName?: string;
  eventName?: string;
  teamName?: string;
  organizationText?: string;
  achievementText?: string;
  customDescription?: string;
  monthYear?: string;
  dateStr?: string;
  activityPointsText?: string | null;
  certificateId?: string;
  status?: "issued" | "revoked";
  qrDataUrl?: string | null;
  className?: string;
  customTemplateUrl?: string | null;
  templateConfig?: TemplateConfig | null;
}

export default function CertificateView({
  title,
  recipientName = "Recipient Name",
  placement,
  contestName,
  eventName,
  teamName,
  organizationText,
  achievementText,
  customDescription,
  monthYear,
  dateStr,
  activityPointsText = "This certificate is eligible for claiming 1-2 activity points.",
  certificateId = "BBCERT-PREVIEW",
  status = "issued",
  qrDataUrl,
  className = "",
  customTemplateUrl,
  templateConfig,
}: CertificateViewProps) {
  const isRevoked = status === "revoked";
  const displayDate = monthYear || dateStr || "October 2026";
  const displayEvent = eventName || contestName || "BitByBit Weekly Contest";
  const displayOrg = organizationText || (teamName ? `from ${teamName} club` : "from teamcodelocked club");

  const cfg = templateConfig || {};

  // Format the recognition statement cleanly
  let displayAchievement = achievementText;
  if (!displayAchievement) {
    displayAchievement = placement
      ? `securing ${placement} for the`
      : "securing 1st Place for the";
  }

  let bodyStatement = customDescription;
  if (!bodyStatement) {
    const achClean = displayAchievement.trim();
    const eventClean = displayEvent.trim();
    const hasEvent = achClean.toLowerCase().includes(eventClean.toLowerCase());
    const eventSuffix = hasEvent ? "" : ` ${eventClean}`;

    if (achClean.toLowerCase().startsWith("in recognition of")) {
      bodyStatement = `${displayOrg} ${achClean}${eventSuffix}`;
    } else if (
      achClean.toLowerCase().startsWith("for active participation") ||
      achClean.toLowerCase().startsWith("for participating")
    ) {
      bodyStatement = `${displayOrg} ${achClean}${hasEvent ? "" : ` in the ${eventClean}`}`;
    } else {
      bodyStatement = `${displayOrg} in recognition of ${achClean}${eventSuffix}`;
    }
  }

  // Title visibility logic
  const isCustomTitle = Boolean(
    title &&
    title.toUpperCase() !== "CERTIFICATE OF ACHIEVEMENT" &&
    title !== "Certificate of Achievement"
  );
  const showTitle = cfg.showTitle !== undefined
    ? cfg.showTitle
    : (customTemplateUrl ? false : isCustomTitle);

  const showBody = cfg.showBody !== undefined ? cfg.showBody : true;
  const showActivityPoints = cfg.showActivityPoints !== undefined ? cfg.showActivityPoints : true;
  const showDate = cfg.showDate !== undefined ? cfg.showDate : true;
  const showCertId = cfg.showCertId !== undefined ? cfg.showCertId : true;
  const showQr = cfg.showQr !== undefined ? cfg.showQr : true;

  // Custom positioning & styling
  // Standard A4 landscape dimensions are 297mm x 210mm (~841.89pt width).
  // In cqw (container query width), 1cqw = 1% of certificate width.
  // Converting points to cqw: (pt / 841.89) * 100 cqw
  const nameY = cfg.nameY ?? 49.5;
  const nameFontSize = cfg.nameFontSize ?? 34;
  const nameColor = cfg.nameColor ?? "#09090b";

  const titleY = cfg.titleY ?? 31.4;
  const titleFontSize = cfg.titleFontSize ?? 22;
  const titleColor = cfg.titleColor ?? "#111827";

  const bodyY = cfg.bodyY ?? 56.7;
  const bodyFontSize = cfg.bodyFontSize ?? 19.5;
  const bodyColor = cfg.bodyColor ?? "#1e1e1e";

  const certIdX = cfg.certIdX ?? 4.7;
  const certIdY = cfg.certIdY ?? 96;

  const qrX = cfg.qrX ?? 90.2;
  const qrY = cfg.qrY ?? 86.2;
  const qrSizeMm = cfg.qrSize ?? 17;
  const qrSizePercent = (qrSizeMm / 297) * 100; // QR width in % of certificate width

  return (
    <div
      className={`relative w-full overflow-hidden bg-white shadow-2xl rounded-sm border border-[#e5e0d3] select-none ${className}`}
      style={{
        aspectRatio: "297 / 210", // Exact A4 landscape printable sheet ratio (1.4142857)
        containerType: "inline-size",
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* Base Certificate Image (Exact A4 Landscape fitting) */}
      <img
        src={customTemplateUrl || "/certificates/certificate-base.png"}
        alt="Certificate Template"
        className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0 select-none"
        draggable={false}
      />

      {/* Title Overlay */}
      {showTitle && title && (
        <div
          className={`absolute z-10 flex items-center justify-center ${customTemplateUrl ? "" : "bg-white"}`}
          style={{
            top: `${titleY}%`,
            left: "13.5%",
            right: "13.5%",
            transform: "translateY(-50%)",
          }}
        >
          <h1
            className="font-serif font-bold uppercase text-center whitespace-nowrap leading-none"
            style={{
              fontFamily: "'Playfair Display', 'Times New Roman', 'Georgia', serif",
              fontSize: `calc(${((titleFontSize ?? 22) / 841.89) * 100}cqw)`,
              letterSpacing: "0.07em",
              color: titleColor,
            }}
          >
            {title}
          </h1>
        </div>
      )}

      {/* Revoked Watermark Overlay */}
      {isRevoked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-red-950/15 backdrop-blur-[1px]">
          <div
            className="border-4 border-red-600 text-red-600 font-sans font-black px-8 py-3 uppercase tracking-widest rotate-[-15deg] opacity-85 shadow-2xl bg-white/90"
            style={{ fontSize: "5.2cqw" }}
          >
            REVOKED
          </div>
        </div>
      )}

      {/* Dynamic Overlays */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        
        {/* 1. Recipient Name */}
        <div
          className="absolute flex items-center justify-center text-center"
          style={{
            top: `${nameY}%`,
            left: "6%",
            right: "6%",
            transform: "translateY(-50%)",
          }}
        >
          <h2
            className="font-serif font-bold italic text-center leading-none"
            style={{
              fontFamily: "'Playfair Display', 'Times New Roman', 'Georgia', serif",
              fontSize: `calc(${((nameFontSize ?? 34) / 841.89) * 100}cqw)`,
              letterSpacing: "0.01em",
              color: nameColor,
            }}
          >
            {recipientName}
          </h2>
        </div>

        {/* 2. Recognition Statement & Event/Date */}
        {showBody && bodyStatement && (
          <div
            className="absolute flex flex-col items-center justify-center text-center px-[8%]"
            style={{
              top: `${bodyY}%`,
              left: "5%",
              right: "5%",
              transform: "translateY(-20%)",
            }}
          >
            <p
              className="font-sans whitespace-pre-wrap"
              style={{
                fontSize: `calc(${((bodyFontSize ?? 19.5) / 841.89) * 100}cqw)`,
                lineHeight: 1.35,
                color: bodyColor,
              }}
            >
              {bodyStatement}{" "}
              {showDate && !customDescription && (
                <span className="font-semibold uppercase tracking-wider text-zinc-950">
                  ORGANISED IN {displayDate.toUpperCase()}
                </span>
              )}
            </p>

            {/* Activity Points Disclaimer */}
            {showActivityPoints && activityPointsText && (
              <p
                className="font-serif italic text-zinc-600 mt-[1.2%]"
                style={{
                  fontSize: `calc(${(14.5 / 841.89) * 100}cqw)`,
                  color: "#52525b",
                }}
              >
                {activityPointsText}
              </p>
            )}
          </div>
        )}

        {/* 3. Date Line (Standalone) */}
        {showDate && displayDate && (customTemplateUrl || cfg.dateX !== undefined) && (
          <div
            className="absolute font-sans font-medium whitespace-nowrap"
            style={{
              top: `${cfg.dateY ?? 88}%`,
              left: `${cfg.dateX ?? 24}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `calc(${(12 / 841.89) * 100}cqw)`,
              color: cfg.dateColor || "#374151",
            }}
          >
            {displayDate.toLowerCase().startsWith("date:") ? displayDate : `Date: ${displayDate}`}
          </div>
        )}

        {/* 4. Extra Custom Text Fields */}
        {cfg.extraFields && cfg.extraFields.map((field, idx) => {
          if (!field.text || !field.text.trim()) return null;
          const align = field.align || "center";
          const transform = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
          return (
            <div
              key={field.id || idx}
              className="absolute font-sans whitespace-pre-wrap"
              style={{
                top: `${field.y ?? 50}%`,
                left: `${field.x ?? 50}%`,
                transform,
                fontSize: `calc(${((field.fontSize ?? 14) / 841.89) * 100}cqw)`,
                color: field.color || "#374151",
                textAlign: align,
              }}
            >
              {field.text}
            </div>
          );
        })}

        {/* 5. Certificate Unique ID */}
        {showCertId && (
          <div
            className="absolute flex items-center gap-1 font-mono text-zinc-600 bg-white/80 px-2 py-0.5 rounded shadow-xs border border-zinc-200/50"
            style={{
              top: `${certIdY}%`,
              left: `${certIdX}%`,
              transform: "translateY(-50%)",
              fontSize: `calc(${(10 / 841.89) * 100}cqw)`,
            }}
          >
            <span className="font-semibold text-zinc-500">ID:</span>
            <span className="font-bold text-zinc-900 tracking-wider">{certificateId}</span>
          </div>
        )}

        {/* 6. Verification QR Code */}
        {showQr && (
          <div
            className="absolute flex flex-col items-center bg-white/90 p-[0.4%] rounded border border-zinc-200/80 shadow-xs pointer-events-auto"
            style={{
              top: `${qrY}%`,
              left: `${qrX}%`,
              width: `${qrSizePercent}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Verification QR"
                className="w-full h-auto aspect-square object-contain"
              />
            ) : (
              <div className="w-full aspect-square bg-zinc-900 rounded flex items-center justify-center text-white font-mono text-[0.8cqw]">
                QR
              </div>
            )}
            <span
              className="font-mono text-zinc-600 uppercase tracking-wider font-semibold whitespace-nowrap mt-[2%]"
              style={{ fontSize: `calc(${(8 / 841.89) * 100}cqw)` }}
            >
              Scan to Verify
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
