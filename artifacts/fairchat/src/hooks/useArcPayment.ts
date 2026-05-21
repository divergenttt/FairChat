import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type WalletClient,
  type Address,
  type Hex,
} from "viem";
import { useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { arcChain, wagmiConfig } from "../lib/wagmiConfig";
import { BatchEvmScheme, CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import {
  NETWORKS,
  sanitizeError,
  type NetworkConfig,
  type TokenConfig,
  type Balances,
  type PaymentStep,
} from "../lib/paymentConfig";
import type { WalletResult } from "./useWallet";

const ARC_CFG = CHAIN_CONFIGS["arcTestnet"];
/** Circle x402 standard Arc testnet (5042002). Confidential StableTrust uses useConfidentialPayment + chain 1244. */
const ARC_CHAIN = ARC_CFG.chain;
if (ARC_CHAIN.id !== arcChain.id) {
  console.warn(
    `[useArcPayment] CHAIN_CONFIGS arcTestnet id ${ARC_CHAIN.id} differs from wagmi arcChain ${arcChain.id}`,
  );
}
const GATEWAY_WALLET = ARC_CFG.gatewayWallet;
const USDC_ADDRESS = ARC_CFG.usdc;
const ARC_NETWORK = NETWORKS["arc"];
const ARC_USDC = ARC_NETWORK.tokens["USDC"];

const ERC20_VIEM_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const GATEWAY_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "availableBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdrawableBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdrawingBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdrawalDelay",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "initiateWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
] as const;

function makeViemBatchSigner(walletClient: WalletClient, address: Address) {
  return {
    address,
    signTypedData: async (params: {
      domain: { name: string; version: string; chainId: number; verifyingContract: Address };
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex> => {
      return walletClient.signTypedData({
        account: address,
        domain: params.domain,
        types: params.types as Record<string, { name: string; type: string }[]>,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}

async function estimateGasWithBuffer(
  publicClient: ReturnType<typeof createPublicClient>,
  params: { account: Address; to: Address; data: Hex },
  fallback = 120000n,
): Promise<bigint> {
  try {
    const estimated = await publicClient.estimateGas(params);
    return (estimated * 130n) / 100n;
  } catch {
    return fallback;
  }
}

function buildPaymentRequirements(recipientAddress: string, rawAmount: bigint) {
  return {
    scheme: "exact",
    network: `eip155:${ARC_NETWORK.chainId}`,
    asset: USDC_ADDRESS,
    amount: rawAmount.toString(),
    payTo: recipientAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: GATEWAY_WALLET,
    },
  };
}

async function circleSettle(
  paymentPayload: object,
  paymentRequirements: object,
): Promise<{ txHash: string | null; error: string | null }> {
  try {
    const res = await fetch(apiUrl("/api/payments/arc/settle"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    console.log("[circleSettle] response:", JSON.stringify(data));
    const txField = data.transaction ?? data.transactionHash ?? data.txHash ?? data.hash;
    if (data.success && typeof txField === "string") {
      return { txHash: txField, error: null };
    }
    if (data.errorReason === "self_transfer") {
      return { txHash: null, error: "Cannot send to yourself — the recipient has the same wallet address" };
    }
    if (data.errorReason === "insufficient_balance") {
      return {
        txHash: null,
        error:
          "Circle Gateway sees an insufficient balance for this transfer. " +
          "If you just deposited, wait 5–10 seconds for the indexer and try again. " +
          "Otherwise top up your Gateway balance (deposit more USDC).",
      };
    }
    const circleMsg =
      data.error ?? data.message ?? data.reason ?? data.detail ?? data.errorMessage ?? data.description ?? data.errorReason;
    const rawError =
      typeof circleMsg === "string"
        ? circleMsg
        : `Settlement failed (HTTP ${res.status})`;
    return { txHash: null, error: rawError };
  } catch (e) {
    return {
      txHash: null,
      error: `Settlement request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export interface ArcWithdrawState {
  withdrawableBalance: string;
  withdrawingBalance: string;
  canInitiate: boolean;
  canFinalize: boolean;
}

export interface ArcPaymentHook {
  isAuthenticated: boolean;
  walletAddress: string | null;
  balances: Balances;
  step: PaymentStep;
  txHash: string | null;
  error: string | null;
  network: NetworkConfig;
  token: TokenConfig;
  withdrawState: ArcWithdrawState;
  withdrawInitiatedAt: number | null;
  withdrawDelay: bigint;
  login: () => void;
  logout: () => void;
  sendConfidentialPayment: (
    recipientAddress: string,
    humanAmount: string,
    expectedSenderWallet?: string | null,
  ) => Promise<void>;
  initiateWithdraw: () => Promise<void>;
  finalizeWithdraw: () => Promise<void>;
  fetchBalances: () => Promise<void>;
  reset: () => void;
}

export function useArcPayment(wallet: WalletResult, isActive: boolean): ArcPaymentHook {
  const { switchChainAsync } = useSwitchChain();

  const [step, setStep] = useState<PaymentStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({ public: "0", confidential: "0" });
  const [withdrawState, setWithdrawState] = useState<ArcWithdrawState>({
    withdrawableBalance: "0",
    withdrawingBalance: "0",
    canInitiate: false,
    canFinalize: false,
  });
  const [withdrawDelay, setWithdrawDelay] = useState<bigint>(0n);
  const [withdrawInitiatedAt, setWithdrawInitiatedAt] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const network: NetworkConfig = ARC_NETWORK;
  const token: TokenConfig = ARC_USDC;
  const walletAddress = wallet.address;
  const isAuthenticated = !!walletAddress;

  const publicClient = useMemo(
    () =>
      createPublicClient({
        transport: http(ARC_CFG.rpcUrl ?? ARC_CHAIN.rpcUrls.default.http[0]),
        chain: ARC_CHAIN,
      }),
    [],
  );

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const addr = walletAddress as Address;
      const [walletRaw, gwRaw, withdrawableRaw, withdrawingRaw, delayRaw] = await Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_VIEM_ABI,
          functionName: "balanceOf",
          args: [addr],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "availableBalance",
          args: [USDC_ADDRESS, addr],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "withdrawableBalance",
          args: [USDC_ADDRESS, addr],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "withdrawingBalance",
          args: [USDC_ADDRESS, addr],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "withdrawalDelay",
          args: [],
        }) as Promise<bigint>,
      ]);

      setWithdrawDelay(delayRaw);

      const delayMs = Number(delayRaw) * 1000;
      const canFinalizeNow =
        withdrawableRaw > 0n &&
        (!withdrawInitiatedAt || Date.now() - withdrawInitiatedAt >= delayMs);

      setBalances({
        public: formatUnits(walletRaw, ARC_USDC.decimals),
        confidential: formatUnits(gwRaw, ARC_USDC.decimals),
      });
      setWithdrawState({
        withdrawableBalance: formatUnits(withdrawableRaw, ARC_USDC.decimals),
        withdrawingBalance: formatUnits(withdrawingRaw, ARC_USDC.decimals),
        canInitiate: gwRaw > 0n,
        canFinalize: canFinalizeNow,
      });

      if (withdrawingRaw === 0n && withdrawableRaw === 0n) {
        stopPolling();
      }
    } catch (e) {
      console.error("[useArcPayment] fetchBalances error:", e);
    }
  }, [publicClient, walletAddress, withdrawInitiatedAt, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(() => {
      fetchBalances();
    }, 30_000);
  }, [fetchBalances, stopPolling]);

  useEffect(() => {
    const stored = localStorage.getItem("arc_withdraw_initiated_at");
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts)) setWithdrawInitiatedAt(ts);
    }
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (isActive && walletAddress) fetchBalances();
  }, [isActive, walletAddress, fetchBalances]);

  const getArcWalletClient = useCallback(async (): Promise<WalletClient> => {
    // Standard Arc only (5042002) — never arcStableTrustChain (1244).
    if (switchChainAsync) {
      await switchChainAsync({ chainId: arcChain.id });
    }
    const wc = await getWalletClient(wagmiConfig, { chainId: arcChain.id });
    if (!wc) throw new Error("Wallet client not available — please reconnect");
    return wc;
  }, [switchChainAsync]);

  const sendConfidentialPayment = useCallback(
    async (
      recipientAddress: string,
      humanAmount: string,
      expectedSenderWallet?: string | null,
    ) => {
      if (!walletAddress) {
        setError("Wallet not connected \u2014 please connect your wallet");
        setStep("error");
        return;
      }
      // Defense-in-depth: refuse to send if the wallet currently connected in
      // wagmi is not the wallet the account is bound to on the server. This
      // prevents one account from spending another account's funds when both
      // were used in the same browser.
      if (
        expectedSenderWallet &&
        expectedSenderWallet.toLowerCase() !== walletAddress.toLowerCase()
      ) {
        setError(
          `Connected wallet (${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}) ` +
          `does not match this account's bound wallet ` +
          `(${expectedSenderWallet.slice(0, 6)}…${expectedSenderWallet.slice(-4)}). ` +
          `Reconnect the correct wallet before sending.`,
        );
        setStep("error");
        return;
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipientAddress)) {
        setError("Invalid recipient wallet address");
        setStep("error");
        return;
      }
      const addr = walletAddress as Address;
      setError(null);
      setTxHash(null);
      setStep("initializing");

      try {
        const wc = await getArcWalletClient();

        setStep("checking");
        const rawAmount = parseUnits(humanAmount, ARC_USDC.decimals);

        const gwBalance = (await publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "availableBalance",
          args: [USDC_ADDRESS, addr],
        })) as bigint;

        if (gwBalance < rawAmount) {
          setStep("depositing");
          const shortfall = rawAmount - gwBalance;

          const approveTxHash = await wc.writeContract({
            address: USDC_ADDRESS,
            abi: ERC20_VIEM_ABI,
            functionName: "approve",
            args: [GATEWAY_WALLET, shortfall],
            chain: ARC_CHAIN,
            account: addr,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTxHash, timeout: 90_000 });

          const depositData = encodeFunctionData({
            abi: GATEWAY_ABI,
            functionName: "deposit",
            args: [USDC_ADDRESS, shortfall],
          });
          const depositGas = await estimateGasWithBuffer(publicClient, { account: addr, to: GATEWAY_WALLET, data: depositData });
          const depositTxHash = await wc.sendTransaction({
            to: GATEWAY_WALLET,
            data: depositData,
            gas: depositGas,
            chain: ARC_CHAIN,
            account: addr,
          });
          await publicClient.waitForTransactionReceipt({ hash: depositTxHash, timeout: 90_000 });

          // Circle's x402 facilitator reads from its own indexer that lags behind the chain
          // by a few seconds. Poll Gateway availableBalance up to 15s waiting for the new
          // amount to be reflected, otherwise settle will fail with insufficient_balance.
          const deadline = Date.now() + 15_000;
          while (Date.now() < deadline) {
            const bal = (await publicClient.readContract({
              address: GATEWAY_WALLET,
              abi: GATEWAY_ABI,
              functionName: "availableBalance",
              args: [USDC_ADDRESS, addr],
            })) as bigint;
            if (bal >= rawAmount) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
          // Extra cushion for Circle's off-chain indexer
          await new Promise((r) => setTimeout(r, 3000));
        }

        const finalGwBalance = (await publicClient.readContract({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: "availableBalance",
          args: [USDC_ADDRESS, addr],
        })) as bigint;
        console.log(
          "[Arc send] pre-settle gateway availableBalance:",
          formatUnits(finalGwBalance, ARC_USDC.decimals),
          "USDC, sending:",
          humanAmount,
          "USDC",
        );

        setStep("transferring");
        console.log("[Arc send] from:", addr, "to:", recipientAddress, "amount:", rawAmount.toString());
        const batchSigner = makeViemBatchSigner(wc, addr);
        const batchScheme = new BatchEvmScheme(batchSigner);
        const requirements = buildPaymentRequirements(recipientAddress, rawAmount);
        console.log("[Arc send] paymentRequirements:", JSON.stringify(requirements));

        const innerPayload = await batchScheme.createPaymentPayload(2, requirements);
        const paymentPayload = {
          ...innerPayload,
          resource: {
            url: `${window.location.origin}/api/messages/${encodeURIComponent(recipientAddress)}`,
            description: "FairChat confidential payment",
            mimeType: "application/json",
          },
          accepted: requirements,
        };

        const { txHash: settleTxHash, error: settleError } = await circleSettle(
          paymentPayload,
          requirements,
        );

        if (settleError) throw new Error(settleError);

        setTxHash(settleTxHash);
        setStep("done");
        setTimeout(() => fetchBalances(), 4000);
      } catch (e: unknown) {
        setError(sanitizeError(e));
        setStep("error");
      }
    },
    [publicClient, walletAddress, getArcWalletClient, fetchBalances],
  );

  const initiateWithdraw = useCallback(async () => {
    if (!walletAddress) {
      setError("Wallet not connected");
      setStep("error");
      return;
    }
    const addr = walletAddress as Address;
    setError(null);
    setTxHash(null);
    try {
      setStep("initializing");
      const wc = await getArcWalletClient();

      const gwBal = (await publicClient.readContract({
        address: GATEWAY_WALLET,
        abi: GATEWAY_ABI,
        functionName: "availableBalance",
        args: [USDC_ADDRESS, addr],
      })) as bigint;

      if (gwBal <= 0n) throw new Error("No available balance in Gateway to withdraw");

      setStep("transferring");
      const initiateData = encodeFunctionData({
        abi: GATEWAY_ABI,
        functionName: "initiateWithdrawal",
        args: [USDC_ADDRESS, gwBal],
      });
      const txH = await wc.sendTransaction({
        to: GATEWAY_WALLET,
        data: initiateData,
        gas: 120000n,
        chain: ARC_CHAIN,
        account: addr,
      });
      setTxHash(txH);

      try {
        await publicClient.waitForTransactionReceipt({ hash: txH, timeout: 90_000 });
      } catch (waitErr) {
        console.warn("[Arc] initiate withdraw receipt wait failed:", txH, waitErr);
      }

      const initiatedAt = Date.now();
      setWithdrawInitiatedAt(initiatedAt);
      localStorage.setItem("arc_withdraw_initiated_at", String(initiatedAt));

      setStep("done");

      fetchBalances();
      startPolling();
    } catch (e) {
      setError(sanitizeError(e));
      setStep("error");
    }
  }, [publicClient, walletAddress, getArcWalletClient, fetchBalances, startPolling]);

  const finalizeWithdraw = useCallback(async () => {
    if (!walletAddress) {
      setError("Wallet not connected");
      setStep("error");
      return;
    }
    const addr = walletAddress as Address;
    setError(null);
    setTxHash(null);
    try {
      setStep("transferring");
      const wc = await getArcWalletClient();

      const withdrawData = encodeFunctionData({
        abi: GATEWAY_ABI,
        functionName: "withdraw",
        args: [USDC_ADDRESS],
      });
      const withdrawGas = await estimateGasWithBuffer(publicClient, { account: addr, to: GATEWAY_WALLET, data: withdrawData });
      const txH = await wc.sendTransaction({
        to: GATEWAY_WALLET,
        data: withdrawData,
        gas: withdrawGas,
        chain: ARC_CHAIN,
        account: addr,
      });
      setTxHash(txH);
      try { await publicClient.waitForTransactionReceipt({ hash: txH, timeout: 90_000 }); } catch (waitErr) { console.warn("[Arc] finalize withdraw receipt wait failed:", txH, waitErr); }
      setStep("done");
      setWithdrawInitiatedAt(null);
      localStorage.removeItem("arc_withdraw_initiated_at");
      setTimeout(() => fetchBalances(), 3000);
      stopPolling();
    } catch (e) {
      setError(sanitizeError(e));
      setStep("error");
    }
  }, [publicClient, walletAddress, getArcWalletClient, fetchBalances, stopPolling]);

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setError(null);
  }, []);

  const handleLogin = useCallback(() => {
    wallet.connect().catch((e) => {
      setError(sanitizeError(e));
      setStep("error");
    });
  }, [wallet]);

  const handleLogout = useCallback(() => {
    wallet.disconnect();
    setBalances({ public: "0", confidential: "0" });
    setWithdrawState({
      withdrawableBalance: "0",
      withdrawingBalance: "0",
      canInitiate: false,
      canFinalize: false,
    });
  }, [wallet]);

  return {
    isAuthenticated,
    walletAddress,
    balances,
    step,
    txHash,
    error,
    network,
    token,
    withdrawState,
    withdrawInitiatedAt,
    withdrawDelay,
    login: handleLogin,
    logout: handleLogout,
    sendConfidentialPayment,
    initiateWithdraw,
    finalizeWithdraw,
    fetchBalances,
    reset,
  };
}
