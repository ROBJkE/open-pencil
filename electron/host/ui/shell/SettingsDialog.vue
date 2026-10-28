<script setup lang="ts">
import { ref } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'

import { CANVAS_TOOLS, type CanvasTool } from '@open-pencil/session'

import AppButton from '../button/AppButton.vue'
import AppInput from '../input/AppInput.vue'
import { useInputUI } from '../input/input'
import { motionStyles } from '../theme/motion'
import { messages, SETTINGS_SECTIONS, TOOL_LABELS, type SettingsSectionId } from './messages'
import { useShellActions, useShellTheme } from './context'

const open = defineModel<boolean>('open', { required: true })
const theme = useShellTheme()
const actions = useShellActions()
const section = ref<SettingsSectionId>('general')
const providerName = ref('')
const enabled = ref<CanvasTool[]>([...CANVAS_TOOLS])
const secretClass = useInputUI({ tone: 'default', size: 'sm' }).base
const contentClass = [
  'fixed top-1/2 left-1/2 z-50 flex h-[min(90vh,56rem)] w-[min(52.5rem,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-panel shadow-[0_8px_30px_rgb(0_0_0/0.4)] outline-none',
  motionStyles.overlay
]

function toggleTool(tool: CanvasTool): void {
  const current = enabled.value
  enabled.value = current.includes(tool)
    ? current.filter((item) => item !== tool)
    : [...current, tool]
}

function toolPressed(tool: CanvasTool): boolean {
  return enabled.value.includes(tool)
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay :class="['fixed inset-0 z-40 bg-black/50', motionStyles.overlay]" />
      <DialogContent data-test-id="app-settings-dialog" :class="contentClass">
        <header class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div class="min-w-0">
            <DialogTitle class="text-sm font-semibold text-surface">{{ messages.settings }}</DialogTitle>
            <DialogDescription class="text-xs text-muted">{{ messages.settingsDescription }}</DialogDescription>
          </div>
          <DialogClose
            class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-muted hover:bg-hover hover:text-surface"
            :aria-label="messages.close"
          >
            <icon-lucide-x class="size-3.5" />
          </DialogClose>
        </header>

        <div class="flex min-h-0 flex-1">
          <div class="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2" role="tablist">
            <button
              v-for="item in SETTINGS_SECTIONS"
              :key="item.id"
              type="button"
              role="tab"
              class="flex cursor-pointer items-center rounded px-2 py-1.5 text-left text-xs text-muted hover:bg-hover hover:text-surface data-[state=active]:bg-hover data-[state=active]:text-surface"
              :data-state="section === item.id ? 'active' : 'inactive'"
              :aria-selected="section === item.id"
              @click="section = item.id"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            <section v-if="section === 'general'" class="grid gap-3">
              <h3 class="text-xs font-semibold text-surface">{{ messages.appearance }}</h3>
              <p class="text-xs text-muted">{{ messages.generalHint }}</p>
              <div class="flex gap-2">
                <AppButton
                  :color="theme === 'dark' ? 'primary' : 'neutral'"
                  :variant="theme === 'dark' ? 'solid' : 'outline'"
                  :aria-pressed="theme === 'dark'"
                  @click="actions.setTheme('dark')"
                >
                  {{ messages.dark }}
                </AppButton>
                <AppButton
                  :color="theme === 'light' ? 'primary' : 'neutral'"
                  :variant="theme === 'light' ? 'solid' : 'outline'"
                  :aria-pressed="theme === 'light'"
                  @click="actions.setTheme('light')"
                >
                  {{ messages.light }}
                </AppButton>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted">
                <span class="size-4 rounded bg-accent" />
                <span>{{ messages.accent }}</span>
              </div>
            </section>

            <section v-else-if="section === 'toolbar'" class="grid gap-2">
              <h3 class="text-xs font-semibold text-surface">{{ messages.toolbar }}</h3>
              <p class="text-xs text-muted">{{ messages.toolbarHint }}</p>
            </section>

            <section v-else-if="section === 'ai'" class="grid max-w-sm gap-3">
              <h3 class="text-xs font-semibold text-surface">{{ messages.ai }}</h3>
              <label class="grid gap-1 text-[11px] text-muted">
                {{ messages.providerName }}
                <AppInput v-model="providerName" size="sm" :aria-label="messages.providerName" />
              </label>
              <label class="grid gap-1 text-[11px] text-muted">
                {{ messages.apiKey }}
                <input type="password" autocomplete="off" spellcheck="false" :aria-label="messages.apiKey" :class="secretClass" />
                <span>{{ messages.apiKeyHint }}</span>
              </label>
            </section>

            <section v-else-if="section === 'tools'" class="grid gap-3">
              <h3 class="text-xs font-semibold text-surface">{{ messages.toolAccess }}</h3>
              <p class="text-xs text-muted">{{ messages.toolAccessHint }}</p>
              <ul class="grid gap-1">
                <li v-for="tool in CANVAS_TOOLS" :key="tool" class="flex items-center justify-between gap-3 py-1">
                  <span class="text-xs text-surface">{{ TOOL_LABELS[tool] }}</span>
                  <AppButton
                    size="xs"
                    :variant="toolPressed(tool) ? 'solid' : 'outline'"
                    :color="toolPressed(tool) ? 'primary' : 'neutral'"
                    :aria-pressed="toolPressed(tool)"
                    @click="toggleTool(tool)"
                  >
                    {{ toolPressed(tool) ? messages.on : messages.off }}
                  </AppButton>
                </li>
              </ul>
            </section>

            <section v-else class="grid gap-2">
              <h3 class="text-xs font-semibold text-surface">
                {{ SETTINGS_SECTIONS.find((item) => item.id === section)?.label }}
              </h3>
              <p class="text-xs text-muted">{{ messages.placeholderHint }}</p>
            </section>
          </div>
        </div>

        <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <DialogClose as-child>
            <AppButton color="primary" variant="solid" data-test-id="app-settings-done">
              {{ messages.done }}
            </AppButton>
          </DialogClose>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
