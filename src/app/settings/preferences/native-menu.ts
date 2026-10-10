import type { SnappingPreferences } from '@open-pencil/core/editor'

export async function syncNativeSnappingMenu(_preferences: SnappingPreferences): Promise<void> {}

export async function syncNativeDesignIssuesMenu(_showOnCanvas: boolean): Promise<void> {}

export async function syncNativeCommentsMenu(_shown: boolean): Promise<void> {}
