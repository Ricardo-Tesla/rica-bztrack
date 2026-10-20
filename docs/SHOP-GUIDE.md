# Rica BizTrack — Shop owner's guide

This guide is for the person who runs the shop. It takes about 10 minutes to read.

---

## 1. Installing

1. Run the file **`Rica BizTrack_x.x.x_x64-setup.exe`**.
2. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway**.
   (This appears because the app is new; it is safe.)
3. The app opens by itself. You do **not** need internet to use it.

**Computer:** Windows 10 or 11, 64-bit, 4 GB RAM recommended.
**Receipt printer:** any 58 mm or 80 mm printer that works in Windows (USB or Bluetooth).
**Barcode scanner:** any USB scanner — plug it in, nothing to install.

---

## 2. First start (5 steps)

1. **Language** — English, Kinyarwanda or Français (you can change it later).
2. **Shop details** — shop name, TIN, phone, address. These are printed on receipts.
3. **VAT** — choose *Yes* only if your business is registered for VAT with RRA.
4. **Owner account** — your name and a PIN of 4–6 digits.
5. **Recovery code** — a code like `K7Q2-XM9P-4TBA`.
   **Write it on paper and keep it safe.** If you forget your PIN, it is the only
   way back into the owner account.

---

## 3. Every day

### Selling (Point of Sale)
1. Click products, or **scan the barcode** (or type the code and press Enter).
2. Change quantities with **− / +**, or type them (e.g. `1.5` for 1.5 kg).
3. Choose the customer if needed, and the **payment method**:
   - **Cash** — type the money received; the app shows the **change**.
   - **Mobile Money / Card / Bank** — type the transaction ID (optional, useful later).
   - **Credit** — the customer pays later (see *Debts* below).
4. Add a **discount** if you give one (RWF or %).
5. Click **Complete Sale**, then **Print**.

> The first time you print, Windows asks which printer to use: choose your
> receipt printer. Windows remembers it.

If the app says *"Not enough stock"*, someone else sold the last items or the
stock count is wrong — check the product.

### Locking the app
Click **🔒 Lock** when you leave the computer. The app also locks itself after
15 minutes without use (change this in **Settings → General**).

---

## 4. Customers who owe you (ideni)

- **Selling on credit:** choose the customer, choose **Credit**, and type what the
  customer pays now (if anything). The rest becomes their debt.
- **See who owes:** **Customers** page → column *Owes* (tick *Only customers who owe*).
- **When they pay:** click **Record payment**, type the amount → **Save payment**.
- **Statement:** shows each credit sale and each payment.

---

## 5. Stock

- **New stock arrived:** **Products → Restock**. Type the quantity and the cost per unit.
  The app updates the average buy price and logs the payment.
  Do **not** record stock purchases as Expenses — your profit would be wrong.
- **Count is wrong:** **Products → Edit → Stock (correction)**. The change is saved in
  the product's *History*.
- **Low stock:** the Dashboard lists products that are running out.

---

## 6. Money and profit

- **Expenses:** rent, salaries, transport, electricity... (**Expenses → Add Expense**).
- **Transactions:** every franc in and out, with totals per payment method —
  use it to check the cash box and the MoMo balance.
- **Profit & Loss:** choose the period (this month, last month...). This is your real
  profit: sales − VAT − cost of goods sold − expenses.
- **Excel:** most pages have an **Excel** button — send the file to your accountant.

---

## 7. Cashiers

**Settings → Users → Add user** → name, role *Cashier*, PIN.

Cashiers can: sell, see sales history, print receipts, add customers, record debt
payments.
Cashiers cannot: see profits or buy prices, change products, void sales, delete
anything, change settings or restore backups.

Every sale, void, payment and stock change records **who** did it.

---

## 8. Mistakes

- **Wrong sale:** **Sales History → View → Void Sale** (owner only). Give a reason.
  The items go back into stock and the refund is recorded.
- **Wrong payment:** **Customers → Statement → Cancel** next to the payment (owner only).
- **Deleting products, customers or suppliers:** if they have history, they are
  *archived* (hidden) so old reports stay correct.

---

## 9. Backups — please read

- The app makes a **full backup every day** automatically, and keeps the last 30.
- They go to **Documents\Rica BizTrack Backups**.
- **Strongly recommended:** in **Settings → Backups → Change folder**, choose a
  **USB drive** or a **OneDrive / Google Drive** folder. If the computer is stolen
  or broken, your data is safe.
- **Restore:** **Settings → Backups** → *Restore* next to a backup. The app first
  saves a safety copy of the current data, then restarts.

---

## 10. VAT and EBM

If your business is VAT-registered, turn on VAT in **Settings → Receipts & VAT**.
Prices are then treated as **including VAT**, and VAT is shown on receipts and in
Profit & Loss.

**Receipts from Rica BizTrack are not EBM invoices.** You must still issue official
invoices with RRA's EBM system. You can write the EBM receipt number on each sale
(**Sales History → View → EBM receipt number**).

---

## 11. Updates

When a new version is available, the owner sees a blue message at the top.
Go to **Settings → About → Install update**. The app closes, updates and reopens;
your data is kept. Do it when no sale is in progress.

---

## 12. Problems?

- **Forgot the owner PIN:** on the sign-in screen click **Owner forgot PIN?** and use
  your recovery code.
- **Lost the recovery code:** **Settings → General → Create new recovery code** (while
  signed in as owner).
- **Something does not work:** note what you did, and send the log file to support.
  Its location is shown in **Settings → About**.
