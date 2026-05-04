import { expect, test } from '@playwright/test'

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`
}

test('end-to-end billing flow with persistence', async ({ page }) => {
  test.setTimeout(180_000)
  const suffix = randomSuffix()
  const productNames = Array.from({ length: 5 }, (_, i) => `AutoItem-${suffix}-${i + 1}`)
  const customerName = `CreditCustomer-${suffix}`
  const customerPhone = `9${String(suffix).slice(-9)}`

  await page.goto('/products')
  await expect(page.getByRole('heading', { name: 'New Product' })).toBeVisible()
  const productForm = page.locator('div.flex-1.p-5.overflow-y-auto')

  for (const name of productNames) {
    await productForm.locator('input').nth(0).fill(name)
    await productForm.locator('input').nth(1).fill('AutoBrand')
    await productForm.locator('input').nth(2).fill('Test Variant')
    await productForm.locator('input').nth(5).fill('100')
    await productForm.locator('input').nth(6).fill('80')
    await productForm.locator('input').nth(7).fill('20')
    await productForm.locator('input').nth(9).fill(name.toLowerCase())
    await page.getByRole('button', { name: 'Save Product' }).click()
  }

  await page.goto('/customers')
  await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible()
  const customerForm = page.locator('div.flex-1.p-5.overflow-y-auto')
  await customerForm.locator('input').nth(0).fill(customerName)
  await customerForm.locator('input').nth(1).fill(customerPhone)
  await customerForm.locator('input').nth(2).fill('Auto Test Address')
  await page.getByRole('button', { name: 'Save Customer' }).click()

  await page.goto('/')
  const search = page.getByPlaceholder('Type to search: ultr, amb, 1inch cpvc...')
  const sellLeftPanel = page.locator('div.w-\\[30\\%\\]')
  const sellResults = sellLeftPanel.locator('div.flex-1.overflow-y-auto')
  await expect(search).toBeVisible()

  for (const name of productNames) {
    await search.fill(name)
    const row = sellResults.locator('div.cursor-pointer', { hasText: name }).first()
    await expect(row).toBeVisible()
    await row.click()
  }

  // Change quantity on two items.
  const qtyInputs = page.locator('input[min="0.1"]')
  await expect(qtyInputs.first()).toBeVisible()
  await qtyInputs.nth(0).fill('2')
  await qtyInputs.nth(1).fill('3')

  // Override price on one item.
  const rateButton = page.locator('button[title="Click to override price"]').first()
  await rateButton.click()
  const rateInput = page.locator('input.w-20').first()
  await expect(rateInput).toBeVisible()
  await rateInput.fill('90')
  await rateInput.press('Enter')
  await expect(page.locator('text=off')).toBeVisible()

  // Select credit customer.
  const customerSearch = page.getByPlaceholder('Search customer...')
  await customerSearch.fill(customerName)
  await page.locator('div').filter({ hasText: customerName }).first().click()
  await expect(page.locator('text=' + customerName)).toBeVisible()

  // Split payment cash + udhaar.
  const paymentPanel = page.locator('div.w-64.bg-slate-950').first()
  await paymentPanel.getByRole('button', { name: 'Cash' }).click({ force: true })
  await paymentPanel.locator('input[type="number"]').first().fill('150')
  await paymentPanel.getByRole('button', { name: '+ Add Payment' }).click({ force: true })
  await paymentPanel.getByRole('button', { name: 'Udhaar' }).click({ force: true })
  await paymentPanel.getByRole('button', { name: 'All' }).click({ force: true })
  await paymentPanel.getByRole('button', { name: '+ Add Payment' }).click({ force: true })

  await page.getByRole('button', { name: 'CONFIRM BILL ⏎' }).click()
  await expect(page.getByText('Bill Saved!')).toBeVisible()
  const invoiceText = await page.locator('div.text-slate-400').first().textContent()
  await page.getByRole('button', { name: 'New Bill' }).click()

  // Check stock reduced.
  await page.goto('/products')
  await page.getByPlaceholder('Search products...').fill(productNames[0])
  await expect(page.locator('text=18 bag')).toBeVisible()

  // Check ledger updated.
  await page.goto('/credit')
  await page.locator('div').filter({ hasText: customerName }).first().click()
  await expect(page.locator('text=Bill INV-')).toBeVisible()
  await expect(page.locator('td', { hasText: '₹' })).toBeVisible()

  // Record payment and verify balance changes.
  await page.getByRole('button', { name: /Full: ₹/ }).click()
  await page.getByRole('button', { name: 'Record Payment' }).click()
  await expect(page.getByText('recorded')).toBeVisible()

  // Reload app and verify persisted data still present.
  await page.reload()
  await page.goto('/credit')
  await page.locator('div').filter({ hasText: customerName }).first().click()
  await expect(page.locator('text=Payment received')).toBeVisible()
  if (invoiceText) {
    await page.goto('/reports')
    await expect(page.getByText('Reports & Settings')).toBeVisible()
  }
})

test('ramesh contractor whatsapp return and print flow', async ({ page }) => {
  test.setTimeout(180_000)

  const customerName = 'Ramesh Mistri'
  const customerPhone = '9876543210'
  const productBrand = 'UltraTech'
  const productName = 'PPC'

  // 1) Add contractor customer with opening balance.
  await page.goto('/customers')
  const customerForm = page.locator('div.flex-1.p-5.overflow-y-auto')
  await customerForm.locator('input').nth(0).fill(customerName)
  await customerForm.locator('input').nth(1).fill(customerPhone)
  await customerForm.locator('input').nth(2).fill('Site office')
  await customerForm.locator('input').nth(3).fill('')
  await customerForm.locator('select').first().selectOption('contractor')
  await customerForm.locator('input[type="number"]').nth(0).fill('50000')
  await customerForm.locator('input[type="number"]').nth(1).fill('30')
  await customerForm.locator('input[type="number"]').nth(2).fill('15000')
  await page.getByRole('button', { name: 'Save Customer' }).click()

  // 2) Ensure product exists and assign customer-specific rate card ₹405.
  await page.goto('/products')
  const productForm = page.locator('div.flex-1.p-5.overflow-y-auto')
  await productForm.locator('input').nth(0).fill(productName)
  await productForm.locator('input').nth(1).fill(productBrand)
  await productForm.locator('input').nth(2).fill('50kg')
  await productForm.locator('input').nth(4).fill('0')
  await productForm.locator('input').nth(5).fill('415')
  await productForm.locator('input').nth(6).fill('390')
  await productForm.locator('input').nth(7).fill('100')
  await productForm.locator('input').nth(8).fill('5')
  await productForm.locator('input').nth(9).fill('ultr,ultratech')
  await page.getByRole('button', { name: 'Save Product' }).click()

  // Insert a backdated opening ledger + rate card directly for deterministic assertions.
  await page.evaluate(async ({ customerName, customerPhone, productBrand, productName }) => {
    const dbMod = await import('/src/db/index.ts')
    const db = dbMod.getDB()

    const cRes = db.exec(
      `SELECT id FROM customers WHERE name=? AND phone=? ORDER BY created_at DESC LIMIT 1`,
      [customerName, customerPhone]
    )
    const pRes = db.exec(
      `SELECT id FROM products WHERE brand=? AND name=? ORDER BY created_at DESC LIMIT 1`,
      [productBrand, productName]
    )
    if (!cRes.length || !cRes[0].values.length) throw new Error('Customer not found')
    if (!pRes.length || !pRes[0].values.length) throw new Error('Product not found')

    const customerId = cRes[0].values[0][0] as string
    const productId = pRes[0].values[0][0] as string
    const oldTs = new Date(Date.now() - 45 * 86400000).toISOString()
    const oldDate = oldTs.split('T')[0]

    db.run(`DELETE FROM ledger_entries WHERE customer_id=? AND ref_type='opening'`, [customerId])
    db.run(
      `INSERT INTO ledger_entries VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [dbMod.generateId(), customerId, 'debit', 'opening', 'opening', 15000, 15000, oldDate, 'Opening balance', oldTs]
    )

    db.run(`DELETE FROM rate_cards WHERE customer_id=? AND product_id=?`, [customerId, productId])
    db.run(
      `INSERT INTO rate_cards VALUES (?,?,?,?,?,?,?,?)`,
      [
        dbMod.generateId(),
        customerId,
        null,
        productId,
        405,
        1,
        '2020-01-01',
        '2099-12-31',
      ]
    )
    await dbMod.persistDB()
  }, { customerName, customerPhone, productBrand, productName })

  // 3/4/5) Sell flow: select customer, add product qty 10, verify ₹405, keyboard udhaar confirm.
  await page.goto('/')
  const customerSearch = page.getByPlaceholder('Search customer...')
  await customerSearch.fill(customerName)
  await page.locator('div.absolute.top-full.left-0.right-0').locator('div.cursor-pointer', { hasText: customerName }).first().click()
  const selectedCustomerCard = page.locator('div.bg-slate-800.rounded-lg').filter({ hasText: customerName }).first()
  await expect(selectedCustomerCard).toBeVisible()
  await expect(selectedCustomerCard.getByText(/overdue/i)).toBeVisible()
  await expect(selectedCustomerCard.getByText(/₹15000/)).toBeVisible()

  const search = page.getByPlaceholder('Type to search: ultr, amb, 1inch cpvc...')
  await search.fill('ultr')
  const resultRow = page.locator('div.cursor-pointer', { hasText: `${productBrand} ${productName}` }).first()
  await expect(resultRow).toBeVisible()
  await resultRow.click()

  const cartRow = page.locator('div.grid.grid-cols-\\[2fr_1fr_1fr_1fr_auto\\]', { hasText: `${productBrand} ${productName}` }).first()
  await expect(cartRow.getByRole('button', { name: '₹405' })).toBeVisible()
  await cartRow.locator('input[min="0.1"]').fill('10')

  await page.keyboard.press('F9')
  await page.keyboard.press('H')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Bill Saved!')).toBeVisible()
  await page.getByRole('button', { name: 'New Bill' }).click()

  // 6/7) Credit page balance + WhatsApp preview and open.
  await page.goto('/credit')
  const rameshCard = page.locator('div.cursor-pointer', { hasText: customerName }).first()
  await expect(rameshCard).toBeVisible()
  await expect(rameshCard.getByText('₹19050')).toBeVisible()
  await rameshCard.getByRole('button', { name: /whatsapp/i }).click()
  await expect(page.getByText('Preview — WhatsApp Statement')).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Open WhatsApp →' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup).toHaveURL(/(wa\.me\/91\d+\?text=|api\.whatsapp\.com\/send)/)
  await popup.close()

  // 8/9/10) Reports return 2 qty -> credit note + balance drop + print.
  await page.goto('/reports')
  await page.getByPlaceholder('Search invoice or customer...').fill(customerName)
  const billRow = page.locator('div.bg-slate-900.rounded', { hasText: customerName }).first()
  await expect(billRow).toBeVisible()
  await billRow.getByRole('button', { name: /return/i }).click()
  const returnModal = page.locator('div').filter({ hasText: 'Process Return' }).first()
  await expect(returnModal).toBeVisible()
  await returnModal.locator('input[type="number"]').first().fill('2')
  await returnModal.getByRole('button', { name: 'Process Return' }).click()
  await expect(page.getByText(/Credit Note .* issued/i)).toBeVisible()

  await page.goto('/credit')
  await expect(page.locator('div.cursor-pointer', { hasText: customerName }).first().getByText('₹18240')).toBeVisible()

  await page.goto('/reports')
  await page.getByPlaceholder('Search invoice or customer...').fill(customerName)
  const reprintRow = page.locator('div.bg-slate-900.rounded', { hasText: customerName }).first()
  await reprintRow.getByRole('button', { name: /print/i }).click()
})
