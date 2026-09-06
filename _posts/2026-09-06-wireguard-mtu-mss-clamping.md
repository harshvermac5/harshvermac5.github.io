---
layout: post
title: "Path MTU Discovery and TCP MSS Clamping Across WireGuard Tunnels"
date: 2026-09-06 23:58:00 +0530
description: "A deep technical guide to PMTU black holes, TCP MSS behavior, and reliable packet sizing across encrypted UDP tunnels."
tags: [wireguard, mtu, tcp]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Encrypted tunnels reduce the usable packet size available to inner traffic because every original IP packet is wrapped in additional protocol headers and cryptographic metadata. When endpoints continue transmitting packets sized for a 1500-byte path while the encapsulated path can carry less, the result may be fragmentation, packet loss, or a **Path MTU Discovery black hole**.

The important engineering problem is not simply “set a smaller MTU.” It is understanding how **Path MTU Discovery (PMTUD)**, **TCP Maximum Segment Size (MSS)**, UDP encapsulation, and ICMP feedback interact. The most confusing failures are selective: DNS works, TCP handshakes succeed, and small requests complete, yet TLS sessions, large HTTP responses, uploads, or application APIs stall.

[RFC 8201 defines the Path MTU as “the minimum link MTU of all the links in a path.”](https://www.rfc-editor.org/rfc/rfc8201.html) Once a tunnel is introduced, its encapsulation overhead becomes part of the packet-size budget that must fit within that minimum.

## Co-Technical Subject

**Tunnel PMTU, TCP MSS advertisement, ICMP-based PMTUD, and packetization-layer MTU discovery for encrypted UDP overlays.**

WireGuard is a useful concrete example because it carries encrypted IP packets over UDP and therefore exposes the interaction between inner MTU, outer PMTU, and TCP MSS clearly.

## Theoretical Foundation

Classical IPv4 PMTUD is defined by **RFC 1191, November 1990**. The sender transmits IPv4 packets with the **Don't Fragment (DF)** bit set. If a router cannot forward a packet because the next-hop link MTU is smaller, it returns an ICMP Destination Unreachable, Fragmentation Needed message. The sender then lowers its estimate of the PMTU.

IPv6 uses a related model defined by **RFC 8201, July 2017**. Routers do not fragment forwarded IPv6 packets. When a packet is too large, the router generates an **ICMPv6 Packet Too Big** message containing the next-hop MTU, as specified by **RFC 4443, March 2006**.

The weakness is dependence on control-plane feedback. [RFC 2923 notes that “Firewalls are often misconfigured to suppress all ICMP messages.”](https://datatracker.ietf.org/doc/html/rfc2923) If Fragmentation Needed or Packet Too Big messages disappear, a sender may continue transmitting oversized packets. Small packets pass, while larger packets repeatedly vanish. That is the classic PMTU black hole.

TCP adds another mechanism: the **MSS option** exchanged in SYN and SYN/ACK packets. MSS limits TCP payload size, not total IP packet size. [RFC 6691 states that “The MSS counts only data octets in the segment.”](https://www.rfc-editor.org/rfc/rfc6691.html) For ordinary headers, an IPv4 TCP MSS can be approximated as `PMTU - 20 - 20`; for IPv6, `PMTU - 40 - 20`. TCP or IP options must be handled separately by the sender.

## Mechanism Breakdown

A tunnel changes the packet path by adding an outer transport envelope around an existing inner IP packet.

For a WireGuard-style UDP tunnel, transport data contains a fixed tunnel header, encrypted payload, and authentication tag, then UDP and an outer IP header. The protocol specification shows **16 bytes of transport header fields** before the encrypted packet, while AEAD adds a **16-byte authentication tag**. All transport packets are carried over UDP. The resulting fixed overhead is therefore at least:

```text
Outer IPv4: 20-byte IP + 8-byte UDP + 16-byte tunnel header + 16-byte AEAD tag = 60 bytes
Outer IPv6: 40-byte IP + 8-byte UDP + 16-byte tunnel header + 16-byte AEAD tag = 80 bytes
```

The protocol may also pad encrypted inner packets, and additional technologies such as PPPoE, provider tunnels, or nested VPNs can reduce effective PMTU further. The correct inner MTU is therefore a property of the complete path, not merely the local Ethernet interface.

The failure sequence typically looks like this:

- An endpoint sends a TCP SYN through the tunnel. The packet is small and succeeds.
- The remote endpoint returns SYN/ACK. The three-way handshake completes normally.
- One endpoint then emits a near-MSS-sized TCP segment.
- Tunnel encapsulation expands the packet beyond the outer PMTU.
- A router drops the packet and should return an ICMP size error.
- If that ICMP message is filtered, lost, or not associated correctly with the tunnel flow, the sender never learns the smaller PMTU.
- TCP retransmits the same oversized data, producing an apparent application stall rather than a total connectivity failure.

[RFC 8201 describes this exact symptom: a connection can complete the TCP handshake and then hang when data is transferred.](https://www.rfc-editor.org/rfc/rfc8201.html)

**MSS clamping** changes the TCP MSS advertised during connection establishment so endpoints never create TCP payloads that would exceed the known tunnel PMTU. Because MSS is directional, SYN and SYN/ACK traffic should both be considered.

## Industry Standards Reference

The relevant standards form a progression from classical PMTUD to more robust packetization-layer discovery:

- **RFC 1191 — Path MTU Discovery, 1990:** defines IPv4 PMTUD using DF and ICMP Fragmentation Needed feedback.
- **RFC 2923 — TCP Problems with Path MTU Discovery, 2000:** documents PMTU black holes and TCP-specific failure modes.
- **RFC 4443 — ICMPv6, 2006:** defines ICMPv6 Packet Too Big behavior.
- **RFC 4821 — Packetization Layer Path MTU Discovery, 2007:** defines probe-based discovery that does not depend entirely on ICMP.
- **RFC 6691 — TCP Options and Maximum Segment Size, 2012:** clarifies correct MSS calculation and interaction with header options.
- **RFC 8085 / BCP 145 — UDP Usage Guidelines, 2017:** provides message-size guidance for UDP applications and tunnels.
- **RFC 8201 — IPv6 Path MTU Discovery, 2017:** updates IPv6 PMTUD behavior.
- **RFC 8899 — Datagram PLPMTUD, 2020:** extends robust packetization-layer discovery to datagram transports.

[RFC 4821 explains that PLPMTUD “does not depend on the delivery of ICMP messages.”](https://datatracker.ietf.org/doc/html/rfc4821) RFC 8899 extends that design to datagram packetization layers, making it especially relevant to modern UDP-based tunnels.

## Practical Examples and Evidence

On Linux, first inspect the configured tunnel MTU and routing decision:

```bash
ip link show wg0
ip route get 198.51.100.10
```

Probe candidate IPv4 packet sizes with DF set. An ICMP payload of 1372 bytes plus 20 bytes of IPv4 header and 8 bytes of ICMP header produces a 1400-byte IPv4 packet:

```bash
ping -M do -s 1372 198.51.100.10
```

For broader path testing, `tracepath` can expose discovered PMTU changes:

```bash
tracepath 198.51.100.10
```

Packet capture is often more conclusive than application logs:

```bash
tcpdump -ni any 'icmp or icmp6 or tcp'
```

Evidence consistent with a PMTU black hole includes a successful SYN/SYN-ACK/ACK exchange followed by repeated retransmission of the same large TCP sequence range, with no corresponding ICMP Fragmentation Needed or ICMPv6 Packet Too Big message reaching the sender.

A standards-aligned Linux firewall can clamp TCP MSS to route-derived PMTU using nftables:

```bash
nft add rule inet mangle forward tcp flags syn tcp option maxseg size set rt mtu
```

The nftables documentation states that `rt mtu` uses route information learned through PMTUD. A fixed MSS can also be applied when the effective tunnel PMTU is known and deterministic:

```bash
nft add rule inet mangle forward tcp flags syn tcp option maxseg size set 1360
```

A static value should be derived from measured PMTU and header requirements, not copied from another environment.

## Key Technical Insights

- **Selective failure is diagnostic evidence.** If small flows work but large TLS or HTTP transfers stall, investigate PMTU before blaming DNS, routing, or application-layer policy.
- **MSS is not MTU.** MSS constrains TCP payload only. UDP, ICMP, QUIC, and non-TCP traffic do not benefit from TCP MSS clamping.
- **Clamping hides symptoms but does not repair PMTUD.** Restoring valid ICMP size feedback is architecturally preferable where possible.
- **Tunnel overhead is cumulative.** Outer IPv6, PPPoE, nested tunnels, carrier overlays, and additional encapsulation all consume packet budget.
- **Asymmetric paths complicate diagnosis.** Each direction can have a different PMTU and therefore a different safe MSS.
- **A very low MSS is safe but inefficient.** Excessively small segments increase packet rate, per-packet processing, interrupt load, and protocol overhead.
- **UDP overlays need their own sizing strategy.** RFC 8899 exists because TCP-specific techniques cannot solve datagram PMTU problems generically.

## Prevention Strategies and Takeaways

- Measure the effective PMTU across the real production path rather than assuming 1500 bytes end to end.
- Permit required ICMP Fragmentation Needed and ICMPv6 Packet Too Big messages through security policy; do not treat all ICMP as expendable.
- Set tunnel interface MTU with enough headroom for outer IP, UDP, tunnel metadata, cryptographic authentication, padding, and any additional encapsulation.
- Use MSS clamping for TCP when the tunnel PMTU is lower than endpoints can reliably discover, but derive the value from the path.
- Validate both directions because PMTU and MSS can be asymmetric.
- Capture SYN packets and large retransmissions to prove whether MSS advertisement and PMTU behavior match the design.
- Prefer PLPMTUD/DPLPMTUD-capable transports where available because they recover more robustly when ICMP feedback is unreliable.

The central principle is simple: **an encrypted tunnel does not create more MTU; it consumes it**. Reliable tunnel performance depends on ensuring that packetization at the inner layer respects the smallest usable size of the encapsulated path.
