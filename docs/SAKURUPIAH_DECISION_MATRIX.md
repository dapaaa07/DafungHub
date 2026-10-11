# Sakurupiah Payment Gateway: Knowledge Base & Agentic Decision Matrix

This document defines machine-parsable specifications, mathematical models, risk boundaries, and rule-based decision trees for the DaFung Hub Agentic AI managing transactions, pricing, and gateway routing via **sakurupiah.id**.

---

## 1. Merchant Profile & Verification Rules (KYC)

### 1.1 Account Tiers & Entity Verification
- **Account Type Supported**: Individual / Solo Merchant (*Perorangan / UMKM Mikro*) and Legal Entity (*Badan Usaha*).
- **Required Documentation for Individuals**:
  1. **KTP** (Primary Identity Card) — **MANDATORY**.
  2. **Bank Account** (Settlement destination matching KTP identity) — **MANDATORY**.
  3. **Business Media URL** (Active Website, Online Catalog, or Social Media showing products, pricing, checkout flow, and contact) — **MANDATORY**.
- **Optional / Conditional Documents**:
  - **NPWP** (Tax Identification Number) — **OPTIONAL** (Labeled *(jika diperlukan)*; leave blank for individual accounts if unavailable).
  - **NIB / Legal Registration** — **OPTIONAL** (Only required for incorporated entities / PT / CV).

### 1.2 Exception Handling Protocol (Agent Action)
```yaml
rule_verification_failure_or_pending:
  trigger: "Status remains unverified > 24 hours OR system enforces NPWP/NIB on individual tier"
  actions:
    - action: "escalate_to_human_or_support"
      target_channels:
        email: "support@sakurupiah.id"
        chat: "Official WhatsApp Support (+6282133014951)"
      payload_message: "Registration Tier: Perorangan/Individu. Identity: KTP verified. Requesting manual override to waive NIB/NPWP requirement as per documentation guidelines."
```

---

## 2. Channel Fee Matrix & Parameters

| Channel Code | Category | Base Fee (Rate $R_c$) | Fixed Fee ($F_c$) | Settlement Time | Suitable Transaction Bracket |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`QRIS`** (*Standard*) | Dynamic QR | $0{,}7\%$ | $\text{Rp } 350$ | $H+1$ | $T > \text{Rp } 175.000$ |
| **`QRISC`** | Dynamic QR | $0{,}7\%$ | $\text{Rp } 100$ | $H+1$ | General / Balanced |
| **`QRISMU`** | Dynamic QR | $0{,}8\%$ | $\text{Rp } 250$ | $H+1$ | Alternative QR |
| **`QRIS2`** | Dynamic QR | $0{,}9\%$ | $\text{Rp } 0$ | $H+1$ | $T \le \text{Rp } 175.000$ |
| **`SHOPEEPAY`** | E-Wallet Direct | $3{,}0\%$ | $\text{Rp } 0$ | $H+2$ | Mobile App Deeplink |
| **`GOPAY`** | E-Wallet Direct | $3{,}0\%$ | $\text{Rp } 0$ | $H+2$ | Mobile App Deeplink |
| **`BCAVA`** | Virtual Account | $0\%$ | $\text{Rp } 4.900$ | $H+1$ | High Value ($> \text{Rp } 500.000$) |
| **`BAGVA`** | Virtual Account | $0\%$ | $\text{Rp } 4.200$ | $H+1$ | High Value |
| **`VA_GENERAL`** | Virtual Account | $0\%$ | $\text{Rp } 3.500$ | $H+1$ | High Value |
| **`RETAIL_OUTLET`** | Indomaret / Alfamart | $0\%$ | $\text{Rp } 3.000$ | $H+1$ | Cash-preferred users |

---

## 3. Mathematical Models & Cost Formulas

### 3.1 Gateway Deduction Formula
For a transaction nominal $T$:
$$\text{Fee}(T, c) = (T \times R_c) + F_c$$

Net Payout Received ($P_{\text{net}}$):
$$P_{\text{net}} = T - \text{Fee}(T, c)$$

### 3.2 Channel Threshold Comparison (QRIS vs QRIS2)
$$\text{Fee}_{\text{QRIS}} = 0{,}007 \cdot T + 350$$
$$\text{Fee}_{\text{QRIS2}} = 0{,}009 \cdot T$$

Inversion point ($T_{\text{threshold}}$):
$$0{,}009 \cdot T = 0{,}007 \cdot T + 350 \implies 0{,}002 \cdot T = 350 \implies T = \mathbf{\text{Rp } 175.000}$$

**Routing Policy**:
- For $T < \text{Rp } 175.000 \implies$ `QRIS2` is more economical than `QRIS Standard`.
- For $T > \text{Rp } 175.000 \implies$ `QRIS Standard` is more economical.

---

## 4. Reseller Economics & Margin Risk Evaluation

### 4.1 Vulnerability of Static Flat Markup
Given:
- Cost of Goods Sold ($\text{COGS}$)
- Flat nominal markup: $M_{\text{flat}} = \text{Rp } 5.000$
- Retail Price: $T = \text{COGS} + M_{\text{flat}}$

Net Profit:
$$\Pi_{\text{net}} = M_{\text{flat}} - \text{Fee}(T, c)$$

### 4.2 Zero-Profit Threshold
$$(T \times 0{,}007) + 350 = 5.000 \implies T_{\text{max}} = \frac{4.650}{0{,}007} \approx \mathbf{\text{Rp } 664.285{,}71}$$

> [!CAUTION]
> **Safety Constraint for Agent**: Never apply a static flat markup of $\le \text{Rp } 5.000$ when $T \ge \text{Rp } 664.285$, as net profit turns zero or negative (nombok).

---

## 5. Agentic AI Decision Logic

### 5.1 Dynamic Pricing Engine (Cost-Plus Protection)
$$\text{Price} = \frac{\text{COGS} + \Pi_{\text{target}} + F_c}{1 - R_c}$$
Rounded up to the nearest market increment (Rp 500).

### 5.2 Dynamic Gateway Routing Policy
Evaluates all active channels for the exact nominal $T$ and routes to $\arg\min_c \text{Fee}(T, c)$.

### 5.3 Cash Flow & Disbursement Buffer Rule
```yaml
settlement_and_payout_policy:
  holding_period: "H+1 for QRIS / VA, H+2 for E-Wallet Direct"
  disbursement_fee_reserve:
    rule: "Batch withdrawals"
    condition: "wallet_balance >= 1000000"
    rationale: "Prevents per-transfer disbursement fees from eroding aggregated small-ticket profit margins."
```
