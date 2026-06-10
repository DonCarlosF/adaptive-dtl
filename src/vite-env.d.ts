/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the optional cloud backend (server/). When unset, the app
   * runs fully local (IndexedDB + bring-your-own-key AI) exactly as before.
   * When set, the app requires login and syncs data through the backend.
   */
  readonly VITE_API_URL?: string;
  /** Override the WebGazer.js script URL (e.g. a vendored local copy). */
  readonly VITE_WEBGAZER_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
