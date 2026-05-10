/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALIEXPRESS_APP_KEY: string
  readonly VITE_ALIEXPRESS_APP_SECRET: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
