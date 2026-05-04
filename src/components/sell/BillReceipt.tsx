import { Bill } from '../../types'
import { forwardRef } from 'react'
import { getStoreConfig } from '../../db/queries/storeConfig'
import { amountToWords } from '../../utils/billing'

interface Props { bill: Bill }

// Build HSN summary from bill lines
function buildHsnSummary(bill: Bill) {
  const map = new Map<string, {
    hsn_code: string
    taxable: number
    cgst_rate: number
    cgst_amount: number
    sgst_rate: number
    sgst_amount: number
    igst_rate: number
    igst_amount: number
  }>()

  for (const line of bill.lines) {
    const key = `${line.product_snapshot.hsn_code}-${line.gst_rate}`
    const existing = map.get(key)
    if (existing) {
      existing.taxable += line.taxable_value
      existing.cgst_amount += line.cgst_amount || 0
      existing.sgst_amount += line.sgst_amount || 0
      existing.igst_amount += line.igst_amount || 0
    } else {
      map.set(key, {
        hsn_code: line.product_snapshot.hsn_code,
        taxable: line.taxable_value,
        cgst_rate: line.cgst_rate || line.gst_rate / 2,
        cgst_amount: line.cgst_amount || 0,
        sgst_rate: line.sgst_rate || line.gst_rate / 2,
        sgst_amount: line.sgst_amount || 0,
        igst_rate: line.igst_rate || 0,
        igst_amount: line.igst_amount || 0,
      })
    }
  }

  return Array.from(map.values()).map(r => ({
    ...r,
    taxable: Math.round(r.taxable * 100) / 100,
    cgst_amount: Math.round(r.cgst_amount * 100) / 100,
    sgst_amount: Math.round(r.sgst_amount * 100) / 100,
    igst_amount: Math.round(r.igst_amount * 100) / 100,
  }))
}

const BillReceipt = forwardRef<HTMLDivElement, Props>(({ bill }, ref) => {
  const config = getStoreConfig()
  const cs = bill.customer_snapshot
  const supply_type = bill.supply_type || 'intra'
  const hsnSummary = buildHsnSummary(bill)
  const inWords = amountToWords(Math.round(bill.total))

  const row = (left: string, right: string, bold = false) => (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1px' }}>
      <span style={{ fontWeight: bold ? 'bold' : 'normal' }}>{left}</span>
      <span style={{ fontWeight: bold ? 'bold' : 'normal' }}>{right}</span>
    </div>
  )

  return (
    <div ref={ref} style={{ fontFamily:'monospace', fontSize:'11px', width:'72mm', padding:'4mm', color:'#000', background:'#fff' }}>

      {/* ── SUPPLIER HEADER ── */}
      <div style={{ textAlign:'center', borderBottom:'1px solid #000', paddingBottom:'4px', marginBottom:'4px' }}>
        <div style={{ fontWeight:'bold', fontSize:'14px' }}>{config.shop_name}</div>
        {config.shop_trade_name && <div style={{ fontSize:'10px' }}>{config.shop_trade_name}</div>}
        <div>{config.shop_address_line1}{config.shop_address_line2 ? ', ' + config.shop_address_line2 : ''}</div>
        <div>{config.shop_city} — {config.shop_pincode}</div>
        <div>GSTIN: <b>{config.shop_gstin}</b> | Ph: {config.shop_phone}</div>
        <div style={{ fontWeight:'bold', fontSize:'12px', marginTop:'3px', letterSpacing:'1px' }}>TAX INVOICE</div>
      </div>

      {/* ── INVOICE META ── */}
      <div style={{ borderBottom:'1px dashed #000', paddingBottom:'3px', marginBottom:'3px' }}>
        {row('Invoice No:', bill.invoice_no, true)}
        {row('Date:', bill.date)}
        {row('Place of Supply:', `${bill.place_of_supply_name || config.shop_state} (${bill.place_of_supply_code || config.shop_state_code})`)}
        {row('Reverse Charge:', 'No')}
        {row('Supply Type:', supply_type === 'inter' ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)')}
      </div>

      {/* ── CUSTOMER (if B2B) ── */}
      {cs && (
        <div style={{ borderBottom:'1px dashed #000', paddingBottom:'3px', marginBottom:'3px' }}>
          <div style={{ fontWeight:'bold', marginBottom:'1px' }}>Bill To:</div>
          <div>{cs.name}</div>
          {cs.phone && <div>Ph: {cs.phone}</div>}
          {cs.gstin && <div>GSTIN: {cs.gstin}</div>}
          {cs.address && <div style={{ fontSize:'10px' }}>{cs.address}</div>}
        </div>
      )}
      {!cs && (
        <div style={{ borderBottom:'1px dashed #000', paddingBottom:'2px', marginBottom:'3px', fontSize:'10px', color:'#666' }}>
          Bill To: Walk-in Customer (Unregistered)
        </div>
      )}

      {/* ── ITEMS TABLE ── */}
      <div style={{ borderBottom:'1px solid #000', marginBottom:'2px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'3fr 0.7fr 0.9fr 1fr', gap:'0 2px', fontWeight:'bold', borderBottom:'1px solid #000', paddingBottom:'1px', marginBottom:'2px', fontSize:'10px' }}>
          <span>Item / HSN</span><span style={{ textAlign:'right' }}>Qty</span>
          <span style={{ textAlign:'right' }}>Rate</span><span style={{ textAlign:'right' }}>Taxable</span>
        </div>

        {bill.lines.map((line, i) => (
          <div key={i} style={{ marginBottom:'3px', borderBottom:'1px dotted #ccc', paddingBottom:'2px' }}>
            <div style={{ fontWeight:'500' }}>{line.product_snapshot.brand} {line.product_snapshot.name}</div>
            <div style={{ fontSize:'9px', color:'#444' }}>{line.product_snapshot.variant}</div>
            <div style={{ display:'grid', gridTemplateColumns:'3fr 0.7fr 0.9fr 1fr', gap:'0 2px', fontSize:'10px' }}>
              <span style={{ fontSize:'9px', color:'#666' }}>HSN: {line.product_snapshot.hsn_code}</span>
              <span style={{ textAlign:'right' }}>{line.qty}</span>
              <span style={{ textAlign:'right' }}>₹{line.unit_price.toFixed(2)}</span>
              <span style={{ textAlign:'right' }}>₹{line.taxable_value.toFixed(2)}</span>
            </div>
            {(line.discount_per_unit > 0) && (
              <div style={{ fontSize:'9px', color:'#c00' }}>
                Disc: ₹{(line.discount_per_unit * line.qty).toFixed(2)}
              </div>
            )}
            <div style={{ fontSize:'9px', color:'#555' }}>
              {supply_type === 'intra'
                ? `CGST ${line.cgst_rate || line.gst_rate/2}%: ₹${(line.cgst_amount||0).toFixed(2)} | SGST ${line.sgst_rate || line.gst_rate/2}%: ₹${(line.sgst_amount||0).toFixed(2)}`
                : `IGST ${line.igst_rate || line.gst_rate}%: ₹${(line.igst_amount||0).toFixed(2)}`
              }
            </div>
          </div>
        ))}
      </div>

      {/* ── TOTALS ── */}
      <div style={{ borderBottom:'1px dashed #000', paddingBottom:'3px', marginBottom:'3px' }}>
        {row('Taxable Value:', `₹${bill.subtotal.toFixed(2)}`)}
        {supply_type === 'intra' ? (
          <>
            {row(`CGST:`, `₹${(bill.cgst_amount||0).toFixed(2)}`)}
            {row(`SGST:`, `₹${(bill.sgst_amount||0).toFixed(2)}`)}
          </>
        ) : (
          row(`IGST:`, `₹${(bill.igst_amount||0).toFixed(2)}`)
        )}
        {bill.rounding !== 0 && row('Rounding:', `₹${bill.rounding.toFixed(2)}`)}
        {row('Invoice Total:', `₹${bill.total.toFixed(2)}`, true)}
      </div>

      {/* ── AMOUNT IN WORDS ── */}
      <div style={{ fontSize:'10px', marginBottom:'3px', fontStyle:'italic' }}>
        {inWords}
      </div>

      {/* ── HSN SUMMARY TABLE ── */}
      <div style={{ borderTop:'1px solid #000', paddingTop:'2px', marginBottom:'3px' }}>
        <div style={{ fontWeight:'bold', fontSize:'10px', marginBottom:'2px' }}>HSN Summary</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'0 2px', fontSize:'9px', fontWeight:'bold', borderBottom:'1px solid #ccc', paddingBottom:'1px', marginBottom:'1px' }}>
          <span>HSN</span><span style={{ textAlign:'right' }}>Taxable</span>
          <span style={{ textAlign:'right' }}>{supply_type==='intra' ? 'CGST' : 'IGST'}</span>
          <span style={{ textAlign:'right' }}>{supply_type==='intra' ? 'SGST' : 'Tax'}</span>
        </div>
        {hsnSummary.map((h, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'0 2px', fontSize:'9px' }}>
            <span>{h.hsn_code}</span>
            <span style={{ textAlign:'right' }}>₹{h.taxable.toFixed(0)}</span>
            <span style={{ textAlign:'right' }}>
              {supply_type==='intra' ? `₹${h.cgst_amount.toFixed(0)}` : `₹${h.igst_amount.toFixed(0)}`}
            </span>
            <span style={{ textAlign:'right' }}>
              {supply_type==='intra' ? `₹${h.sgst_amount.toFixed(0)}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* ── PAYMENT SPLIT ── */}
      <div style={{ borderTop:'1px dashed #000', paddingTop:'3px', marginBottom:'3px' }}>
        <div style={{ fontWeight:'bold', marginBottom:'2px', fontSize:'10px' }}>Payment</div>
        {bill.payments.map((p, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'10px' }}>
            <span style={{ textTransform:'capitalize' }}>
              {p.mode === 'credit' ? 'Udhaar (Credit)' : p.mode}
              {p.ref_no ? ` — ${p.ref_no}` : ''}
            </span>
            <span>₹{p.amount.toFixed(2)}</span>
          </div>
        ))}
        {bill.credit_amount > 0 && (
          <div style={{ marginTop:'2px', fontWeight:'bold', color:'#c00', fontSize:'10px' }}>
            ⚠ Added to Udhaar: ₹{bill.credit_amount.toFixed(2)}
          </div>
        )}
        {bill.change_due > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:'10px', color:'#c60' }}>
            <span>Change Returned:</span><span>₹{bill.change_due.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop:'1px solid #000', paddingTop:'3px', textAlign:'center', fontSize:'9px', color:'#666' }}>
        <div>This is a computer generated invoice</div>
        <div>Thank you for your business!</div>
        <div style={{ marginTop:'2px' }}>
          Subject to {config.shop_city} jurisdiction
        </div>
      </div>
    </div>
  )
})
BillReceipt.displayName = 'BillReceipt'
export default BillReceipt
