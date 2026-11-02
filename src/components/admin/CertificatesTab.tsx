"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { Certificate, Member, CertificateCoordinator } from "@/types/database";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import { DEFAULT_COORDINATORS, CERTIFICATE_TYPES, type TemplateConfig } from "@/lib/certificates/types";
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
  Upload,
  Sliders,
  Image as ImageIcon,
  RotateCcw,
  ChevronDown,
  ChevronUp,
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

  // Custom Template State
  const [templateMode, setTemplateMode] = useState<"default" | "custom">("default");
  const [customTemplateImage, setCustomTemplateImage] = useState<string | null>(null);
  const [customTemplateFileName, setCustomTemplateFileName] = useState<string>("");
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);

  // Layout & positioning adjustments (in %)
  const [nameY, setNameY] = useState(48);
  const [nameFontSize, setNameFontSize] = useState(38);
  const [nameColor, setNameColor] = useState("#09090b");

  const [showBody, setShowBody] = useState(true);
  const [bodyY, setBodyY] = useState(58);
  const [bodyFontSize, setBodyFontSize] = useState(16);
  const [bodyColor, setBodyColor] = useState("#27272a");

  const [showTitleOverlay, setShowTitleOverlay] = useState(false);
  const [titleY, setTitleY] = useState(26.5);
  const [titleFontSize, setTitleFontSize] = useState(22);
  const [titleColor, setTitleColor] = useState("#09090b");

  const [showActivityPoints, setShowActivityPoints] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showCertId, setShowCertId] = useState(true);
  const [showQr, setShowQr] = useState(true);

  const [certIdX, setCertIdX] = useState(4.5);
  const [certIdY, setCertIdY] = useState(95.5);
  const [qrX, setQrX] = useState(88);
  const [qrY, setQrY] = useState(86);

  // Text Customization & Freeform Mode
  const [textMode, setTextMode] = useState<"standard" | "custom">("standard");
  const [customBodyText, setCustomBodyText] = useState("");
  const [extraFields, setExtraFields] = useState<Array<{ id: string; text: string; x: number; y: number; fontSize: number; color: string }>>([]);

  function addExtraField() {
    setExtraFields((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}`,
        text: "Custom Text",
        x: 50,
        y: 75,
        fontSize: 14,
        color: "#374151",
      },
    ]);
  }

  function updateExtraField(id: string, updates: Partial<{ text: string; x: number; y: number; fontSize: number; color: string }>) {
    setExtraFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }

  function removeExtraField(id: string) {
    setExtraFields((prev) => prev.filter((f) => f.id !== id));
  }

  function resetTemplateLayout() {
    setNameY(48);
    setNameFontSize(38);
    setNameColor("#09090b");
    setShowBody(true);
    setBodyY(58);
    setBodyFontSize(16);
    setBodyColor("#27272a");
    setShowTitleOverlay(false);
    setTitleY(26.5);
    setTitleFontSize(22);
    setTitleColor("#09090b");
    setShowActivityPoints(true);
    setShowDate(true);
    setShowCertId(true);
    setShowQr(true);
    setCertIdX(4.5);
    setCertIdY(95.5);
    setQrX(88);
    setQrY(86);
    setExtraFields([]);
  }

  function handleCustomTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file (PNG, JPG, or WebP).");
      return;
    }

    setCustomTemplateFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 2048;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/png", 0.95);
          setCustomTemplateImage(dataUrl);
          setTemplateMode("custom");
          setShowLayoutSettings(true);
          showToast(`Custom template loaded: ${file.name}`);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  const activeTemplateConfig: TemplateConfig = useMemo(() => {
    return {
      isCustom: templateMode === "custom",
      nameY,
      nameFontSize,
      nameColor,
      showTitle: templateMode === "custom" ? showTitleOverlay : undefined,
      titleY,
      titleFontSize,
      titleColor,
      showBody,
      bodyY,
      bodyFontSize,
      bodyColor,
      showActivityPoints,
      showDate,
      showCertId,
      showQr,
      certIdX,
      certIdY,
      qrX,
      qrY,
      extraFields: extraFields.length > 0 ? extraFields : undefined,
    };
  }, [
    templateMode,
    nameY,
    nameFontSize,
    nameColor,
    showTitleOverlay,
    titleY,
    titleFontSize,
    titleColor,
    showBody,
    bodyY,
    bodyFontSize,
    bodyColor,
    showActivityPoints,
    showDate,
    showCertId,
    showQr,
    certIdX,
    certIdY,
    qrX,
    qrY,
    extraFields,
  ]);

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
    if (templateMode === "custom" && !customTemplateImage) {
      showToast("Please upload a custom certificate template image, or switch to Default Template.");
      return;
    }

    const trimmedDesc = textMode === "custom" && customBodyText.trim() ? customBodyText.trim() : undefined;
    if (!selectedGithub || !recipientName.trim() || !recipientEmail.trim() || (!trimmedDesc && (!achievementText.trim() || !eventName.trim()))) {
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
          customTemplateImage: templateMode === "custom" ? customTemplateImage : undefined,
          templateConfig: activeTemplateConfig,
          customDescription: trimmedDesc,
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Certificates Management
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
            Issue, track, download, and revoke verified achievement certificates.
          </p>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 text-xs font-mono font-bold py-2 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 rounded-lg hover:opacity-95 shadow-xs transition-all shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Issue Certificate
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono shadow-xs">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search recipient, ID, event..."
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-cyan-500/80"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter by certificate status"
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500/80"
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
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500/80"
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
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500/80"
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
        <div className="flex items-center justify-center py-16 text-slate-500 dark:text-zinc-500 font-mono text-xs gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-zinc-700 border-t-cyan-500 dark:border-t-cyan-400 animate-spin" /> Loading certificates...
        </div>
      ) : filteredCertificates.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-12 text-center shadow-xs">
          <Award className="w-10 h-10 text-slate-400 dark:text-zinc-600 mx-auto mb-3" />
          <p className="font-mono text-sm text-slate-800 dark:text-zinc-200 font-semibold">No certificates found</p>
          <p className="font-mono text-xs text-slate-500 dark:text-zinc-500 mt-1">
            {certificates.length === 0
              ? "No certificates have been issued yet. Click 'Issue Certificate' to create one."
              : "No certificates matched your filter criteria."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 uppercase border-b border-slate-200 dark:border-zinc-800">
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
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                {filteredCertificates.map((cert) => {
                  const isRevoked = cert.status === "revoked";
                  return (
                    <tr key={cert.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                      {/* Recipient */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-zinc-200">{cert.recipient_name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-500">@{cert.github}</div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-500 truncate max-w-[150px]">{cert.recipient_email}</div>
                      </td>

                      {/* Certificate ID */}
                      <td className="px-4 py-3.5 font-medium text-cyan-600 dark:text-cyan-400">
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
                        <div className="text-slate-800 dark:text-zinc-300 font-medium truncate">{cert.title}</div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">{cert.event_name}</div>
                      </td>

                      {/* Issued Date */}
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400">
                        {new Date(cert.issued_at).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-0.5">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
                            Issued
                          </span>
                        )}
                      </td>

                      {/* Email Status */}
                      <td className="px-4 py-3.5">
                        {cert.email_status === "sent" ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1" title="Email sent via Brevo">
                            <CheckCircle className="w-3 h-3" /> Sent
                          </span>
                        ) : cert.email_status === "failed" ? (
                          <button
                            onClick={() => handleResendEmail(cert.certificate_id)}
                            disabled={resendingEmailId === cert.certificate_id}
                            className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5 flex items-center gap-1 hover:bg-amber-500/20"
                            title={`Failed: ${cert.email_error || "Unknown error"}. Click to retry.`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {resendingEmailId === cert.certificate_id ? "Sending..." : "Retry"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingCert(cert)}
                            title="View Certificate"
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDownload(cert.certificate_id)}
                            title="Download PDF"
                            className="p-1.5 rounded hover:bg-cyan-50 dark:hover:bg-zinc-800 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {!isRevoked && (
                            <button
                              onClick={() => setRevokingCertId(cert.certificate_id)}
                              title="Revoke Certificate"
                              className="p-1.5 rounded hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors"
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
        <div className="fixed inset-0 z-[200] bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-semibold text-base text-slate-900 dark:text-zinc-100">Issue New Certificate</h3>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                className="p-1 rounded-lg text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Split view (Form Left, Live Preview Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-zinc-800">
              {/* Form Column */}
              <form onSubmit={handleIssueCertificate} className="lg:col-span-5 p-5 space-y-4 overflow-y-auto max-h-[75vh]">
                {/* 0. Template Selection & Placement Controls */}
                <div className="bg-slate-50 dark:bg-zinc-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-700 dark:text-zinc-300 uppercase font-semibold flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      Certificate Template
                    </label>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                      {templateMode === "default" ? "Standard Base" : "Custom Template"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateMode("default")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-mono font-medium transition-all flex items-center justify-center gap-1.5 border ${
                        templateMode === "default"
                          ? "bg-white dark:bg-zinc-800 border-cyan-500 text-cyan-700 dark:text-cyan-300 shadow-xs"
                          : "bg-slate-100/70 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100"
                      }`}
                    >
                      Default Template
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateMode("custom")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-mono font-medium transition-all flex items-center justify-center gap-1.5 border ${
                        templateMode === "custom"
                          ? "bg-white dark:bg-zinc-800 border-cyan-500 text-cyan-700 dark:text-cyan-300 shadow-xs"
                          : "bg-slate-100/70 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Custom
                    </button>
                  </div>

                  {templateMode === "custom" && (
                    <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-zinc-800 animate-fade-in">
                      <label className="block text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                        Upload Template Image (PNG / JPG / WebP):
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-lg hover:border-cyan-500 dark:hover:border-cyan-400 transition-colors bg-white dark:bg-zinc-950">
                          <Upload className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-mono text-slate-600 dark:text-zinc-300 truncate">
                            {customTemplateFileName || "Browse or Drop Template Image..."}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleCustomTemplateUpload}
                            className="hidden"
                          />
                        </label>
                        {customTemplateImage && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomTemplateImage(null);
                              setCustomTemplateFileName("");
                              setTemplateMode("default");
                            }}
                            className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs font-mono"
                            title="Remove custom template"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                        Upload any blank or pre-designed certificate. Adjust text positions below.
                      </p>
                    </div>
                  )}

                  {/* Positioning & Text Adjustment Controls */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowLayoutSettings(!showLayoutSettings)}
                      className="w-full flex items-center justify-between text-[11px] font-mono text-cyan-600 dark:text-cyan-400 py-1 hover:underline"
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Sliders className="w-3.5 h-3.5" />
                        {templateMode === "custom" ? "Text Placement & Sizing Controls" : "Adjust Positions & Layout (Optional)"}
                      </span>
                      {showLayoutSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showLayoutSettings && (
                      <div className="space-y-3 mt-2.5 p-3 bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-mono animate-fade-in">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-zinc-850">
                          <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase">Field Alignments</span>
                          <button
                            type="button"
                            onClick={resetTemplateLayout}
                            className="text-[10px] text-slate-400 hover:text-cyan-600 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        </div>

                        {/* Recipient Name Controls */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-700 dark:text-zinc-300 font-semibold">Recipient Name Position:</span>
                            <span className="text-slate-400">{nameY}% (Y)</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="85"
                            step="0.5"
                            value={nameY}
                            onChange={(e) => setNameY(parseFloat(e.target.value))}
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                          />
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <div>
                              <span className="text-[10px] text-slate-500">Font Size: {nameFontSize}pt</span>
                              <input
                                type="range"
                                min="20"
                                max="64"
                                step="1"
                                value={nameFontSize}
                                onChange={(e) => setNameFontSize(parseInt(e.target.value))}
                                className="w-full accent-cyan-500 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Color:</span>
                              <input
                                type="color"
                                value={nameColor}
                                onChange={(e) => setNameColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-zinc-700 p-0"
                              />
                              <span className="text-[10px] text-slate-400 font-mono">{nameColor}</span>
                            </div>
                          </div>
                        </div>

                        {/* Recognition Statement Controls */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-700 dark:text-zinc-300 font-semibold">Recognition Body Position:</span>
                            <span className="text-slate-400">{bodyY}% (Y)</span>
                          </div>
                          <input
                            type="range"
                            min="25"
                            max="90"
                            step="0.5"
                            value={bodyY}
                            onChange={(e) => setBodyY(parseFloat(e.target.value))}
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                          />
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <div>
                              <span className="text-[10px] text-slate-500">Font Size: {bodyFontSize}pt</span>
                              <input
                                type="range"
                                min="10"
                                max="28"
                                step="1"
                                value={bodyFontSize}
                                onChange={(e) => setBodyFontSize(parseInt(e.target.value))}
                                className="w-full accent-cyan-500 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Color:</span>
                              <input
                                type="color"
                                value={bodyColor}
                                onChange={(e) => setBodyColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border border-slate-300 dark:border-zinc-700 p-0"
                              />
                              <span className="text-[10px] text-slate-400 font-mono">{bodyColor}</span>
                            </div>
                          </div>
                        </div>

                        {/* Toggles for Title, QR Code, ID, Activity Points */}
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 space-y-2">
                          <span className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase">
                            Elements Visibility
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={showTitleOverlay}
                                onChange={(e) => setShowTitleOverlay(e.target.checked)}
                                className="rounded accent-cyan-500"
                              />
                              Title Text
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={showQr}
                                onChange={(e) => setShowQr(e.target.checked)}
                                className="rounded accent-cyan-500"
                              />
                              QR Code
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={showCertId}
                                onChange={(e) => setShowCertId(e.target.checked)}
                                className="rounded accent-cyan-500"
                              />
                              Certificate ID
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={showActivityPoints}
                                onChange={(e) => setShowActivityPoints(e.target.checked)}
                                className="rounded accent-cyan-500"
                              />
                              Activity Points
                            </label>
                          </div>
                        </div>

                        {/* Extra Custom Text Lines */}
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase">
                              Extra Custom Text Lines ({extraFields.length})
                            </span>
                            <button
                              type="button"
                              onClick={addExtraField}
                              className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Plus className="w-3 h-3" /> Add Text Line
                            </button>
                          </div>

                          {extraFields.map((field) => (
                            <div key={field.id} className="p-2 bg-slate-50 dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={field.text}
                                  onChange={(e) => updateExtraField(field.id, { text: e.target.value })}
                                  placeholder="Type text to display..."
                                  className="flex-1 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeExtraField(field.id)}
                                  className="text-rose-500 hover:text-rose-600 p-1"
                                  title="Remove line"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div>
                                  <span className="text-slate-400">Position Y: {field.y}%</span>
                                  <input
                                    type="range"
                                    min="10"
                                    max="95"
                                    step="1"
                                    value={field.y}
                                    onChange={(e) => updateExtraField(field.id, { y: parseInt(e.target.value) })}
                                    className="w-full accent-cyan-500 h-1 bg-slate-200 dark:bg-zinc-800 rounded"
                                  />
                                </div>
                                <div>
                                  <span className="text-slate-400">Position X: {field.x}%</span>
                                  <input
                                    type="range"
                                    min="5"
                                    max="95"
                                    step="1"
                                    value={field.x}
                                    onChange={(e) => updateExtraField(field.id, { x: parseInt(e.target.value) })}
                                    className="w-full accent-cyan-500 h-1 bg-slate-200 dark:bg-zinc-800 rounded"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 1. Member Selector */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                    Select Member *
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search member by name or username..."
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                    />
                    <select
                      value={selectedGithub}
                      onChange={(e) => handleSelectMember(e.target.value)}
                      aria-label="Select member"
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
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
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Recipient Name *
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="e.g. Dhruv G Nayak"
                      required
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Edits apply to certificate only.</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Recipient Email *
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="e.g. member@bmsce.ac.in"
                      required
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* 3. Certificate Type & Title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Certificate Type
                    </label>
                    <select
                      value={certType}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      aria-label="Certificate type"
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {CERTIFICATE_TYPES.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Certificate Title
                    </label>
                    <input
                      type="text"
                      value={certTitle}
                      onChange={(e) => setCertTitle(e.target.value)}
                      placeholder="CERTIFICATE OF ACHIEVEMENT"
                      required
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* 4. Certificate Text & Body Statement */}
                <div className="space-y-3 bg-slate-50/70 dark:bg-zinc-900/40 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono text-slate-700 dark:text-zinc-300 uppercase font-semibold">
                      Certificate Body Statement *
                    </label>
                    <div className="flex items-center bg-slate-200/80 dark:bg-zinc-800 p-0.5 rounded-lg text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setTextMode("standard")}
                        className={`px-2 py-0.5 rounded transition-all ${
                          textMode === "standard"
                            ? "bg-white dark:bg-zinc-950 text-cyan-600 dark:text-cyan-400 font-bold shadow-xs"
                            : "text-slate-500 hover:text-slate-900 dark:text-zinc-400"
                        }`}
                      >
                        Standard Fields
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTextMode("custom");
                          if (!customBodyText) {
                            setCustomBodyText(
                              `from ${organizationText} in recognition of ${achievementText} ${eventName} ORGANISED IN ${dateStr.toUpperCase()}`
                            );
                          }
                        }}
                        className={`px-2 py-0.5 rounded transition-all ${
                          textMode === "custom"
                            ? "bg-white dark:bg-zinc-950 text-cyan-600 dark:text-cyan-400 font-bold shadow-xs"
                            : "text-slate-500 hover:text-slate-900 dark:text-zinc-400"
                        }`}
                      >
                        ✍️ Freeform Custom Text
                      </button>
                    </div>
                  </div>

                  {textMode === "custom" ? (
                    <div className="space-y-2 animate-fade-in">
                      <textarea
                        rows={3}
                        value={customBodyText}
                        onChange={(e) => setCustomBodyText(e.target.value)}
                        placeholder="Write the exact text you want to appear on the certificate..."
                        className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500 resize-none leading-relaxed"
                        required={textMode === "custom"}
                      />
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 mr-1">Templates:</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomBodyText(
                              `from teamcodelocked club in recognition of securing 1st Place for the ${eventName} ORGANISED IN ${dateStr.toUpperCase()}`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded text-slate-700 dark:text-zinc-200"
                        >
                          1st Place
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomBodyText(
                              `for active and enthusiastic participation in the ${eventName} conducted by teamcodelocked club IN ${dateStr.toUpperCase()}`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded text-slate-700 dark:text-zinc-200"
                        >
                          Participation
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomBodyText(
                              `has successfully completed all requirements and practical projects for the ${eventName} conducted by BMSCE TeamCodeLocked.`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded text-slate-700 dark:text-zinc-200"
                        >
                          Bootcamp / Course
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomBodyText(
                              `in sincere appreciation for outstanding dedication, leadership and mentorship during the ${eventName}.`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded text-slate-700 dark:text-zinc-200"
                        >
                          Appreciation
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 dark:text-zinc-400 mb-1">
                          Achievement / Placement Text
                        </label>
                        <input
                          type="text"
                          value={achievementText}
                          onChange={(e) => setAchievementText(e.target.value)}
                          placeholder="e.g. securing 1st Place for the"
                          required={textMode === "standard"}
                          className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 dark:text-zinc-400 mb-1">
                          Event / Contest Name *
                        </label>
                        <input
                          type="text"
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                          placeholder="e.g. Bit By Bit Weekly Contest"
                          required={textMode === "standard"}
                          className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Common Date Display */}
                  <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800">
                    <label className="block text-[10px] font-mono text-slate-500 dark:text-zinc-400 mb-1">
                      Date Display
                    </label>
                    <input
                      type="text"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      placeholder="e.g. June 2026"
                      className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* 5. Organization Text & Activity Points */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Organization Text
                    </label>
                    <input
                      type="text"
                      value={organizationText}
                      onChange={(e) => setOrganizationText(e.target.value)}
                      placeholder="e.g. from teamcodelocked club"
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-1">
                      Activity Points Text
                    </label>
                    <input
                      type="text"
                      value={activityPointsText}
                      onChange={(e) => setActivityPointsText(e.target.value)}
                      placeholder="e.g. This certificate is eligible for claiming 1-2 activity points."
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* 6. Coordinators / Signatories */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-600 dark:text-zinc-400 uppercase mb-2">
                    Coordinators / Signatories (3 Columns)
                  </label>
                  <div className="space-y-2">
                    {coordinators.map((coord, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div>
                          <span className="text-slate-500 dark:text-zinc-500 text-[10px]">Name:</span>
                          <input
                            type="text"
                            value={coord.name}
                            onChange={(e) => updateCoordinator(idx, "name", e.target.value)}
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-slate-900 dark:text-zinc-200"
                          />
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-zinc-500 text-[10px]">Title:</span>
                          <input
                            type="text"
                            value={coord.title}
                            onChange={(e) => updateCoordinator(idx, "title", e.target.value)}
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-slate-900 dark:text-zinc-200"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex gap-3">
                  <button
                    type="submit"
                    disabled={issuing}
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 rounded-lg py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-2 hover:opacity-95 shadow-xs transition-all disabled:opacity-50"
                  >
                    {issuing ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-950/20 border-t-white dark:border-t-zinc-950 animate-spin" /> Generating PDF & Sending Email...
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
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800 rounded-lg text-xs font-mono transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {/* Live Certificate Preview Column */}
              <div className="lg:col-span-7 p-4 sm:p-6 bg-slate-100/90 dark:bg-zinc-950 flex flex-col justify-center items-center overflow-y-auto">
                <div className="w-full max-w-3xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Live Preview (Exact 1:1 Download Ratio)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/90 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-300/50 dark:border-zinc-700">
                      A4 Print Ratio (297 × 210 mm)
                    </span>
                  </div>
                  <div className="p-2 sm:p-3 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl">
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
                      customTemplateUrl={templateMode === "custom" ? customTemplateImage : null}
                      templateConfig={activeTemplateConfig}
                      customDescription={textMode === "custom" && customBodyText.trim() ? customBodyText.trim() : undefined}
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
        <div className="fixed inset-0 z-[200] bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-semibold text-base text-slate-900 dark:text-zinc-100">
                  Certificate {viewingCert.certificate_id}
                </h3>
              </div>
              <button
                onClick={() => setViewingCert(null)}
                className="p-1 rounded-lg text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-xl">
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
                <div className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                  Recipient: <strong className="text-slate-900 dark:text-zinc-200">{viewingCert.recipient_name}</strong> (
                  {viewingCert.recipient_email})
                </div>
                <button
                  onClick={() => handleDownload(viewingCert.certificate_id)}
                  className="bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 rounded-lg py-2 px-4 text-xs font-mono font-bold flex items-center gap-2 hover:opacity-95 shadow-xs transition-all"
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
        <div className="fixed inset-0 z-[200] bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-950 border border-rose-500/20 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto">
              <Ban className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-100">Revoke Certificate?</h3>
              <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 mt-1">
                Are you sure you want to revoke <strong className="text-rose-600 dark:text-rose-400">{revokingCertId}</strong>?
                This will mark the certificate as invalid on the verification page and in member views.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleRevokeCertificate(revokingCertId)}
                disabled={revoking}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-mono font-medium text-xs py-2.5 rounded-lg transition-colors"
              >
                {revoking ? "Revoking..." : "Confirm Revoke"}
              </button>
              <button
                onClick={() => setRevokingCertId(null)}
                disabled={revoking}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800 rounded-lg text-xs font-mono transition-colors"
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
