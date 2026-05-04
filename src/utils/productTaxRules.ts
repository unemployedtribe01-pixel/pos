/** Category-based GST/HSN suggestion and validation for product import. */

export type TaxRuleSeverity = 'ok' | 'warning' | 'error'

export interface TaxValidationResult {
  suggestedHsn: string
  suggestedGstRate: number
  severity: TaxRuleSeverity
  message: string
}

/** Known-good HSN prefixes (4 digits) used elsewhere in the app. */
const KNOWN_HSN_PREFIXES = new Set([
  '2523', '2521', '3208', '3209', '3214', '3917', '7307', '7304',
  '8544', '8536', '8539', '8537', '7318', '7317', '8302', '8301', '6809', '9965',
])

interface CategoryTaxRule {
  allowedHsns: string[]
  suggestedHsn: string
  suggestedGstRate: number
  /** HSN considered plausible but not primary (warnings). */
  alternateHsns: string[]
}

const RULES: Record<string, CategoryTaxRule> = {
  cement: {
    allowedHsns: ['2523', '2521'],
    suggestedHsn: '2523',
    suggestedGstRate: 18,
    alternateHsns: ['2521'],
  },
  paint: {
    allowedHsns: ['3208', '3209', '3214'],
    suggestedHsn: '3209',
    suggestedGstRate: 18,
    alternateHsns: [],
  },
  pipe: {
    allowedHsns: ['3917', '7307', '7304'],
    suggestedHsn: '3917',
    suggestedGstRate: 18,
    alternateHsns: ['7307', '7304'],
  },
  electrical: {
    allowedHsns: ['8544', '8536', '8539', '8537'],
    suggestedHsn: '8544',
    suggestedGstRate: 18,
    alternateHsns: ['8536', '8539', '8537'],
  },
  hardware: {
    allowedHsns: ['7318', '8302', '8301', '7317', '6809'],
    suggestedHsn: '7318',
    suggestedGstRate: 18,
    alternateHsns: ['8302', '8301', '7317', '6809'],
  },
}

function digitsOnly(hsn: string): string {
  return (hsn || '').replace(/\D/g, '')
}

export function getSuggestedTaxForCategory(category: string): TaxValidationResult {
  const c = (category || '').toLowerCase().trim()
  const rule = RULES[c]
  if (!rule) {
    return {
      suggestedHsn: '',
      suggestedGstRate: 18,
      severity: 'ok',
      message: 'No fixed HSN default for this category — verify HSN and GST manually.',
    }
  }
  return {
    suggestedHsn: rule.suggestedHsn,
    suggestedGstRate: rule.suggestedGstRate,
    severity: 'ok',
    message: `Suggested HSN ${rule.suggestedHsn} at ${rule.suggestedGstRate}% GST.`,
  }
}

/**
 * Validates HSN + GST against category rules.
 * Cement: GST must be 18 (error otherwise). HSN must be 2523 for "ok"; 2521 warning; non-2523 with digits = warning; blank/short = error.
 * Other categories: GST 18 expected; mismatches use warning unless clearly wrong (error).
 */
export function validateTaxAgainstCategory(
  category: string,
  hsn: string,
  gstRate: number
): TaxValidationResult {
  const c = (category || '').toLowerCase().trim()
  const hsnDigits = digitsOnly(hsn)
  const rule = RULES[c]

  if (c === 'other') {
    return {
      suggestedHsn: '',
      suggestedGstRate: 18,
      severity: 'ok',
      message: 'Other category: no automatic HSN default — confirm tax codes are correct.',
    }
  }

  if (!rule) {
    return {
      suggestedHsn: '',
      suggestedGstRate: 18,
      severity: 'error',
      message: 'Unknown category for tax validation.',
    }
  }

  const { suggestedHsn, suggestedGstRate, allowedHsns, alternateHsns } = rule

  if (c === 'cement') {
    if (!hsnDigits || hsnDigits.length < 4) {
      return {
        suggestedHsn,
        suggestedGstRate,
        severity: 'error',
        message: 'Cement requires a valid HSN (e.g. 2523). HSN is missing or too short.',
      }
    }
    if (gstRate !== 18) {
      return {
        suggestedHsn,
        suggestedGstRate,
        severity: 'error',
        message: `Cement must use 18% GST. You entered ${gstRate}%.`,
      }
    }
    if (hsnDigits === '2523') {
      return { suggestedHsn, suggestedGstRate, severity: 'ok', message: 'HSN and GST match cement defaults.' }
    }
    if (alternateHsns.includes(hsnDigits) || allowedHsns.includes(hsnDigits)) {
      return {
        suggestedHsn,
        suggestedGstRate,
        severity: 'warning',
        message: `Cement usually uses HSN 2523. You entered ${hsnDigits}. Confirm if correct.`,
      }
    }
    if (KNOWN_HSN_PREFIXES.has(hsnDigits.slice(0, 4))) {
      return {
        suggestedHsn,
        suggestedGstRate,
        severity: 'warning',
        message: `HSN ${hsnDigits} is unusual for cement. Expected 2523. Verify before import.`,
      }
    }
    return {
      suggestedHsn,
      suggestedGstRate,
      severity: 'error',
      message: `HSN ${hsnDigits} does not look valid for cement. Use 2523 unless you are certain.`,
    }
  }

  // Non-cement categories
  if (!hsnDigits || hsnDigits.length < 4) {
    return {
      suggestedHsn,
      suggestedGstRate,
      severity: 'error',
      message: 'HSN is missing or too short for this category.',
    }
  }

  if (gstRate !== suggestedGstRate) {
    return {
      suggestedHsn,
      suggestedGstRate,
      severity: 'warning',
      message: `This category typically uses ${suggestedGstRate}% GST. You entered ${gstRate}%. Confirm.`,
    }
  }

  const prefix4 = hsnDigits.slice(0, 4)
  if (allowedHsns.some(a => prefix4 === a || hsnDigits.startsWith(a))) {
    return { suggestedHsn, suggestedGstRate, severity: 'ok', message: 'HSN and GST are consistent with category.' }
  }

  if (KNOWN_HSN_PREFIXES.has(prefix4)) {
    return {
      suggestedHsn,
      suggestedGstRate,
      severity: 'warning',
      message: `HSN ${hsnDigits} may not match typical codes for ${c}. Suggested: ${suggestedHsn}.`,
    }
  }

  return {
    suggestedHsn,
    suggestedGstRate,
    severity: 'error',
    message: `HSN ${hsnDigits} is not plausible for category "${c}". Check and correct.`,
  }
}
