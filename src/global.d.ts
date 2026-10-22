/// <reference types="vite/client" />
import type { PlatinumAPI } from "./shared/ipc";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  interface Window { platinum: PlatinumAPI }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
        webpreferences?: string;
      };
    }
  }
}

export {};
