---
layout: post
title: "When IKE Is Healthy but IPsec Is Broken: Diagnosing One-Way ESP Black Holes"
date: 2026-09-04 18:41:00 +0530
description: "Why an IPsec tunnel can remain established at the IKE control plane while ESP traffic silently fails in one direction, and how to diagnose the split correctly."
tags: [ipsec, ike, esp, vpn, linux]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

An IPsec tunnel can be **cryptographically established, successfully rekeying, and passing Dead Peer Detection while still being unusable for application traffic**. The reason is architectural: IKE and ESP have different roles and different state machines.

IKE creates and maintains Security Associations. ESP carries protected user traffic. A healthy IKE exchange proves that the key-management peers can communicate; it does not prove that both ESP directions are forwarding packets.

This distinction matters in **one-way ESP black holes**, where one gateway keeps encrypting traffic and incrementing outbound SA counters while the opposite direction receives or decrypts nothing. Monitoring that checks only “IKE established” can therefore miss a real outage.

The objective is to understand how to separate **control-plane liveness** from **data-plane forwarding**, why simplex IPsec SAs allow directional failures, and how to prove where traffic disappears.

## Co-Technical Subject

**IPsec Security Association state, IKE liveness, ESP forwarding, rekey behavior, and Linux XFRM diagnostics.**

The relevant domains are route-based VPN architecture, IKEv1/IKEv2 SA management, ESP SPI handling, directional SA pairing, and packet-level fault isolation.

## Theoretical Foundation

**RFC 4301, Security Architecture for the Internet Protocol, December 2005** defines a fundamental property of IPsec: an SA is directional. The RFC states that [“An SA is a simplex ‘connection’ that affords security services to the traffic carried by it.”](https://www.rfc-editor.org/rfc/rfc4301.html#section-4.1)

Bidirectional communication therefore depends on **two SAs**, one in each direction. Each inbound ESP SA is identified principally by a **Security Parameters Index**, or SPI, chosen by the receiver. The transmitting peer must use the SPI associated with that receiver's inbound SA.

**RFC 4303, IP Encapsulating Security Payload, December 2005** defines ESP. Native ESP uses IP protocol **50** and provides confidentiality, integrity, origin authentication, anti-replay protection, or combinations of these services according to the negotiated transform set.

IKE is separate. **RFC 2409, The Internet Key Exchange, November 1998** defines IKEv1. Main Mode establishes the Phase 1 IKE/ISAKMP SA; Quick Mode negotiates Phase 2 IPsec SAs. RFC 2409 describes that [“Quick Mode is essentially a SA negotiation and an exchange of nonces that provides replay protection.”](https://www.rfc-editor.org/rfc/rfc2409.html#section-5.5)

IKEv1 was superseded by IKEv2. **RFC 7296, Internet Key Exchange Protocol Version 2, October 2014** uses IKE SAs and Child SAs; `CREATE_CHILD_SA` creates or rekeys Child SAs.

For IKEv1, **RFC 3706, February 2004** describes Dead Peer Detection. Its scope is explicit: [“DPD relies on IKE Notify messages to query the liveliness of an IKE peer.”](https://www.rfc-editor.org/rfc/rfc3706.html#section-1)

That boundary is crucial: **DPD validates peer liveness through IKE. It does not directly validate bidirectional forwarding through every ESP SA.**

## Mechanism Breakdown

A route-based IPsec VPN may expose a logical tunnel interface, while the kernel still performs protection through IPsec policy and SA databases.

A protected packet typically follows this path:

- Routing selects the logical tunnel path.
- IPsec policy marks the packet for protection.
- The outbound SA is selected.
- ESP adds the SPI and sequence number, then encrypts and authenticates the payload.
- The packet crosses the WAN using native ESP or UDP encapsulation for NAT traversal.
- The peer uses the SPI to locate the matching inbound SA.
- Anti-replay, integrity, and decryption checks complete before the inner packet is forwarded.

Because each direction has independent SA state, one direction may work while the other fails. The reverse SA can be stale, absent, mapped to the wrong SPI, rejected by anti-replay processing, filtered in transit, or never selected by routing and policy.

IKE can remain healthy throughout. UDP/500 or UDP/4500 exchanges may succeed, rekeys may complete, and DPD may receive timely responses. A management system that equates **IKE_SA established** with **VPN healthy** therefore has an incomplete health model.

Rekeying adds complexity. IKEv1 Quick Mode or IKEv2 `CREATE_CHILD_SA` can briefly leave old and new SAs present at the same time. During intermittent failures, the important question is not merely “Is IKE established?” but **“Are the paired inbound and outbound ESP SAs carrying traffic in both directions?”**

## Industry Standards Reference

The relevant standards are:

- **RFC 4301 — Security Architecture for the Internet Protocol, December 2005.** Defines the SPD, SAD, SA model, and paired simplex SAs.
- **RFC 4303 — IP Encapsulating Security Payload, December 2005.** Defines ESP packet structure, SPIs, sequence numbers, anti-replay, and inbound/outbound processing.
- **RFC 2409 — The Internet Key Exchange, November 1998.** Defines IKEv1 Main Mode and Quick Mode; obsolete for new protocol design but still operationally relevant.
- **RFC 3706 — A Traffic-Based Method of Detecting Dead Internet Key Exchange Peers, February 2004.** Defines commonly implemented IKEv1 DPD behavior as an Informational RFC.
- **RFC 7296 — Internet Key Exchange Protocol Version 2, October 2014.** Defines IKEv2 IKE SAs, Child SAs, liveness, and rekeying.

RFC 7296 also warns about black-hole behavior when a system has only outgoing traffic and has not recently received protected traffic. The lesson is broader than IKEv2: **directional data-plane evidence is required to prove tunnel health.**

## Practical Examples and Evidence

On Linux, IPsec implementations commonly program kernel XFRM state. Start by checking SA and policy counters:

```bash
ip -s xfrm state
ip -s xfrm policy
```

A suspicious pattern is an outbound SA whose counters increase while the corresponding inbound SA remains at zero:

```text
src 203.0.113.10 dst 198.51.100.20
    proto esp spi 0x4a21be90
    packets 18422 bytes 27411833

src 198.51.100.20 dst 203.0.113.10
    proto esp spi 0x9c772104
    packets 0 bytes 0
```

If IKE logs simultaneously show successful DPD and normal rekeys, the evidence points to a **data-plane asymmetry**, not a dead-peer failure.

Capture native ESP with:

```bash
tcpdump -ni eth0 'proto 50 and host 198.51.100.20'
```

For NAT traversal, inspect UDP/4500 instead:

```bash
tcpdump -ni eth0 'udp port 4500 and host 198.51.100.20'
```

The strongest isolation method is a simultaneous capture at both peers.

- If the sender's outbound XFRM counter rises and ESP appears on its WAN, but the receiver never sees it, investigate the path: upstream filtering, CPE behavior, asymmetric routing, or NAT state.
- If the receiver sees ESP but its inbound SA counter does not rise, investigate SPI mismatch, stale SAD state, integrity failure, or anti-replay rejection.
- If the sender's outbound counter does not rise, investigate routing, policy selection, tunnel-interface state, or traffic selectors before encryption.

## Key Technical Insights

- **IKE health is not ESP health.** A responsive IKE peer can coexist with a failed ESP direction.
- **IPsec SAs are directional.** Inbound and outbound counters are separate health signals.
- **DPD detects peer liveness, not application reachability.** Tuning DPD cannot repair a one-way ESP path when IKE remains reachable.
- **Rekey events are transition points.** Old and new SPIs may coexist briefly, so SPI correlation matters during intermittent failures.
- **Zero inbound bytes are highly diagnostic.** Growing outbound counters with a zero inbound peer should shift the investigation to directional packet-path analysis.
- **Monitoring should test the protected path.** Data-plane probes and SA counters complement IKE state.

## Prevention Strategies and Takeaways

- Prefer **IKEv2** for new deployments because its Child SA lifecycle is cleaner than legacy IKEv1 Phase 1/Phase 2 handling.
- Monitor **inbound and outbound ESP counters independently** and alert on sustained directional divergence.
- Correlate SPIs at both peers during failures rather than trusting a single session-state indicator.
- Use simultaneous packet captures to determine whether loss occurs before encryption, in transit, or during inbound IPsec processing.
- Do not treat successful DPD as proof that protected application traffic is healthy.
- Avoid making critical services such as DNS entirely dependent on a remote tunnel without local fallback; this limits the blast radius of VPN failures.
- Preserve rekey timestamps, SA creation/deletion events, and XFRM counters so intermittent outages can be reconstructed.

The operational rule is simple: **an established IKE SA proves that key-management peers can communicate; only bidirectional ESP evidence proves that the VPN data path is working.**
