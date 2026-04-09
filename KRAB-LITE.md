# KRAB Lite: Implementer's Quick Reference

A lightweight reference for evaluating confidential computing deployments. For full rationale, platform baselines, and extended discussion, see [KRAB.md](./README.md).

## The Model

**Verifiability (V)** measures how much of a system can be independently verified:

> **`K × R × A × B = V`**

If any dimension is 0, verifiability collapses. The KRAB Vector is written: **`A | R | B | K`**.

---

## Stack Layers

Score at each layer from silicon up:

| Layer | Abbr | Contents | Notes |
|-------|------|----------|-------|
| Firmware | `f` | UEFI/OVMF, paravisor, pre-boot blobs | CSP-controlled on public clouds |
| OS | `o` | Kernel, initramfs, early userspace | Includes initramfs even with app artifacts |
| Libraries | `l` | Runtimes, system libs, dependencies | Includes container base image layers |
| Application | `a` | Workload binary, bundled config | Most frequently deployed layer |

**Boundary rule:** Components measured at launch belong to the layer reflecting that hardware measurement event, not logical placement.

---

## A — Attestation Level

Platform attestation ceiling (bottom-up constraint):

| Level | Name | Constraint |
|-------|------|------------|
| **A0** | Unmeasured | No cryptographic proof |
| **A1** | Provider-Rooted | Hardware root of trust = cloud provider PKI |
| **A2** | Silicon-Rooted, Mediated | Silicon root, but CSP paravisor in attestation TCB |
| **A3** | Silicon-Rooted, Direct | Silicon root of trust, raw hardware quote access |

If measurement chain fractures at any layer, effective A collapses to **A0**.

---

## R — Reproducibility (Per-Layer)

| Level | Name | Meaning |
|-------|------|---------|
| **R0** | Opaque | Binary is a black box |
| **R1** | Source Available | Auditable, but not deterministic |
| **R2** | Maintainer-Signed | Cryptographic assertion of source-to-binary |
| **R2+** | Threshold Multi-Party | M-of-N maintainer signatures |
| **R3** | Provenance-Verified | SLSA provenance, trusted CI/CD |
| **R4** | Deterministic/Reproducible | Anyone can rebuild to identical hash |

### Expanded Notation

**`R[fX/oX/lX/aX]`** — per-layer grades (e.g., `R[f0/o0/l4/a4]`).

---

## B — Session Binding

Prevents quote replay: binds live session to attestation evidence.

| Level | Name | Behavior |
|-------|------|----------|
| **B0** | Unbound | Application binding field absent, static, or unchecked |
| **B1** | Bound, Weakly Enforced | Field used but replayable or weakly validated |
| **B2** | Dynamically Bound & Enforced | Fresh session data hashed into field, strict verifier enforcement, quote TTL |

**MITM Risk:** Without B2, an attacker can obtain a valid quote from a real TEE and present it over their own channel to receive secrets. The quote proves the binary — not who receives the key.

---

## K — Key Release Enforcement

| Level | Name | Enforcement |
|-------|------|-------------|
| **K0** | Credential-Gated | No attestation checked |
| **K1** | Signature-Bound | Verifies quote, but trusts maintainer signature |
| **K2** | Provider-Delegated | CSP's attestation policy gates release |
| **K3** | Artifact-Bound | Verifies exact measurements, but no session binding |
| **K4** | Dynamically-Bound | Verifies measurements **and** session binding |

**Debug rejection:** K3/K4 must reject quotes from debug-mode TEEs.

**Session security alignment:** A3 + B2 + K4 = MITM-safe. Any drop creates session vulnerability.

---

## Closing the Measurement Gap

Hardware measures firmware/OS at launch. Applications loaded from disk after boot are unmeasured.

**Solutions:**

1. **initramfs packing** — Bundle app into initramfs (measured at boot)
2. **dm-verity** — Embed Merkle root hash in initramfs; kernel verifies disk blocks

---

## Composability (CPU + GPU)

Multi-TEE workloads require cryptographic binding between attestation domains.

**Required protocol (CPU → GPU):**

1. CPU measures GPU via SPDM over PCIe
2. CPU verifies GPU's attestation report  
3. CPU binds GPU report hash into its own application binding field

**Notation:**

- `B2*` — application binding field includes second TEE's attestation report
- `[CPU: A3 | R[...] | B2* | K4]` + `[GPU: A1 | R[...] | B2 | K0]`

---

## Example Vectors

| KRAB Vector | Deployment | Meaning |
|-------------|------------|---------|
| `A3 \| R[f4/o4/l4/a4] \| B2 \| K4` | Bare-metal TDX, reproducible stack | Strongest profile, full verifiability |
| `A2[Azure TDX] \| R[f1/o0/l4/a4] \| B2 \| K4` | Azure TDX CVM, reproducible app | Mediated attestation, opaque OS foundation |
| `A1[AWS Nitro] \| R[f0/o4/l4/a4] \| B2 \| K4` | AWS Nitro Enclave, reproducible image | Provider-rooted trust, explicit delegation |
| `A3 \| R[f0/o0/l4/a4] \| B0 \| K3` | Strong platform, no binding | Attests binary but not session recipient |

---

## Scorecard Template

| Dimension | Score | Justification |
|-----------|-------|---------------|
| **A: Attestation** | | |
| **R: Reproducibility** | `R[f?/o?/l?/a?]` | |
| **B: Session Binding** | | |
| **K: Key Release** | | |

**KRAB Vector:** `A | R[f?/o?/l?/a?] | B | K`

---

## See Full Framework

- **Platform baselines** (AWS, Azure, GCP): Appendix A in [KRAB.md](./README.md#appendix-a-platform-baselines)
- **Trust anchors and rationale**: Full framework sections 2-3