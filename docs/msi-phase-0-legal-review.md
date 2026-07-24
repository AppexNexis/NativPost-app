# MSI — Phase 0: Legal & Platform Review Checklist

**Status:** Working checklist — the gate that must pass before any real account provisioning/operation ships (roadmap Phase 3 execution). Living document.
**Owner:** [assign — Legal lead]
**Parent:** [managed-social-infrastructure.md](./managed-social-infrastructure.md) (§2.3, §9, §16 Phase 0)
**Last updated:** 2026-07-23

> ⚠️ **This is not legal advice.** It is a structured checklist to run *with* qualified counsel (and, where noted, platform-relations and a DPO). Each item is a decision to resolve and evidence to attach — not a conclusion. Nothing here should be read as an assertion that the model is compliant; that determination is the output of completing this review.

---

## 0. How to use this

- Phase 0 **blocks** the execution parts of Phase 3+ (creating/operating real accounts, applying the worker plan to live platform actions, releasing credentials). The *build* work already done (schema, grant enforcement, vault, capacity/worker engines, DB services) is deliberately inert until this passes.
- Each item is `- [ ]` until resolved. For every item record: **decision**, **owner**, **evidence/link**, **date**.
- An item is only "done" when a named approver in §13 signs the corresponding domain.
- **Exit gate:** every item in §12 (the hard blockers) resolved + all §13 sign-offs recorded. Anything unresolved keeps provisioning execution behind its feature flag.
- **Scope of this pass:** the first launch scope only — pin it now: **[platforms: e.g. Instagram, TikTok] × [countries: e.g. US, UK]**. Every *new* platform or country triggers a scoped re-run (§14).

---

## 1. The model being reviewed (what counsel is signing off on)

Confirm the reviewers are evaluating the **compliant Managed Local Presence** model, not a warmed-accounts marketplace. The material facts:

- [ ] Accounts represent a **real, disclosed brand the customer owns**; each is tied to a real `brand_profile` (never anonymous inventory).
- [ ] The customer **owns the account and credentials** from day one; NativPost operates under a signed, revocable **Authorization Grant** (`authorization_grant` table).
- [ ] Operation is **genuine local activity** by in-country staff on real local devices/connectivity — geo-authenticity is real, **not** spoofed.
- [ ] Credentials are held in an encrypted vault and are **customer-retrievable on exit** (custody state machine → `released`).
- [ ] The following are **out of scope and not built**: detection/"anti-ban" evasion, credential-withholding to protect geo-spoofing, accounts-as-transferable-inventory, proxy/IP tooling to simulate provenance.
- [ ] Reviewers have read parent doc §2 (the compliance spine) and agree these facts match what will actually ship.

---

## 2. Per-platform operating model *(core risk — §2.3)*

Owner: **Legal + Platform-relations**. Resolve **per platform**; do not generalize one platform's answer to another. Fill the matrix, one row per launch platform.

| Question | Instagram/Meta | TikTok | Notes |
|---|---|---|---|
| Does ToS/Business Terms permit a third party operating an account **on behalf of** a client? | | | |
| Sanctioned mechanism: (a) official Business/Partner API, (b) delegated access (Meta Business Mgr partner assignment / TikTok Business Center roles), (c) documented device-based operation w/ disclosure? | | | Prefer (a)/(b). |
| Are our **publishing API** calls within permitted use (IG Content Publishing / TikTok Content Posting API)? | | | Protects existing OAuth apps. |
| Rules on **account creation on behalf of a client** (who may create; real-identity requirements)? | | | |
| Rules on **operating many clients** from one org/infrastructure (isolation requirements)? | | | Legitimate agency multi-tenancy vs. coordinated inauthentic behavior. |
| Does our model risk being construed as account **sale/transfer** (prohibited)? Confirm customer-owned-from-day-one defeats this. | | | |
| Confirm no **provenance misrepresentation** (real local device + connectivity; no proxy spoofing). | | | |
| **Automation** limits (rate limits, prohibited automated actions) for operator activity? | | | |

- [ ] Each launch platform has a **named, sanctioned operating mechanism** documented above.
- [ ] Confirmed our developer/OAuth apps (used by the existing publishing product) are **not put at risk** by the MSI operating model — enforcement against MSI must not cascade to the core product.
- [ ] Written record of the ToS/policy sections relied on (dated — platform terms change; §14 re-review).

---

## 3. Authorization Grant & agency instrument

Owner: **Legal**. This is the legal backbone that `authorization_grant` records.

- [ ] The grant is **legally sufficient** to authorize NativPost as the customer's agent to create + operate accounts in the named scope.
- [ ] Determine whether each platform additionally requires a **platform-native authorization step** (e.g. customer adding NativPost as a partner in Business Manager / Business Center) — if so, provisioning must require it before `brand_setup`.
- [ ] **Liability & indemnification:** allocation for account suspension/ban, content claims, and misuse; customer indemnifies for brand-rights/impersonation.
- [ ] **Customer warranties:** they own or are licensed to use the brand/identity/handles requested (anti-impersonation hook for the AUP §4).
- [ ] **Termination & off-boarding:** customer's right to credentials on exit; NativPost's obligation to release (matches custody `transfer_requested → released`, dual-auth + rotation).
- [ ] **Scope binding:** the grant's platform/country scope is legally meaningful and matches the enforced `scope` field (`grantCoversScope`).
- [ ] **Versioning:** grant terms are versioned (`grant_version`) and re-consent is required on material change.
- [ ] Governing law / dispute resolution / venue set.

---

## 4. Acceptable Use Policy (AUP) & content

Owner: **Legal + Trust/Policy**. Prevents the product being used for impersonation/spam/illegal content.

- [ ] Prohibited uses defined: impersonating people/brands the customer doesn't own; spam/inauthentic engagement; deceptive or illegal content; regulated-vertical violations (pharma, gambling, crypto/financial advice, adult, political ads).
- [ ] **Brand-legitimacy gate** before provisioning (ties to §5 KYC and Ops onboarding gate, parent §8.2): no job enters `brand_setup` until verified.
- [ ] Content responsibility model: customer supplies/approves content; NativPost publishes. Who bears liability for what is explicit.
- [ ] Enforcement rights: suspend/terminate for AUP breach; audit-logged.
- [ ] Takedown/DMCA and platform-restriction handling procedure (ties to `appeal_restriction` job).

---

## 5. Customer verification (KYC) & sanctions

Owner: **Legal + Compliance**.

- [ ] Minimum verification before a customer may order managed accounts (business identity; evidence of brand ownership/authorization).
- [ ] **Sanctions/denied-party screening** (e.g. OFAC and local equivalents) given cross-border operation — customers and, where relevant, beneficial owners.
- [ ] AML considerations if/where money movement warrants it.
- [ ] Records retention for verification evidence (with §6 retention rules).

---

## 6. Data protection & privacy (multi-jurisdiction)

Owner: **DPO / Privacy counsel**. Operators span many countries → cross-border by default.

- [ ] **Controller/processor mapping:** for managed-account content and audience data, is NativPost a controller or a processor for the customer? Document per data category.
- [ ] **DPA** in place with customers; **sub-processor** disclosures (in-country operators, cloud, vault provider).
- [ ] **Lawful basis** for each processing purpose (account operation, analytics, credentials, audit log).
- [ ] **Cross-border transfer** mechanism (SCCs/adequacy) covering operators in launch countries.
- [ ] **Credential data** classified as sensitive; handling matches §7 vault controls; access is least-privilege and audited (`msi_activity_log`).
- [ ] **Data-subject rights**, retention schedule, and deletion/off-boarding paths defined (incl. audit-log retention — it's append-only; confirm lawful).
- [ ] Operators' access to personal data governed by processor terms + confidentiality.

---

## 7. Security & credential custody

Owner: **Security + Legal**. Validates the vault (parent §9) meets legal/contractual bars.

- [ ] Custody/escrow model is **legally sufficient** and disclosed to customers (we operate; they own; retrievable on exit).
- [ ] Encryption-at-rest approach accepted (envelope encryption; DEK-per-secret wrapped by KMS master key; separate storage of blob vs. wrapped DEK).
- [ ] **Key management**: production `MSI_VAULT_MASTER_KEY` custody, rotation policy, and access controls signed off (the in-memory blob store is dev-only — prod backend required before launch).
- [ ] **Breach notification** obligations mapped (GDPR 72h; applicable US state laws; contractual).
- [ ] Incident-response runbooks exist for credential compromise / forced rotation / freeze (parent §12).
- [ ] Access reviews for who/what can read vault material.

---

## 8. Labor, contractor model & in-country operations

Owner: **Employment counsel + Ops**. Often the most underestimated risk area.

- [ ] Operator **classification** per launch country (employee vs. contractor) assessed; misclassification risk documented.
- [ ] **Employer/engagement-of-record** model per country; payroll, tax withholding, benefits, local labor law.
- [ ] Confidentiality + acceptable-conduct terms for operators; access scoped to assigned jobs only (enforced at query layer, parent §3.2).
- [ ] Liability for operator actions on customer accounts.

---

## 9. Telecom, SIM & device procurement

Owner: **Ops + Legal**.

- [ ] **SIM registration/KYC laws** per country (many require ID to register a SIM) — who registers, in whose name, and is that lawful?
- [ ] Device ownership, insurance, and loss/replacement liability.
- [ ] Telecom/reseller regulations per country for our usage pattern.

---

## 10. Financial, tax & consumer protection

Owner: **Finance + Legal**.

- [ ] **Indirect tax** (VAT/GST/sales tax) on managed-account subscriptions + per-post fees, per country/region (ties to parent §8 regional pricing).
- [ ] Operator compensation flows and local tax obligations.
- [ ] **Refund/chargeback policy** for undeliverable or platform-suspended accounts (what does the customer get if an account is banned?).
- [ ] Consumer-protection rules for the subscription (cancellation, auto-renewal disclosures) per market.

---

## 11. Marketing & claims substantiation

Owner: **Legal + Marketing**. The framing must not reintroduce the risks we removed.

- [ ] Marketing copy contains **no** "anti-ban", "undetectable", guaranteed-reach, or evasion language.
- [ ] Positioning is "managed local presence you own," consistent with parent §1.
- [ ] **SLA/ETA claims** (e.g. "95% within N days," capacity confidence figures) are substantiated by real data before being published; caveated until then.
- [ ] No implied platform endorsement/partnership unless one actually exists (§12).

---

## 12. Hard blockers (must ALL be resolved to exit Phase 0)

Provisioning execution stays flag-off until each of these is a documented **yes**:

- [ ] **B1.** Each launch platform has a named, sanctioned operating mechanism (§2) — counsel-confirmed.
- [ ] **B2.** The Authorization Grant is legally sufficient and, where required, backed by platform-native authorization (§3).
- [ ] **B3.** AUP + brand-legitimacy gate are in force and technically enforced before `brand_setup` (§4).
- [ ] **B4.** KYC + sanctions screening operational for launch markets (§5).
- [ ] **B5.** Privacy posture (controller/processor, DPA, transfers, credential handling) signed off by DPO (§6, §7).
- [ ] **B6.** Production credential-vault backend + key custody approved (§7).
- [ ] **B7.** Operator labor model lawful in each launch country (§8).
- [ ] **B8.** SIM/telecom registration approach lawful per launch country (§9).
- [ ] **B9.** Marketing reviewed; no evasion/guarantee claims; SLA claims substantiated or caveated (§11).

---

## 13. Sign-off

Provisioning execution may be enabled only with every row signed. Record name + date; attach conditions.

| Domain | Approver (role) | Decision | Conditions | Date |
|---|---|---|---|---|
| Platform operating model (§2) | Legal + Platform-relations | | | |
| Authorization Grant (§3) | Legal | | | |
| Acceptable Use & content (§4) | Legal + Trust/Policy | | | |
| KYC & sanctions (§5) | Compliance | | | |
| Privacy / data protection (§6) | DPO | | | |
| Security & credentials (§7) | Security | | | |
| Labor / operations (§8) | Employment counsel | | | |
| Telecom / SIM (§9) | Legal + Ops | | | |
| Finance / tax / consumer (§10) | Finance + Legal | | | |
| Marketing & claims (§11) | Legal + Marketing | | | |
| **Final go / no-go** | Exec sponsor | | | |

---

## 14. Re-review triggers

Re-run the relevant sections when any of these change — do **not** treat Phase 0 as one-and-done:

- New **platform** or new **country** enters scope (scoped re-run; each new infrastructure type also gets its own Phase-0-style review per parent §15).
- A platform materially changes its ToS / Business terms / API policy.
- Change to the operating mechanism, credential-custody model, or the operator labor model.
- A material security incident or regulatory change (privacy, sanctions, telecom, tax).

---

## 15. Changelog

- **2026-07-23** — Initial Phase 0 checklist drafted, grounded in the built compliant model (grant enforcement, credential vault, no-evasion stance). Hard blockers (§12) + sign-off matrix (§13) defined.
