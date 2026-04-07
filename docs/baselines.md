# Platform Baselines

Platform baselines assess only the layers controlled by the platform provider. User-controlled layers (OS image, application) inherit the Attestation Ceiling set by these baselines.

## GCP TDX

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R0**
- **Notes:** Closed-source OVMF; hardware-measured via TDX MRTD, signed by Intel's PCK chain. The guest has direct `configfs-tsm` / `go-tdx-guest` access — no software vTPM intermediates the quote delivery. However, Google's closed KVM-based hypervisor manages the TD launch and controls what is measured into the MRTD. Because CSP-controlled software participates in the initial TD measurement setup, the attestation ceiling is A2. This distinguishes GCP TDX from bare-metal TDX (where you control the VMM and the full launch configuration) and from Azure TDX (where an explicit named paravisor — OpenHCL — mediates the quote path itself). Use `A2[GCP TDX]` when declaring this trust anchor explicitly.

## Azure TDX

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R1**
- **Notes:** OpenHCL paravisor; source available, build not reproducible. Hardware-measured via TDX MRTD into the HCL envelope. The guest has no direct hardware quoting access; the paravisor remains inside the attestation trust path and expands the TCB.

## Azure SEV-SNP

- **Attestation Ceiling:** **A2** (Silicon-Rooted, Mediated).
- **Firmware R-Grade:** **R0**
- **Notes:** Proprietary closed-source HCL paravisor. Hardware-measured via SNP `MEASUREMENT`. The paravisor intercepts all SNP APIs; `/dev/sev-guest` is hidden from the guest, so CSP-controlled software remains in the attestation path and expands the TCB.

## AWS SEV-SNP

- **Attestation Ceiling:** **A3** (Silicon-Rooted, Direct).
- **Firmware R-Grade:** **R4**
- **Notes:** Nix-reproducible OVMF. Guest has raw access to `/dev/sev-guest` signed by AMD VLEK, with no paravisor in the quote path. This is the platform's theoretical attestation ceiling, not the effective runtime attestation of a typical workload. AWS uses a hybrid boot mechanism where the hypervisor injects kernel/initrd hashes into the OVMF binary before launch — the OS is measured indirectly through the firmware, but the injection process is AWS-controlled and not independently verifiable. The measurement chain's integrity at the OS layer depends on trusting AWS's tooling.

## AWS Nitro Enclaves

- **Attestation Ceiling:** **A1** (Provider-Rooted).
- **Firmware R-Grade:** **R0**
- **Notes:** The Nitro Security Module (NSM) is a dedicated hardware chip that computes measurements and ensures real process isolation. However, the root of trust is the AWS Nitro PKI, not a silicon vendor. A compromised AWS could forge attestation documents without hardware alarms. Third-party verification without trusting AWS infrastructure is impossible. Use `A1[AWS Nitro]` when declaring this trust anchor explicitly. **Layer mapping note:** Nitro Enclaves do not run a traditional OS — the enclave image (EIF) bundles kernel, init, and application into a single artifact. When applying the `R[f/o/l/a]` notation, `o` maps to the enclave image's OS-level components (kernel, init), not a standalone guest OS.

## Comparison Table

| Platform | A | Firmware R | Key trade-off |
|----------|---|-----------|--------------|
| **GCP TDX** | A2 | R0 | Direct quote delivery, closed hypervisor in TD launch TCB |
| **Azure TDX** | A2 | R1 | Auditable paravisor code, explicit mediated attestation |
| **Azure SEV-SNP** | A2 | R0 | Mediated and fully opaque |
| **AWS SEV-SNP** | A3* | R4 | Best on-paper ceiling — but measurement chain integrity at OS layer depends on CSP tooling |
| **AWS Nitro** | A1 | R0 | Provider-rooted — deepest CSP trust dependency |
| **Bare-metal TDX / SEV-SNP** | A3 | R0–R4 | Full stack control, true silicon-direct attestation |

*\*A3 is the platform ceiling. Effective workload attestation may be lower due to measurement chain constraints.*

::: warning Trust assumption
No public cloud platform as of 2026 achieves A3 with an intact measurement chain from firmware to application. A3 currently requires bare-metal. Every cloud platform requires at least one trust decision — the baselines above tell you exactly where that decision lives for each provider.
:::

::: tip Practical tip
GCP TDX sits between Azure TDX and bare-metal: direct quote delivery (no vTPM proxy) but closed hypervisor in TD launch TCB. If your threat model requires A3, bare-metal is the only option on any public cloud today.
:::