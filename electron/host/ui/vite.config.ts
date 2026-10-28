import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

const uiRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: uiRoot,
  base: './',
  resolve: {
    alias: {
      '@open-pencil/session/schema': fileURLToPath(new URL('../../session/src/schema.ts', import.meta.url)),
      '@open-pencil/session': fileURLToPath(new URL('../../session/src/index.ts', import.meta.url)),
      '@open-pencil/vue-next': fileURLToPath(new URL('../../sdk/src/index.ts', import.meta.url))
    }
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/ui', import.meta.url)),
    emptyOutDir: true
  },
  plugins: [
    vue(),
    tailwindcss(),
    Icons({ compiler: 'vue3' }),
    Components({ dirs: [], dts: false, resolvers: [IconsResolver({ prefix: 'icon' })] })
  ],
  server: {
    host: '127.0.0.1',
    port: 4179,
    strictPort: true
  }
})
