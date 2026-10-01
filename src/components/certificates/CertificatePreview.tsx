"use client";

import React from "react";
import type { CertificateCoordinator } from "@/types/database";

export interface CertificatePreviewProps {
  recipientName: string;
  title: string;
  achievementText: string;
  eventName: string;
  organizationText: string;
  activityPointsText?: string | null;
  coordinators: CertificateCoordinator[];
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
  const isRevoked = status === "revoked";

  return (
    <div
      className={`relative w-full aspect-[1.414/1] bg-[#FCFBF8] text-[#111] overflow-hidden shadow-2xl rounded-sm border border-[#d8d2c4] select-none ${className}`}
      style={{
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* Background Decorative subtle wave lines & watermark */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="cert-pattern"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 50 Q 25 35, 50 50 T 100 50"
              fill="none"
              stroke="#e2dac9"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cert-pattern)" />
        {/* Subtle geometric corner flourishes */}
        <path
          d="M 20 20 L 70 20 M 20 20 L 20 70"
          stroke="#bfa268"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M 25 25 L 55 25 M 25 25 L 25 55"
          stroke="#bfa268"
          strokeWidth="0.8"
          fill="none"
        />
      </svg>

      {/* Outer Border with double gold and dark accent */}
      <div className="absolute inset-3 border-2 border-[#bfa268] pointer-events-none" />
      <div className="absolute inset-4 border border-[#333333] pointer-events-none" />

      {/* Revoked watermark overlay */}
      {isRevoked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-red-900/10">
          <div className="border-4 border-red-600 text-red-600 font-sans font-black text-4xl sm:text-6xl px-8 py-3 uppercase tracking-widest rotate-[-15deg] opacity-75 shadow-lg">
            REVOKED
          </div>
        </div>
      )}

      {/* Inner Certificate Content */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-[5%]">
        {/* ── TOP HEADER: BMSCE Logo, Heading, TeamCodeLocked Logo ── */}
        <div className="flex items-center justify-between gap-4">
          {/* BMSCE Crest (Vector SVG) */}
          <div className="w-[12%] max-w-[70px] aspect-square shrink-0 flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full text-[#111]"
              fill="currentColor"
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <circle
                cx="50"
                cy="50"
                r="41"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <path
                d="M 50 12 A 38 38 0 0 1 88 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.8"
              />
              <text
                x="50"
                y="30"
                fontSize="7.5"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                B.M.S. COLLEGE
              </text>
              <text
                x="50"
                y="38"
                fontSize="6"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                OF ENGINEERING
              </text>
              <circle
                cx="50"
                cy="52"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <polygon
                points="50,45 54,55 46,55"
                fill="#111"
              />
              <text
                x="50"
                y="75"
                fontSize="5.5"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                BANGALORE - 560019
              </text>
              <text
                x="50"
                y="83"
                fontSize="5"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                ESTD. 1946
              </text>
            </svg>
          </div>

          {/* Center Institution Title */}
          <div className="text-center flex-1">
            <h1
              className="text-[2.2cqw] font-bold text-[#111] tracking-[0.14em] uppercase leading-tight"
              style={{
                fontFamily:
                  "'Cinzel', 'Playfair Display', 'Times New Roman', serif",
              }}
            >
              BMS COLLEGE OF ENGINEERING
            </h1>
            <p className="text-[1.05cqw] font-medium text-[#444] tracking-[0.18em] uppercase mt-0.5">
              ESTD .1946 AUTONOMOUS INSTITUTE, AFFILIATED TO VTU
            </p>
          </div>

          {/* TeamCodeLocked Logo (Hexagon vector SVG) */}
          <div className="w-[12%] max-w-[70px] aspect-square shrink-0 flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full text-[#111]"
              fill="none"
              stroke="currentColor"
            >
              {/* Outer Hexagon */}
              <polygon
                points="50,6 88,28 88,72 50,94 12,72 12,28"
                strokeWidth="2.5"
                fill="none"
              />
              {/* Circuit Accents */}
              <line x1="50" y1="6" x2="50" y2="18" strokeWidth="2" />
              <line x1="88" y1="28" x2="78" y2="34" strokeWidth="2" />
              <line x1="88" y1="72" x2="78" y2="66" strokeWidth="2" />
              <line x1="50" y1="94" x2="50" y2="82" strokeWidth="2" />
              <line x1="12" y1="72" x2="22" y2="66" strokeWidth="2" />
              <line x1="12" y1="28" x2="22" y2="34" strokeWidth="2" />
              {/* Inner Box */}
              <rect
                x="26"
                y="36"
                width="48"
                height="28"
                strokeWidth="1.5"
                fill="#FCFBF8"
              />
              <text
                x="50"
                y="54"
                fontSize="7"
                fontWeight="900"
                fontFamily="monospace"
                fill="#111"
                stroke="none"
                textAnchor="middle"
                letterSpacing="1"
              >
                CODELOCKED
              </text>
            </svg>
          </div>
        </div>

        {/* ── MAIN TITLE & PRESENTED TO ── */}
        <div className="text-center my-auto py-1">
          <h2
            className="text-[3.2cqw] font-black text-[#111] tracking-[0.16em] uppercase"
            style={{
              fontFamily:
                "'Cinzel', 'Playfair Display', 'Times New Roman', serif",
            }}
          >
            {title || "CERTIFICATE OF ACHIEVEMENT"}
          </h2>

          <p className="text-[1.1cqw] font-semibold text-[#555] tracking-[0.35em] uppercase mt-2 mb-1 font-sans">
            P R E S E N T E D &nbsp; T O
          </p>

          {/* Recipient Name - The Visual Focal Point */}
          <div className="my-1.5 flex flex-col items-center">
            <span
              className="text-[4.2cqw] font-normal text-[#0c0d0e] px-4 tracking-normal"
              style={{
                fontFamily:
                  "'Brush Script MT', 'Great Vibes', 'Alex Brush', 'Playfair Display', cursive, serif",
                textShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              {recipientName || "Recipient Name"}
            </span>
            <div className="w-1/2 max-w-md h-[1.5px] bg-gradient-to-r from-transparent via-[#bfa268] to-transparent mt-0.5" />
          </div>

          {/* Statement & Event Info */}
          <div className="text-[1.35cqw] text-[#222] font-normal leading-relaxed max-w-2xl mx-auto px-4 mt-2">
            <span>
              {organizationText || "from teamcodelocked club"} in recognition of{" "}
              <strong className="font-semibold text-[#111]">
                {achievementText || "outstanding performance"}
              </strong>{" "}
              for the
            </span>
            <div className="mt-0.5">
              <strong className="font-bold text-[#111]">
                {eventName || "Bit By Bit Contest"}
              </strong>{" "}
              <span className="uppercase text-[1.15cqw] tracking-wider text-[#444]">
                ORGANISED in {dateStr || "2026"}
              </span>
            </div>
          </div>

          {/* Activity Points Statement */}
          {activityPointsText && (
            <p className="text-[1.15cqw] text-[#444] italic mt-2 font-serif">
              {activityPointsText}
            </p>
          )}
        </div>

        {/* ── BOTTOM COORDINATORS / SIGNATURES (3 COLUMNS) ── */}
        <div className="pt-2 border-t border-[#e8dfcf]/60">
          <div className="grid grid-cols-3 gap-4 text-center items-end">
            {coordinators.map((coord, idx) => (
              <div key={idx} className="flex flex-col items-center">
                {/* Signature script */}
                <div
                  className="text-[2.1cqw] text-[#111] italic h-7 flex items-end justify-center font-serif"
                  style={{
                    fontFamily:
                      "'Brush Script MT', 'Great Vibes', 'Dancing Script', cursive, serif",
                  }}
                >
                  {coord.signatureText || coord.name.split(" ")[0] || "Signature"}
                </div>
                {/* Signature Line */}
                <div className="w-3/4 max-w-[160px] h-[1px] bg-[#111] my-1" />
                {/* Signatory Details */}
                <p className="text-[1.05cqw] font-bold text-[#111] uppercase tracking-wider font-sans">
                  {coord.name}
                </p>
                <p className="text-[0.85cqw] font-medium text-[#555] uppercase tracking-wider font-sans mt-0.5">
                  {coord.title}
                </p>
                <p className="text-[0.75cqw] font-semibold text-[#777] uppercase tracking-widest font-sans">
                  {coord.org}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom Footer: Certificate ID & Verification Info */}
          <div className="flex items-center justify-between pt-2 mt-1 text-[0.8cqw] text-[#777] font-mono border-t border-[#eee]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#444]">
                ID: {certificateId || "BBCERT-PREVIEW"}
              </span>
              <span>•</span>
              <span>Bit by Bit Platform</span>
            </div>
            {qrDataUrl && (
              <div className="flex items-center gap-1.5">
                <span className="text-[0.75cqw] text-[#888]">Verify:</span>
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-7 h-7 object-contain border border-[#ddd] p-0.5 bg-white rounded"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
