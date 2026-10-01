"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { Certificate, Member, CertificateCoordinator } from "@/types/database";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import { DEFAULT_COORDINATORS, CERTIFICATE_TYPES } from "@/lib/certificates/types";
import {
  Award,
  Search,
  Filter,
  Plus,
  Download,
  Eye,
  Ban,
  Mail,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  User,
  Calendar,
  ExternalLink,
} from "lucide-react";

interface CertificatesTabProps {
  members: Member[];
  showToast: (msg: string) => void;
}

export default function CertificatesTab({ members, showToast }: CertificatesTabProps) {
  const db = getSupabaseClient();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "revoked">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>("all");

  // Issue Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issuing, setIssuing] = useState(false);

  // View / Detail Modal State
  const [viewingCert, setViewingCert] = useState<Certificate | null>(null);

  // Revoke Modal State
  const [revokingCertId, setRevokingCertId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Resend Email State
  const [resendingEmailId, setResendingEmailId] = useState<string | null>(null);

  // Issue Form State
  const [selectedGithub, setSelectedGithub] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [certType, setCertType] = useState("Certificate of Achievement");
  const [certTitle, setCertTitle] = useState("CERTIFICATE OF ACHIEVEMENT");
  const [achievementText, setAchievementText] = useState("securing 1st Place for the");
  const [eventName, setEventName] = useState("Bit By Bit Weekly Contest");
  const [organizationText, setOrganizationText] = useState("from teamcodelocked club");
  const [activityPointsText, setActivityPointsText] = useState("This certificate is eligible for claiming 1-2 activity points.");
  const [dateStr, setDateStr] = useState(() =>
    new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })
  );
  const [coordinators, setCoordinators] = useState<CertificateCoordinator[]>(DEFAULT_COORDINATORS);

  // Load Certificates
  async function loadCertificates() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/certificates/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.certificates) {
        setCertificates(data.certificates);
      }
    } catch {
      showToast("Failed to load certificates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCertificates();
  }, []);

  // When admin selects a member from dropdown/search
  function handleSelectMember(github: string) {
    setSelectedGithub(github);
    const m = members.find((x) => x.github === github);
    if (m) {
      setRecipientName(m.name || m.github);
      setRecipientEmail(m.email || "");
    }
  }

  // Handle Type Change
  function handleTypeChange(typeLabel: string) {
    setCertType(typeLabel);
    const found = CERTIFICATE_TYPES.find((t) => t.label === typeLabel);
    if (found) {
      setCertTitle(found.defaultTitle);
    }
  }

  // Update coordinator in form
  function updateCoordinator(index: number, field: keyof CertificateCoordinator, val: string) {
    const updated = [...coordinators];
    updated[index] = { ...updated[index], [field]: val };
    setCoordinators(updated);
  }

  // Submit Issue Certificate
  async function handleIssueCertificate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGithub || !recipientName.trim() || !recipientEmail.trim() || !achievementText.trim() || !eventName.trim()) {
      showToast("Please fill all required certificate fields.");
      return;
    }

    setIssuing(true);
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showToast("Session expired. Please sign in again.");
        setIssuing(false);
        return;
      }

      const m = members.find((x) => x.github === selectedGithub);

      const res = await fetch("/api/certificates/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memberId: m?.id || null,
          github: selectedGithub,
          recipientName,
          recipientEmail,
          certificateType: certType,
          title: certTitle,
          achievementText,
          eventName,
          organizationText,
          activityPointsText,
          coordinators,
          dateStr,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        showToast(body.error || "Failed to issue certificate");
      } else {
        showToast(body.message || "Certificate issued successfully!");
        setShowIssueModal(false);
        // Reset form
        setSelectedGithub("");
        setRecipientName("");
        setRecipientEmail("");
        // Reload certificates list
        loadCertificates();
      }
    } catch {
      showToast("Network error while issuing certificate");
    } finally {
      setIssuing(false);
    }
  }

  // Revoke certificate
  async function handleRevokeCertificate(certificateId: string) {
    setRevoking(true);
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showToast("Sign in required");
        setRevoking(false);
        return;
      }

      const res = await fetch("/api/certificates/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateId }),
      });

      const body = await res.json();
      if (!res.ok) {
        showToast(body.error || "Failed to revoke certificate");
      } else {
        showToast(`Certificate ${certificateId} revoked`);
        setRevokingCertId(null);
        loadCertificates();
      }
    } catch {
      showToast("Network error while revoking certificate");
    } finally {
      setRevoking(false);
    }
  }

  // Resend notification email
  async function handleResendEmail(certificateId: string) {
    setResendingEmailId(certificateId);
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showToast("Sign in required");
        setResendingEmailId(null);
        return;
      }

      const res = await fetch("/api/certificates/resend-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateId }),
      });

      const body = await res.json();
      if (!res.ok) {
        showToast(body.error || "Failed to resend email");
      } else {
        showToast(body.message || "Email sent successfully");
        loadCertificates();
      }
    } catch {
      showToast("Network error while resending email");
    } finally {
      setResendingEmailId(null);
    }
  }

  // Secure Download
  async function handleDownload(certificateId: string) {
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showToast("Sign in required");
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

      const body = await res.json();
      if (!res.ok || !body.downloadUrl) {
        showToast(body.error || "Could not get download URL");
      } else {
        window.open(body.downloadUrl, "_blank");
      }
    } catch {
      showToast("Network error during download");
    }
  }

  // Filtered certificates list
  const filteredCertificates = useMemo(() => {
    return certificates.filter((c) => {
      // Search
      const matchesSearch =
        searchTerm === "" ||
        c.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.github.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.certificate_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.event_name.toLowerCase().includes(searchTerm.toLowerCase());

      // Status
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;

      // Type
      const matchesType = typeFilter === "all" || c.certificate_type === typeFilter;

      // Member
      const matchesMember = selectedMemberFilter === "all" || c.github === selectedMemberFilter;

      return matchesSearch && matchesStatus && matchesType && matchesMember;
    });
  }, [certificates, searchTerm, statusFilter, typeFilter, selectedMemberFilter]);

  // Filtered members for member selector
  const memberOptions = useMemo(() => {
    if (!memberSearch.trim()) return members.slice(0, 30);
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.github?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-[#e0e0e0] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#00e87a]" /> Certificates Management
          </h2>
          <p className="text-xs font-mono text-[#888] mt-0.5">
            Issue, track, download, and revoke verified achievement certificates.
          </p>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="btn-solid flex items-center gap-2 text-xs py-2 px-4 shadow-[0_0_15px_rgba(0,232,122,0.2)] shrink-0"
        >
          <Plus className="w-4 h-4" /> Issue Certificate
        </button>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search recipient, ID, event..."
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg pl-8 pr-3 py-2 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#00e87a40]"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter by certificate status"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          >
            <option value="all">All Statuses</option>
            <option value="issued">Active / Issued</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>

        {/* Certificate Type Filter */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by certificate type"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          >
            <option value="all">All Certificate Types</option>
            {CERTIFICATE_TYPES.map((t) => (
              <option key={t.id} value={t.label}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Member Filter */}
        <div>
          <select
            value={selectedMemberFilter}
            onChange={(e) => setSelectedMemberFilter(e.target.value)}
            aria-label="Filter by member"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          >
            <option value="all">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.github}>
                {m.name || m.github} (@{m.github})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Certificates Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[#888] font-mono text-sm gap-2">
          <div className="spinner" /> Loading certificates...
        </div>
      ) : filteredCertificates.length === 0 ? (
        <div className="card p-12 text-center">
          <Award className="w-10 h-10 text-[#444] mx-auto mb-3" />
          <p className="font-mono text-sm text-[#e0e0e0] font-bold">No certificates found</p>
          <p className="font-mono text-xs text-[#666] mt-1">
            {certificates.length === 0
              ? "No certificates have been issued yet. Click 'Issue Certificate' to create one."
              : "No certificates matched your filter criteria."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden border border-[#222]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#111] text-[#777] uppercase border-b border-[#222]">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Certificate ID</th>
                  <th className="px-4 py-3">Title & Event</th>
                  <th className="px-4 py-3">Issued Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {filteredCertificates.map((cert) => {
                  const isRevoked = cert.status === "revoked";
                  return (
                    <tr key={cert.id} className="hover:bg-[#141414] transition-colors">
                      {/* Recipient */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#e0e0e0]">{cert.recipient_name}</div>
                        <div className="text-[10px] text-[#666]">@{cert.github}</div>
                        <div className="text-[10px] text-[#555] truncate max-w-[150px]">{cert.recipient_email}</div>
                      </td>

                      {/* Certificate ID */}
                      <td className="px-4 py-3.5 font-bold text-[#00e87a]">
                        <a
                          href={`/certificate/${cert.certificate_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          {cert.certificate_id} <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </a>
                      </td>

                      {/* Title & Event */}
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="text-[#ccc] font-medium truncate">{cert.title}</div>
                        <div className="text-[10px] text-[#888] truncate">{cert.event_name}</div>
                      </td>

                      {/* Issued Date */}
                      <td className="px-4 py-3.5 text-[#999]">
                        {new Date(cert.issued_at).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-950/30 border border-red-800/40 rounded px-2 py-0.5">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00e87a] bg-[#00e87a15] border border-[#00e87a30] rounded px-2 py-0.5">
                            Issued
                          </span>
                        )}
                      </td>

                      {/* Email Status */}
                      <td className="px-4 py-3.5">
                        {cert.email_status === "sent" ? (
                          <span className="text-[10px] text-[#00e87a] flex items-center gap-1" title="Email sent via Brevo">
                            <CheckCircle className="w-3 h-3" /> Sent
                          </span>
                        ) : cert.email_status === "failed" ? (
                          <button
                            onClick={() => handleResendEmail(cert.certificate_id)}
                            disabled={resendingEmailId === cert.certificate_id}
                            className="text-[10px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-0.5 flex items-center gap-1 hover:bg-amber-900/40"
                            title={`Failed: ${cert.email_error || "Unknown error"}. Click to retry.`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {resendingEmailId === cert.certificate_id ? "Sending..." : "Retry"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#777]">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingCert(cert)}
                            title="View Certificate"
                            className="p-1.5 rounded hover:bg-[#222] text-[#bbb] hover:text-[#fff]"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDownload(cert.certificate_id)}
                            title="Download PDF"
                            className="p-1.5 rounded hover:bg-[#222] text-[#00e87a] hover:text-[#00ff88]"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {!isRevoked && (
                            <button
                              onClick={() => setRevokingCertId(cert.certificate_id)}
                              title="Revoke Certificate"
                              className="p-1.5 rounded hover:bg-red-950/40 text-red-400 hover:text-red-300"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ISSUE CERTIFICATE MODAL (WITH REALTIME LIVE PREVIEW)        */}
      {/* ════════════════════════════════════════════════════════════ */}
      {showIssueModal && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#222] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#00e87a]" />
                <h3 className="font-display font-bold text-base text-[#e0e0e0]">Issue New Certificate</h3>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                className="p-1 rounded-lg text-[#666] hover:text-[#fff] hover:bg-[#222]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Split view (Form Left, Live Preview Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-[#222]">
              {/* Form Column */}
              <form onSubmit={handleIssueCertificate} className="lg:col-span-5 p-5 space-y-4 overflow-y-auto max-h-[75vh]">
                {/* 1. Member Selector */}
                <div>
                  <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                    Select Member *
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search member by name or username..."
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#00e87a40]"
                    />
                    <select
                      value={selectedGithub}
                      onChange={(e) => handleSelectMember(e.target.value)}
                      aria-label="Select member"
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-2 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                      required
                    >
                      <option value="">-- Choose Member --</option>
                      {memberOptions.map((m) => (
                        <option key={m.id} value={m.github}>
                          {m.name || m.github} (@{m.github})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Recipient Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Recipient Name *
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="e.g. Dhruv G Nayak"
                      required
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                    <span className="text-[10px] text-[#666] font-mono">Edits apply to certificate only.</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Recipient Email *
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="e.g. member@bmsce.ac.in"
                      required
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                </div>

                {/* 3. Certificate Type & Title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Certificate Type
                    </label>
                    <select
                      value={certType}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      aria-label="Certificate type"
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    >
                      {CERTIFICATE_TYPES.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Certificate Title
                    </label>
                    <input
                      type="text"
                      value={certTitle}
                      onChange={(e) => setCertTitle(e.target.value)}
                      placeholder="CERTIFICATE OF ACHIEVEMENT"
                      required
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                </div>

                {/* 4. Achievement & Event */}
                <div>
                  <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                    Recognition / Achievement Statement *
                  </label>
                  <input
                    type="text"
                    value={achievementText}
                    onChange={(e) => setAchievementText(e.target.value)}
                    placeholder="e.g. securing 1st Place for the"
                    required
                    className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Event / Contest Name *
                    </label>
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder="e.g. Bit By Bit Weekly Contest"
                      required
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Date Display
                    </label>
                    <input
                      type="text"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      placeholder="e.g. June 2026"
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                </div>

                {/* 5. Organization Text & Activity Points */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Organization Text
                    </label>
                    <input
                      type="text"
                      value={organizationText}
                      onChange={(e) => setOrganizationText(e.target.value)}
                      placeholder="e.g. from teamcodelocked club"
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#999] uppercase mb-1">
                      Activity Points Text
                    </label>
                    <input
                      type="text"
                      value={activityPointsText}
                      onChange={(e) => setActivityPointsText(e.target.value)}
                      placeholder="e.g. This certificate is eligible for claiming 1-2 activity points."
                      className="w-full bg-[#080808] border border-[#252525] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                    />
                  </div>
                </div>

                {/* 6. Coordinators / Signatories */}
                <div>
                  <label className="block text-[11px] font-mono text-[#999] uppercase mb-2">
                    Coordinators / Signatories (3 Columns)
                  </label>
                  <div className="space-y-2">
                    {coordinators.map((coord, idx) => (
                      <div key={idx} className="p-2.5 bg-[#080808] border border-[#222] rounded-lg grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div>
                          <span className="text-[#666] text-[10px]">Name:</span>
                          <input
                            type="text"
                            value={coord.name}
                            onChange={(e) => updateCoordinator(idx, "name", e.target.value)}
                            className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-[#e0e0e0]"
                          />
                        </div>
                        <div>
                          <span className="text-[#666] text-[10px]">Title:</span>
                          <input
                            type="text"
                            value={coord.title}
                            onChange={(e) => updateCoordinator(idx, "title", e.target.value)}
                            className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-[#e0e0e0]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-3 border-t border-[#222] flex gap-3">
                  <button
                    type="submit"
                    disabled={issuing}
                    className="flex-1 btn-solid py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-2"
                  >
                    {issuing ? (
                      <>
                        <div className="spinner w-3.5 h-3.5" /> Generating PDF & Sending Email...
                      </>
                    ) : (
                      <>
                        <Award className="w-4 h-4" /> Issue Certificate
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    disabled={issuing}
                    className="btn-ghost py-2.5 px-4 text-xs font-mono"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {/* Live Certificate Preview Column */}
              <div className="lg:col-span-7 p-6 bg-[#080808] flex flex-col justify-center items-center overflow-y-auto">
                <div className="w-full max-w-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-[#00e87a] font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Live Certificate Preview
                    </span>
                    <span className="text-[10px] font-mono text-[#666]">Updates in real-time</span>
                  </div>
                  <div className="card p-2 sm:p-3 bg-[#0a0a0a] border-[#222] shadow-2xl">
                    <CertificatePreview
                      recipientName={recipientName || "Dhruv G Nayak"}
                      title={certTitle || "CERTIFICATE OF ACHIEVEMENT"}
                      achievementText={achievementText || "securing 1st Place for the"}
                      eventName={eventName || "Bit By Bit Weekly Contest"}
                      organizationText={organizationText || "from teamcodelocked club"}
                      activityPointsText={activityPointsText}
                      coordinators={coordinators}
                      dateStr={dateStr || "June 2026"}
                      certificateId="BBCERT-2026-PREVIEW"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* VIEW CERTIFICATE MODAL                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      {viewingCert && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-[#222] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#00e87a]" />
                <h3 className="font-display font-bold text-base text-[#e0e0e0]">
                  Certificate {viewingCert.certificate_id}
                </h3>
              </div>
              <button
                onClick={() => setViewingCert(null)}
                className="p-1 rounded-lg text-[#666] hover:text-[#fff] hover:bg-[#222]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="card p-3 bg-[#0a0a0a] border-[#222]">
                <CertificatePreview
                  recipientName={viewingCert.recipient_name}
                  title={viewingCert.title}
                  achievementText={viewingCert.achievement_text}
                  eventName={viewingCert.event_name}
                  organizationText={viewingCert.organization_text}
                  activityPointsText={viewingCert.activity_points_text}
                  coordinators={viewingCert.coordinator_names || []}
                  dateStr={new Date(viewingCert.issued_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                  certificateId={viewingCert.certificate_id}
                  status={viewingCert.status}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs font-mono text-[#888]">
                  Recipient: <strong className="text-[#e0e0e0]">{viewingCert.recipient_name}</strong> (
                  {viewingCert.recipient_email})
                </div>
                <button
                  onClick={() => handleDownload(viewingCert.certificate_id)}
                  className="btn-solid py-2 px-4 text-xs font-mono flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* REVOKE CONFIRMATION MODAL                                   */}
      {/* ════════════════════════════════════════════════════════════ */}
      {revokingCertId && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#111] border border-red-900/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto">
              <Ban className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="font-display font-bold text-lg text-[#e0e0e0]">Revoke Certificate?</h3>
              <p className="text-xs font-mono text-[#888] mt-1">
                Are you sure you want to revoke <strong className="text-red-400">{revokingCertId}</strong>?
                This will mark the certificate as invalid on the verification page and in member views.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleRevokeCertificate(revokingCertId)}
                disabled={revoking}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs py-2.5 rounded-lg transition-colors"
              >
                {revoking ? "Revoking..." : "Confirm Revoke"}
              </button>
              <button
                onClick={() => setRevokingCertId(null)}
                disabled={revoking}
                className="btn-ghost py-2.5 px-4 text-xs font-mono"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
