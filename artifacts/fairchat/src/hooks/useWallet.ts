import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { NetworkConfig } from "../lib/paymentConfig";

export interface WalletResult {
  address: string | null;
  signer: ethers.Signer | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(network: NetworkConfig): WalletResult {
  const { address: wagmiAddress, isConnected, chain } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { data: walletClient } = useWalletClient();

  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const address = isConnected && wagmiAddress ? wagmiAddress : null;

  useEffect(() => {
    if (!walletClient || !address) {
      setSigner(null);
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(walletClient.transport);
      const s = new ethers.JsonRpcSigner(provider, address);
      setSigner(s);
    } catch {
      setSigner(null);
    }
  }, [walletClient, address]);

  useEffect(() => {
    if (!isConnected || !address || !switchChainAsync) return;
    if (chain?.id === network.chainId) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await switchChainAsync({ chainId: network.chainId });
      } catch {}
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isConnected, address, chain?.id, network.chainId, switchChainAsync]);

  const connect = useCallback(async () => {
    if (isConnected && address) {
      if (chain?.id !== network.chainId && switchChainAsync) {
        try {
          await switchChainAsync({ chainId: network.chainId });
        } catch {}
      }
      return;
    }

    if (openConnectModal) {
      openConnectModal();
      return;
    }

    setIsConnecting(true);
    try {
      const connector = connectors[0];
      if (connector) {
        await connectAsync({ connector });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, address, chain?.id, network.chainId, switchChainAsync, openConnectModal, connectors, connectAsync]);

  const disconnect = useCallback(() => {
    disconnectAsync().catch(() => {});
  }, [disconnectAsync]);

  return { address, signer, isConnecting, connect, disconnect };
}
