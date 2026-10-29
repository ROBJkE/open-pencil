import type { LintCheck, RuleId } from '../types'
import { checkColors } from './colors'
import { checkContrast } from './contrast'
import {
  checkAutoLayout,
  checkDetached,
  checkEmpty,
  checkPixel,
  checkTouch
} from './family'
import {
  checkDefaultNames,
  checkDepth,
  checkEffects,
  checkGroups,
  checkHidden,
  checkMinText,
  checkMixed,
  checkRadius,
  checkSpacing,
  checkTextStyle
} from './node'

export const CHECKS = {
  'no-hardcoded-colors': checkColors,
  'no-default-names': checkDefaultNames,
  'prefer-auto-layout': checkAutoLayout,
  'consistent-spacing': checkSpacing,
  'consistent-radius': checkRadius,
  'color-contrast': checkContrast,
  'touch-target-size': checkTouch,
  'text-style-required': checkTextStyle,
  'min-text-size': checkMinText,
  'no-hidden-layers': checkHidden,
  'no-deeply-nested': checkDepth,
  'no-empty-frames': checkEmpty,
  'pixel-perfect': checkPixel,
  'no-groups': checkGroups,
  'effect-style-required': checkEffects,
  'no-mixed-styles': checkMixed,
  'no-detached-instances': checkDetached
} as const satisfies Record<RuleId, LintCheck>
