/** Category-based MRP / cost sanity checks for product import. */

export type PriceRuleSeverity = 'ok' | 'warning' | 'error'

export interface PriceSanityResult {
  severity: PriceRuleSeverity
  message: string
}

interface Range {
  min: number
  max: number
}

const MRP_RANGE: Record<string, Range> = {
  cement: { min: 250, max: 700 },
  paint: { min: 50, max: 10000 },
  pipe: { min: 10, max: 5000 },
  electrical: { min: 10, max: 10000 },
  hardware: { min: 1, max: 5000 },
  other: { min: 0, max: 50000 },
}

/** How far outside range before "far" warning (ratio of range width). */
const FAR_OUT_FACTOR = 0.5

function inRange(mrp: number, cat: string): boolean {
  const r = MRP_RANGE[cat] || MRP_RANGE.other
  return mrp >= r.min && mrp <= r.max
}

function distanceFromRange(mrp: number, cat: string): number {
  const r = MRP_RANGE[cat] || MRP_RANGE.other
  if (mrp < r.min) return r.min - mrp
  if (mrp > r.max) return mrp - r.max
  return 0
}

export function validatePriceSanity(
  category: string,
  _unit: string,
  mrp: number,
  costPrice?: number
): PriceSanityResult {
  if (!mrp || mrp <= 0 || Number.isNaN(mrp)) {
    return { severity: 'error', message: 'MRP must be a number greater than 0.' }
  }

  const cat = (category || 'other').toLowerCase().trim()
  const range = MRP_RANGE[cat] || MRP_RANGE.other

  if (costPrice !== undefined && !Number.isNaN(costPrice) && costPrice > mrp) {
    return {
      severity: 'warning',
      message: `Cost (₹${costPrice}) is higher than MRP (₹${mrp}). Verify pricing.`,
    }
  }

  // Cement bag-specific band (tighter warning)
  if (cat === 'cement') {
    if (mrp < 250 || mrp > 700) {
      return {
        severity: 'warning',
        message: `Cement bag MRP ₹${mrp} is outside the usual ₹250–₹700 range. Verify.`,
      }
    }
  }

  if (inRange(mrp, cat)) {
    return { severity: 'ok', message: 'MRP looks reasonable for this category.' }
  }

  const span = Math.max(range.max - range.min, 1)
  const dist = distanceFromRange(mrp, cat)
  if (dist > span * FAR_OUT_FACTOR) {
    return {
      severity: 'warning',
      message: `MRP ₹${mrp} is far outside the typical range ₹${range.min}–₹${range.max} for ${cat}.`,
    }
  }

  return {
    severity: 'warning',
    message: `MRP ₹${mrp} is outside the typical range ₹${range.min}–₹${range.max} for ${cat}.`,
  }
}
