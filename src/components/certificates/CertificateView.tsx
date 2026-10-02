"use client";

import React from "react";

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
}: CertificateViewProps) {
  const isRevoked = status === "revoked";
  const displayDate = monthYear || dateStr || "October 2026";
  const displayEvent = eventName || contestName || "BitByBit Weekly Contest";
  const displayOrg = organizationText || (teamName ? `from ${teamName} club` : "from teamcodelocked club");

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

  // Check if a custom title was passed that differs from "CERTIFICATE OF ACHIEVEMENT"
  const isCustomTitle = Boolean(
    title &&
    title.toUpperCase() !== "CERTIFICATE OF ACHIEVEMENT" &&
    title !== "Certificate of Achievement"
  );

  return (
    <div
      className={`relative w-full overflow-hidden bg-white shadow-2xl rounded-sm border border-[#e5e0d3] select-none ${className}`}
      style={{
        aspectRatio: "1024 / 723",
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* 
        Master Base Certificate Image
        Contains the official BMSCE & TeamCodeLocked seals, topographic background contours,
        double gold borders with corner geometry, header text, "CERTIFICATE OF ACHIEVEMENT",
        "PRESENTED TO" dividing lines, and all 3 coordinator signatures.
      */}
      <img
        src="/certificates/certificate-base.png"
        alt="Certificate Template"
        className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0 select-none"
        draggable={false}
      />

      {/* Optional Title Patch if a different title (e.g. PARTICIPATION) is specified */}
      {isCustomTitle && (
        <div
          className="absolute z-10 flex items-center justify-center bg-white py-0.5"
          style={{
            top: "26.5%",
            left: "12%",
            right: "12%",
          }}
        >
          <h1
            className="font-serif font-bold text-zinc-950 uppercase text-center whitespace-nowrap"
            style={{
              fontFamily: "'Playfair Display', 'Times New Roman', 'Georgia', serif",
              fontSize: "clamp(16px, 3.1vw, 42px)",
              letterSpacing: "0.07em",
              color: "#09090b",
            }}
          >
            {title}
          </h1>
        </div>
      )}

      {/* Revoked Watermark Overlay */}
      {isRevoked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-red-950/15 backdrop-blur-[1px]">
          <div className="border-4 border-red-600 text-red-600 font-sans font-black text-3xl sm:text-5xl md:text-6xl px-8 py-3 uppercase tracking-widest rotate-[-15deg] opacity-85 shadow-2xl bg-white/90">
            REVOKED
          </div>
        </div>
      )}

      {/* Dynamic Overlays: Recipient Name, Recognition Body, Date, ID & QR */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        
        {/* 1. Dynamic Recipient Name (Centered right in the blank space under 'PRESENTED TO') */}
        <div
          className="absolute flex items-center justify-center text-center"
          style={{
            top: "47%",
            left: "8%",
            right: "8%",
            height: "11%",
          }}
        >
          <h2
            className="font-serif font-bold italic text-zinc-950 text-center leading-none"
            style={{
              fontFamily: "'Playfair Display', 'Times New Roman', 'Georgia', serif",
              fontSize: "clamp(26px, 4.4vw, 56px)",
              letterSpacing: "0.01em",
              color: "#09090b",
            }}
          >
            {recipientName}
          </h2>
        </div>

        {/* 2. Recognition Statement & Event/Date */}
        <div
          className="absolute flex flex-col items-center justify-center text-center px-10"
          style={{
            top: "58.5%",
            left: "10%",
            right: "10%",
          }}
        >
          <p
            className="font-sans text-zinc-800 leading-normal"
            style={{
              fontSize: "clamp(11px, 1.6vw, 19px)",
              color: "#27272a",
            }}
          >
            {bodyStatement}{" "}
            <span className="font-semibold uppercase tracking-wider text-zinc-950">
              ORGANISED IN {displayDate.toUpperCase()}
            </span>
          </p>

          {/* 3. Activity Points Disclaimer */}
          {activityPointsText && (
            <p
              className="font-serif italic text-zinc-600 mt-2.5"
              style={{
                fontSize: "clamp(9px, 1.25vw, 14.5px)",
                color: "#52525b",
              }}
            >
              {activityPointsText}
            </p>
          )}
        </div>

        {/* 4. Discrete Certificate Unique ID (Bottom-Left) */}
        <div
          className="absolute flex items-center gap-1 font-mono text-zinc-600 bg-white/80 px-2 py-0.5 rounded shadow-sm border border-zinc-200/50"
          style={{
            bottom: "3.8%",
            left: "4.5%",
            fontSize: "clamp(8px, 0.88vw, 11.5px)",
          }}
        >
          <span className="font-semibold text-zinc-500">ID:</span>
          <span className="font-bold text-zinc-900 tracking-wider">{certificateId}</span>
        </div>

        {/* 5. Verification QR Code (Bottom-Right) */}
        {qrDataUrl && (
          <div
            className="absolute flex items-center gap-1.5 bg-white/90 p-1.5 rounded border border-zinc-200/80 shadow-sm pointer-events-auto"
            style={{
              bottom: "3.2%",
              right: "4.5%",
            }}
          >
            <img
              src={qrDataUrl}
              alt="Verification QR"
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
            <span
              className="font-mono text-zinc-600 uppercase tracking-wider font-semibold"
              style={{ fontSize: "clamp(7px, 0.75vw, 9.5px)" }}
            >
              Scan to Verify
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
