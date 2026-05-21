import { apiUrl } from "@/lib/apiConfig";
export interface NetworkConfig {
  id: string;
  chainId: number;
  name: string;
  badge: string;
  rpcUrl: string;
  explorerUrl: string;
  comingSoon?: boolean;
  hidden?: boolean;
  tokens: Record<string, TokenConfig>;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  comingSoon?: boolean;
}

export interface Balances {
  public: string;
  confidential: string;
}

export type PaymentStep =
  | "idle"
  | "checking"
  | "initializing"
  | "depositing"
  | "transferring"
  | "done"
  | "error";

export const NETWORKS: Record<string, NetworkConfig> = {
  "base-sepolia": {
    id: "base-sepolia",
    chainId: 84532,
    name: "Base",
    badge: "Sepolia",
    rpcUrl: "https://base-sepolia.drpc.org",
    explorerUrl: "https://base-sepolia.blockscout.com",
    tokens: {
      USDC: { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    },
  },
  arc: {
    id: "arc",
    chainId: 5042002,
    name: "Arc",
    badge: "Testnet",
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    tokens: {
      USDC: { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
    },
  },
  "arc-confidential": {
    id: "arc-confidential",
    chainId: 1244,
    name: "Arc",
    badge: "Confidential",
    rpcUrl: "https://rpc.arc.xyz",
    explorerUrl: "https://arcscan.app",
    hidden: true,
    tokens: {
      USDC: { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
    },
  },
  stable: {
    id: "stable",
    chainId: 2201,
    name: "Stable",
    badge: "Testnet",
    rpcUrl: "https://rpc.testnet.stable.xyz",
    explorerUrl: "https://testnet.stablescan.xyz",
    tokens: {
      USDC: { symbol: "USDC", address: "0x78Cf24370174180738C5B8E352B6D14c83a6c9A9", decimals: 6 },
    },
  },
  arbitrum: {
    id: "arbitrum",
    chainId: 421614,
    name: "Arbitrum",
    badge: "Sepolia",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    tokens: {
      USDC: { symbol: "USDC", address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", decimals: 6 },
    },
  },
  ethereum: {
    id: "ethereum",
    chainId: 11155111,
    name: "Ethereum",
    badge: "Sepolia",
    rpcUrl: "https://sepolia.drpc.org",
    explorerUrl: "https://sepolia.etherscan.io",
    tokens: {
      USDC: { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
    },
  },
  tempo: {
    id: "tempo",
    chainId: 42431,
    name: "Tempo",
    badge: "Testnet",
    rpcUrl: "https://rpc.tempo.xyz",
    explorerUrl: "https://explorer.tempo.xyz",
    comingSoon: true,
    tokens: {
      USDC: { symbol: "USDC", address: "0x20c0000000000000000000000000000000000000", decimals: 6 },
    },
  },
};

export const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

export const BALANCE_OF_SELECTOR = "0x70a08231";

export async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(apiUrl("/api/rpc-proxy"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rpcUrl, to, data }),
  });
  const json = await res.json();
  if (json.error)
    throw new Error(typeof json.error === "string" ? json.error : json.error.message ?? "RPC error");
  return json.result ?? "0x0";
}

export { sanitizeError } from "./paymentUtils";
