"use client";

import React, { useEffect, useState } from "react";
import { Coins, AlertCircle, Loader2, Zap, CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiCreditWallet, CreditActivity } from "@/lib/ai-studio/server";

const CREDITS_PER_DOLLAR = 10;
const MIN_CREDITS = 10;
const MAX_CREDITS = 10000;

interface CreditWalletProps {
  estimate?: number;
  wallet?: AiCreditWallet | null;
  onWalletChange?: (wallet: AiCreditWallet) => void;
}

export function CreditWallet({ estimate, wallet: externalWallet, onWalletChange }: CreditWalletProps) {
  const [internalWallet, setInternalWallet] = useState<AiCreditWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  // Purchase form state
  const [creditAmount, setCreditAmount] = useState(50);
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'paystack'>('stripe');

  const wallet = externalWallet !== undefined ? externalWallet : internalWallet;

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
    if (creditAmount < MIN_CREDITS) return;
    setBuying(true);
    try {
      const res = await fetch("/api/billing/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: creditAmount, paymentProvider }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        // Redirect to Stripe or Paystack checkout
        window.location.href = data.url;
      } else {
        console.error("Failed to create purchase:", data.error);
      }
    } catch (err) {
      console.error("Failed to buy credits", err);
    } finally {
      setBuying(false);
    }
  };

  const creditPrice = Math.round((creditAmount / CREDITS_PER_DOLLAR) * 100) / 100;

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
          onClick={() => setBuyModalOpen(true)}
          size="sm"
          className="h-7 rounded-full bg-purple-600 px-3 text-xs hover:bg-purple-700"
        >
          Buy more
        </Button>
      </div>

      {/* Wallet dropdown */}
      {open && wallet && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-lg font-semibold text-gray-900">{total}</span>
              <span className="text-sm text-gray-500">credits</span>
            </div>
            <Button onClick={() => setBuyModalOpen(true)} size="sm" className="h-7 bg-purple-600 hover:bg-purple-700">
              Buy more
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

      {/* Buy Credits Modal */}
      <Dialog open={buyModalOpen} onOpenChange={setBuyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buy AI Credits</DialogTitle>
            <DialogDescription>
              Purchase additional credits for AI Studio content generation. Credits never expire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Credit amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Credit amount</label>
              <Input
                type="number"
                min={MIN_CREDITS}
                max={MAX_CREDITS}
                step={10}
                value={creditAmount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setCreditAmount(Math.max(MIN_CREDITS, Math.min(MAX_CREDITS, val)));
                }}
                className="text-center text-lg font-semibold"
              />
              <div className="flex gap-1">
                {[50, 100, 250, 500, 1000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCreditAmount(amount)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      creditAmount === amount
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment provider */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Payment method</label>
              <Select
                value={paymentProvider}
                onValueChange={(v) => setPaymentProvider(v as 'stripe' | 'paystack')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Card (Stripe)
                    </span>
                  </SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Price summary */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{creditAmount} credits</span>
                <span className="text-lg font-bold text-gray-900">${creditPrice.toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{CREDITS_PER_DOLLAR} credits per $1</p>
            </div>

            <Button
              onClick={handleBuy}
              disabled={buying || creditAmount < MIN_CREDITS}
              className="h-11 w-full rounded-xl bg-purple-600 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
            >
              {buying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Buy {creditAmount} credits — ${creditPrice.toFixed(2)}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
