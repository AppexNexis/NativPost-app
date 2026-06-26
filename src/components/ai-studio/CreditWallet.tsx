"use client";

import React, { useEffect, useState } from "react";
import { Coins, AlertCircle, Loader2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AiCreditWallet, CreditActivity } from "@/lib/ai-studio/server";

interface CreditWalletProps {
  estimate?: number;
  wallet?: AiCreditWallet | null;
  onWalletChange?: (wallet: AiCreditWallet) => void;
}

export function CreditWallet({ estimate, wallet: externalWallet, onWalletChange }: CreditWalletProps) {
  const [internalWallet, setInternalWallet] = useState<AiCreditWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  const wallet = externalWallet !== undefined ? externalWallet : internalWallet;
  const setWallet = (next: AiCreditWallet) => {
    if (externalWallet === undefined) setInternalWallet(next);
    onWalletChange?.(next);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-studio/credits");
      const data = await res.json();
      const next = data.wallet as AiCreditWallet;
      if (externalWallet === undefined) setInternalWallet(next);
      onWalletChange?.(next);
    } catch (err) {
      console.error("Failed to load credits", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalWallet === undefined) load();
  }, [externalWallet]);

  const monthlyRemaining = wallet ? Math.max(0, wallet.monthly.limit - wallet.monthly.used) : 0;
  const addonRemaining = wallet?.addon.remaining ?? 0;
  const total = monthlyRemaining + addonRemaining;
  const low = estimate !== undefined && estimate > 0 && total < estimate;

  const handleBuy = async () => {
    setBuying(true);
    try {
      const res = await fetch("/api/ai-studio/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 50 }),
      });
      const data = await res.json();
      if (res.ok) {
        setWallet(data);
      }
    } catch (err) {
      console.error("Failed to buy credits", err);
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            low
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-purple-200 bg-purple-50 text-purple-700"
          }`}
        >
          {low ? <AlertCircle className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>{total} credits</span>}
          {estimate !== undefined && estimate > 0 && (
            <span className="text-purple-500/80">· {estimate} needed</span>
          )}
        </button>
        <Button
          onClick={handleBuy}
          disabled={buying}
          size="sm"
          className="h-7 rounded-full bg-purple-600 px-3 text-xs hover:bg-purple-700"
        >
          {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buy more"}
        </Button>
      </div>

      {open && wallet && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-lg font-semibold text-gray-900">{total}</span>
              <span className="text-sm text-gray-500">credits</span>
            </div>
            <Button onClick={handleBuy} disabled={buying} size="sm" className="h-7 bg-purple-600 hover:bg-purple-700">
              {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buy more"}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Monthly credits</span>
                <span className="text-gray-900">{wallet.monthly.used} / {wallet.monthly.limit}</span>
              </div>
              <p className="text-xs text-gray-500">Reset each billing cycle</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${Math.min(100, (wallet.monthly.used / wallet.monthly.limit) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{monthlyRemaining} left</p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Add-on credits</span>
                <span className="text-gray-900">{wallet.addon.used} used</span>
              </div>
              <p className="text-xs text-gray-500">Extra credits never expire</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{addonRemaining} left</p>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent activity</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {wallet.recentActivity.length === 0 && (
                <p className="text-xs text-gray-400">No recent activity</p>
              )}
              {wallet.recentActivity.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: CreditActivity }) {
  const isSpend = item.amount < 0;
  const date = new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="flex items-start justify-between text-sm">
      <div>
        <p className="font-medium text-gray-800">{item.description}</p>
        <p className="text-xs text-gray-400">{date}</p>
      </div>
      <span className={`font-medium ${isSpend ? "text-red-600" : "text-green-600"}`}>
        {isSpend ? "" : "+"}{item.amount}
      </span>
    </div>
  );
}
