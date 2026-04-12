# KRAB: A Confidential Computing Verifiability Framework

## An Open Framework for Evaluating Confidential Computing Systems

This framework evaluates deployments over Trusted Execution Environments (TEEs) by mapping how much of a system can be independently verified. It moves beyond academic ideals to provide engineering teams with a realistic, actionable diagnostic tool for production deployments.

### Pragmatism Over Purity

A core principle of this framework is distinguishing between a conscious business trust delegation and a structural security flaw. While the academic ideal demands pure silicon trust, relying on a mature Cloud Service Provider (CSP) like AWS or Microsoft is a valid engineering choice. The KRAB Vector makes these trust assumptions explicit rather than penalizing them, ensuring the framework remains useful for real-world cloud architectures.

### How to Read This Document

- **Section 1** defines the stack layers and deployment context — read this first to understand what is being scored.
- **Section 2** defines the KRAB model and its four dimensions A, R, B, K — the normative core of the framework.
- **Section 3** explains how to interpret a KRAB Vector in practice, including common failure patterns.
- **Section 4** shows how to produce the final KRAB Scorecard.
- **Appendix A** covers platform baselines for major CSPs.

---

## Scope and Preconditions

This framework measures **independently verifiable claims**. Each dimension is defined so that an external verifier — with no prior relationship to the builder — can reproduce the claimed grade from published artifacts and tooling, without builder assistance.

**Publishing a KRAB Vector as a public claim asserts that independent verification is possible.** A grade that requires trusting the builder's word, a signed NDA, or access to private artifacts is not a public score — it is an internal assertion.

**Private and internal use is fully valid.** Teams may use this framework for internal audits, pre-deployment reviews, or security assessments under NDA.

This distinction is not about deployment confidentiality — a production system can be private. It is about the _evidence_ behind each grade: are the artifacts and attestation tooling published such that an independent party could check the score themselves?

---

## 1. The Stack, Deployment Context, and KBS

Every confidential computing system runs on a stack of layers. Before scoring anything, we need to name the layers we are evaluating:

0. **Silicon** — CPU/GPU, microcode, vendor attestation key. Always trusted and always in the Implicit **Trusted Computing Base (TCB)** — the set of components that must be correct for the system's security guarantees to hold. Silicon is the root of trust accepted on faith — it is not scored.

| Layer                        | Abbreviation | Canonical contents                                                                                                                                 | Boundary rule / notes                                                                                                                                                          |
| ---------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Firmware**                 | `f`          | UEFI/OVMF, paravisor (e.g., Azure OpenHCL, Azure HCL), hypervisor-injected pre-boot blobs. Everything measured by silicon _before_ kernel handoff. | On clouds, this includes the paravisor even though it is software — it is measured at launch as if it were firmware. Always CSP-controlled on public clouds.                   |
| **OS**                       | `o`          | Linux kernel, kernel modules, initramfs, early userspace (`init`, systemd, udev).                                                                  | initramfs belongs here even when it embeds app artifacts or dm-verity root hashes — it is measured at kernel handoff, making it part of the OS measurement point, not the app. |
| **Libraries & dependencies** | `l`          | Language runtimes, shared system libraries, package-manager-installed dependencies linked by the application.                                      | Includes container base image layers if built and versioned separately from the application logic itself.                                                                      |
| **Application**              | `a`          | The workload binary or container, application-bundled config, secrets management agent shipped with the workload.                                  | The layer the team owns and deploys most frequently.                                                                                                                           |

> **Boundary rule:** If a component is loaded at launch and measured by hardware at that point, it belongs to the layer that reflects that hardware measurement event, not where it logically feels like it belongs. This rule resolves most ambiguous placement decisions (e.g., kernel TEE guest driver patches → `o`; container runtime linking libraries → `l`).

> **Platform-Specific Layer Mappings:** Some platforms bundle multiple layers into a single measured artifact. For **AWS Nitro Enclaves**, the enclave image (EIF) bundles kernel, init, and application into one artifact, with no separate guest OS. In this case, the `o` layer maps to the EIF's OS-level components (kernel, init), not a standalone guest OS. The R-grade for `o` should reflect the reproducibility of the entire EIF build process.

### Deployment Context

The stack runs in a deployment context. This context is not scored. It defines the hardware ceiling for what Attestation levels are achievable by the stack above the platform foundation.

| Context               | Characteristic                                                                |
| --------------------- | ----------------------------------------------------------------------------- |
| CSP (AWS, GCP, Azure) | Vendor controls firmware/paravisor. Strong physical and operational security. |
| Bare-metal provider   | You control the full stack above silicon. Provider handles physical security. |
| Self-hosted           | Full control including physical.                                              |

CSPs inject closed-source firmware or paravisors into the base of your stack, forcing an R0 or R1 bottleneck that cannot be worked around. In exchange, you get enterprise-grade physical security, 24/7 operations, hardware supply chain oversight, and infrastructure resilience at a scale no bare-metal provider can match today.

Bare-metal providers handle physical security and hardware provisioning — but usually at lower operational maturity than a major CSP. You trade CSP-grade hosting and adversarial physical security guarantees for a transparent stack you can verify end-to-end. This is a deliberate trade-off, not a free upgrade.

### The KBS (Key Broker Service)

A **KMS** is a generic key-management service with no attestation awareness. A **KBS** (Key Broker Service) is an attestation-aware policy gate that evaluates evidence before releasing secrets. This framework evaluates the service performing key release, secret unsealing, or volume decryption. Because almost every deployment in this framework involves attestation-gated release, the preferred term is **KBS** throughout the remainder of this document. The KBS sits alongside the stack as a scorable external control point through its `K` policy level. It is the gate where runtime evidence — the measurement chain — either unlocks secrets or confirms the system cannot be trusted.

---

## 2. The KRAB Model of Verifiability 🦀

KRAB evaluates verifiability across four dimensions:

> **`K × R × A × B = V`**

V represents the **verifiability posture** of the system — the degree to which an independent party can cryptographically confirm what software runs, on what hardware, in what session, and under what release policy. This is not a single numeric score and should not be collapsed into one. It is a compact way to express that a system's **Verifiability (V)** depends on all four dimensions being present:

- **K** = Key-release enforcement (KBS)
- **R** = Reproducibility
- **A** = Attestation
- **B** = Session Binding

If any one of these collapses to zero, verifiability collapses with it. This equation describes what the system can prove, not every property of its overall security. In practical terms:

- **K = 0:** secrets are released without meaningful attestation enforcement/policy
- **R = 0:** irreproducible build
- **A = 0:** no usable measurement chain (unmeasured, or chain fractured)
- **B = 0:** no session binding — quote proves nothing about who receives the secrets

The remainder of this section defines each dimension in turn, in `A → R → B → K` order — bottom-up, from platform foundation to enforcement. The model is named **KRAB** for memorability; the KRAB Vector is written in that same `A | R | B | K` sequence throughout the rest of this document.

Throughout this document, the four-dimensional score is called the **KRAB Vector**. The term "CoCo Vector" is synonymous and may appear in external references to this framework.

### A — Attestation: what is the effective attestation level? (scored once for the stack)

Attestation is a bottom-up hardware property. The platform sets an **Attestation Ceiling**: the highest A-level that any upper layer can meaningfully claim on that stack. However, **A in the KRAB Vector is the effective attestation level, not the ceiling.** The ceiling is a precondition; the score is what survives the measurement chain. If the chain fractures at any layer (see _Bridging the Measurement Gap_ and _Chain Integrity_), the effective A collapses to A0 regardless of the platform's capability. In practice, `A` defines the shape of the attestation trust boundary and whether CSP-controlled software sits inside the guest's TCB.

| Level  | Name                     | Platform Constraint (The "Ceiling")                                                                                                                                           | Example                   |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **A0** | Unmeasured               | No cryptographic proof.                                                                                                                                                       | Traditional VM            |
| **A1** | Provider-Rooted          | Hardware may isolate the workload, but the cryptographic root of trust belongs to the cloud provider, not the silicon vendor.                                                 | AWS Nitro Enclaves        |
| **A2** | Silicon-Rooted, Mediated | Silicon root of trust, but CSP-controlled software sits inside the guest's attestation TCB. This covers two architecturally distinct cases: **(a) Quote-path mediation** — a paravisor or vTPM intercepts the quoting interface directly, so all attestation evidence flows through CSP-controlled code (Azure TDX, Azure SEV-SNP). **(b) Launch-config mediation** — CSP-controlled firmware and launch configuration participate in what is measured into the launch digest, preventing external verifiers from reproducing the measurement independently, even when raw hardware quote access is available (GCP TDX). Both result in CSP software inside the attestation TCB, but the implications differ: (a) requires verifying the paravisor envelope format, while (b) allows standard quote formats but requires trusting CSP endorsements for measurement values. | Azure TDX / Azure SEV-SNP / GCP TDX |
| **A3** | Silicon-Rooted, Direct   | Full silicon root of trust with raw hardware quote access (for example, `/dev/sev-guest` or `configfs-tsm`). No CSP paravisor sits between the workload and the CPU.          | Bare-metal TDX / SEV-SNP  |

> **Attestation Signing Algorithm (CRQC Advisory):** All current hardware attestation platforms sign quotes with classical ECDSA (P-256/P-384). PQ key encapsulation (ML-KEM) at B and K protects session confidentiality against a CRQC, but cannot protect attestation authenticity — a CRQC can forge valid-looking quotes regardless. The `[PQ]` modifier on the A dimension addresses this. No shipping hardware qualifies for `[PQ]` today; it is reserved for platforms that sign attestation reports with a NIST PQ algorithm (ML-DSA/Dilithium). All current A3 deployments are implicitly ECDSA-bounded.

### R — Reproducibility: how was it made? (scored per-layer)

Each component in the stack gets its own R level.

| Level | Name                         | What it means                                                                                                                                                                                                                        |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R0    | Opaque                       | No source, no build instructions. Binary is a black box.                                                                                                                                                                             |
| R1    | Source Available             | Source published, builds documented, but output is not deterministic. You can audit the code; you cannot prove the deployed binary matches it.                                                                                       |
| R2    | Maintainer-Signed            | Binary signed by one or more maintainers asserting it was built from the published source. Source-to-binary correspondence is asserted cryptographically but not independently verifiable.                                           |
| R2+   | Threshold Multi-Party Signed | Binary signed by M-of-N independent maintainers (e.g., Turnkey's StageX). All M must collude to forge the claim, raising the bar above a single-key compromise. Source-to-binary correspondence remains asserted, not independently verifiable. |
| R3    | Provenance-Verified          | Signed build provenance (e.g. SLSA), trusted CI/CD pipeline. The build process is auditable (requires evaluating the build system separately) — the CI pipeline's integrity is now part of the claim.                                |
| R4    | Deterministic / Reproducible | Anyone can rebuild from source to identical hash. No trust in any builder or maintainer required.                                                                                                                                    |

> **R2, R3, and the build system:** R2 shifts trust to the maintainer's key(s) — if compromised, the claim collapses to R1. R3 shifts trust to the CI/CD pipeline: SLSA provenance and signed logs provide real evidence, but the build system is now in your trust chain. R4 eliminates the build system as a trust dependency.

#### Expanded R Notation: Per-Layer Grading

Because the four stack layers defined in Section 1 (Firmware, OS, Libraries, Application) can have very different reproducibility levels, the R dimension supports a fully expanded per-layer notation:

> **`R[fX/oX/lX/aX]`** — where `f` = Firmware, `o` = OS, `l` = Libraries, `a` = Application, and each `X` is an R-level (0–4).

This notation makes verification gaps and bottlenecks explicit at a glance rather than collapsing them into a single score. Note the case distinction: **uppercase** letters (`A`, `R`, `B`, `K`) refer to KRAB dimensions; **lowercase** letters (`f`, `o`, `l`, `a`) refer to stack layers within the R dimension. For example, `a4` means the Application layer at R-level 4 — not Attestation level 4.

**Example:** An opaque CSP firmware, opaque OS, reproducible libraries, and reproducible application would be expressed as `R[f0/o0/l4/a4]`.

#### Bridging the Measurement Gap

The hardware measures what is in memory at VM launch: firmware, kernel, and initramfs. Everything loaded from disk after boot — your application, libraries, configuration — is outside that initial measurement. A malicious hypervisor could swap the disk image after launch and the attestation report would look identical. This is the **measurement gap**. Without closing it, the effective A-level collapses to A0 at the disk boundary — the platform ceiling is irrelevant if the chain never reaches the workload.

Two common patterns close it:

- **initramfs packing** — Bundle the entire application into the initial RAM filesystem measured at boot. The application becomes part of the launch digest directly. Straightforward but produces large, monolithic images.

- **dm-verity** — Compute a Merkle tree over the application filesystem image; embed the root hash into the measured initramfs. The kernel verifies every disk block at read time. The chain extends: hardware measurement → initramfs → root hash → application disk. Note that disk encryption alone is not sufficient: Trail of Bits' 2025 disclosure of LUKS2 vulnerabilities affecting eight confidential computing systems demonstrated that malleable encryption metadata can be modified by an attacker with storage access to weaken or bypass encryption entirely, with no detectable change to the measured launch state. dm-verity addresses this by making filesystem content integrity part of the measurement chain.

**Platform-only attestation** is a distinct deployment shape worth naming *(e.g., Marlin Oyster's Blue Images, dstack-based deployments where the user workload is a Docker container injected at launch)*: the measured image contains only a platform or infrastructure layer (kernel, init, essential services), while the application workload is supplied dynamically at launch — outside the hardware measurement event. The platform is attested; the workload has no presence in any PCR. This does not close the measurement gap — it defines where the chain terminates. An external verifier can confirm the platform layer is genuine but cannot confirm what workload is executing. The chain can be extended only if the workload's identity is explicitly bound into the application binding field (e.g., a hash of the workload image) and the KBS enforces that binding before releasing secrets. Without that extension, the effective A at the workload boundary collapses to A0 regardless of the platform's ceiling.

The R-grade of the `l` and `a` layers reflects _build_ reproducibility (R0–R4). Whether the measurement chain reaches those layers is an A-dimension question. A high `a4` score is only meaningful if the chain is intact — dm-verity or initramfs packing is how you establish that.

> **IGVM note:** The launch digest depends on both the bytes and the guest physical addresses where they land. The IGVM (Independent Guest Virtual Machine) format standardizes this layout to ensure consistent measurements across hypervisors — it addresses measurement _consistency_, not build _reproducibility_.

### B — Session Binding: can the outside world tie a live session to the attested workload? (scored per TEE component)

_Required for every TEE component that communicates with external verifiers or receives secrets. In a single-TEE deployment, B is scored once. In multi-TEE deployments (e.g. CPU + GPU), each TEE component gets its own B score — see Composability._

R and A prove _what binary was built_ and _what trust boundary attests it_. They do not prove that the party you are talking to right now is that attested workload. Binding closes that gap.

**Why this matters — a concrete example:** A KBS verifies a valid quote proving the correct binary runs on genuine hardware. It releases a signing key over TLS. But nothing in the quote ties it to _this_ TLS connection. An attacker could obtain a legitimate quote from a real TEE, present it to the KBS, and receive the key over their own channel — a classic MITM. The quote is real; the recipient is not.

**Session binding** prevents this. The workload generates an ephemeral TLS key pair, hashes the public key into the quote, and the KBS checks that the public key in the quote matches the TLS connection delivering the secret. Now the quote is bound to a specific channel — replay it on a different connection and the hash won't match. *(RA-TLS — Remote Attestation TLS, available in Gramine and other SGX/TDX runtimes — is the canonical protocol implementing this pattern: the TLS certificate's public key hash is embedded directly in the attestation report, making it machine-verifiable by any relying party.)*

A **session** in this context is any single cryptographic interaction between an external party and the workload — a TLS handshake, a key exchange, a challenge-response. The data bound into the quote (a public key hash, a nonce, key exchange parameters) is what this document calls **session data**.

Every TEE platform provides an **application binding field** — a slot in the hardware quote that the application fills with session data. The hardware provides the slot, but it is the application that fills it. It is the app's anchor into the attestation evidence — effectively acting as the verifier's session anchor in the quote. Without the app actively using it, the field sits empty and B = 0. Platform-specific names vary: `REPORTDATA` (TDX), `REPORT_DATA` (SEV-SNP), `user_data` (Nitro), `cca-realm-challenge` (ARM CCA). This document uses **application binding field** as the platform-neutral term.

| Level  | Name                         | Enforcement Behavior                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B0** | Unbound                      | The application binding field is absent, zeroed, filled with static strings, or left unchecked by the application and verifier.                                                                                                                                                                                                                                                                                                         |
| **B1** | Bound, Weakly Enforced       | The application binding field is used, but the payload is static, stale, replayable, or only weakly validated. This includes fixed strings, reused nonces, old challenges, or checks that are optional, delegated, or easy to bypass. Also includes verifier-side failures — for example, where the field is populated correctly with fresh data, but the verifier delegates, makes optional, or skips checking it in production paths. |
| **B2** | Dynamically Bound & Enforced | The application actively generates or accepts dynamic/fresh session data, hashes it into the application binding field and uses it in the protocol. The verifier or key-release path strictly enforces a match before proceeding. Dynamic session binding also enforces a strict **Quote Freshness / TTL** window — quotes older than a few minutes are rejected, preventing replay of previously-valid sessions.                       |

> **Collapse rule:** An application can be perfectly reproducible and silicon-measured, but if it is Unbound (B0), the quote is semantically meaningless for proving session identity to external verifiers. In the verifiability equation, `B = 0` and the architecture is flawed.

### K — Key Release Enforcement: does secret release actually enforce the evidence? (usually scored once for the stack)

_Always required when secret release is part of the system design._
`K` measures how strictly the key-release service enforces attestation policy. A separate review of the KBS under this framework (if applicable) is useful, but it is optional rather than part of the main system vector.

| Level  | Name                                 | What it means                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K0** | Credential-Gated                     | Secrets are released using traditional controls such as API keys, IAM, network location, or operator approval. No attestation is checked.                                                                                                                                                                                                     |
| **K1** | Signature-Bound / Maintainer Trust   | The service verifies a hardware quote, but the release policy is anchored only to a developer or maintainer signature/certificate rather than an exact artifact identity. K1 can only provide evidence equivalent to R2-level trust, regardless of the underlying binary's actual R-grade — a compromised maintainer key collapses the claim. |
| **K2** | Provider-Delegated                   | The system relies on the CSP's internal attestation policy engine to gate release (for example, AWS KMS with `RecipientAttestation`). Useful, but trust is delegated to the provider's opaque verifier and policy implementation.                                                                                                             |
| **K3** | Artifact-Bound / Deterministic Trust | The service independently verifies the quote and enforces exact artifact measurements such as PCR0, MRTD, or deterministic binary hashes. This can support **R4**, but it does not verify dynamic session binding and remains vulnerable to MITM or replay.                                                                                   |
| **K4** | Dynamically-Bound / Full Enforcement | The service verifies exact artifact measurements **and** the dynamic session binding carried in the application binding field. Secrets are released only to the exact secure session requesting them.                                                                                                                                         |

**Collateral and security-version validation:** K3 and K4 require complete verification of the platform collateral behind the quote, not just the values self-reported inside the quote body. This includes:
- **Debug attribute rejection:** Quotes from TEEs running in debug mode MUST be rejected. Debug mode allows the host to read or modify TEE memory — attestation is meaningless. Platform-specific checks include TDX's `td_attributes` debug bit, SEV-SNP's debug bit in attestation report, and equivalent flags across all TEE platforms. A KBS that accepts debug-mode quotes has collapsed to K0 in practice.

**Instance identity (multi-tenant note):** Some platforms also expose launch identity fields such as TDX `HOSTDATA`. These are distinct from dynamic session binding. Session binding ties a live session to a quote; instance identity distinguishes one launched workload instance from another. Where available, a strong `K` policy should use both.

The **measurement chain** is the sequence of cryptographic digests each layer extends into hardware registers to prove what software ran at launch.

Register names used in this document refer to hardware measurement state: MRTD is the TDX launch digest; RTMRs are TDX runtime extension registers; PCRs are TPM Platform Configuration Registers. PCRs and RTMRs behave as append-only measurement logs, while MRTD is the launch digest produced from launch-time measurements.

**Key delivery transport (CRQC advisory):** K scores enforcement logic — whether the KBS gates secret release on the correct attestation evidence. It does not score the cryptographic algorithm used to wrap and deliver the released secret. Deployments under a CRQC threat model should use ML-KEM for key delivery — this is orthogonal to the K score. K4 with ECDH transport and K4 with ML-KEM transport have identical enforcement strength; only the quantum resistance of the delivery channel differs. Note that B's session binding often uses cryptographic hashing (e.g., SHA-384/SHA-512) which is already PQ-resistant; the PQ concern is solely about key encapsulation at secret delivery, not about the B score.

**Session security alignment:** A system is session-secure against MITM and replay only when A3, B2, and K4 align. A3 provides a direct, non-mediated quoting path with minimal TCB. B2 carries fresh session identity into the quote. K4 verifies that bound identity before releasing secrets. If any one drops, the system regains a session-level vulnerability: A3→A2 expands the TCB to include the CSP paravisor; B2→B1/B0 means fresh identity is no longer carried through the protocol; K4→K3 means the KBS may release secrets to the wrong session. R is deliberately absent from this triad — R measures build-time provenance, not whether the live session is bound to the attested workload. A system on an A2 platform (e.g. Azure TDX) can achieve B2 and K4, but does so by extending its trust boundary to include the CSP's paravisor. Only A3 achieves this alignment with a pure silicon root of trust.

**The `[OnChain]` modifier** may be appended to any K-level (K2–K4) to indicate that the attestation policy — which code digests are approved for key release — is governed by a public smart contract rather than a single off-chain KBS operator. The policy logic is publicly auditable and forkable; no single operator controls the approval gate unilaterally.

`K3[OnChain]` — exact artifact measurements enforced, approved digest set governed on-chain. `K4[OnChain]` — same, with dynamic session binding also enforced. *(e.g., Marlin Nautilus contract variant, Phala DeRoT — both publish approved code digests on-chain and gate key derivation against that contract state.)*

The modifier does not change the enforcement level (K3 vs K4) — it changes who governs the policy. The distinct failure modes introduced are governance attacks (contract upgrade paths, chain consensus assumptions) rather than the single-operator compromise risk of a standard KBS.

---

## 3. Interpreting the KRAB Vector in Practice

Once the four dimensions are scored, the resulting KRAB Vector maps the system's verifiability posture. Reading that vector reveals where the attestation chain breaks, where supply-chain trust bottlenecks occur, and where explicit platform trust re-enters the model.

### Chain Integrity

The platform establishes an Attestation Ceiling (e.g., A3), but this score must be carried up to the application via an unbroken chain of cryptographic measurements (Firmware → OS → App, extended into hardware registers). If any layer fails to measure the layer above it, the chain fractures. The target application is left without hardware proof, and the system's effective A-level collapses regardless of the underlying silicon.

**AWS SEV-SNP: A Concrete Fracture Example.** AWS SEV-SNP provides a direct `/dev/sev-guest` path and Nix-reproducible OVMF firmware, establishing a theoretical ceiling of A3 with R4 firmware. However, AWS uses a hybrid boot mechanism where the hypervisor injects kernel and initrd hashes into the OVMF binary before launch. The OS is measured — but indirectly, via this modified OVMF that incorporates the kernel/initrd hashes — and the injection process is AWS-controlled and not independently reproducible by the verifier. The measurement chain's integrity depends on AWS's tooling behaving correctly, which effectively makes the OS layer's verifiability dependent on trusting the CSP. The silicon still works; the question is whether an independent verifier can confirm what OS is actually running without trusting AWS.

**Post-Boot Unmeasured Inputs: A Second Fracture Pattern.** A subtler fracture occurs when the binary is correctly measured but its runtime inputs are not. Env vars (including `LD_PRELOAD`) injected after launch measurement; hypervisor-injected ACPI tables that allow fake memory-mapped devices to extract keys — both observed in the [Trail of Bits audit of WhatsApp's Private Processing TEE](https://blog.trailofbits.com/2026/04/07/what-we-learned-about-tee-security-from-auditing-whatsapps-private-inference/). The rule: any host-controlled or operator-controlled input consumed by the guest after the measured launch point must either be included in the measured chain, cryptographically authenticated before use, or treated as hostile. A measurement chain that correctly attests the binary but not the runtime configuration is effectively fractured at the configuration surface.

### Verification Gaps and Stack Constraints

A **Verification Gap** occurs when a highly reproducible upper layer rests on an opaque or provider-controlled lower layer.

Reproducibility is a top-down developer choice: an application can easily achieve `a4` while its firmware or OS foundation is `f0` or `o0`. The expanded `R[fX/oX/lX/aX]` notation makes this explicit at a glance — `R[f0/o0/l4/a4]` immediately shows that strong cryptographic build evidence at the application and library layers is constrained by opaque foundations below them.

Attestation remains a bottom-up architectural constraint. The platform sets a strict **Attestation Ceiling**. An application cannot achieve `A3` if the platform below it mediates the hardware (`A2`) or relies on a provider-rooted PKI (`A1`).

### CSP Trust vs. Architectural Flaws

The strongest KRAB profile is `A3 | R[f4/o4/l4/a4] | B2 | K4`: direct silicon-rooted attestation, every layer reproducible, dynamic session binding, and strict key-release enforcement.

Real-world engineering does not always optimize for that profile. Teams often choose platforms such as **AWS Nitro** (`A1`) or **Azure TDX** (`A2`) because of their maturity, tooling, and operational reliability. In KRAB, that is **not automatically an architectural flaw**. It is a **conscious trust delegation**. If the Threat Model explicitly accepts the platform as part of the Trusted Computing Base, the design can still be coherent and production-worthy.

It is important to distinguish declared trust from structural weakness:

- **A1 or A2 is a Conscious Trust Delegation:** You are deliberately trusting the platform provider as part of the attestation root or mediation layer. If that dependency is explicit in the Threat Model, the architecture remains understandable and reviewable.
- **R0, B0, or weak K-levels are Architectural Weaknesses:** These are not merely declared trust assumptions. They create blind spots in supply-chain verification, session identity, or secret-release enforcement, and they leave the system structurally exposed.

**The Practical Comparison:**
A system scoring `A1[AWS Nitro] | R[f0/o4/l4/a4] | B2 | K4` is often practically stronger than a system scoring `A3 | R[f0/o0/l0/a0] | B0 | K3`. The former relies on an explicitly trusted platform. The latter is simply under-verified where it matters most.

### Explicit Trust Anchors

To make threat-model assumptions explicit, any `A` score below `A3` should append the accepted platform trust anchor in brackets. This makes the trust delegation visible rather than implicit.

### The `[PQ]` Modifier

The `[PQ]` modifier may be appended to any A-level to declare that the platform's attestation signing algorithm is post-quantum safe (e.g. `A3[PQ]`). No shipping hardware qualifies today; the modifier is defined as a forward-compatible placeholder. Note that `[PQ]` on A addresses only attestation signature forgery. A fully quantum-resistant deployment requires `A[PQ]` + PQ key encapsulation at B and K — all three independently.

### Example Vectors

The table below maps common real-world engineering configurations to their KRAB Vectors and what each implies for the verifiability of the system.

| KRAB Vector                                   | Deployment Context                                                                                   | What it tells you                                                                                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A3 \| R[f4/o4/l4/a4] \| B2 \| K4`            | Bare-metal TDX or SEV-SNP, Nix-built full stack                                                      | Strongest achievable profile. Every layer verifiable from source, direct silicon root of trust, strict dynamic enforcement end-to-end.                                                                          |
| `A2[Azure TDX] \| R[f1/o0/l4/a4] \| B2 \| K4` | Azure TDX CVM, reproducible app, opaque OS                                                           | Strong runtime binding and enforcement, but mediated attestation (OpenHCL in TCB) and an opaque OS layer. Trust delegation explicitly declared.                                                                 |
| `A1[AWS Nitro] \| R[f0/o4/l4/a4] \| B2 \| K4` | AWS Nitro Enclave, reproducible enclave image                                                        | Provider-rooted attestation accepted as a conscious trust delegation. Nitro Enclaves have no traditional OS — `o` here maps to the enclave image's OS-level components (kernel, init). Strong software verifiability within that boundary. |
| `A2[GCP TDX] \| R[f0/o0/l4/a4] \| B2 \| K4`   | GCP TDX CVM, reproducible app and libraries, platform-managed OS                                     | Direct TDX quote delivery but closed hypervisor in TD launch TCB. Trust delegation declared explicitly. Opaque firmware and OS beneath reproducible app.                                                        |
| `A3 \| R[f0/o0/l4/a4] \| B0 \| K3`            | Bare-metal with dm-verity chain intact; reproducible app, opaque firmware and OS; no session binding | Measurement chain reaches the app (A3 holds), and the workload is reproducible — but not bound to any session. Attestation proves the right binary runs; it proves nothing about the session receiving secrets. |
| `A1[AWS Nitro] \| R[f0/o4/l4/a4] \| B0 \| K3[OnChain]` | Decentralized TEE compute, platform-only attestation, on-chain policy governance | Provider-rooted attestation. Platform layer is reproducible (`o4/l4`), and the workload is independently reproducible (`a4`), but the workload is injected dynamically at launch and absent from PCR measurements. PCRs attest the platform only — the measurement chain terminates at the OS boundary. Policy over approved platform images is governed on-chain. Without explicit workload binding into the application binding field and KBS enforcement, the running workload remains unverifiable regardless of its build reproducibility. |
| `A3 \| R[f0/o0/l0/a0] \| B0 \| K0`            | Opaque workload on strong hardware                                                                   | The platform is strong, but the workload is a black box. No layer can be independently verified, no session binding, no attestation-gated key release — the TEE is earning nothing.                             |

### Composability & Mixed Workloads (CPU + GPU)

When a workload spans multiple TEEs — for example, a CPU TEE passing data to a GPU TEE — each component must be scored independently, and the **trust link between them must be cryptographically established**.

A CPU TEE and a GPU TEE are separate attestation domains. Simply running code in both does not establish a verifiable trust relationship between them. SPDM — Security Protocol and Data Model — is the DMTF standard protocol used to perform hardware attestation over PCIe between a CPU TEE and a GPU. To achieve end-to-end verifiable trust, the CPU TEE must:

1. **Measure the GPU** — via SPDM over PCIe, retrieving the GPU's hardware attestation report.
2. **Verify the GPU's attestation report** — confirming the GPU's identity and integrity against the expected hardware certificate chain.
3. **Bind the GPU report into the CPU TEE's own quote** — by including a hash or digest of the verified GPU report in the CPU TEE's application binding field before generating its own quote.

Without step 3, an external verifier who validates the CPU quote has no evidence about which GPU — or whether any authentic GPU — is actually receiving the sensitive data.

#### Compound Vector Notation

Score each component separately with its own full KRAB Vector. When the 3-step binding protocol above is completed, note the binding explicitly in the CPU component's B dimension justification — it is the application binding field that establishes the cryptographic link between the two attestation domains.

The `*` suffix on a B score (e.g. `B2*`) indicates that the component's application binding field also binds a second TEE's attestation report — establishing a cryptographic link between two separate attestation domains.

**With binding (step 3 completed):**

> **`[CPU: A3 | R[f0/o1/l4/a4] | B2* | K4]`** + **`[GPU: A1[NVIDIA] | R[f0/o0/l0/a0] | B2 | K0]`**
> `*(B2*)` on CPU indicates the GPU attestation report is included in the application binding field

**Without binding (step 3 missing):**

> **`[CPU: A3 | R[f0/o1/l4/a4] | B2 | K4]`** + **`[GPU: A1[NVIDIA] | R[f0/o0/l0/a0] | B2 | K0]`**

The `+` operator indicates two independently scored components. The binding claim lives in the CPU scorecard's B2 justification text, not in a separate notation symbol. If the CPU TEE does not bind the GPU report into its own application binding field, the two vectors are unlinked and no compound trust claim holds — they are simply two separate systems that happen to run together.

### Advisory Dimensions

The KRAB Vector captures verifiability. Two additional dimensions should accompany any thorough audit as advisory metrics. They do not alter the KRAB Vector but provide essential context for interpreting it.

| Dimension                          | What to assess                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TCB Minimization**               | Is the trusted footprint proportionate to the workload? A high-scoring KRAB Vector on a 50 MB TCB is qualitatively different from the same vector on a 500 MB TCB.                               |
| **Verifiability Tooling Maturity** | Do independent tools exist to validate attestation evidence without trusting the vendor's own SDK? Note whether third-party verifiers, open-source tooling, or documented APIs cover each layer. **On-chain attestation verifiers** — smart contracts that parse attestation documents, verify certificate chains, and check measurements — represent the strongest form of independent tooling: the verification logic is itself public, auditable, and not controlled by any single operator *(e.g., Automata Network's DCAP attestation contracts, which support SGX, TDX, AMD SEV-SNP, and Nitro)*. Note the distinct failure modes: gas limits, chain finality assumptions, and governance of the verifier contract itself. |

---

## 4. The KRAB Scorecard (Final Deliverable)

The final deliverable of a KRAB evaluation is the **KRAB Scorecard**. It flattens the system's architecture, supply chain, application behavior, and key-release policy into a single, highly readable summary.

The KRAB Vector is linear:

> **`A | R | B | K`**

If `A < A3`, the score should append the accepted platform trust anchor in brackets to make the threat-model assumption explicit.

### Example Scorecard

The following is a fictional example showing what a completed KRAB Scorecard looks like in practice.

**Target:** Confidential Signing Service v1.2 (fictional)  
**Deployment Context:** Azure TDX CVM

| Dimension              | Score              | Justification                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: Attestation**     | **A2[Azure TDX]**  | **Silicon-Rooted, Mediated.** The workload runs on Intel TDX, but attestation is mediated through Azure TDX's OpenHCL paravisor. The platform remains silicon-rooted, but Azure's mediation layer is inside the attestation TCB.                                                                                                         |
| **R: Reproducibility** | **R[f1/o0/l4/a4]** | **Severe Verification Gap.** The application and libraries are deterministically reproducible (`a4`, `l4`), but the stack rests on an opaque Azure guest OS (`o0`) and source-available-but-non-reproducible Azure TDX firmware (`f1`). The lower layers remain opaque, creating a significant verification gap beneath the application. |
| **B: Session Binding** | **B2**             | **Dynamically Bound & Enforced.** The application generates fresh session identity and hashes it into the application binding field, allowing verifiers to tie the live session to the attested workload and resist replay or misbinding.                                                                                                |
| **K: Key Release**     | **K4**             | **Dynamically-Bound / Full Enforcement.** The KBS verifies the hardware quote, validates vendor collateral and platform security-version state, checks the expected measurements, and strictly enforces the bound application binding field payload before releasing the signing seed.                                                   |

#### The KRAB Vector

The KRAB Vector is the at-a-glance cryptographic and operational map of the system.

> **`A2[Azure TDX] | R[f1/o0/l4/a4] | B2 | K4`**

**Executive Summary:**  
The architecture achieves dynamic security alignment: the application carries fresh identity into its own session flow (`B2`), and the KBS enforces that exact binding before releasing secrets (`K4`). The threat model explicitly accepts Azure TDX's mediation layer into the TCB (`A2[Azure TDX]`). While the application and libraries achieve maximum reproducibility (`l4/a4`), the system carries a significant verification gap at its foundation — the firmware is source-available but not reproducible (`f1`), and the guest OS is fully opaque (`o0`).

---

## Appendix A: Platform Baselines

Platform baselines assess only the layers controlled by the platform provider. User-controlled layers (OS image, application) inherit the Attestation Ceiling set by these baselines.

### GCP TDX

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R0**
- **Notes:** Closed-source OVMF; hardware-measured via TDX MRTD, signed by Intel's PCK chain. The guest has direct `configfs-tsm` / `go-tdx-guest` access — no software vTPM intermediates the quote delivery. The A2 ceiling is not due to quote mediation; it is due to opaque firmware and CSP-managed launch configuration. Google's closed KVM-based hypervisor controls what is measured into the MRTD, using closed-source virtual firmware that Google does not publish in source or reproducible form. An external verifier cannot reproduce the expected MRTD from first principles — only from Google's signed endorsements. MRTD values also vary with VM configuration (RAM size, NUMA layout), reinforcing that the measurement is not independently derivable. **Note:** Google's `gce-tcb-verifier` provides endorsement-based verification of the binary-to-MRTD mapping, allowing verifiers to confirm the binary matches what Google measured. This offers meaningful assurance for threat models that accept Google as a trusted endorser but is not equivalent to R3/R4 reproducibility — you cannot rebuild and verify the firmware yourself. This distinguishes GCP TDX from bare-metal TDX (where you control the VMM and the full launch configuration) and from Azure TDX (where an explicit named paravisor — OpenHCL — mediates the quote path itself). Use `A2[GCP TDX]` when declaring this trust anchor explicitly.

### Azure TDX

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R1**
- **Notes:** OpenHCL paravisor; source available, build not reproducible. Hardware-measured via TDX MRTD into the HCL envelope. The guest has no direct hardware quoting access; the paravisor remains inside the attestation trust path and expands the TCB.

### Azure SEV-SNP

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R0**
- **Notes:** Proprietary closed-source HCL paravisor. Hardware-measured via SNP `MEASUREMENT`. The paravisor intercepts all SNP APIs; `/dev/sev-guest` is hidden from the guest, so CSP-controlled software remains in the attestation path and expands the TCB.

### AWS SEV-SNP

- **Attestation Ceiling:** **A3** (Silicon-Rooted, Direct).
- **Firmware R-Grade:** **R4**
- **Notes:** Nix-reproducible OVMF. Guest has raw access to `/dev/sev-guest` signed by AMD VLEK, with no paravisor in the quote path. This is the platform's theoretical attestation ceiling, not the effective runtime attestation of a typical workload. AWS uses a hybrid boot mechanism where the hypervisor injects kernel/initrd hashes into the OVMF binary before launch — the OS is measured into MRTD indirectly via this modified OVMF, but the injection process is AWS-controlled and not independently verifiable. (Note: the SEV-SNP ABI measures all initial guest pages in principle; the limitation here is AWS's closed image tool and pre-launch pipeline, not a hardware capability gap.) **For a typical AWS SEV-SNP workload, the practical R-grade is `R[f4/o?/lX/aX]`** — firmware is reproducible (f4), but the OS layer (o) sits in an ambiguous state: it is measured but via an opaque injection process that cannot be independently reproduced or verified. The chain integrity at the OS layer requires trusting AWS's proprietary tooling.

### AWS Nitro Enclaves

- **Attestation Ceiling:** **A1** (Provider-Rooted).
- **Firmware R-Grade:** **R0**
- **Notes:** The Nitro Security Module (NSM) is a dedicated hardware chip that computes measurements and ensures real process isolation. However, the root of trust is the AWS Nitro PKI, not a silicon vendor. The A1 classification reflects the trust root (Nitro PKI), not the isolation quality of the Nitro data plane — the hardware isolation is real, but attestation authenticity cannot be verified independently of AWS. A compromised AWS could forge attestation documents without hardware alarms. Third-party verification without trusting AWS infrastructure is impossible. Use `A1[AWS Nitro]` when declaring this trust anchor explicitly. **Layer mapping note:** Nitro Enclaves do not run a traditional OS — the enclave image (EIF) bundles kernel, init, and application into a single artifact. When applying the `R[f/o/l/a]` notation, `o` maps to the enclave image's OS-level components (kernel, init), not a standalone guest OS.
