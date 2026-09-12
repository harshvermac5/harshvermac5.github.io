---
layout: post
title: "Why BGP Authentication Fails Before the Session Starts"
date: 2026-09-12 05:28:00 +0530
description: "A deep technical guide to BGP session authentication, TCP MD5, TCP-AO, and why authentication failures often occur before the BGP finite-state machine can exchange OPEN messages."
tags: [bgp, tcp, routing-security]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

BGP authentication problems are often misdiagnosed as routing-policy or BGP state-machine failures when the real failure occurs one layer lower: during establishment of the underlying TCP connection. BGP-4 uses TCP as its transport, normally with the passive endpoint listening on TCP port **179**. When TCP-level authentication is enabled, protected TCP segments must carry a valid authentication value before BGP can exchange an **OPEN** message.

The core principle is that **BGP adjacency establishment depends on successful authenticated TCP establishment first**. A mismatched key, missing authentication option, unsupported mechanism, or failed configuration commit can prevent the TCP three-way handshake from completing. The BGP finite-state machine may then remain in **Connect** or **Active**, with no BGP NOTIFICATION because no BGP protocol exchange ever began.

## Co-Technical Subject

**BGP Session Authentication and TCP Control-Plane Security**

The mechanism spans BGP-4 session establishment, TCP MD5 authentication, TCP-AO, and configuration-plane behavior in systems that translate declarative configuration into routing-daemon and kernel socket state.

## Theoretical Foundation

BGP-4 is defined by [**RFC 4271 — A Border Gateway Protocol 4 (BGP-4), 2006**](https://www.rfc-editor.org/rfc/rfc4271). Its finite-state machine includes **Idle**, **Connect**, **Active**, **OpenSent**, **OpenConfirm**, and **Established**. BGP does not begin exchanging protocol messages until TCP connectivity exists. RFC 4271 requires implementations to establish TCP connectivity to peers and listen for incoming BGP connections on TCP port 179.

RFC 4271 also requires support for the TCP MD5 option defined in RFC 2385, reflecting the operational practice of its era.

[**RFC 2385 — Protection of BGP Sessions via the TCP MD5 Signature Option, 1998**](https://www.rfc-editor.org/rfc/rfc2385) defines the original TCP-level authentication mechanism for BGP. Its purpose is stated directly: [“The primary motivation for this option is to allow BGP to protect itself against the introduction of spoofed TCP segments”](https://www.rfc-editor.org/rfc/rfc2385). The primary threat was forged TCP traffic, particularly spoofed resets capable of terminating long-lived BGP sessions.

TCP MD5 was later obsoleted by [**RFC 5925 — The TCP Authentication Option, 2010**](https://www.rfc-editor.org/rfc/rfc5925). TCP-AO adds stronger message authentication, algorithm agility, replay protection, and coordinated key rollover. The standard explicitly says TCP-AO [“obsoletes the TCP MD5 Signature option of RFC 2385”](https://www.rfc-editor.org/rfc/rfc5925).

[**RFC 7454 / BCP 194 — BGP Operations and Security, 2015**](https://www.rfc-editor.org/rfc/rfc7454) recommends preferring TCP-AO when both implementations support it, while recognizing the continued deployment of TCP MD5.

## Mechanism Breakdown

A BGP session starts with ordinary TCP establishment. One speaker sends a SYN toward TCP port 179, the peer replies with SYN-ACK, and the initiator completes the handshake with ACK. Only after TCP succeeds can BGP move toward **OpenSent** and exchange OPEN messages containing BGP version, autonomous-system information, hold time, BGP identifier, and optional parameters.

With TCP MD5 enabled, authentication applies to the TCP segments themselves. RFC 2385 defines TCP option **Kind 19**, length 18 bytes: two bytes for Kind and Length plus a 16-byte MD5 digest.

The digest is calculated over:

- the TCP pseudo-header, including source and destination IP addresses, protocol number, and TCP length;
- the TCP header, excluding TCP options and with the checksum treated as zero;
- the TCP payload, if present; and
- a shared secret known to both endpoints.

Because IP addresses participate in the digest, authentication is bound to the expected connection context. Unexpected NAT, an incorrect source interface, or peering from a different address can invalidate signatures even when the configured key appears correct.

RFC 2385 defines the critical failure behavior: if the receiver calculates a different digest, the segment is discarded and no response is sent. This intentional silent discard prevents unauthenticated traffic from influencing the protected connection.

Operationally, that means a peer using the wrong key can send repeated SYN packets without receiving a SYN-ACK. From the BGP process perspective, the failure looks like inability to establish TCP. No BGP NOTIFICATION is expected because BGP has not reached the message-exchange stage.

TCP-AO preserves this layering but improves the security model. It uses TCP option **Kind 29**, introduces key identifiers, supports stronger MAC algorithms, and permits planned key transitions. TCP-AO and TCP MD5 cannot protect the same TCP connection simultaneously.

A further complication is the configuration plane. A controller can accept syntactically valid BGP input yet fail while translating it into runtime socket state. Conversely, a routing daemon may store an authentication directive even when applying it to an existing socket requires session recreation. Engineers should therefore distinguish **configuration parsing**, **configuration commit**, **runtime application**, and **protocol establishment**.

## Industry Standards Reference

- [**RFC 4271 — BGP-4, 2006**](https://www.rfc-editor.org/rfc/rfc4271): BGP session establishment, TCP transport, and finite-state machine behavior.
- [**RFC 2385 — TCP MD5 Signature Option, 1998**](https://www.rfc-editor.org/rfc/rfc2385): MD5-based TCP authentication originally developed for BGP.
- [**RFC 5925 — TCP Authentication Option, 2010**](https://www.rfc-editor.org/rfc/rfc5925): successor to TCP MD5 with stronger cryptography, replay protection, and key rollover support.
- [**RFC 7454 / BCP 194 — BGP Operations and Security, 2015**](https://www.rfc-editor.org/rfc/rfc7454): operational guidance for protecting BGP speakers and sessions.
- [**RFC 5082 — Generalized TTL Security Mechanism, 2007**](https://www.rfc-editor.org/rfc/rfc5082): GTSM, commonly paired with session authentication to reduce exposure to remotely spoofed BGP packets.

These controls are complementary. TCP authentication protects the transport session, GTSM constrains plausible packet origin, and route policy controls what an authenticated peer is allowed to advertise.

## Practical Examples and Evidence

A standards-oriented configuration can be represented abstractly as follows. Exact syntax varies by implementation:

```text
local-as 65000
router-id 192.0.2.10

neighbor 192.0.2.11 {
    remote-as 65001
    tcp-authentication md5 "shared-secret"
}
```

The peer must use the same authentication mechanism and key. A mismatch may produce a trace resembling:

```text
192.0.2.10:49152 > 192.0.2.11:179  SYN  [TCP MD5 option]
192.0.2.10:49152 > 192.0.2.11:179  SYN retransmission
192.0.2.10:49152 > 192.0.2.11:179  SYN retransmission
```

A useful capture filter is:

```bash
tcpdump -ni eth0 'tcp port 179'
```

Repeated authenticated SYNs without SYN-ACK are significant. If IP reachability, ACLs, and TCP/179 are otherwise correct, the receiving endpoint may be silently discarding the segment because authentication failed.

The diagnostic order should follow the protocol stack. Confirm that TCP completes before focusing on BGP OPEN parameters. If the handshake succeeds but the session fails afterward, inspect OPEN, KEEPALIVE, and NOTIFICATION messages. If it never completes, investigate transport reachability, filtering, source addresses, TTL policy, and authentication first.

RFC 2385 provides the decisive evidence: [“A failing comparison must result in the segment being dropped and must not produce any response back to the sender.”](https://www.rfc-editor.org/rfc/rfc2385)

## Key Technical Insights

- **BGP authentication failure usually appears as a TCP failure first.** Do not expect a BGP NOTIFICATION when authenticated TCP never establishes.
- **A valid configuration file is not proof of successful runtime application.** Parsing, committing, applying socket options, and protocol establishment are separate checkpoints.
- **Authentication must be symmetric.** Both peers must agree on mechanism and key.
- **TCP MD5 is connection-sensitive.** IP-layer information contributes to the digest, so unexpected addressing or translation can invalidate signatures.
- **Silent packet discard is expected.** SYN retransmissions may indicate authentication rejection rather than ordinary loss.
- **TCP-AO is the stronger architectural choice.** It addresses MD5's lack of algorithm agility, replay protection, and coordinated key rollover.
- **Session authentication does not replace routing policy.** An authenticated peer can still advertise incorrect routes; prefix filters, maximum-prefix controls, AS-path policy, and control-plane protection remain necessary.

## Prevention Strategies and Takeaways

- Validate BGP in layers: confirm IP reachability, TCP/179 accessibility, authenticated TCP establishment, BGP OPEN exchange, then routing-policy behavior.
- Configure authentication consistently on both peers and coordinate key changes to avoid unnecessary session loss.
- Prefer TCP-AO where both endpoints support it; otherwise use TCP MD5 with strong, non-reused secrets and appropriate operational controls.
- Combine session authentication with GTSM where appropriate, anti-spoofing filters, control-plane policing, and strict route policy.
- Capture traffic on both sides when possible. Distinguishing **no SYN received**, **SYN silently discarded**, **successful TCP followed by BGP NOTIFICATION**, and **Established with policy issues** sharply narrows the fault domain.
- Treat configuration-management errors as evidence about the control plane, not proof that BGP itself is defective. Verify what reached the routing daemon and kernel before drawing protocol-level conclusions.

The central principle is operationally powerful: **BGP authentication protects the TCP transport that BGP depends on, so authentication failures can prevent the BGP protocol from starting at all**. Troubleshooting becomes faster when TCP establishment, authentication, and the BGP finite-state machine are analyzed as separate stages rather than as one undifferentiated “BGP down” condition.
