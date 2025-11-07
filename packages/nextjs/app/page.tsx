"use client";

import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { AdminPanel } from "./_components/AdminPanel";
import { ProtectoraPanel } from "./_components/ProtectoraPanel";
import { DonationPool } from "./_components/DonationPool";
import { DonorPanel } from "./_components/DonorPanel";
import { RoleConfig } from "./_components/RoleConfig";
import { useDonationSystem } from "~~/hooks/donation-system/useDonationSystem";

export default function Home() {
  const { isConnected } = useAccount();
  const { isAdmin, isProtectora, isDonante } = useDonationSystem();

  if (!isConnected) {
    return (
      <div className="w-full px-3 md:px-0 flex flex-col items-center">
        <div className="max-w-5xl w-full p-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFD208] via-[#FFE883] to-[#FFF9D1] border border-[#F6D75A] shadow-xl">
            <div className="absolute -top-10 -right-12 h-32 w-32 rounded-full bg-white/30" />
            <div className="absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-white/15" />
            <div className="relative px-8 py-12 text-[#2D2D2D]">
              <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-full border border-white/60 shadow-sm text-sm font-semibold font-arcade text-[11px]">
                <span className="text-lg">✨</span>
                Welcome to RescueDAO
              </div>
              <h1 className="mt-5 text-4xl md:text-[44px] font-extrabold tracking-tight">Connect your wallet to continue</h1>
              <p className="mt-3 max-w-2xl text-base sm:text-lg text-[#3F3F3F]">
                Once connected, we detect your role and unlock the corresponding dashboard: admin, shelter or donor.
              </p>
              <div className="mt-6 inline-flex items-center gap-4 flex-wrap text-xs text-[#2D2D2D] font-semibold">
                <span className="inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-full border border-white/60 shadow-sm font-arcade">
                  🔒 Non-custodial
                </span>
                <span className="inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-full border border-white/60 shadow-sm font-arcade">
                  🛠️ Built for Sepolia
                </span>
                <span className="inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-full border border-white/60 shadow-sm font-arcade">
                  🐾 Shelter first
                </span>
              </div>
              <div className="mt-8">
                <RainbowKitCustomConnectButton />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 items-center sm:items-start w-full px-3 md:px-0">
      {/* Panel según rol */}
      {isAdmin ? (
        <div className="w-full">
          <AdminPanel />
        </div>
      ) : isProtectora ? (
        <div className="w-full">
          <ProtectoraPanel />
        </div>
      ) : isDonante ? (
        <div className="w-full">
          <DonorPanel />
        </div>
      ) : (
        /* Panel público de donaciones para usuarios sin rol asignado */
        <div className="w-full">
          <DonationPool />
        </div>
      )}

      {/* Configuración de Roles */}
      <RoleConfig />
    </div>
  );
}
