"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import { CheckCircle2, XCircle, ShieldCheck, ArrowLeft, Download, Award } from "lucide-react";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function CertificateVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAppShell();
  const certificateId = params?.certificateId as string;

  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!certificateId) return;
    async function verify() {
      setLoading(true);
      try {
        const res = await fetch(`/api/certificates/verify/${certificateId}`);
        const data = await res.json();
        if (!res.ok || !data.certificate) {
          setError(data.error || "Certificate record not found");
        } else {
          setCert(data.certificate);
        }
      } catch (err: any) {
        setError("Network error while verifying certificate");
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [certificateId]);

  async function handleDownload() {
    if (!user) {
      alert("Please sign in to download your certificate PDF");
      return;
    }
    setDownloading(true);
    try {
      const db = (await import("@/lib/supabase")).getSupabaseClient();
      const { data: { session } } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/certificates/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateId }),
      });
      const data = await res.json();
      if (!res.ok || !data.downloadUrl) {
        alert(data.error || "Failed to download certificate");
      } else {
        window.open(data.downloadUrl, "_blank");
      }
    } catch {
      alert("Network error during download");
    } finally {
      setDownloading(false);
    }
  }

  const isRevoked = cert?.status === "revoked";

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--muted)]">
          <ShieldCheck className="w-4 h-4 text-[#00e87a]" /> Official Verification
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="spinner" />
          <p className="font-mono text-sm text-[var(--muted)]">Verifying certificate authenticity...</p>
        </div>
      ) : error || !cert ? (
        <div className="card p-8 text-center max-w-md mx-auto border-red-500/20 bg-red-950/10">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h1 className="font-display font-bold text-lg text-[#e0e0e0] mb-1">Certificate Not Found</h1>
          <p className="font-mono text-xs text-[var(--muted)] mb-4">{error || "No certificate matched this ID."}</p>
          <button onClick={() => router.push("/")} className="btn-ghost text-xs">
            Return to Home
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Verification Status Banner */}
          <div
            className={`card p-5 flex items-center justify-between flex-wrap gap-4 border ${
              isRevoked
                ? "border-red-500/40 bg-red-950/20"
                : "border-[#00e87a]/40 bg-[#00e87a]/5"
            }`}
          >
            <div className="flex items-center gap-3.5">
              {isRevoked ? (
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#00e87a]/10 flex items-center justify-center text-[#00e87a] shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="font-display font-bold text-base text-[var(--text)] flex items-center gap-2">
                  {isRevoked ? "Certificate Revoked" : "Certificate Authenticated ✓"}
                </h1>
                <p className="font-mono text-xs text-[var(--muted)]">
                  {isRevoked
                    ? "This certificate has been revoked and is no longer valid."
                    : "Issued officially through Bit-by-Bit (BMSCE TeamCodeLocked)."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <span className="font-mono text-xs px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)]">
                ID: <strong className="text-[#00e87a]">{cert.certificate_id}</strong>
              </span>
              {!isRevoked && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="btn-solid flex items-center gap-2 text-xs py-2 px-4 shadow-[0_0_15px_rgba(0,232,122,0.2)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? "Downloading..." : "Download PDF"}
                </button>
              )}
            </div>
          </div>

          {/* Certificate Live Preview */}
          <div className="card p-4 sm:p-6 bg-[#111111]/80 border-[var(--border)]">
            <CertificatePreview
              recipientName={cert.recipient_name}
              title={cert.title}
              achievementText={cert.achievement_text}
              eventName={cert.event_name}
              organizationText={cert.organization_text}
              activityPointsText={cert.activity_points_text}
              coordinators={cert.coordinator_names || []}
              dateStr={new Date(cert.issued_at).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
              certificateId={cert.certificate_id}
              status={cert.status}
            />
          </div>

          {/* Details Table */}
          <div className="card p-6 divide-y divide-[var(--border)]">
            <h2 className="font-display font-bold text-sm text-[var(--text)] pb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-[#00e87a]" /> Certificate Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs font-mono">
              <div>
                <span className="text-[var(--muted)]">Recipient:</span>
                <p className="font-bold text-[var(--text)] mt-0.5 text-sm">{cert.recipient_name}</p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Certificate Type:</span>
                <p className="font-bold text-[var(--text)] mt-0.5">{cert.certificate_type || cert.title}</p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Event / Contest:</span>
                <p className="font-bold text-[var(--text)] mt-0.5">{cert.event_name}</p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Issue Date:</span>
                <p className="font-bold text-[var(--text)] mt-0.5">
                  {new Date(cert.issued_at).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Recognition Statement:</span>
                <p className="text-[var(--text)] mt-0.5">{cert.achievement_text}</p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Activity Points:</span>
                <p className="text-[var(--text)] mt-0.5">{cert.activity_points_text || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
