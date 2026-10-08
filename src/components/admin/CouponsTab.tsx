"use client";
// ════════════════════════════════════════════════════════════
// src/components/admin/CouponsTab.tsx
// Admin interface for managing coupon codes & discount overrides
// ════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import {
  getCouponsAction,
  createCouponAction,
  toggleCouponActiveAction,
  deleteCouponAction,
} from "@/app/actions/coupons";
import type { Coupon, DiscountType } from "@/types/coupons";

export default function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  // Create form states
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("fixed");
  const [discountValue, setDiscountValue] = useState<number | string>(160);
  const [isActive, setIsActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [deleteModalCoupon, setDeleteModalCoupon] = useState<Coupon | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCoupons();
  }, []);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  async function loadCoupons() {
    setLoading(true);
    try {
      const res = await getCouponsAction();
      if (res.success && res.coupons) {
        setCoupons(res.coupons);
      } else if (res.error) {
        showToast(`Failed to load coupons: ${res.error}`);
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setFormError("Coupon code is required");
      return;
    }

    const val = Number(discountValue);
    if (isNaN(val) || val <= 0) {
      setFormError("Discount value must be greater than 0");
      return;
    }

    if (discountType === "percentage" && val > 100) {
      setFormError("Percentage discount cannot exceed 100%");
      return;
    }

    setCreating(true);
    try {
      const res = await createCouponAction({
        code: cleanCode,
        discount_type: discountType,
        discount_value: val,
        is_active: isActive,
      });

      if (res.success && res.coupon) {
        setCoupons((prev) => [res.coupon!, ...prev]);
        setFormSuccess(`Coupon code "${cleanCode}" created successfully!`);
        setCode("");
        setDiscountValue(160);
        setIsActive(true);
        showToast(`Created promo code ${cleanCode}`);
      } else {
        setFormError(res.error || "Failed to create coupon code");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to create coupon");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(coupon: Coupon) {
    const nextState = !coupon.is_active;
    setActionLoadingId(coupon.id);
    try {
      const res = await toggleCouponActiveAction(coupon.id, nextState);
      if (res.success) {
        setCoupons((prev) =>
          prev.map((c) => (c.id === coupon.id ? { ...c, is_active: nextState } : c))
        );
        showToast(
          `Coupon "${coupon.code}" ${nextState ? "activated" : "deactivated"}`
        );
      } else {
        showToast(res.error || "Failed to update status");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update status");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteModalCoupon) return;
    const { id, code: couponCode } = deleteModalCoupon;
    setActionLoadingId(id);
    try {
      const res = await deleteCouponAction(id);
      if (res.success) {
        setCoupons((prev) => prev.filter((c) => c.id !== id));
        showToast(`Coupon "${couponCode}" deleted permanently`);
        setDeleteModalCoupon(null);
      } else {
        showToast(res.error || "Failed to delete coupon");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete coupon");
    } finally {
      setActionLoadingId(null);
    }
  }

  function handleCopy(c: string) {
    navigator.clipboard.writeText(c);
    setCopiedCode(c);
    showToast(`Copied "${c}" to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  function generateRandomCode() {
    const prefixes = ["PROMO", "SAVE", "DEAL", "OFF", "BITS", "MEMBER"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 900);
    setCode(`${prefix}${num}`);
  }

  // Filtered list
  const filteredCoupons = coupons.filter((c) => {
    const matchesQuery =
      c.code.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesFilter =
      filterStatus === "all"
        ? true
        : filterStatus === "active"
        ? c.is_active
        : !c.is_active;
    return matchesQuery && matchesFilter;
  });

  const totalCoupons = coupons.length;
  const activeCount = coupons.filter((c) => c.is_active).length;
  const inactiveCount = totalCoupons - activeCount;

  // Calculation preview
  const numVal = Number(discountValue) || 0;
  const sampleBase = 199;
  const sampleDiscount =
    discountType === "percentage"
      ? (sampleBase * numVal) / 100
      : Math.min(sampleBase, numVal);
  const sampleFinal = Math.max(0, sampleBase - sampleDiscount);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-cyan-400 text-zinc-950 px-4 py-2.5 rounded-xl font-mono text-xs font-bold shadow-2xl animate-fade-up border border-cyan-300/40">
          {toastMessage}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 dark:text-rose-400 text-lg">
                ⚠️
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-zinc-100 font-display font-semibold text-base">
                  Delete Coupon Code?
                </h3>
                <p className="text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-slate-700 dark:text-zinc-300 text-sm bg-slate-50 dark:bg-zinc-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800/80 font-mono">
              Are you sure you want to permanently delete{" "}
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                {deleteModalCoupon.code}
              </span>
              ? Users will no longer be able to use this discount code.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalCoupon(null)}
                className="px-4 py-2 text-xs font-mono text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={actionLoadingId === deleteModalCoupon.id}
                className="px-4 py-2 bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {actionLoadingId === deleteModalCoupon.id
                  ? "Deleting…"
                  : "Yes, Delete Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Total Coupons
          </div>
          <div className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-100">
            {totalCoupons}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 mt-1">
            Configured promo codes
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 border border-emerald-500/30 dark:border-emerald-500/20 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            Active Codes
          </div>
          <div className="text-2xl font-display font-bold text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 mt-1">
            Ready for checkout validation
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Inactive / Disabled
          </div>
          <div className="text-2xl font-display font-bold text-slate-500 dark:text-zinc-400">
            {inactiveCount}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 mt-1">
            Archived or deactivated
          </div>
        </div>
      </div>

      {/* Create Promo Code Form */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-slate-900 dark:text-zinc-100 font-display font-semibold text-base flex items-center gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">🏷</span> Create New Promo Code
            </h2>
            <p className="text-slate-600 dark:text-zinc-400 text-xs font-mono mt-0.5">
              Create coupon codes with custom fixed discount amounts or percentage savings.
            </p>
          </div>
          <button
            type="button"
            onClick={generateRandomCode}
            className="text-xs font-mono text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 transition-colors bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-500/20 px-3 py-1.5 rounded-lg"
          >
            ⚡ Generate Random Code
          </button>
        </div>

        {formError && (
          <div className="mb-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-mono px-3.5 py-2.5 rounded-xl">
            {formError}
          </div>
        )}

        {formSuccess && (
          <div className="mb-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono px-3.5 py-2.5 rounded-xl">
            {formSuccess}
          </div>
        )}

        <form onSubmit={handleCreateCoupon} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Code Name */}
            <div>
              <label className="block text-xs font-mono text-slate-700 dark:text-zinc-300 mb-1.5">
                Coupon Code <span className="text-cyan-600 dark:text-cyan-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. SAVE160"
                className="w-full bg-white dark:bg-zinc-950/80 border border-slate-300 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-zinc-100 uppercase placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors shadow-2xs"
                required
              />
            </div>

            {/* Discount Type */}
            <div>
              <label className="block text-xs font-mono text-slate-700 dark:text-zinc-300 mb-1.5">
                Discount Type
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="w-full bg-white dark:bg-zinc-950/80 border border-slate-300 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer shadow-2xs"
              >
                <option value="fixed">Fixed Amount ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>

            {/* Discount Value */}
            <div>
              <label className="block text-xs font-mono text-slate-700 dark:text-zinc-300 mb-1.5">
                Discount Value ({discountType === "fixed" ? "$" : "%"}){" "}
                <span className="text-cyan-600 dark:text-cyan-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={discountType === "percentage" ? 100 : undefined}
                step="any"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "fixed" ? "160" : "20"}
                className="w-full bg-white dark:bg-zinc-950/80 border border-slate-300 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors shadow-2xs"
                required
              />
            </div>
          </div>

          {/* Pricing Preview Banner & Active Checkbox */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 pb-1 border-t border-slate-200 dark:border-zinc-800/60">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-white dark:bg-zinc-950 border-slate-300 dark:border-zinc-700 text-cyan-600 focus:ring-cyan-500 accent-cyan-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                  Activate coupon immediately
                </span>
              </label>
            </div>

            {/* Live Pricing Math Preview */}
            <div className="text-xs font-mono bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 px-3.5 py-1.5 rounded-xl text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <span>Checkout Impact:</span>
              <span className="line-through text-slate-400 dark:text-zinc-500">${sampleBase}</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">-${sampleDiscount}</span>
              <span>=</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">${sampleFinal}</span>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={creating || !code.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-xs rounded-xl shadow-xs transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <span>+ Create Coupon</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Coupons Table & Management List */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Header Controls */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-slate-900 dark:text-zinc-100 font-display font-semibold text-sm">
              Existing Coupon Codes
            </h3>
            <span className="text-xs font-mono text-slate-600 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full">
              {filteredCoupons.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <input
              type="text"
              placeholder="Search code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white dark:bg-zinc-950/80 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-cyan-500 w-36 sm:w-44"
            />

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as "all" | "active" | "inactive")
              }
              className="bg-white dark:bg-zinc-950/80 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {/* Refresh */}
            <button
              onClick={loadCoupons}
              disabled={loading}
              title="Refresh list"
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-xl text-xs transition-colors"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-6 h-6 border-2 border-cyan-500 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-xs font-mono text-slate-500 dark:text-zinc-500">Loading coupons…</span>
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-zinc-500 font-mono text-xs">
            {searchQuery || filterStatus !== "all"
              ? "No coupons match your search or filter."
              : "No coupons created yet. Create one above!"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 dark:bg-zinc-950/60 text-slate-600 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800/80">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Pricing Effect ($199 Base)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {filteredCoupons.map((c) => {
                  const discountAmt =
                    c.discount_type === "percentage"
                      ? (199 * Number(c.discount_value)) / 100
                      : Math.min(199, Number(c.discount_value));
                  const finalCalculated = Math.max(0, 199 - discountAmt);

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* Code with Copy Button */}
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-zinc-100 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 dark:bg-zinc-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-800 text-cyan-700 dark:text-cyan-300 font-mono tracking-wider">
                            {c.code}
                          </span>
                          <button
                            onClick={() => handleCopy(c.code)}
                            title="Copy code"
                            className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors text-xs"
                          >
                            {copiedCode === c.code ? "✓" : "📋"}
                          </button>
                        </div>
                      </td>

                      {/* Discount Type & Value */}
                      <td className="px-4 py-3 text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-[11px] font-semibold">
                          {c.discount_type === "percentage"
                            ? `${c.discount_value}% OFF`
                            : `-$${c.discount_value} FIXED`}
                        </span>
                      </td>

                      {/* Pricing Effect */}
                      <td className="px-4 py-3 text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                        <span className="line-through text-slate-400 dark:text-zinc-600 mr-1.5">
                          $199
                        </span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                          ${finalCalculated.toFixed(0)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(c)}
                          disabled={actionLoadingId === c.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${
                            c.is_active
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700/60"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              c.is_active ? "bg-emerald-500 animate-pulse" : "bg-slate-400 dark:bg-zinc-500"
                            }`}
                          />
                          {actionLoadingId === c.id
                            ? "Updating…"
                            : c.is_active
                            ? "Active"
                            : "Inactive"}
                        </button>
                      </td>

                      {/* Created At */}
                      <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 whitespace-nowrap text-[11px]">
                        {new Date(c.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleStatus(c)}
                            disabled={actionLoadingId === c.id}
                            className="px-2.5 py-1 text-[11px] font-mono text-slate-700 hover:text-cyan-600 bg-slate-100 hover:bg-slate-200 dark:text-zinc-300 dark:hover:text-cyan-300 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700/60 transition-colors"
                          >
                            {c.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => setDeleteModalCoupon(c)}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            title="Delete coupon"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
