import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ethers } from "ethers";
import { useSwitchChain } from "wagmi";
import { ConfidentialTransferClient } from "@fairblock/stabletrust";
import {
  NETWORKS,
  BALANCE_OF_SELECTOR,
  rpcCall,
  sanitizeError,
  type Balances,
  type PaymentStep,
} from "../lib/paymentConfig";
import { arcStableTrustChain } from "../lib/wagmiConfig";
import { idbGet, idbSet, idbDel, IDB_KEYS } from "../lib/idb";
import type { WalletResult } from "./useWallet";

const ARC_CONFIDENTIAL_NETWORK_ID = "arc-confidential";

export interface ConfidentialPaymentHook {
  isAuthenticated: boolean;
  walletAddress: string | null;
  balances: Balances;
  step: PaymentStep;
  txHash: string | null;
  error: string | null;
  login: () => void;
  logout: () => void;
  sendConfidentialPayment: (recipientAddress: string, humanAmount: string) => Promise<void>;
  fetchBalances: () => Promise<void>;
  reset: () => void;
}

export function useConfidentialPayment(
  wallet: WalletResult,
  networkId: string,
  tokenSymbol: string,
  isActive: boolean,
): ConfidentialPaymentHook {
  const [step, setStep] = useState<PaymentStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({ public: "0", confidential: "0" });
  const [userKeys, setUserKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);

  const network = NETWORKS[networkId] ?? NETWORKS["base-sepolia"];
  const token = network.tokens[tokenSymbol] ?? network.tokens["USDC"];
  const isArcConfidential = networkId === ARC_CONFIDENTIAL_NETWORK_ID;
  const { switchChainAsync } = useSwitchChain();

  const client = useMemo(() => {
    if (!isActive) return null;
    if (isArcConfidential && network.chainId !== arcStableTrustChain.id) {
      console.error(
        `[useConfidentialPayment] arc-confidential must use chain ${arcStableTrustChain.id}, got ${network.chainId}`,
      );
    }
    return new ConfidentialTransferClient(network.rpcUrl, network.chainId);
  }, [isActive, isArcConfidential, network.rpcUrl, network.chainId]);

  const ensureConfidentialArcChain = useCallback(async () => {
    if (!isArcConfidential || !switchChainAsync) return;
    await switchChainAsync({ chainId: arcStableTrustChain.id });
  }, [isArcConfidential, switchChainAsync]);

  const isAuthenticated = !!wallet.address;
  const walletAddress = wallet.address;
  const signer = wallet.signer;
  const keysLoadedRef = useRef(false);

  const idbKey = walletAddress ? `conf_${networkId}_${walletAddress.toLowerCase()}` : null;

  useEffect(() => {
    keysLoadedRef.current = false;
    setUserKeys(null);
    setBalances({ public: "0", confidential: "0" });
    if (!idbKey) return;
    (async () => {
      const stored = await idbGet<{ publicKey: string; privateKey: string }>(IDB_KEYS, idbKey);
      if (stored) { setUserKeys(stored); keysLoadedRef.current = true; }
    })();
  }, [networkId, idbKey]);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress || token.comingSoon) return;
    try {
      const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
      const calldata = BALANCE_OF_SELECTOR + paddedAddr;
      const result = await rpcCall(network.rpcUrl, token.address, calldata);
      const bal = BigInt(result);
      const pub = ethers.formatUnits(bal, token.decimals);

      if (userKeys && client) {
        try {
          const confBal = await client.getConfidentialBalance(
            walletAddress,
            userKeys.privateKey,
            token.address,
          );
          setBalances({
            public: pub,
            confidential: ethers.formatUnits(confBal.amount, token.decimals),
          });
        } catch {
          setBalances({ public: pub, confidential: "0" });
        }
      } else {
        setBalances((prev) => ({ ...prev, public: pub }));
      }
    } catch {}
  }, [client, walletAddress, token, userKeys, network.rpcUrl]);

  useEffect(() => {
    if (!isActive || !walletAddress) return;
    fetchBalances();
  }, [isActive, walletAddress, fetchBalances]);

  const sendConfidentialPayment = useCallback(
    async (recipientAddress: string, humanAmount: string) => {
      if (!client || !signer) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }
      setError(null);
      setTxHash(null);
      try {
        await ensureConfidentialArcChain();
        setStep("initializing");
        const keys = await client.ensureAccount(signer);
        setUserKeys(keys);
        if (idbKey) idbSet(IDB_KEYS, idbKey, keys).catch(() => {});

        const rawAmount = ethers.parseUnits(humanAmount, token.decimals);

        // Recovery: if a previous run already deposited (but failed before
        // transferring), reuse those confidential funds and only top up the shortfall.
        let confBalance = BigInt(0);
        try {
          const existing = await client.getConfidentialBalance(
            await signer.getAddress(),
            keys.privateKey,
            token.address,
          );
          confBalance = BigInt(existing.amount);
        } catch {}

        if (confBalance < rawAmount) {
          setStep("depositing");
          const shortfall = rawAmount - confBalance;
          await client.confidentialDeposit(signer, token.address, shortfall);
        }

        setStep("transferring");
        if (rawAmount > BigInt(Number.MAX_SAFE_INTEGER))
          throw new Error("Amount too large \u2014 exceeds safe integer range");
        const receipt = (await client.confidentialTransfer(
          signer,
          recipientAddress,
          token.address,
          Number(rawAmount),
        )) as { hash?: string } | undefined;

        setTxHash(receipt?.hash ?? null);
        setStep("done");
        setTimeout(() => fetchBalances(), 3000);
      } catch (e) {
        setError(sanitizeError(e));
        setStep("error");
      }
    },
    [client, signer, token, fetchBalances, ensureConfidentialArcChain],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setError(null);
  }, []);

  const login = useCallback(() => {
    wallet.connect().catch((e) => {
      setError(sanitizeError(e));
      setStep("error");
    });
  }, [wallet]);

  const logout = useCallback(() => {
    wallet.disconnect();
    setUserKeys(null);
    setBalances({ public: "0", confidential: "0" });
    if (idbKey) idbDel(IDB_KEYS, idbKey).catch(() => {});
  }, [wallet, idbKey]);

  return {
    isAuthenticated: !!isAuthenticated,
    walletAddress,
    balances,
    step,
    txHash,
    error,
    login,
    logout,
    sendConfidentialPayment,
    fetchBalances,
    reset,
  };
}
