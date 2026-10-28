<script setup lang="ts">
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarRoot,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from 'reka-ui'

import IconButton from '../button/IconButton.vue'
import AppShortcutText from '../menu/AppShortcutText.vue'
import MenuScrollArea from '../menu/MenuScrollArea.vue'
import { useMenuUI } from '../menu/menu'
import { messages } from './messages'
import { useShellActions, useShellTheme } from './context'

const { documentName } = defineProps<{ documentName: string }>()

const actions = useShellActions()
const theme = useShellTheme()
const menu = useMenuUI()
const mainMenu = useMenuUI({ content: 'min-w-52' })
const subMenu = useMenuUI({ content: 'min-w-36' })
</script>

<template>
  <div class="shrink-0 border-b border-border">
    <div class="flex items-center gap-2 px-2 py-1.5">
      <span class="flex size-6 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-semibold text-on-accent">
        OP
      </span>
      <span data-test-id="app-document-name" class="min-w-0 flex-1 truncate px-1 py-0.5 text-xs text-surface">
        {{ documentName }}
      </span>
      <IconButton :label="messages.settings" data-test-id="app-settings-trigger" @click="actions.openSettings()">
        <icon-lucide-settings class="size-3.5" />
      </IconButton>
    </div>
    <div class="flex items-center px-1 pb-1">
      <MenubarRoot class="flex w-max items-center gap-0.5">
        <MenubarMenu>
          <MenubarTrigger
            data-test-id="menubar-file"
            class="flex cursor-pointer items-center rounded px-2 py-1 text-[11px] text-surface/80 select-none hover:bg-hover hover:text-surface data-[state=open]:bg-hover data-[state=open]:text-surface"
          >
            {{ messages.file }}
          </MenubarTrigger>
          <MenubarPortal>
            <MenubarContent :side-offset="4" align="start" :class="mainMenu.content">
              <MenuScrollArea>
                <MenubarItem :class="menu.item" @select="actions.newTab()">
                  <span class="flex-1">{{ messages.newTab }}</span>
                  <AppShortcutText>Ctrl+N</AppShortcutText>
                </MenubarItem>
                <MenubarSeparator :class="menu.separator" />
                <MenubarItem :class="menu.item" disabled>
                  <span class="flex-1">{{ messages.open }}</span>
                  <AppShortcutText>Ctrl+O</AppShortcutText>
                </MenubarItem>
                <MenubarItem :class="menu.item" disabled>
                  <span class="flex-1">{{ messages.save }}</span>
                  <AppShortcutText>Ctrl+S</AppShortcutText>
                </MenubarItem>
                <MenubarSeparator :class="menu.separator" />
                <MenubarItem :class="menu.item" @select="actions.closeTab()">
                  <span class="flex-1">{{ messages.closeTab }}</span>
                  <AppShortcutText>Ctrl+W</AppShortcutText>
                </MenubarItem>
                <MenubarSeparator :class="menu.separator" />
                <MenubarItem :class="menu.item" @select="actions.openSettings()">
                  <span class="flex-1">{{ messages.settings }}</span>
                </MenubarItem>
              </MenuScrollArea>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger
            data-test-id="menubar-edit"
            class="flex cursor-pointer items-center rounded px-2 py-1 text-[11px] text-surface/80 select-none hover:bg-hover hover:text-surface data-[state=open]:bg-hover data-[state=open]:text-surface"
          >
            {{ messages.edit }}
          </MenubarTrigger>
          <MenubarPortal>
            <MenubarContent :side-offset="4" align="start" :class="mainMenu.content">
              <MenuScrollArea>
                <MenubarItem :class="menu.item" @select="actions.undo()">
                  <span class="flex-1">{{ messages.undo }}</span>
                  <AppShortcutText>Ctrl+Z</AppShortcutText>
                </MenubarItem>
                <MenubarItem :class="menu.item" @select="actions.redo()">
                  <span class="flex-1">{{ messages.redo }}</span>
                  <AppShortcutText>Ctrl+Shift+Z</AppShortcutText>
                </MenubarItem>
              </MenuScrollArea>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger
            data-test-id="menubar-view"
            class="flex cursor-pointer items-center rounded px-2 py-1 text-[11px] text-surface/80 select-none hover:bg-hover hover:text-surface data-[state=open]:bg-hover data-[state=open]:text-surface"
          >
            {{ messages.view }}
          </MenubarTrigger>
          <MenubarPortal>
            <MenubarContent :side-offset="4" align="start" :class="mainMenu.content">
              <MenuScrollArea>
                <MenubarItem :class="menu.item" @select="actions.zoomIn()">
                  <span class="flex-1">{{ messages.zoomIn }}</span>
                  <AppShortcutText>Ctrl++</AppShortcutText>
                </MenubarItem>
                <MenubarItem :class="menu.item" @select="actions.zoomOut()">
                  <span class="flex-1">{{ messages.zoomOut }}</span>
                  <AppShortcutText>Ctrl+-</AppShortcutText>
                </MenubarItem>
                <MenubarSeparator :class="menu.separator" />
                <MenubarSub>
                  <MenubarSubTrigger :class="menu.item">
                    <span class="flex-1">{{ messages.theme }}</span>
                    <icon-lucide-chevron-right class="size-3 text-muted" />
                  </MenubarSubTrigger>
                  <MenubarPortal>
                    <MenubarSubContent :side-offset="4" :class="subMenu.content">
                      <MenuScrollArea>
                        <MenubarItem :class="menu.item" @select="actions.setTheme('dark')">
                          <span class="flex-1">{{ messages.dark }}</span>
                          <icon-lucide-check v-if="theme === 'dark'" class="size-3.5" />
                        </MenubarItem>
                        <MenubarItem :class="menu.item" @select="actions.setTheme('light')">
                          <span class="flex-1">{{ messages.light }}</span>
                          <icon-lucide-check v-if="theme === 'light'" class="size-3.5" />
                        </MenubarItem>
                      </MenuScrollArea>
                    </MenubarSubContent>
                  </MenubarPortal>
                </MenubarSub>
              </MenuScrollArea>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger
            data-test-id="menubar-object"
            class="flex cursor-pointer items-center rounded px-2 py-1 text-[11px] text-surface/80 select-none hover:bg-hover hover:text-surface data-[state=open]:bg-hover data-[state=open]:text-surface"
          >
            {{ messages.object }}
          </MenubarTrigger>
          <MenubarPortal>
            <MenubarContent :side-offset="4" align="start" :class="mainMenu.content">
              <MenuScrollArea>
                <MenubarItem :class="menu.item" @select="actions.removeSelection()">
                  <span class="flex-1">{{ messages.delete }}</span>
                  <AppShortcutText>Del</AppShortcutText>
                </MenubarItem>
              </MenuScrollArea>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </MenubarRoot>
    </div>
  </div>
</template>
