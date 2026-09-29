/// <reference types="vite/client" />

/** Feature switches controlled by the local build environment. */
export const isEnrichmentSourceEditorEnabled = (): boolean =>
  import.meta.env.VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR === "true";
