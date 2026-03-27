export {};

declare global {
  interface Window {
    cardano?: {
      lace?: {
        enable: () => Promise<{
          getUsedAddresses: () => Promise<string[]>;
          getChangeAddress: () => Promise<string>;
        }>;
      };
    };
  }
}
