"use client";

const STORAGE_KEY_ADDRESS = "epoh_lace_address";
const STORAGE_KEY_SUBJECT = "epoh_subject_address";

type Cip30Api = {
  getUsedAddresses: () => Promise<string[]>;
  getChangeAddress: () => Promise<string>;
};

type LaceConnector = {
  enable: () => Promise<Cip30Api>;
};

function getLaceConnector(): LaceConnector | undefined {
  if (typeof window === "undefined") return undefined;
  return window.cardano?.lace;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToSubjectAddress(addressHex: string): Promise<string> {
  const addressBytes = hexToBytes(addressHex);
  const digest = await crypto.subtle.digest("SHA-256", addressBytes as BufferSource);
  return `0x${bytesToHex(new Uint8Array(digest))}`;
}

export function isLaceAvailable(): boolean {
  return Boolean(getLaceConnector());
}

export function getStoredSubjectAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY_SUBJECT);
}

export function getStoredLaceAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY_ADDRESS);
}

export function disconnectLace(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY_ADDRESS);
  localStorage.removeItem(STORAGE_KEY_SUBJECT);
}

export async function connectLace(): Promise<{
  laceAddress: string;
  subjectAddress: string;
}> {
  const connector = getLaceConnector();
  if (!connector) {
    throw new Error("Lace wallet not found. Please install Lace extension.");
  }

  const api = await connector.enable();
  const used = await api.getUsedAddresses();
  const laceAddress = used[0] ?? (await api.getChangeAddress());

  if (!laceAddress) {
    throw new Error("No wallet address available from Lace.");
  }

  const subjectAddress = await hashToSubjectAddress(laceAddress);
  localStorage.setItem(STORAGE_KEY_ADDRESS, laceAddress);
  localStorage.setItem(STORAGE_KEY_SUBJECT, subjectAddress);

  return { laceAddress, subjectAddress };
}
