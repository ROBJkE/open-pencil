import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    vue(),
    tailwindcss(),
    Icons({ compiler: 'vue3' }),
    Components({ dirs: [], dts: false, resolvers: [IconsResolver({ prefix: 'icon' })] })
  ],
  server: {
    port: 4179,
    strictPort: true
  }
})
