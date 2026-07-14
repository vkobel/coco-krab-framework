# KRAB Lite: Implementer's Quick Reference

A lightweight reference for evaluating confidential computing deployments. For full rationale, platform baselines, and extended discussion, see [KRAB.md](./README.md).

## The Model

**Verifiability (V)** measures how much of a system can be independently verified:

> **`K × R × A × B = V`**

If any dimension is 0, verifiability collapses. The KRAB Vector is written: **`A | R | B | K`**.

Declare evidence access as **public**, **authorized**, or **measurement-only**. Only public evidence supports a public KRAB claim.

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
| **A2** | Silicon-Rooted, Mediated | Silicon root, but provider mediation or launch control remains in the attestation TCB |
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
| **R4** | Deterministic/Reproducible | Independent parties rebuild declared source and inputs to an identical hash |

### Expanded Notation

**`R[fX/oX/lX/aX]`** — per-layer grades (e.g., `R[f0/o0/l4/a4]`).

For R4, record hermeticity, immutable input/toolchain pins, independent rebuilds, toolchain reproducibility, and opaque bootstrap seeds. A public R4 claim requires at least one rebuild outside the original pipeline. Do not create a new R-level for these attributes.

---

## B — Session Binding

Separates freshness from proof of the actual recipient or channel.

| Level | Name | Behavior |
|-------|------|----------|
| **B0** | Unbound | Application binding field absent, static, or unchecked |
| **B1** | Freshness-Only / Weakly Bound | Fresh nonce without recipient binding, or binding that is replayable, optional, or weakly enforced |
| **B2** | Recipient-Bound & Enforced | Freshness plus an attested ephemeral recipient/channel key; the operation continues only through that key |

**B2 requires:** (1) single-use challenge or equivalent TTL policy, (2) attested recipient/channel key, and (3) release encrypted to or authorized through that exact key. A nonce alone is B1 because it can be relayed.

---

## K — Key Release Enforcement

| Level | Name | Enforcement |
|-------|------|-------------|
| **K0** | Credential-Gated | No attestation checked |
| **K1** | Signature-Bound | Verifies quote, but trusts maintainer signature |
| **K2** | Provider-Delegated | CSP's attestation policy gates release |
| **K3** | Artifact-Bound | Verifies exact measurements, but no session binding |
| **K4** | Dynamically-Bound | Verifies measurements and B2 binding; restricts release to the bound key/channel |

**K3/K4 minimum checks:** evidence signature and trust chain, revocation/collateral, minimum security version, complete claimed measurement set, and debug rejection.

**Session security alignment:** B2 + K4 provides relay-resistant release, conditional on the accepted A trust anchor. A1/A2 expand who is trusted to authenticate the evidence; they do not remove the protocol binding.

**`[OnChain]` modifier:** Append to K2–K4 when the attestation policy is governed by a public smart contract rather than a single off-chain operator (e.g. `K3[OnChain]`, `K4[OnChain]`). Changes who governs the policy, not what is enforced.

---

## Closing the Measurement Gap

Hardware measures firmware/OS at launch. Applications loaded from disk after boot are unmeasured.

**Solutions:**

1. **initramfs packing** — Bundle app into initramfs (measured at boot)
2. **dm-verity** — Embed Merkle root hash in initramfs; kernel verifies disk blocks
3. **Platform-only attestation** — Measured image contains only the platform layer; workload injected dynamically at launch. Chain terminates at the OS boundary unless the workload hash is bound into the application binding field and enforced at the KBS.

---

## Composability

For CPU/GPU, nested, redundant-root, or multi-service TEE systems:

1. Score every attestation domain separately.
2. Verify each domain against its own trust anchor and measurement policy.
3. Bind all required domains to the same workload/session key, or bind one verified report into another.
4. Enforce the declared all-of-N or M-of-N rule before release.
5. Declare shared roots/operators; reports sharing one failure domain are not independent roots.

**Notation:**

- `B2*` — application binding field includes another domain's verified report
- `[CPU: A3 | R[...] | B2* | K4]` + `[GPU: A1 | R[...] | B2 | K0]`

`+` shows separately scored domains; it does not assert composition without the binding and policy checks above.

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

A public score MUST link a machine-readable evidence packet covering source/build inputs, artifact and measurement mapping, attestation/collateral checks, recipient binding, policy version, verifier version, timestamp, and per-check results.

| Dimension | Score | Justification |
|-----------|-------|---------------|
| **A: Attestation** | | |
| **R: Reproducibility** | `R[f?/o?/l?/a?]` | |
| **B: Session Binding** | | |
| **K: Key Release** | | |

**KRAB Vector:** `A | R[f?/o?/l?/a?] | B | K`

Also record:

- evidence access class and evidence-packet digest
- release authority and M-of-N policy, if any
- reference-value update, rollback, expiry, and revocation controls
- protected data path and first plaintext boundary
- production/debug operating state
- composition graph and enforced threshold

Threshold custody and governance do not raise K by themselves.

---

## See Full Framework

- **Platform baselines** (AWS, Azure, GCP): Appendix A in [KRAB.md](./README.md#appendix-a-platform-baselines)
- **Trust anchors and rationale**: Full framework sections 2-3
