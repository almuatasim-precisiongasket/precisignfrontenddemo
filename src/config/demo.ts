/** Showcase is an explicitly selected browser-only build, never a fallback for API mode. */
export const isShowcaseBuild = import.meta.env?.VITE_DATA_MODE === 'demo' && import.meta.env?.VITE_SHOWCASE === 'true';
