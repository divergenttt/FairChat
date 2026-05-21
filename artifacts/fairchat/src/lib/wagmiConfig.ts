import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { baseSepolia, arbitrumSepolia, sepolia } from "viem/chains";

const arcChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

/** StableTrust / FairBlock confidential Arc — separate from standard x402 Arc (5042002). */
const arcStableTrustChain = defineChain({
  id: 1244,
  name: "Arc",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arc.xyz"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://arcscan.app" } },
});

const stableChain = defineChain({
  id: 2201,
  name: "Stable Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.stable.xyz"] } },
  blockExplorers: { default: { name: "StableScan", url: "https://testnet.stablescan.xyz" } },
  testnet: true,
});

const tempoChain = defineChain({
  id: 42431,
  name: "Tempo Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.tempo.xyz"] } },
  blockExplorers: { default: { name: "Tempo Explorer", url: "https://explorer.tempo.xyz" } },
  testnet: true,
});

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
if (!WC_PROJECT_ID) {
  throw new Error(
    "[wagmiConfig] VITE_WALLETCONNECT_PROJECT_ID is not set. " +
    "Register a project at https://cloud.walletconnect.com and set the secret before starting the app.",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "FairChat",
  projectId: WC_PROJECT_ID,
  chains: [baseSepolia, arcChain, arcStableTrustChain, stableChain, arbitrumSepolia, sepolia, tempoChain],
});

export { arcChain, arcStableTrustChain, stableChain, tempoChain };
