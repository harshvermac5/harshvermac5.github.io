---
layout: post
title: "PPPoE MTU, MSS Clamping, and Path MTU Black Holes"
date: 2026-09-08 02:12:00 +0530
description: "A deep technical guide to how PPPoE overhead, Path MTU Discovery failures, and TCP MSS handling can cause selective application connectivity problems."
tags: [pppoe, mtu, tcp, mss, pmtud]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A network can have working DNS, successful TCP handshakes, responsive web pages, and still fail for video, gaming, mobile applications, or other high-throughput traffic. One common cause is an **MTU mismatch** combined with failed **Path MTU Discovery (PMTUD)**.

This is especially relevant on **Point-to-Point Protocol over Ethernet (PPPoE)** access links. PPPoE adds eight bytes of overhead inside the Ethernet payload, reducing the conventional IP MTU from 1500 bytes to 1492 bytes unless the network supports larger Ethernet frames.

The core principle is simple: **every IP packet must fit the smallest MTU along its path, or the sender must learn to transmit smaller packets**. If that learning mechanism fails, small packets may succeed while larger packets disappear, producing a partial-connectivity failure that looks application-specific.

The incident that motivated this analysis was ultimately associated with a PPPoE forwarding-path defect. The original support context described an [`"issue ... when it comes to RJ45 ports connected over PPPoE"`](https://community.ui.com/releases/UniFi-OS-Dream-Router-7-4-1-20/54761021-50b8-4732-95d1-78a127dd9acc). The transferable lesson, however, is the standards-based interaction between PPPoE overhead, PMTU discovery, TCP MSS negotiation, and packet-processing paths.

## Co-Technical Subject

**WAN Encapsulation, TCP Path MTU Discovery, and MSS Control**

The relevant mechanisms span several layers:

- PPPoE encapsulation at the access edge
- IP Path MTU Discovery
- TCP Maximum Segment Size negotiation
- ICMP error delivery
- Packetization-layer probing
- Router forwarding and queueing paths

## Theoretical Foundation

Classic PPPoE is defined by [RFC 2516](https://www.rfc-editor.org/rfc/rfc2516.html), published in 1999. Ethernet normally carries a maximum payload of 1500 octets. A PPPoE session consumes six octets for the PPPoE header and two octets for the PPP Protocol ID, leaving:

```text
1500 - 6 - 2 = 1492 bytes
```

RFC 2516 therefore specifies a maximum PPP MTU of 1492 bytes on a conventional 1500-byte Ethernet path. [RFC 4638](https://www.rfc-editor.org/rfc/rfc4638.html), published in 2006, later defined negotiation for payloads larger than 1492 when the Ethernet infrastructure supports larger frames.

For IPv4, [RFC 1191](https://www.rfc-editor.org/rfc/rfc1191.html), published in 1990, defines PMTUD. A host sends packets with the **Don't Fragment** bit set. If a router cannot forward a packet because the outgoing MTU is smaller, the router returns an ICMP **Destination Unreachable, Fragmentation Needed** message containing information that allows the sender to reduce its packet size.

IPv6 does not permit routers to fragment transit packets. [RFC 8201](https://www.rfc-editor.org/rfc/rfc8201.html), published in 2017, defines IPv6 PMTUD using ICMPv6 **Packet Too Big** messages. If required ICMP messages are filtered or lost, the sender can continue transmitting oversized packets; [RFC 2923](https://www.rfc-editor.org/rfc/rfc2923.html), published in 2000, documents this as the classic **PMTU black hole**.

TCP adds another control point through the **Maximum Segment Size**, or MSS. [RFC 6691](https://www.rfc-editor.org/rfc/rfc6691.html), published in 2012, clarifies MSS handling. For a simple IPv4 TCP flow with no options:

```text
1492 byte IP MTU
- 20 byte IPv4 header
- 20 byte TCP header
= 1452 byte TCP MSS
```

For IPv6 with a 40-byte base header:

```text
1492 byte IP MTU
- 40 byte IPv6 header
- 20 byte TCP header
= 1432 byte TCP MSS
```

Tunnels and additional encapsulation can reduce the effective payload further.

## Mechanism Breakdown

A normal PPPoE TCP connection begins with PPPoE establishment and PPP negotiation. The forwarding interface then exposes an effective IP MTU, commonly 1492 bytes.

During the TCP three-way handshake, endpoints advertise MSS values in SYN packets. Problems arise when an endpoint behind a router assumes a 1500-byte local Ethernet MTU while the WAN path only supports 1492 bytes.

A TCP sender may then construct a 1460-byte IPv4 TCP payload:

```text
1460 TCP data
+ 20 TCP header
+ 20 IPv4 header
= 1500 byte IP packet
```

That packet cannot fit into a 1492-byte PPPoE payload.

With functioning IPv4 PMTUD, the constrained hop drops the oversized packet, returns ICMP fragmentation-needed, and the sender lowers its PMTU estimate. With broken PMTUD, the packet disappears without useful feedback. SYNs, ACKs, DNS, and small objects may succeed while larger TLS records, media transfers, or application data stall. This explains how a host can have **Internet access** while selected applications report **no Internet**.

**MSS clamping** changes the TCP MSS value in transit, usually on SYN packets crossing a router. The goal is to ensure that downstream endpoints never generate TCP segments larger than the real path can carry.

A conservative fixed value such as `1380` may avoid fragmentation across PPPoE plus extra overhead, but it is not universally optimal. An unnecessarily low MSS increases packet count and protocol overhead. Where supported, PMTU-aware clamping is preferable to an arbitrary constant.

## Industry Standards Reference

The key standards for this failure domain are:

- [RFC 2516](https://www.rfc-editor.org/rfc/rfc2516.html), **A Method for Transmitting PPP Over Ethernet**, 1999
- [RFC 4638](https://www.rfc-editor.org/rfc/rfc4638.html), **Accommodating an MTU/MRU Greater Than 1492 in PPPoE**, 2006
- [RFC 1191](https://www.rfc-editor.org/rfc/rfc1191.html), **Path MTU Discovery**, 1990
- [RFC 2923](https://www.rfc-editor.org/rfc/rfc2923.html), **TCP Problems with Path MTU Discovery**, 2000
- [RFC 4821](https://www.rfc-editor.org/rfc/rfc4821.html), **Packetization Layer Path MTU Discovery**, 2007
- [RFC 6691](https://www.rfc-editor.org/rfc/rfc6691.html), **TCP Options and Maximum Segment Size**, 2012
- [RFC 8201](https://www.rfc-editor.org/rfc/rfc8201.html), **Path MTU Discovery for IPv6**, 2017
- [RFC 8899](https://www.rfc-editor.org/rfc/rfc8899.html), **Packetization Layer Path MTU Discovery for Datagram Transports**, 2020

RFC 4821 and RFC 8899 are important because **Packetization Layer PMTUD (PLPMTUD)** reduces dependence on ICMP delivery by probing packet sizes and inferring a usable path size from successful delivery.

## Practical Examples and Evidence

On Linux, first inspect the effective interface MTU:

```bash
ip link show
ip route get 203.0.113.10
```

For IPv4, probe the path while preventing fragmentation:

```bash
ping -M do -s 1464 203.0.113.10
ping -M do -s 1465 203.0.113.10
```

The ICMP payload plus the 20-byte IPv4 header and 8-byte ICMP header must fit the path; a 1464-byte payload produces a 1492-byte IP packet.

`tracepath` can also estimate the path MTU:

```bash
tracepath 203.0.113.10
```

Capture TCP handshakes to inspect negotiated MSS:

```bash
tcpdump -ni any 'tcp[tcpflags] & tcp-syn != 0'
```

On a Linux router, MSS adjustment can be implemented with netfilter. A path-aware rule is preferable when available:

```bash
iptables -t mangle -A FORWARD   -p tcp --tcp-flags SYN,RST SYN   -j TCPMSS --clamp-mss-to-pmtu
```

A fixed clamp is more deterministic but should be justified by the encapsulation budget:

```bash
iptables -t mangle -A FORWARD   -p tcp --tcp-flags SYN,RST SYN   -j TCPMSS --set-mss 1380
```

Packet captures should then confirm that the rewritten MSS appears in forwarded SYN packets and that large data segments no longer exceed the effective path.

## Key Technical Insights

**Partial connectivity is strong evidence.** If DNS, TCP establishment, and small HTTP transactions work while large transfers fail, investigate packet size before blaming application-layer filtering.

**PPPoE changes the layer-three assumptions of an Ethernet LAN.** A client can correctly use a 1500-byte LAN MTU while the WAN edge must transmit through a 1492-byte PPPoE payload.

**ICMP is part of normal IP control behavior.** Blanket filtering of ICMP or ICMPv6 can break PMTUD and create failures that are difficult to correlate with firewall policy.

**MSS clamping is mitigation, not discovery.** It prevents oversized TCP segments but does not repair UDP, QUIC, IPsec, or other protocols that do not use TCP MSS negotiation.

**Queueing or traffic-shaping features can alter forwarding behavior.** If a queueing discipline unexpectedly fixes an MTU-sensitive problem, traffic may be traversing a different software, hardware-offload, or scheduling path; queueing itself is not necessarily the root cause.

**Modern applications expose MTU faults differently.** QUIC runs over UDP, so TCP MSS clamping cannot directly fix it. PLPMTUD becomes more important as application stacks move beyond TCP.

## Prevention Strategies and Takeaways

- Document the real WAN MTU for every encapsulated uplink.
- Treat PPPoE, IPsec, GRE, VXLAN, WireGuard, and nested tunnels as explicit MTU-budget calculations.
- Permit the ICMP and ICMPv6 messages required for PMTUD.
- Validate large packets with DF-aware probes rather than relying only on ordinary ping.
- Inspect SYN/SYN-ACK MSS values when TCP flows stall after establishment.
- Prefer dynamic PMTU-aware MSS adjustment over unexplained fixed values.
- Remember that MSS clamping protects TCP only; test UDP and QUIC separately.
- Use packet captures on both sides of the constrained hop to distinguish packet generation, forwarding, and return-path failures.
- When a traffic-management feature changes the symptom, investigate forwarding-path implementation differences instead of concluding that congestion was the cause.
- Prefer PLPMTUD-capable transports and operating systems where classical ICMP-based PMTUD cannot be trusted.

The engineering objective is not merely to make a failing application work. It is to ensure that every layer agrees on the largest packet that can cross the path, and that endpoints have a reliable mechanism to adapt when that path changes.
