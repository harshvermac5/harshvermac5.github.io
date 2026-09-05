---
layout: post
title: "SIP ALG, Conntrack State, and Persistent NAT Rewriting"
date: 2026-09-06 02:32:00 +0530
description: "How SIP application-layer gateways interact with UDP connection tracking, NAT mappings, response routing, and stale helper state."
tags: [sip, conntrack, nat]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

SIP over UDP is unusually sensitive to the boundary between **Layer 3/4 NAT state** and **Layer 7 signaling state**. A firewall can successfully pass packets in both directions while SIP registration still fails because an application-layer gateway, or ALG, rewrites addresses or ports embedded inside SIP headers or SDP bodies.

The central mechanism is **state persistence**. Stateful firewalls classify traffic into connection-tracking entries, and protocol helpers may become metadata on those entries. If helper policy changes after a flow already exists, the existing entry can continue to use the old helper association until that entry expires or is explicitly removed. Continuous SIP retransmission or keep-alive traffic can therefore preserve stale processing longer than an operator expects.

The practical lesson is that **configuration state and active flow state are separate**. Changing helper policy does not necessarily mutate an existing connection.

## Co-Technical Subject

**SIP NAT traversal and stateful connection tracking**: specifically, the interaction among SIP response routing, UDP NAT mappings, Netfilter-style conntrack state, and SIP ALG payload rewriting.

## Theoretical Foundation

SIP signaling is defined by **RFC 3261, Session Initiation Protocol, 2002**. SIP messages carry routing information inside the application payload, especially **Via** and **Contact** headers. RFC 3261 explains that the Via header [`"identifies the location where the response is to be sent"`](https://www.rfc-editor.org/rfc/rfc3261.html#section-8.1.1.7). This creates tension with NAT because the endpoint may place a private address or pre-NAT port in the SIP message while the IP/UDP packet is translated to a different public tuple.

**RFC 3581, An Extension to SIP for Symmetric Response Routing, 2003**, introduced the **`rport`** parameter to address this mismatch. It allows a client to request that the server return a response to the packet source tuple actually observed on the wire. The RFC states that `rport` lets the server send the response [`"back to the source IP address and port where the request came from"`](https://www.rfc-editor.org/rfc/rfc3581.html#section-1).

NAT behavior for UDP is standardized operationally by **RFC 4787, NAT Behavioral Requirements for Unicast UDP, 2007**. It requires endpoint-independent mapping for compliant NATs and states that a UDP mapping timer generally **must not expire in less than two minutes**, with defined exceptions, while recommending a default of five minutes or more. This matters because periodic SIP traffic can refresh the same mapping indefinitely.

**RFC 5626, Managing Client-Initiated Connections in SIP, 2009**, defines SIP Outbound and keep-alives, treating the client-created flow as persistent routing state that must survive NAT and firewall boundaries.

## Mechanism Breakdown

A SIP user agent sending a UDP `REGISTER` normally creates a five-tuple such as source IP, source port, destination IP, destination port, and protocol. A stateful gateway creates a **conntrack entry** representing both the original and reply directions. NAT metadata is stored alongside that state so that return packets can be translated back to the internal endpoint.

A protocol helper adds another dimension. Because SIP carries IP addresses and ports in **Via**, **Contact**, and SDP, an ALG may inspect or alter payload fields and create expectations for related media flows. Linux Netfilter implements this with components such as `nf_conntrack_sip` and `nf_nat_sip`; the kernel source describes the latter as a [`"SIP extension for NAT alteration"`](https://github.com/torvalds/linux/blob/master/net/netfilter/nf_nat_sip.c). In nftables, helper assignment becomes connection metadata once attached to a tracked flow.

The sequence is therefore:

- The first SIP datagram creates a UDP conntrack entry.
- NAT allocates or reuses an external address/port mapping.
- A SIP helper rule may attach the **`sip`** helper to the new connection.
- Later packets matching the same tuple refresh the entry rather than creating a replacement.
- Reply traffic sets reply-seen state; sustained bidirectional UDP traffic may transition the entry to **`ASSURED`**.
- SIP retransmissions, re-registration, NAT keep-alives, or other periodic messages continue refreshing the timer.
- If helper policy is disabled after creation, the existing flow can remain alive with its original helper association until the entry is destroyed.

This explains an important diagnostic paradox: the running configuration can show **SIP helper disabled** while the connection table still shows **`helper=sip`** on an established UDP flow.

## Industry Standards Reference

The mechanism spans several standards and implementation layers:

- **RFC 3261 (2002)** defines SIP transactions, registration, Via processing, Contact bindings, retransmission behavior, and response routing.
- **RFC 3581 (2003)** adds **`rport`** and symmetric response routing so UDP responses can follow the observed source address and port through NAT.
- **RFC 4787 (2007)** defines required NAT mapping and filtering behavior for UDP, including mapping timers and refresh behavior.
- **RFC 5389 (2008)** defines STUN, used by later SIP NAT-traversal mechanisms to discover and maintain translated paths.
- **RFC 5626 (2009)** defines SIP Outbound, flow tokens, flow recovery, and keep-alive procedures for clients behind NATs and firewalls.
- **RFC 6223 (2011)** extends SIP keep-alive negotiation and complements the flow-management model introduced by RFC 5626.
- **Linux Netfilter conntrack/nftables** is an implementation reference, not an IETF standard. Its helper model demonstrates how application-aware state can be attached to tracked flows and retained independently of later policy edits.

SIP ALG is not required by RFC 3261. It is an implementation technique for NAT-unaware endpoints; modern deployments generally favor `rport`, STUN, persistent outbound flows, or TLS over transparent payload rewriting.

## Practical Examples and Evidence

Consider a SIP endpoint behind NAT using UDP/5060. A simplified request may contain:

```text
REGISTER sip:voice.example.net SIP/2.0
Via: SIP/2.0/UDP 10.20.30.40:5060;rport;branch=z9hG4bK-1
Contact: <sip:user@10.20.30.40:5060>
```

The packet may leave the NAT as `198.51.100.25:62014 -> 203.0.113.50:5060`. With `rport`, a compliant server can reply to `198.51.100.25:62014` instead of trusting the private address embedded by the client.

On a Linux stateful gateway, an illustrative conntrack entry might look like:

```text
udp 17 118 src=10.20.30.40 dst=203.0.113.50 sport=5060 dport=5060 \
    packets=840 bytes=512400 \
    src=203.0.113.50 dst=198.51.100.25 sport=5060 dport=62014 \
    packets=120 bytes=74400 [ASSURED] helper=sip
```

The asymmetry does not prove packet loss by itself. Reply counters prove that **some reverse traffic reached conntrack**. An `[ASSURED]` UDP entry likewise reflects connection-tracking state, not successful SIP registration.

Helper assignment can be inspected with nftables metadata, and active flows can be listed using:

```bash
conntrack -L -p udp --dport 5060 -o extended
```

If policy has been changed and a stale entry must be invalidated for a controlled test, the relevant flow can be removed:

```bash
conntrack -D -p udp --dport 5060
```

The Netfilter conntrack-tools manual explicitly supports listing, updating, and deleting in-kernel flow entries. Removing the entry forces the next SIP packet to create a new connection that is evaluated against the **current** helper-assignment policy.

Paired captures across the NAT boundary are equally useful. A response visible on WAN but absent on LAN points toward translation or helper processing; a response visible on both sides shifts analysis toward SIP transaction and endpoint behavior.

## Key Technical Insights

- **Packet filtering and SIP correctness are different questions.** An established-state firewall rule can accept a return packet while Layer 7 rewriting still makes the SIP transaction unusable.
- **Conntrack state outlives configuration edits.** Policy changes generally govern new flow creation; persistent UDP traffic can preserve an old connection long enough to hide the effect of a new configuration.
- **`ASSURED` is not application success.** It indicates durable bidirectional conntrack activity, not a `200 OK`, successful authentication, or a valid registrar binding.
- **SIP embeds topology information in payloads.** Any mismatch among packet tuples, Via, Contact, SDP, and NAT mappings creates opportunities for asymmetric signaling or media failure.
- **Retransmission can preserve the failure mechanism.** Continuous `REGISTER` retries may keep both the NAT mapping and stale helper state alive, preventing natural re-evaluation.
- **Response counters are high-value evidence.** If conntrack records reply packets, a simple WAN firewall-drop hypothesis becomes weaker and analysis should move inward toward translation and application semantics.

## Prevention Strategies and Takeaways

Prefer standards-based NAT traversal when supported: enable **`rport`**, use SIP Outbound or suitable keep-alives, and have registrars route responses using observed transport information.

Treat connection tracking as operational state. After changing helper or NAT policy, verify both the ruleset and live conntrack table; expire relevant entries during controlled tests when immediate re-evaluation is required.

Avoid unnecessary ALGs. Moving a gateway from packet forwarding into protocol parsing and payload modification increases failure modes, complicates encryption, and reduces troubleshooting determinism.

Finally, diagnose SIP failures layer by layer: confirm DNS resolution, packet egress, return traffic, NAT translation, conntrack helper state, SIP header correctness, transaction matching, and registrar response. The most important distinction is simple: **a flow can be permitted by the firewall and still be broken by stateful application-layer processing.**
