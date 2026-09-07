---
layout: post
title: "Troubleshooting IKEv2 Authentication and Traffic Selector Failures"
date: 2026-09-08 01:17:00 +0530
description: "A standards-based guide to separating IKE_SA_INIT, IKE_AUTH, CHILD_SA, and traffic-selector failures when diagnosing site-to-site IPsec tunnels."
tags: [ipsec, ikev2, troubleshooting]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A site-to-site IPsec tunnel can appear partially established while remaining unusable. The correct troubleshooting model is to treat **IKEv2 as a sequence of distinct protocol stages**, not a single up-or-down event.

**IKE_SA_INIT, IKE_AUTH, and CHILD_SA creation prove different things**. Proposal negotiation does not prove that the peer identity or pre-shared key is correct. Authentication does not prove that the protected networks are acceptable. A working CHILD_SA does not prove routing or forwarding. Troubleshooting should therefore follow the protocol state machine and stop at the first transition that fails.

## Co-Technical Subject

**IPsec site-to-site VPN negotiation: IKEv2 authentication, Security Associations, Traffic Selectors, and IPsec policy architecture.**

The key architectural boundary is between the **IKE SA**, which protects IKE control traffic and authenticates peers, and **Child SAs**, which protect user traffic, usually with ESP.

## Theoretical Foundation

IKEv2 is standardized in **RFC 7296 / STD 79, Internet Key Exchange Protocol Version 2, October 2014**. Its role is to authenticate peers, negotiate cryptographic parameters, derive keying material, and create IPsec SAs. The specification states: [“IKE is a component of IPsec used for performing mutual authentication and establishing and maintaining Security Associations.”](https://www.rfc-editor.org/rfc/rfc7296.html#section-1)

The broader IPsec processing model is defined by **RFC 4301, Security Architecture for the Internet Protocol, December 2005**. That architecture separates policy, established SA state, and peer authorization. RFC 4301 describes the model directly: [“There are three nominal databases in this model: the Security Policy Database (SPD), the Security Association Database (SAD), and the Peer Authorization Database (PAD).”](https://www.rfc-editor.org/rfc/rfc4301.html#section-4.4)

The **SPD** determines whether traffic is discarded, bypassed, or protected. The **SAD** contains instantiated SA state. The **PAD** ties authenticated identities to policy. Failures can therefore occur during peer-policy selection, Child SA creation, or packet-to-policy matching.

**Policy-based VPN** and **route-based VPN** are implementation descriptions, not core IETF protocol modes. Policy-based systems expose SPD-like selectors directly; route-based systems commonly bind IPsec to a logical interface and let routing choose traffic. Both still rely on standards-compliant IKEv2 and IPsec SAs.

## Mechanism Breakdown

The first exchange is **IKE_SA_INIT**. The initiator sends an SA proposal, Diffie-Hellman key exchange material, and a nonce. The responder selects an acceptable proposal and returns its own key exchange material and nonce. NAT-detection notifications may also appear.

Conceptually, the exchange is:

```text
Initiator                         Responder
SAi1, KEi, Ni        -->
                     <--  SAr1, KEr, Nr
```

Completion proves bidirectional IKE reachability, an acceptable IKE suite, a compatible Diffie-Hellman group, and enough shared ephemeral material to derive IKE protection keys. It does **not** prove that the peers trust each other; the pre-shared key, certificate, or other authentication credential has not yet been validated.

The second exchange is **IKE_AUTH**. It is encrypted and integrity protected with keys derived after IKE_SA_INIT. The peers exchange identities through `IDi` and `IDr`, prove possession of the corresponding authentication credential with the `AUTH` payload, and normally negotiate the first Child SA using `SAi2`, `SAr2`, `TSi`, and `TSr`.

```text
Initiator                                      Responder
SK { IDi, AUTH, SAi2, TSi, TSr }   -->
                                   <--  SK { IDr, AUTH, SAr2, TSi, TSr }
```

With pre-shared-key authentication, the `AUTH` value is derived from the configured shared secret plus transcript-dependent values. A wrong PSK can therefore allow **IKE_SA_INIT to succeed and IKE_AUTH to fail**. The same is true when the PSK is correct but the asserted identity selects a different credential or policy entry on the peer.

Authentication-stage failures should focus on:

- Pre-shared-key equality and encoding.
- `IDi` and `IDr` values.
- Identity-to-credential mapping.
- Authentication method selection.
- Integrity verification of the protected IKE_AUTH message.

An optional `CERTREQ` payload does not, by itself, prove that certificate authentication is required. RFC 7296 permits certificate-request payloads in exchanges where a peer is indicating acceptable trust anchors. The actual configured authentication method and `AUTH` processing are more authoritative evidence.

IKEv2 is request/response based. The requester retransmits after timeout, with exponentially increasing intervals, while Message IDs correlate requests and responses. Repeated identical IKE_AUTH requests with no response therefore differ materially from an explicit protected `AUTHENTICATION_FAILED` notification.

After authentication, the first **Child SA** is created. It carries protected traffic and has its own transforms, SPIs, selectors, and lifetimes. Peer authentication can therefore succeed while Child SA negotiation fails.

**Traffic Selectors** are central to this stage. `TSi` describes traffic associated with the initiator side and `TSr` describes traffic associated with the responder side. Selectors can include IP ranges, protocol numbers, and port ranges. The responder may accept them, narrow them to an allowed subset, or reject them with `TS_UNACCEPTABLE` when policy permits none of the proposed traffic.

The boundary is critical: **authentication failure prevents the IKE SA from being established; selector failure can occur after authentication while blocking the desired Child SA.**

## Industry Standards Reference

- **RFC 7296 / STD 79, 2014** defines IKEv2 exchanges, identities, authentication, Traffic Selectors, retransmissions, Child SAs, and error notifications.
- **RFC 4301, 2005** defines the IPsec architecture, including SPD, SAD, PAD, packet selectors, and the protect/bypass/discard processing model.
- **RFC 4303, 2005** defines Encapsulating Security Payload, which provides confidentiality, integrity, authentication, and anti-replay services for protected IP traffic.
- **RFC 8247, 2017** defines IKEv2 cryptographic algorithm implementation requirements and usage guidance. It should be read together with later updates rather than treated as a permanent list of preferred algorithms.
- **RFC 8221, 2017** provides corresponding algorithm implementation guidance for ESP and AH.
- **RFC 9395, 2023** formally deprecates IKEv1 and updates the status of obsolete cryptographic algorithms. New deployments should use IKEv2 and current cryptographic guidance.

## Practical Examples and Evidence

Consider a generic diagnostic state:

```text
Security Associations: 0 established, 1 connecting
IKEv2 state: CONNECTING
Selected IKE proposal: AES-CBC-256 / HMAC-SHA2-256 / PRF-SHA2-256 / MODP-2048
Active tasks: IKE_AUTH, IKE_ESTABLISH, CHILD_CREATE
```

A selected proposal means IKE_SA_INIT progressed. If the session remains connecting while `IKE_AUTH` is active, investigate authentication and identity before changing Phase 1 transforms.

A generic integrity-related diagnostic during IKE_AUTH might look like:

```text
IKE_AUTH processing failed
protected-message integrity verification failed
```

That evidence is consistent with incorrect derived authentication state, a credential or identity mismatch, or malformed protected input. It does not by itself prove an encryption-transform mismatch.

Once authentication succeeds, inspect selector negotiation. Compare the intended protected domains in both directions; do not assume that `10.10.0.0/16 -> 10.20.0.0/16` is represented identically on each peer.

On a Linux IPsec implementation, useful data-plane and policy checks include:

```bash
ip xfrm state
ip xfrm policy
ip route get 10.20.0.10
tcpdump -ni any 'udp port 500 or udp port 4500 or proto 50'
```

`ip xfrm state` shows SAs, `ip xfrm policy` shows selector policy, `ip route get` confirms forwarding selection, and packet capture verifies whether IKE, NAT-T, and ESP packets are transmitted and returned.

## Key Technical Insights

- **A selected IKE proposal is not proof of successful authentication.** IKE_SA_INIT and IKE_AUTH solve different problems.
- **A wrong PSK often fails late enough to confuse operators.** Diffie-Hellman negotiation can succeed even when the configured shared secrets differ.
- **Identity matters independently of the PSK string.** A correct shared secret associated with the wrong `IDi` or `IDr` can still fail authentication or policy lookup.
- **`CERTREQ` is not proof of certificate-based authentication.** Diagnose the actual authentication method and `AUTH` payload behavior.
- **Traffic Selector failures are Child SA policy failures, not necessarily IKE authentication failures.** Treat `AUTHENTICATION_FAILED` and `TS_UNACCEPTABLE` as different branches of the state machine.
- **Route-based and policy-based administration can interoperate only when their resulting selector expectations are compatible.** A logical tunnel interface does not eliminate IKEv2 Traffic Selector negotiation.
- **Dashboard state is secondary evidence.** The authoritative questions are whether an IKE SA exists, whether a Child SA exists, which selectors were installed, and whether packets match them.

## Prevention Strategies and Takeaways

- Troubleshoot in strict protocol order: **IKE_SA_INIT -> IKE_AUTH -> CHILD_SA -> routing -> security policy -> packet forwarding**.
- Record both peers' IKE transforms, authentication method, identities, Child SA transforms, and protected prefixes before making changes.
- Treat PSKs as binary secrets with exact encoding requirements; avoid visually similar strings, trailing whitespace, and inconsistent secret handling.
- Define peer identities explicitly when multiple identities, FQDNs, addresses, or credential mappings are possible.
- Compare `TSi` and `TSr` from packet captures or detailed logs when Child SA creation fails.
- In route-oriented deployments, validate both the logical tunnel routing decision and the underlying IPsec selector policy.
- Use current IETF algorithm guidance and avoid preserving legacy transforms solely for convenience.
- Prefer evidence that maps directly to a protocol stage. A troubleshooting change is useful only when it tests a specific hypothesis about that stage.

The transferable rule is: **an IPsec tunnel is a chain of independently verifiable state transitions**. Diagnose the first failed transition; later symptoms are downstream effects.
