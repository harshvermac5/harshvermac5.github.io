---
layout: post
title: "Stateful Firewall Rule Ordering and the TCP Return Path"
date: 2026-09-16 21:04:00 +0530
description: "How rule ordering, connection tracking, and reverse-path policy interact to permit or silently break otherwise valid TCP sessions across security zones."
tags: [firewall, tcp, conntrack]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A stateful firewall does more than decide whether a packet's source, destination, and port are acceptable. It also tracks flows over time and uses that history to distinguish a **new connection attempt** from packets belonging to an **existing permitted session**.

The important design principle is simple: **a broad deny rule must not preempt the stateful return-traffic rule for sessions that policy already allowed in the forward direction**.

A common failure mode appears when two security zones are intentionally isolated. An administrator permits a TCP service from Zone A to Zone B, then adds a broad Zone B to Zone A deny rule. If that reverse-direction deny is evaluated before the firewall's `ESTABLISHED`/`RELATED` acceptance logic, the initial SYN can pass while the SYN-ACK is dropped. The application then reports a timeout even though the forward allow rule shows increasing counters.

This article explains why that happens, how connection tracking interacts with the TCP state machine, and how to design zone policies without accidentally converting a stateful firewall into an asymmetric stateless filter.

## Co-Technical Subject

**Stateful packet filtering, TCP connection tracking, inter-zone firewall policy, and bidirectional flow evaluation.**


## Theoretical Foundation

TCP connection establishment is defined by **RFC 9293, Transmission Control Protocol, published in 2022**. TCP peers synchronize sequence numbers through the three-way handshake. The initiator sends SYN, the responder returns SYN-ACK, and the initiator completes the exchange with ACK. RFC 9293 describes `SYN-RECEIVED` as waiting for the confirming acknowledgment and `ESTABLISHED` as the normal data-transfer state. The RFC explicitly calls this exchange the ["three-way handshake"](https://www.rfc-editor.org/rfc/rfc9293.html).

A firewall placed between the endpoints must therefore allow packets in **both directions** for a permitted TCP connection. Allowing only the initiating direction is insufficient because TCP is inherently bidirectional even when application data is mostly one-way.

**RFC 2979, Behavior of and Requirements for Internet Firewalls, published in 2000**, describes packet-filter firewalls as systems that inspect packets and either pass, drop, or otherwise handle them. More importantly, it defines a transparency principle: a firewall should not introduce unintended failures for legitimate standards-compliant traffic that policy intends to permit. Its requirement that applications continue working properly in the presence of firewalls is summarized by the linked statement ["MUST NOT cause unintended failures"](https://www.rfc-editor.org/rfc/rfc2979.html).

Stateful filtering is not itself a TCP feature. It is a firewall implementation technique that observes packets and maintains a flow record. **RFC 6092, published in 2011**, discusses conventional stateful packet filters that create state as a side effect of forwarding a permitted flow initiation. It notes that stateful filtering can allow return traffic associated with an outbound flow while still rejecting unsolicited inbound flows. The document describes how ["stateful packet filtering"](https://www.rfc-editor.org/rfc/rfc6092.html) is used to enforce this behavior.

**TCP states such as `SYN-SENT` and `ESTABLISHED` belong to endpoints; firewall states such as `NEW`, `ESTABLISHED`, and `RELATED` belong to connection tracking.** They are related but are not the same state machine.

## Mechanism Breakdown

Consider two routed security zones:

```text
Zone A: 172.16.0.0/24
Zone B: 10.0.0.0/24

Client: 172.16.0.249
Server: 10.0.0.198
Service: TCP/2020
```

The intended policy is:

```text
Zone A -> Zone B: allow TCP/2020 to 10.0.0.198
Zone B -> Zone A: block unsolicited connections
```

A stateful firewall can implement this safely by evaluating established return traffic before the default reverse-direction deny:

```text
if flow_state in {ESTABLISHED, RELATED}:
    ACCEPT

if source_zone == A and destination_zone == B \
   and destination == 10.0.0.198 and tcp_dport == 2020:
    ACCEPT

if source_zone == B and destination_zone == A:
    DROP
```

The packet sequence then behaves normally:

```text
172.16.0.249:ephemeral -> 10.0.0.198:2020   SYN
10.0.0.198:2020       -> 172.16.0.249:ephemeral SYN,ACK
172.16.0.249:ephemeral -> 10.0.0.198:2020   ACK
```

The first SYN matches the explicit service allow rule and causes the connection tracker to create flow state. The reverse SYN-ACK is recognized as belonging to that tracked flow and matches the stateful return rule. The final ACK completes the TCP handshake.

The failure occurs when a broad reverse-direction drop rule is ordered first:

```text
if source_zone == B and destination_zone == A:
    DROP

if flow_state in {ESTABLISHED, RELATED}:
    ACCEPT
```

Now the SYN still passes in the A to B direction, but the SYN-ACK enters the B to A policy chain and encounters `DROP` before the firewall evaluates its connection state. Because most ordered rule engines use **first terminal match wins**, later acceptance rules become unreachable for that packet.

This creates a diagnostic pattern that can be misleading. The forward allow counter increases, proving only that the initiating packets matched that rule. It does **not** prove the complete TCP conversation was permitted.

In a Linux-style packet filter, the conceptual difference looks like this:

```bash
# Safe ordering
-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A FORWARD -s 172.16.0.0/24 -d 10.0.0.198 -p tcp --dport 2020 -j ACCEPT
-A FORWARD -s 10.0.0.0/24 -d 172.16.0.0/24 -j DROP
```

Versus:

```bash
# Broken ordering
-A FORWARD -s 10.0.0.0/24 -d 172.16.0.0/24 -j DROP
-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```


## Industry Standards Reference

The principal references are **RFC 9293 (2022)** for the TCP state machine and connection establishment, **RFC 2979 (2000)** for firewall behavior and protocol transparency, and **RFC 6092 (2011)** for stateful filtering behavior and the distinction between solicited return traffic and unsolicited inbound flows.

For service discovery, **OASIS Web Services Dynamic Discovery Version 1.1** specifies WS-Discovery ad hoc mode over IP multicast. It assigns **UDP port 3702**, IPv4 multicast address **239.255.255.250**, and IPv6 multicast address **FF02::C**. The specification states that multicast discovery messages ["MUST be sent using the following assignments"](https://docs.oasis-open.org/ws-dd/discovery/1.1/cs-01/wsdd-discovery-1.1-spec-cs-01.html). IANA also registers `ws-discovery` on port **3702** for TCP and UDP in the [Service Name and Transport Protocol Port Number Registry](https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml).

Discovery traffic is distinct from the later application session, which may use a different TCP port. Firewall policy must model those flows independently.

## Practical Examples and Evidence

When troubleshooting, inspect **both policy counters and flow state**. A high hit count on the forward allow rule confirms that packets reached that rule; it does not establish end-to-end success.

Useful Linux diagnostics include:

```bash
conntrack -L -p tcp | grep '10.0.0.198'
```

A healthy established flow should eventually show an established connection-tracking state. A connection repeatedly stuck during handshake indicates that one direction of the exchange is not completing.

Packet capture is decisive:

```bash
tcpdump -ni any 'host 10.0.0.198 and tcp port 2020'
```

A broken return path typically shows repeated client SYN retransmissions, or a SYN arriving at the server followed by a SYN-ACK that never reaches the client-side interface. Capturing on both sides of the firewall identifies the exact enforcement boundary.

Rule counters should be interpreted together:

```text
service_allow_A_to_B        packets: increasing
established_return_accept   packets: 0
broad_drop_B_to_A           packets: increasing
```

That pattern strongly indicates that the reverse deny is shadowing stateful acceptance.

## Key Technical Insights

- **Firewall directionality is evaluated per packet, not per application intent.** A client-initiated TCP session necessarily produces packets in the reverse zone direction.
- **Rule ordering is part of policy semantics.** Two logically reasonable rules can produce incorrect behavior when their evaluation order is reversed.
- **Forward-rule hits do not prove session success.** Validate the reverse path, connection tracker, and handshake progression.
- **Stateful policy should distinguish solicited return traffic from unsolicited initiation.** Blocking every packet from a restricted zone is different from blocking only new connections originating there.
- **`RELATED` and `ESTABLISHED` are firewall classifications, not TCP header flags.** Do not infer them merely from ACK or SYN bits.
- **Discovery and application traffic are separate control planes.** UDP/3702 multicast discovery may require different routing and filtering treatment than the subsequent unicast TCP service.
- **Multicast does not automatically cross routed security zones.** Cross-subnet discovery requires deliberate multicast forwarding, proxying, or relay architecture in addition to firewall permission.

## Prevention Strategies and Takeaways

Design inter-zone policy around **connection initiation**, not around simplistic bidirectional subnet blocking. Permit the required new flows from the initiating zone, accept tracked return traffic before broad denies, and then reject unsolicited new sessions from the restricted zone.

Prefer this conceptual order:

```text
accept ESTABLISHED,RELATED
accept explicitly permitted NEW flows
apply explicit security exceptions
apply inter-zone/default denies
```

When a deny must appear earlier for architectural reasons, scope it narrowly to **new connection initiations** rather than all packets. This preserves isolation while allowing response traffic for sessions already approved by policy.

Finally, validate enforcement with packet-level evidence. Correlate firewall counters, connection-tracking state, and captures from both sides of the routing boundary. A TCP application that works immediately when a deny rule is removed is not evidence that the forward allow failed; it is often evidence that the **reverse half of an otherwise permitted stateful flow was shadowed by policy ordering**.
