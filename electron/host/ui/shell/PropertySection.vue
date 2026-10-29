<script setup lang="ts">
const { label } = defineProps<{ label: string }>()
</script>

<template>
  <section class="border-b border-border px-3 pb-3 text-surface">
    <header class="flex h-8 min-w-0 items-center">
      <h3 class="min-w-0 flex-1 truncate text-[11px] font-semibold text-surface">{{ label }}</h3>
    </header>
    <slot />
  </section>
</template>
