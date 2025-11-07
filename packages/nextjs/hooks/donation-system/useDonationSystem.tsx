"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "../helper";
import { useWagmiEthers } from "../wagmi/useWagmiEthers";
import { ethers } from "ethers";
import type { Contract } from "~~/utils/helper/contract";
import type { AllowedChainIds } from "~~/utils/helper/networks";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useSendTransaction } from "wagmi";
import { parseUnits, formatUnits, parseEther } from "ethers";

// Helper function to retrieve role configuration from localStorage
const getRoleConfig = (): {
  admin?: string;
  protectoras: Record<string, { nombre: string }>;
  donantes: Record<string, { nombre: string }>;
} => {
  const saved = localStorage.getItem("donationSystemRoles");
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<{
        admin?: string;
        protectoras: Record<string, { nombre: string }>;
        donantes: Record<string, { nombre: string }>;
      }>;
      return {
        admin: parsed.admin,
        protectoras: parsed.protectoras || {},
        donantes: parsed.donantes || {},
      };
    } catch (e) {
      return { protectoras: {}, donantes: {} };
    }
  }
  return { protectoras: {}, donantes: {} };
};

// Types
export interface Protectora {
  wallet: string;
  nombre: string;
  activa: boolean;
  fechaRegistro: bigint;
}

export interface Animal {
  id: bigint;
  protectora: string;
  nombre: string;
  especie: string;
  balance: bigint;
  activo: boolean;
  fechaRegistro: bigint;
}

export const useDonationSystem = () => {
  const { chainId, accounts, isConnected, ethersReadonlyProvider, ethersSigner } = useWagmiEthers();
  const allowedChainId = typeof chainId === "number" ? (chainId as AllowedChainIds) : undefined;
  const { data: donationSystem } = useDeployedContractInfo({
    contractName: "DonationSystem",
    chainId: allowedChainId,
  });

  const [message, setMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  type DonationSystemInfo = Contract<"DonationSystem"> & { chainId?: number };

  const hasContract = Boolean(donationSystem?.address && donationSystem?.abi);
  const hasProvider = Boolean(ethersReadonlyProvider);
  const hasSigner = Boolean(ethersSigner);
  const userAddress = accounts?.[0];

  // Load role configuration from localStorage
  const [roleConfig, setRoleConfig] = useState(getRoleConfig());
  
  // Keep configuration in sync across tabs/localStorage updates
  useEffect(() => {
    const handleStorageChange = () => {
      setRoleConfig(getRoleConfig());
    };
    window.addEventListener("storage", handleStorageChange);
    // Periodically check as a fallback in the same tab
    const interval = setInterval(() => {
      setRoleConfig(getRoleConfig());
    }, 1000);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Determine user role based on stored configuration
  const userAddressLower = userAddress?.toLowerCase();
  const isAdminFromConfig = userAddressLower === roleConfig.admin?.toLowerCase();
  const protectoraConfigData = userAddressLower
    ? roleConfig.protectoras[userAddressLower]
    : undefined;
  const isProtectoraFromConfig = Boolean(protectoraConfigData);
  const donanteConfigData = userAddressLower
    ? roleConfig.donantes?.[userAddressLower]
    : undefined;
  const isDonanteFromConfig = Boolean(donanteConfigData);

  // Read admin status from contract (if available)
  const { data: isAdminFromContract, refetch: refetchIsAdmin } = useReadContract({
    address: (hasContract ? (donationSystem!.address as unknown as `0x${string}`) : undefined) as
      | `0x${string}`
      | undefined,
    abi: (hasContract ? ((donationSystem as DonationSystemInfo).abi as any) : undefined) as any,
    functionName: "esAdmin",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(hasContract && hasProvider && userAddress),
    },
  });

  // Read shelter status from contract (if available)
  const { data: isProtectoraFromContract, refetch: refetchIsProtectora } = useReadContract({
    address: (hasContract ? (donationSystem!.address as unknown as `0x${string}`) : undefined) as
      | `0x${string}`
      | undefined,
    abi: (hasContract ? ((donationSystem as DonationSystemInfo).abi as any) : undefined) as any,
    functionName: "esProtectora",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(hasContract && hasProvider && userAddress),
    },
  });

  // Prefer on-chain role flags; fallback to local configuration
  const isAdmin = hasContract ? Boolean(isAdminFromContract) : isAdminFromConfig;
  const isProtectora = hasContract ? Boolean(isProtectoraFromContract) : isProtectoraFromConfig;
  const isDonante = !isAdmin && !isProtectora && isDonanteFromConfig;

  // Read donation pool value
  const { data: poolDonacionesFromContract, refetch: refetchPool } = useReadContract({
    address: (hasContract ? (donationSystem!.address as unknown as `0x${string}`) : undefined) as
      | `0x${string}`
      | undefined,
    abi: (hasContract ? ((donationSystem as DonationSystemInfo).abi as any) : undefined) as any,
    functionName: "obtenerPoolDonaciones",
    query: {
      enabled: Boolean(hasContract && hasProvider),
    },
  });

  // Simulated pools for development when no contract is present
  // Pools by shelter: { address: pool }
  const [simulatedPools, setSimulatedPools] = useState<Record<string, string>>({});
  const useSimulation = !hasContract; // Only simulate when there is no deployed contract
  
  // Retrieve donation pool for the current shelter (if any) or overall pool
  const poolDonaciones = useSimulation
    ? (isProtectora && userAddress
        ? simulatedPools[userAddress.toLowerCase()] || "0"
        : "0")
    : poolDonacionesFromContract
      ? formatUnits(poolDonacionesFromContract, 6) // USDC tiene 6 decimales
      : "0";

  // Build shelter list from configuration
  const listaProtectoras = useMemo(() => {
    return Object.entries(roleConfig.protectoras).map(([address, info]) => ({
      address,
      nombre: info.nombre,
    }));
  }, [roleConfig.protectoras]);

  const listaDonantes = useMemo(() => {
    return Object.entries(roleConfig.donantes || {}).map(([address, info]) => ({
      address,
      nombre: info.nombre,
    }));
  }, [roleConfig.donantes]);

  // Read shelter info from contract
  const { data: protectoraInfoFromContract, refetch: refetchProtectoraInfo } = useReadContract({
    address: (hasContract ? (donationSystem!.address as unknown as `0x${string}`) : undefined) as
      | `0x${string}`
      | undefined,
    abi: (hasContract ? ((donationSystem as DonationSystemInfo).abi as any) : undefined) as any,
    functionName: "obtenerProtectora",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(hasContract && hasProvider && userAddress && isProtectoraFromContract),
    },
  });

  // Combine simulation/contract shelter info
  const protectoraInfoFromConfig: Protectora | undefined =
    useSimulation && isProtectora && protectoraConfigData
      ? {
          wallet: userAddress || "",
          nombre: protectoraConfigData.nombre,
          activa: true,
          fechaRegistro: BigInt(Date.now()),
        }
      : undefined;

  const protectoraInfo = useSimulation
    ? protectoraInfoFromConfig
    : (protectoraInfoFromContract as Protectora | undefined);

  // Read animal IDs for the shelter
  const { data: animalesIdsFromContract, refetch: refetchAnimalesIds } = useReadContract({
    address: (hasContract ? (donationSystem!.address as unknown as `0x${string}`) : undefined) as
      | `0x${string}`
      | undefined,
    abi: (hasContract ? ((donationSystem as DonationSystemInfo).abi as any) : undefined) as any,
    functionName: "obtenerAnimalesPorProtectora",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(hasContract && hasProvider && userAddress && isProtectoraFromContract),
    },
  });

  // Simulated animals for development
  const [simulatedAnimalesIds, setSimulatedAnimalesIds] = useState<bigint[]>([]);
  const [simulatedAnimales, setSimulatedAnimales] = useState<Map<bigint, Animal>>(new Map());
  const animalesIds = useSimulation ? simulatedAnimalesIds : ((animalesIdsFromContract as bigint[]) || []);

  // Write contract hook helpers
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  const { sendTransactionAsync } = useSendTransaction();

  useEffect(() => {
    if (isConfirmed) {
      setMessage("Transaction confirmed successfully!");
      refetchIsAdmin();
      refetchIsProtectora();
      refetchPool();
      refetchProtectoraInfo();
      refetchAnimalesIds();
      setIsProcessing(false);
    }
  }, [isConfirmed, refetchIsAdmin, refetchIsProtectora, refetchPool, refetchProtectoraInfo, refetchAnimalesIds]);

  useEffect(() => {
    if (error) {
      setMessage(`Error: ${error.message}`);
      setIsProcessing(false);
    }
  }, [error]);

  // Write functions
  const agregarProtectora = useCallback(
    async (protectoraAddress: string, nombre: string) => {
      if (!hasContract || !userAddress) {
        setMessage("Contract unavailable or wallet not connected");
        return;
      }
      if (!protectoraAddress || !nombre) {
        setMessage("Please complete all fields");
        return;
      }
      setIsProcessing(true);
      setMessage("Adding shelter...");
      try {
        writeContract({
          address: donationSystem!.address as `0x${string}`,
          abi: (donationSystem as DonationSystemInfo).abi as any,
          functionName: "agregarProtectora",
          args: [protectoraAddress as `0x${string}`, nombre],
        });
      } catch (e) {
        setMessage(`Failed to add shelter: ${e instanceof Error ? e.message : String(e)}`);
        setIsProcessing(false);
      }
    },
    [hasContract, userAddress, donationSystem, writeContract],
  );

  const agregarAnimal = useCallback(
    async (nombre: string, especie: string) => {
      if (!userAddress) {
        setMessage("Wallet not connected");
        return;
      }
      if (!nombre || !especie) {
        setMessage("Please complete all fields");
        return;
      }

      // Simulation mode
      if (useSimulation) {
        setIsProcessing(true);
        setMessage("Adding pet (simulation mode)...");
        setTimeout(() => {
          const newId = BigInt(simulatedAnimalesIds.length);
          const newAnimal: Animal = {
            id: newId,
            protectora: userAddress || "",
            nombre,
            especie,
            balance: BigInt(0),
            activo: true,
            fechaRegistro: BigInt(Date.now()),
          };
          setSimulatedAnimalesIds([...simulatedAnimalesIds, newId]);
          setSimulatedAnimales(new Map(simulatedAnimales).set(newId, newAnimal));
          setMessage("Pet added successfully (simulation)!");
          setIsProcessing(false);
        }, 1000);
        return;
      }

      // Contract mode
      if (!hasContract) {
        setMessage("Contract unavailable");
        return;
      }
      setIsProcessing(true);
      setMessage("Adding pet...");
      try {
        writeContract({
          address: donationSystem!.address as `0x${string}`,
          abi: (donationSystem as DonationSystemInfo).abi as any,
          functionName: "agregarAnimal",
          args: [nombre, especie],
        });
      } catch (e) {
        setMessage(`Failed to add pet: ${e instanceof Error ? e.message : String(e)}`);
        setIsProcessing(false);
      }
    },
    [hasContract, userAddress, donationSystem, writeContract, useSimulation, simulatedAnimalesIds, simulatedAnimales],
  );

  const donar = useCallback(
    async (cantidad: string, protectoraAddress?: string) => {
      if (!userAddress) {
        setMessage("Wallet not connected");
        return;
      }
      if (!cantidad || parseFloat(cantidad) <= 0) {
        setMessage("Please enter a valid amount");
        return;
      }
      if (!protectoraAddress) {
        setMessage("Please select a shelter");
        return;
      }

      // No contract deployed: send native tokens directly to shelter
      if (useSimulation) {
        if (!ethersSigner || !sendTransactionAsync) {
          setMessage("Provider not available to send transaction");
          return;
        }
        try {
          setIsProcessing(true);
          setMessage("Sending donation from your wallet...");
          const value = parseEther(cantidad);
          await sendTransactionAsync({
            to: protectoraAddress as `0x${string}`,
            value,
          });
          setMessage(`Donation of ${cantidad} ETH sent successfully.`);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          setMessage(`Failed to donate: ${errorMsg}`);
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      // Contract mode
      if (!hasContract) {
        setMessage("Contract unavailable");
        return;
      }
      setIsProcessing(true);
      setMessage("Processing donation...");
      try {
        const amount = parseUnits(cantidad, 6); // USDC tiene 6 decimales
        writeContract({
          address: donationSystem!.address as `0x${string}`,
          abi: (donationSystem as DonationSystemInfo).abi as any,
          functionName: "donar",
          args: [protectoraAddress as `0x${string}`],
          value: amount,
        });
      } catch (e) {
        setMessage(`Failed to donate: ${e instanceof Error ? e.message : String(e)}`);
        setIsProcessing(false);
      }
    },
    [hasContract, userAddress, donationSystem, writeContract, useSimulation, ethersSigner, sendTransactionAsync],
  );

  const retirarDelPool = useCallback(
    async (cantidad: string, destino: "wallet" | "gastar", direccionDestino?: string) => {
      if (!userAddress) {
        setMessage("Wallet not connected");
        return;
      }
      if (!cantidad || parseFloat(cantidad) <= 0) {
        setMessage("Please enter a valid amount");
        return;
      }
      if (destino === "wallet" && !direccionDestino) {
        setMessage("Please enter the destination address");
        return;
      }

      // Simulation mode
      if (useSimulation) {
        setIsProcessing(true);
        const actionLabel = destino === "wallet" ? "Withdrawing to wallet" : "Marking as spent";
        setMessage(`${actionLabel} (simulation mode)...`);
        setTimeout(() => {
          const cantidadNum = parseFloat(cantidad);
          const protectoraAddrLower = userAddress?.toLowerCase() || "";
          const currentPool = parseFloat(simulatedPools[protectoraAddrLower] || "0");
          if (cantidadNum > currentPool) {
            setMessage("Insufficient funds in pool (simulation)");
            setIsProcessing(false);
            return;
          }

          // Update shelter pool (deduct amount)
          const newPool = currentPool - cantidadNum;
          setSimulatedPools({
            ...simulatedPools,
            [protectoraAddrLower]: newPool.toFixed(6),
          });

          const successMessage =
            destino === "wallet"
              ? `${cantidad} USDC withdrawn to ${direccionDestino?.slice(0, 6)}...${direccionDestino?.slice(-4)} (simulation)`
              : `${cantidad} USDC marked as spent (simulation)`;
          setMessage(successMessage);
          setIsProcessing(false);
        }, 1000);
        return;
      }

      // Contract mode
      if (!hasContract) {
        setMessage("Contract unavailable");
        return;
      }
      setIsProcessing(true);
      const actionLabel = destino === "wallet" ? "Withdrawing to wallet" : "Marking as spent";
      setMessage(`${actionLabel}...`);
      try {
        const amount = parseUnits(cantidad, 6); // USDC tiene 6 decimales
        writeContract({
          address: donationSystem!.address as `0x${string}`,
          abi: (donationSystem as DonationSystemInfo).abi as any,
          functionName: destino === "wallet" ? "retirarAWallet" : "marcarComoGastado",
          args: destino === "wallet" ? [direccionDestino as `0x${string}`, amount] : [amount],
        });
      } catch (e) {
        setMessage(`Failed to withdraw: ${e instanceof Error ? e.message : String(e)}`);
        setIsProcessing(false);
      }
    },
    [hasContract, userAddress, donationSystem, writeContract, useSimulation, simulatedPools],
  );

  // Helper to fetch animal info
  const obtenerAnimal = useCallback(
    async (animalId: bigint): Promise<Animal | null> => {
      // Simulation mode
      if (useSimulation) {
        return simulatedAnimales.get(animalId) || null;
      }

      // Contract mode
      if (!hasContract || !hasProvider) return null;
      try {
        const contract = new ethers.Contract(
          donationSystem!.address,
          (donationSystem as DonationSystemInfo).abi,
          ethersReadonlyProvider!,
        );
        const animal = await contract.obtenerAnimal(animalId);
        return {
          id: animal.id,
          protectora: animal.protectora,
          nombre: animal.nombre,
          especie: animal.especie,
          balance: animal.balance,
          activo: animal.activo,
          fechaRegistro: animal.fechaRegistro,
        };
      } catch (e) {
        console.error("Failed to fetch animal:", e);
        return null;
      }
    },
    [hasContract, hasProvider, donationSystem, ethersReadonlyProvider, useSimulation, simulatedAnimales],
  );

  const donarRecurrente = useCallback(
    async (cantidad: string, frecuencia: "daily" | "weekly" | "monthly", numeroVeces: number, protectoraAddress?: string) => {
      if (!userAddress) {
        setMessage("Wallet not connected");
        return;
      }
      if (!cantidad || parseFloat(cantidad) <= 0) {
        setMessage("Please enter a valid amount");
        return;
      }
      if (numeroVeces <= 0 || numeroVeces > 100) {
        setMessage("The number of occurrences must be between 1 and 100");
        return;
      }
      if (!protectoraAddress) {
        setMessage("Please select a shelter");
        return;
      }

      // Simulation mode
      if (useSimulation) {
        setIsProcessing(true);
        setMessage(`Setting up ${frecuencia} recurring donation (simulation mode)...`);
        setTimeout(() => {
          const cantidadTotal = parseFloat(cantidad) * numeroVeces;
          const protectoraAddrLower = protectoraAddress.toLowerCase();
          const currentPool = parseFloat(simulatedPools[protectoraAddrLower] || "0");
          const newPool = currentPool + cantidadTotal;
          setSimulatedPools({
            ...simulatedPools,
            [protectoraAddrLower]: newPool.toFixed(6),
          });
          setMessage(
            `Recurring donation scheduled: ${cantidad} USDC ${frecuencia} for ${numeroVeces} occurrences (Total: ${cantidadTotal.toFixed(2)} USDC) - Simulation`
          );
          setIsProcessing(false);
        }, 1500);
        return;
      }

      // Contract mode
      if (!hasContract) {
        setMessage("Contract unavailable");
        return;
      }
      setIsProcessing(true);
      setMessage(`Configuring ${frecuencia} recurring donation...`);
      try {
        // NOTE: the on-chain contract must support recurring donations.
        // For now we assume the first donation is executed immediately.
        const amount = parseUnits(cantidad, 6); // USDC has 6 decimals
        writeContract({
          address: donationSystem!.address as `0x${string}`,
          abi: (donationSystem as DonationSystemInfo).abi as any,
          functionName: "donarRecurrente",
          args: [protectoraAddress as `0x${string}`, amount, frecuencia, numeroVeces],
        });
      } catch (e) {
        setMessage(`Failed to configure recurring donation: ${e instanceof Error ? e.message : String(e)}`);
        setIsProcessing(false);
      }
    },
    [hasContract, userAddress, donationSystem, writeContract, useSimulation, simulatedPools],
  );

  return {
    // State
    contractAddress: donationSystem?.address,
    isAdmin: Boolean(isAdmin),
    isProtectora: Boolean(isProtectora),
    isDonante: Boolean(isDonante),
    poolDonaciones,
    protectoraInfo: protectoraInfo as Protectora | undefined,
    animalesIds: (animalesIds as bigint[]) || [],
    listaProtectoras,
    listaDonantes,
    message,
    isProcessing: isProcessing || isPending || isConfirming,
    isConnected,
    userAddress,
    // Functions
    agregarProtectora,
    agregarAnimal,
    donar,
    donarRecurrente,
    retirarDelPool,
    obtenerAnimal,
    refetchPool,
    refetchAnimalesIds,
  };
};

