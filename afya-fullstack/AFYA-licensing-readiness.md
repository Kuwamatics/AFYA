# AFYA — Compliance & Licensing Readiness Pack (Kenya)

*A practical map of what you must put in place to operate legally as a digital health marketplace in
Kenya, who regulates each part, and the order to tackle it. This is a working checklist to take to a
Kenyan healthcare/commercial lawyer — not legal advice, and not a substitute for one. Regulations
here changed significantly in 2024–2025, so confirm current requirements directly with each body.*

---

## The headline change you must know

Kenya now regulates digital health platforms directly. Two things matter most:

1. **Digital Health Act, No. 15 of 2023 + the Digital Health Regulations, 2025** (Legal Notices 76 & 77 of 2025). These created a framework where **e-health and telemedicine platforms must be *certified*** by the digital health Agency against a Certification Framework before a healthcare provider or facility may use them. In short: the *platform itself* now needs certification, not just the doctors on it. Confirm the current Agency, the Form HMIS 4 application, and the self-attestation step.

2. **ODPC Certificate of Data Handler/Processor is now mandatory for health facilities.** Since 1 Jan 2025, KMPDC ties facility registration to holding a valid certificate from the Office of the Data Protection Commissioner. Health data is "sensitive data"; non-compliance carries fines up to **KES 5 million or 1% of annual turnover**. The ODPC has moved from advisory to active enforcement (thousands of complaints, real fines).

These two items did not exist in their current form a couple of years ago. Treat them as central, not peripheral.

---

## Who regulates what

| Body | Covers | What AFYA needs |
|---|---|---|
| **Digital Health Agency** (under the Digital Health Act 2023 / 2025 regs) | Certification of e-health & telemedicine platforms; the national health data exchange | **Platform certification** (Form HMIS 4 + self-attestation report); alignment to the Certification Framework |
| **ODPC** (Office of the Data Protection Commissioner) | Data Protection Act 2019 (Cap 411C); sensitive personal data | **Certificate of Data Handler/Processor**; lawful basis & consent; DPIA; breach process |
| **KMPDC** | Doctors, dentists, and health facilities | **Provider licence verification**; facility registration (now requires the ODPC certificate) |
| **Nursing Council of Kenya / Clinical Officers Council / allied boards** | Nurses, midwives, COs, physios, etc. | Verify each non-doctor provider against the right register |
| **Pharmacy & Poisons Board (PPB)** | Medicines, e-prescribing, controlled drugs | Rules for prescribing/dispensing; controlled-substance register & retention; pharmacy partner compliance |
| **Central Bank of Kenya (CBK)** | Payments, holding client funds | You must **not** hold patient funds directly — route through a **CBK-licensed PSP / payment partner** |
| **KRA** | Tax | eTIMS electronic tax invoicing on transactions |
| **SHA** (Social Health Authority, replaced NHIF) | Public health cover | Integration rules if you support SHA claims/eligibility |

---

## Readiness checklist (group by who must do it)

### A. Corporate & structural (lawyer + you)
- [ ] Register the legal entity that will own and be liable for AFYA.
- [ ] Decide and **document the revenue model as a platform/technology fee**, not clinician fee-splitting (fee-splitting between practitioners can be restricted — get this structured by counsel).
- [ ] Terms of Service + provider agreement (incl. the **non-circumvention clause** — confirm enforceability against patients vs providers).
- [ ] Clarify liability: AFYA as a *technology platform connecting verified providers*, with clinicians carrying clinical responsibility. Get the wording right.

### B. Data protection (ODPC) — do this early, it gates KMPDC
- [ ] Register with the **ODPC** and obtain the **Certificate of Data Handler/Processor**.
- [ ] Appoint/identify a Data Protection Officer.
- [ ] Privacy policy + explicit **consent flows** for collecting and sharing health data.
- [ ] **Data Protection Impact Assessment (DPIA)** for the platform.
- [ ] Technical & organisational measures: encryption at rest/in transit, access controls, **audit logging** (especially for the controlled-substance register and any message scanning), breach-notification process, data-retention schedule, data residency considerations.
- [ ] Disclose the **message-redaction/scanning** as processing in the privacy policy.

### C. Platform certification (Digital Health Agency)
- [ ] Prepare the **self-attestation report** on the digital health solution.
- [ ] Apply for certification (Form HMIS 4) against the **Certification Framework**.
- [ ] Confirm whether/how you must interoperate with the **national health data exchange** and Kenya HMIS standards.

### D. Provider verification (KMPDC + councils)
- [ ] Build a real verification step: collect licence number + body, verify against the relevant register **before** a provider goes live (the app already gates unverified providers — this is the human/process behind it).
- [ ] Keep evidence of verification on file.
- [ ] Facility registration via the KMPDC online portal if you operate as/through a facility.

### E. Payments (CBK-licensed PSP + KRA)
- [ ] Integrate **M-Pesa Daraja** through a properly registered business shortcode.
- [ ] Ensure **held funds / escrow** run through a **CBK-licensed payment service provider** — do not custody patient money yourself.
- [ ] **KRA eTIMS** electronic tax invoices on transactions.

### F. Medicines & diagnostics (PPB + partners)
- [ ] Confirm PPB rules for **e-prescribing**, prescriber e-signatures, and especially **controlled substances** (scheduling, register format, retention period, who may access).
- [ ] Replace the prototype's starter drug-interaction data with a **licensed clinical database** (First Databank / Medi-Span / DrugBank) before any real prescribing.
- [ ] Sign **pharmacy** (e.g. PharmaPOS/Medbook/SARU TECH) and **lab** (e.g. Cerba Lancet) partner agreements; integrate their APIs.

### G. SHA (if supporting public cover)
- [ ] Confirm current SHA integration requirements for eligibility/claims.

---

## Suggested order

1. **Entity + lawyer engaged** — nothing else is safe without this.
2. **ODPC certificate + data-protection measures** — gates KMPDC facility registration and is a hard legal requirement.
3. **Platform certification** with the Digital Health Agency — you legally need this for providers to use the platform.
4. **Provider verification process** live (KMPDC/councils).
5. **Payments done right** — M-Pesa via a CBK-licensed PSP + eTIMS.
6. **Medicines/labs** — licensed drug DB + signed partner integrations + PPB sign-off on controlled drugs.
7. **SHA** if/when you support it.
8. **Pilot** with a small, consenting cohort — only after 1–6.

---

## How the build maps to this

The prototype + backend already reflect several requirements *structurally* (they are not a substitute for the legal steps, but they show you've designed for them):
- Provider **verification gate** (unverified providers can't be booked).
- **Role-based access control** on every API route.
- **Controlled-substance register** + audit-style integrity metrics.
- **Consent/non-circumvention** acceptance at signup.
- **Server-side message redaction** (disclose as processing to ODPC).
- Hashed passwords + JWT sessions; `.env` placeholders for the regulated integrations so secrets are never hardcoded.

Still required before real patients: the **licensed drug DB**, **CBK-licensed payment/escrow**, **ODPC certificate**, **platform certification**, **real provider verification**, and the **legal entity + counsel-drafted agreements**.

---

*Sources are current as of mid-2026 and were drawn from public reporting and Kenya Law; the Digital
Health Act 2023 and the 2025 Digital Health Regulations are recent and still being operationalised, so
verify the exact Agency, forms, fees, and timelines with each regulator and your lawyer before relying
on this.*
