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
          className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> Official Verification
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
          <p className="font-mono text-xs text-zinc-400">Verifying certificate authenticity...</p>
        </div>
      ) : error || !cert ? (
        <div className="bg-zinc-900/50 border border-rose-500/20 rounded-2xl p-8 text-center max-w-md mx-auto shadow-sm">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h1 className="font-semibold text-lg text-zinc-100 mb-1">Certificate Not Found</h1>
          <p className="font-mono text-xs text-zinc-400 mb-4">{error || "No certificate matched this ID."}</p>
          <button onClick={() => router.push("/")} className="px-4 py-2 text-xs font-mono text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            Return to Home
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Verification Status Banner */}
          <div
            className={`p-5 rounded-2xl flex items-center justify-between flex-wrap gap-4 border ${
              isRevoked
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-center gap-3.5">
              {isRevoked ? (
                <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="font-semibold text-base text-zinc-100 flex items-center gap-2">
                  {isRevoked ? "Certificate Revoked" : "Certificate Authenticated ✓"}
                </h1>
                <p className="font-mono text-xs text-zinc-400">
                  {isRevoked
                    ? "This certificate has been revoked and is no longer valid."
                    : "Issued officially through Bit-by-Bit (BMSCE TeamCodeLocked)."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <span className="font-mono text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-xs">
                ID: <strong className="text-indigo-400">{cert.certificate_id}</strong>
              </span>
              {!isRevoked && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-2 text-xs font-mono font-medium py-2 px-4 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? "Downloading..." : "Download PDF"}
                </button>
              )}
            </div>
          </div>

          {/* Certificate Live Preview */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 sm:p-6 shadow-xl">
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
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 divide-y divide-zinc-800/80">
            <h2 className="font-semibold text-sm text-zinc-100 pb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-400" /> Certificate Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs font-mono">
              <div>
                <span className="text-zinc-500">Recipient:</span>
                <p className="font-semibold text-zinc-200 mt-0.5 text-sm">{cert.recipient_name}</p>
              </div>
              <div>
                <span className="text-zinc-500">Certificate Type:</span>
                <p className="font-semibold text-zinc-200 mt-0.5">{cert.certificate_type || cert.title}</p>
              </div>
              <div>
                <span className="text-zinc-500">Event / Contest:</span>
                <p className="font-semibold text-zinc-200 mt-0.5">{cert.event_name}</p>
              </div>
              <div>
                <span className="text-zinc-500">Issue Date:</span>
                <p className="font-semibold text-zinc-200 mt-0.5">
                  {new Date(cert.issued_at).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Recognition Statement:</span>
                <p className="text-zinc-300 mt-0.5">{cert.achievement_text}</p>
              </div>
              <div>
                <span className="text-zinc-500">Activity Points:</span>
                <p className="text-zinc-300 mt-0.5">{cert.activity_points_text || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
