import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  NETWORKS,
  ERC20_ABI,
  BALANCE_OF_SELECTOR,
  rpcCall,
  sanitizeError,
  type Balances,
  type PaymentStep,
} from "../lib/paymentConfig";
import type { WalletResult } from "./useWallet";

export interface StandardPaymentHook {
  isAuthenticated: boolean;
  walletAddress: string | null;
  balances: Balances;
  step: PaymentStep;
  txHash: string | null;
  error: string | null;
  login: () => void;
  logout: () => void;
  sendPayment: (recipientAddress: string, humanAmount: string) => Promise<void>;
  fetchBalances: () => Promise<void>;
  reset: () => void;
}

export function useStandardPayment(
  wallet: WalletResult,
  networkId: string,
  tokenSymbol: string,
  isActive: boolean,
): StandardPaymentHook {
  const [step, setStep] = useState<PaymentStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({ public: "0", confidential: "0" });

  const network = NETWORKS[networkId] ?? NETWORKS["base-sepolia"];
  const token = network.tokens[tokenSymbol] ?? network.tokens["USDC"];

  const isAuthenticated = !!wallet.address;
  const walletAddress = wallet.address;
  const signer = wallet.signer;

  useEffect(() => {
    setBalances({ public: "0", confidential: "0" });
  }, [networkId]);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress || token.comingSoon) return;
    try {
      const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
      const calldata = BALANCE_OF_SELECTOR + paddedAddr;
      const result = await rpcCall(network.rpcUrl, token.address, calldata);
      const bal = BigInt(result);
      const formatted = ethers.formatUnits(bal, token.decimals);
      setBalances({ public: formatted, confidential: formatted });
    } catch (e) {
      console.error("[StandardPayment] fetchBalances failed:", e instanceof Error ? e.message : e);
    }
  }, [walletAddress, token, network.rpcUrl]);

  const fetchWithRetry = useCallback(async (attempt = 0, maxAttempts = 5) => {
    try {
      await fetchBalances();
    } catch {
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        setTimeout(() => fetchWithRetry(attempt + 1, maxAttempts), delay);
      }
    }
  }, [fetchBalances]);

  useEffect(() => {
    if (isActive && isAuthenticated && walletAddress) fetchWithRetry();
  }, [isActive, isAuthenticated, walletAddress, fetchWithRetry]);

  const login = useCallback(() => {
    wallet.connect().catch((e) => {
      setError(sanitizeError(e));
      setStep("error");
    });
  }, [wallet]);

  const logout = useCallback(() => {
    wallet.disconnect();
    setBalances({ public: "0", confidential: "0" });
  }, [wallet]);

  const sendPayment = useCallback(
    async (recipientAddress: string, humanAmount: string) => {
      if (!signer) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }
      setError(null);
      setTxHash(null);
      try {
        setStep("transferring");
        const rawAmount = ethers.parseUnits(humanAmount, token.decimals);
        const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
        const tx = await contract.transfer(recipientAddress, rawAmount);
        setTxHash(tx.hash);
        try {
          const receipt = await tx.wait();
          if (receipt?.hash) setTxHash(receipt.hash);
        } catch (waitErr) {
          console.warn("[StandardPayment] tx.wait() failed but tx was sent:", tx.hash, waitErr);
        }
        setStep("done");
        setTimeout(() => fetchWithRetry(), 3000);
      } catch (e) {
        setError(sanitizeError(e));
        setStep("error");
      }
    },
    [signer, token, fetchWithRetry],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setError(null);
  }, []);

  return {
    isAuthenticated,
    walletAddress,
    balances,
    step,
    txHash,
    error,
    login,
    logout,
    sendPayment,
    fetchBalances,
    reset,
  };
}
