import { Bill } from '../../types'
import { forwardRef } from 'react'

interface Props { bill: Bill; shopName?: string; shopAddress?: string; shopGstin?: string; shopPhone?: string }

const BillReceipt = forwardRef<HTMLDivElement, Props>(({
  bill, shopName='Shri Hardware Store', shopAddress='Main Road, Your City — 000000',
  shopGstin='29XXXXX0000X1ZX', shopPhone='98XXXXXXXX',
}, ref) => {
  const cs = bill.customer_snapshot
  return (
    <div ref={ref} style={{ fontFamily:'monospace', fontSize:'11px', width:'72mm', padding:'4mm', color:'#000', background:'#fff' }}>
      <div style={{ textAlign:'center', borderBottom:'1px dashed #000', paddingBottom:'4px', marginBottom:'4px' }}>
        <div style={{ fontWeight:'bold', fontSize:'14px' }}>{shopName}</div>
        <div>{shopAddress}</div>
        <div>GSTIN: {shopGstin} | Ph: {shopPhone}</div>
        <div style={{ fontWeight:'bold', fontSize:'12px', marginTop:'2px' }}>TAX INVOICE</div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
        <span>Invoice: <b>{bill.invoice_no}</b></span><span>Date: {bill.date}</span>
      </div>
      {cs && (
        <div style={{ borderBottom:'1px dashed #000', paddingBottom:'3px', marginBottom:'3px' }}>
          <div>To: <b>{cs.name}</b></div>
          {cs.phone && <div>Ph: {cs.phone}</div>}
          {cs.gstin && <div>GSTIN: {cs.gstin}</div>}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr 1fr 1fr', gap:'0 4px', fontWeight:'bold', borderBottom:'1px solid #000', paddingBottom:'2px', marginBottom:'2px' }}>
        <span>Item</span><span style={{ textAlign:'right' }}>Qty</span><span style={{ textAlign:'right' }}>Rate</span><span style={{ textAlign:'right' }}>Amt</span>
      </div>
      {bill.lines.map((line, i) => (
        <div key={i} style={{ marginBottom:'2px' }}>
          <div>{line.product_snapshot.brand} {line.product_snapshot.name}</div>
          <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr 1fr 1fr', gap:'0 4px', fontSize:'10px' }}>
            <span style={{ color:'#666' }}>{line.product_snapshot.variant}</span>
            <span style={{ textAlign:'right' }}>{line.qty}{line.product_snapshot.unit}</span>
            <span style={{ textAlign:'right' }}>₹{line.unit_price}</span>
            <span style={{ textAlign:'right' }}>₹{line.taxable_value.toFixed(2)}</span>
          </div>
          <div style={{ fontSize:'9px', color:'#666' }}>HSN:{line.product_snapshot.hsn_code} GST@{line.gst_rate}%: ₹{line.gst_amount.toFixed(2)}</div>
        </div>
      ))}
      <div style={{ borderTop:'1px dashed #000', paddingTop:'3px', marginTop:'3px' }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}><span>Taxable</span><span>₹{bill.subtotal.toFixed(2)}</span></div>
        <div style={{ display:'flex', justifyContent:'space-between' }}><span>GST</span><span>₹{bill.gst_amount.toFixed(2)}</span></div>
        {bill.rounding !== 0 && <div style={{ display:'flex', justifyContent:'space-between' }}><span>Rounding</span><span>₹{bill.rounding}</span></div>}
        <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:'13px', borderTop:'1px solid #000', marginTop:'2px', paddingTop:'2px' }}>
          <span>TOTAL</span><span>₹{bill.total.toFixed(2)}</span>
        </div>
      </div>
      <div style={{ borderTop:'1px dashed #000', paddingTop:'3px', marginTop:'3px' }}>
        <div style={{ fontWeight:'bold', marginBottom:'2px' }}>Payment</div>
        {bill.payments.map((p, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ textTransform:'capitalize' }}>{p.mode==='credit'?'Udhaar':p.mode}{p.ref_no?` (${p.ref_no})`:''}</span>
            <span>₹{p.amount.toFixed(2)}</span>
          </div>
        ))}
        {bill.credit_amount > 0 && <div style={{ marginTop:'3px', fontWeight:'bold', color:'#c00' }}>Udhaar Added: ₹{bill.credit_amount.toFixed(2)}</div>}
      </div>
      <div style={{ borderTop:'1px dashed #000', paddingTop:'3px', marginTop:'3px', textAlign:'center', fontSize:'10px', color:'#666' }}>
        <div>Thank you for your business!</div>
        <div>Goods once sold will not be taken back without receipt.</div>
      </div>
    </div>
  )
})
BillReceipt.displayName = 'BillReceipt'
export default BillReceipt
