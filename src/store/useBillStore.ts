import { create } from 'zustand'
import { CartItem, BillDraft, Customer, PaymentSplit, Product } from '../types'
import { getSpecialPrice } from '../db/queries/rateCards'

interface BillStore {
  draft: BillDraft
  heldBills: BillDraft[]
  addToCart: (product: Product, qty?: number) => void
  removeFromCart: (productId: string) => void
  updateCartQty: (productId: string, qty: number) => void
  updateCartPrice: (productId: string, price: number) => void
  setCustomer: (customer: Customer | null) => void
  recalculateCartPrices: () => void
  addPayment: (payment: PaymentSplit) => void
  removePayment: (index: number) => void
  setRounding: (amount: number) => void
  setNotes: (notes: string) => void
  clearBill: () => void
  holdCurrentBill: () => void
  retrieveHeldBill: (index: number) => void
  deleteHeldBill: (index: number) => void
}

const EMPTY_DRAFT: BillDraft = { cart:[], customer:null, payments:[], rounding:0, notes:'' }

export const useBillStore = create<BillStore>((set) => ({
  draft: { ...EMPTY_DRAFT },
  heldBills: [],

  addToCart: (product, qty = 1) => set(state => {
    const existingItem = state.draft.cart.find(i => i.product.id === product.id)
    if (existingItem) {
      return { draft: { ...state.draft, cart: state.draft.cart.map(i =>
        i.product.id === product.id ? { ...i, qty: i.qty + qty } : i
      )}}
    }
    const customer = state.draft.customer
    const specialPrice = getSpecialPrice(
      product.id,
      customer?.id || null,
      customer?.type || null,
      qty
    )
    const newItem: CartItem = {
      product,
      qty,
      unit_price: specialPrice !== null ? specialPrice : product.mrp,
      discount_per_unit: 0,
    }
    return { draft: { ...state.draft, cart: [...state.draft.cart, newItem] }}
  }),

  removeFromCart: (productId) => set(state => ({
    draft: { ...state.draft, cart: state.draft.cart.filter(i => i.product.id !== productId) }
  })),

  updateCartQty: (productId, qty) => set(state => ({
    draft: { ...state.draft, cart: state.draft.cart.map(i =>
      i.product.id === productId ? { ...i, qty: Math.max(0.1, qty) } : i
    )}
  })),

  updateCartPrice: (productId, price) => set(state => ({
    draft: { ...state.draft, cart: state.draft.cart.map(i =>
      i.product.id === productId ? { ...i, unit_price: Math.max(0, price), _manualOverride: true } : i
    )}
  })),

  setCustomer: (customer) => set(state => ({ draft: { ...state.draft, customer } })),
  recalculateCartPrices: () => set(state => {
    const customer = state.draft.customer
    const updatedCart = state.draft.cart.map(item => {
      // Only recalculate if price was NOT manually overridden (price equals original mrp or a previous special price)
      // We detect manual override by checking if there's a _manualOverride flag — add this to CartItem
      if (item._manualOverride) return item
      const specialPrice = getSpecialPrice(
        item.product.id,
        customer?.id || null,
        customer?.type || null,
        item.qty
      )
      return { ...item, unit_price: specialPrice !== null ? specialPrice : item.product.mrp }
    })
    return { draft: { ...state.draft, cart: updatedCart } }
  }),

  addPayment: (payment) => set(state => ({
    draft: { ...state.draft, payments: [...state.draft.payments, payment] }
  })),

  removePayment: (index) => set(state => ({
    draft: { ...state.draft, payments: state.draft.payments.filter((_, i) => i !== index) }
  })),

  setRounding: (rounding) => set(state => ({ draft: { ...state.draft, rounding } })),
  setNotes: (notes) => set(state => ({ draft: { ...state.draft, notes } })),
  clearBill: () => set({ draft: { ...EMPTY_DRAFT } }),

  holdCurrentBill: () => set(state => {
    if (state.draft.cart.length === 0) return state
    const newHeld = [...state.heldBills, { ...state.draft }]
    if (newHeld.length > 3) newHeld.shift()
    return { heldBills: newHeld, draft: { ...EMPTY_DRAFT } }
  }),

  retrieveHeldBill: (index) => set(state => {
    const held = state.heldBills[index]
    if (!held) return state
    const newHeld = state.draft.cart.length > 0
      ? [...state.heldBills.filter((_,i)=>i!==index), state.draft]
      : state.heldBills.filter((_,i)=>i!==index)
    return { draft: held, heldBills: newHeld }
  }),

  deleteHeldBill: (index) => set(state => ({
    heldBills: state.heldBills.filter((_,i)=>i!==index)
  })),
}))
