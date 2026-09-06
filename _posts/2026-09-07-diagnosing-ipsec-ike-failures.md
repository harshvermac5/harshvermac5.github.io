---
layout: post
title: "Diagnosing IPsec IKE Failures with Packet-Flow Evidence"
date: 2026-09-07 02:08:00 +0530
description: "A standards-based method for separating IKE reachability failures from cryptographic negotiation problems using UDP flow state, packet captures, and protocol sequencing."
tags: [ipsec, ikev2, troubleshooting]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

An IPsec tunnel that never completes its initial key exchange is often diagnosed by repeatedly changing encryption, integrity, Diffie-Hellman, or Perfect Forward Secrecy settings. That approach is backwards when the initiator is transmitting IKE packets but receiving no response.

The core principle is **failure-domain ordering**: prove bidirectional IKE transport before troubleshooting cryptographic agreement. If an initiator sends UDP packets to the peer and the peer never answers, there is not yet enough protocol evidence to blame an AES, SHA, authentication, or Diffie-Hellman mismatch. The fault domain is still reachability, filtering, NAT, peer availability, or responder configuration.

A proposal mismatch requires the remote endpoint to receive and parse a request sufficiently to reject or negotiate it. Silence is a different failure class.

## Co-Technical Subject

**IPsec control-plane troubleshooting, IKE state establishment, NAT traversal, and packet-path validation.**

## Theoretical Foundation

The modern architectural basis is **RFC 4301, Security Architecture for the Internet Protocol**, with IKEv2 defined by **RFC 7296, Internet Key Exchange Protocol Version 2, October 2014**. ESP is defined by **RFC 4303**. NAT traversal for older IKE deployments is described by **RFC 3947** and UDP encapsulation of ESP by **RFC 3948**, both published in January 2005.

IKE establishes shared cryptographic state rather than directly carrying application traffic. An IKE Security Association protects subsequent control exchanges, while one or more **Child SAs** protect data with ESP or AH. This sequencing is central to diagnosis: data-plane parameters cannot be meaningfully debugged until the control-plane exchange progresses far enough to create the required state.

RFC 7296 explicitly states that ["IKE messages use UDP ports 500 and/or 4500"](https://www.rfc-editor.org/rfc/rfc7296.html#section-3.1). UDP 500 is the conventional IKE listener, while UDP 4500 is used for NAT traversal and may also be used by IKEv2 from the beginning.

IKEv1 was defined by **RFC 2409 in November 1998**, but **RFC 9395, published in 2023**, moved IKEv1 to Historic status. The current guidance is unambiguous: ["IKEv1 has been deprecated"](https://www.rfc-editor.org/rfc/rfc9395.html#section-1). New deployments should therefore prefer IKEv2 unless interoperability with legacy systems requires otherwise.

## Mechanism Breakdown

IKEv2 begins with an **IKE_SA_INIT** exchange. The initiator proposes cryptographic transforms, sends a nonce, and provides a Diffie-Hellman key exchange value. The responder selects an acceptable proposal and returns its own nonce and key exchange material. Only after this request-response pair succeeds does **IKE_AUTH** authenticate the peers and establish the first Child SA in the common case.

The diagnostic hierarchy is:

- The initiator must have a route to the responder's public address.
- The request must leave the local interface with the expected source address and UDP destination port.
- Intermediate firewalls, NAT devices, ACLs, and ISPs must forward the datagram.
- The remote host must be listening for IKE and must associate the packet with the intended VPN configuration.
- The responder must send a response that can return through the reverse path.
- Only then can proposal selection, authentication, identity validation, and Child SA negotiation become observable failure domains.

IKE runs over UDP, so reliability is implemented by IKE itself. RFC 7296 defines exchanges as request-response pairs and requires the requester to retransmit when a response is not received. Implementations normally use increasing retransmission intervals to avoid amplifying congestion. Repeated identical outbound requests with no inbound response therefore strongly indicate that the state machine has not advanced beyond waiting for the peer.

A cryptographic mismatch looks different. Once the responder participates, packet captures or daemon logs may expose errors such as **NO_PROPOSAL_CHOSEN**, **AUTHENTICATION_FAILED**, or **INVALID_KE_PAYLOAD**. Those signals prove the remote endpoint processed the request. Silence does not.

NAT traversal introduces another branch. For IKEv2, NAT detection occurs through NAT detection payloads. When NAT-T is used, IKE and UDP-encapsulated ESP normally operate on UDP 4500. RFC 3948 defines UDP encapsulation so ESP can traverse translators that cannot directly handle native ESP reliably. When diagnosing a tunnel, inspect both UDP 500 and UDP 4500 rather than assuming all negotiation remains on a single port.

**Perfect Forward Secrecy** must also be placed at the correct stage. IKE itself derives keying material from ephemeral Diffie-Hellman. In IKEv2, a later **CREATE_CHILD_SA** exchange may include an additional KE payload to give the generated Child SA stronger forward-secrecy guarantees. This means toggling a PFS option associated with Child SA creation cannot repair a condition where the first IKE request receives no response at all.

## Industry Standards Reference

The relevant standards form a layered troubleshooting model:

- **RFC 4301, 2005** defines the IPsec security architecture, Security Policy Database, Security Association Database, and processing model.
- **RFC 4303, 2005** defines ESP, which provides confidentiality and optional integrity for protected IP traffic.
- **RFC 7296, 2014** defines IKEv2 exchanges, retransmission behavior, NAT detection, authentication, Child SA creation, and rekeying.
- **RFC 3947, 2005** defines negotiation of NAT traversal for IKE.
- **RFC 3948, 2005** defines UDP encapsulation of ESP, including operation on UDP 4500.
- **RFC 8247, 2017**, updated by RFC 9395, provides IKEv2 algorithm implementation guidance.
- **RFC 8221, 2017**, also updated by RFC 9395, provides algorithm guidance for ESP and AH.
- **RFC 9395, 2023** deprecates IKEv1 and several obsolete cryptographic algorithms.

Compatibility settings should not be weakened blindly. Modern deployments should prefer IKEv2 and contemporary cryptographic suites.

## Practical Examples and Evidence

A Linux packet capture can establish whether the local endpoint is sending IKE and whether any response returns:

```bash
sudo tcpdump -ni any 'host 203.0.113.20 and (udp port 500 or udp port 4500)'
```

A healthy initial exchange should show traffic in both directions. Repeated traffic in only one direction is more significant than the exact transform proposal at that moment.

Linux connection tracking can provide another clue:

```bash
sudo conntrack -L -p udp --dport 500
```

Representative output might resemble:

```text
udp 17 25 src=198.51.100.10 dst=203.0.113.20 sport=500 dport=500 \
    [UNREPLIED] src=203.0.113.20 dst=198.51.100.10 sport=500 dport=500
```

**`UNREPLIED` is a Linux conntrack implementation state, not an IETF protocol state.** It means the tracking subsystem has observed packets in the original direction but none matching the reverse tuple. It does not identify where the packet was lost.

The decisive next test is a capture at or immediately in front of the responder:

```bash
sudo tcpdump -ni any 'host 198.51.100.10 and (udp port 500 or udp port 4500)'
```

Interpret the result causally:

- If the responder capture sees nothing, investigate routing, upstream ACLs, NAT, ISP filtering, wrong peer addressing, or cloud security policy.
- If the request arrives but the responder sends nothing, investigate IKE service state, peer matching, local firewall policy, malformed input, or responder configuration.
- If both request and response leave the responder but the initiator sees only outbound traffic, investigate asymmetric routing, NAT state, return-path filtering, or intermediate packet loss.
- If bidirectional IKE is visible, move upward to proposal, authentication, identity, certificate, traffic-selector, and Child SA diagnostics.

## Key Technical Insights

- **Transport evidence precedes cryptographic evidence.** No response means the responder has not been proven to participate in negotiation.
- **Proposal mismatches require protocol interaction.** Look for IKE notifications or responder logs before concluding that AES, SHA, or Diffie-Hellman settings disagree.
- **UDP retransmissions are diagnostic evidence.** Repeated requests with no reverse traffic show that IKE reliability logic is waiting on the peer.
- **NAT-T changes the observable path.** Capture both UDP 500 and 4500 and account for address or port translation between endpoints.
- **PFS is not a reachability switch.** Additional Child SA Diffie-Hellman exchange affects key derivation and forward secrecy, not whether the first IKE packet receives a response.
- **Working parallel tunnels are useful controls.** If the same local IPsec stack maintains other SAs successfully, a global IKE subsystem failure becomes less likely, although peer-specific routing and policy must still be verified.

## Prevention Strategies and Takeaways

Build IPsec troubleshooting around protocol progression rather than configuration guessing.

- Verify peer addressing and routing before modifying cryptographic proposals.
- Capture IKE traffic on both endpoints whenever possible.
- Treat one-way UDP 500 or 4500 traffic as a reachability or responder problem until evidence proves otherwise.
- Confirm NAT-T behavior explicitly when NAT exists anywhere in the path.
- Move to proposal and authentication debugging only after bidirectional IKE traffic is established.
- Prefer IKEv2 for new deployments and avoid weakening cryptography merely to test reachability.
- Record a known-good baseline containing peer addresses, IKE version, transforms, authentication method, lifetimes, Child SA selectors, and NAT assumptions.

The most important operational habit is simple: **follow the packet and the state machine in order**. When IKE never receives a response, the next useful question is not which cipher to try. It is where the response path stops existing.
