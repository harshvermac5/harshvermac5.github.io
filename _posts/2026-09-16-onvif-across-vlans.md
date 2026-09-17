---
layout: post
title: "ONVIF Across VLANs: Discovery, Control, Streaming, and Stateful Firewall Design"
date: 2026-09-16 21:04:00 +0530
description: "A vendor-neutral deep dive into how ONVIF discovery, control, media transport, multicast, and stateful firewalling interact across segmented IP networks."
tags: [onvif, firewall, multicast]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

ONVIF is often treated as if it were a single application protocol that can be allowed through a firewall with one port. In reality, an ONVIF deployment is a collection of control-plane and media-plane behaviors layered on HTTP/SOAP, WS-Discovery, UDP multicast, TCP, RTSP, RTP, and related transport mechanisms.

The practical consequence is important: an ONVIF client can reach a camera directly by IP yet fail to discover it automatically, or successfully discover a device while media streaming still fails. A firewall can also allow the client-to-device request while unintentionally dropping the reverse packets required to complete the TCP session.

The core principle is therefore **traffic-path decomposition**. ONVIF troubleshooting across VLANs or security zones requires treating discovery, service control, session return traffic, and media transport as separate flows with different forwarding requirements.

## Co-Technical Subject

**ONVIF service discovery, TCP state tracking, multicast forwarding, and inter-VLAN firewall policy design.**

This subject sits at the intersection of application-layer service discovery, stateful firewalling, IP multicast, and real-time media transport.

## Theoretical Foundation

ONVIF defines interoperable network interfaces for IP-based physical security devices. Its management and control model is based on Web Services, while device discovery uses WS-Discovery. The ONVIF Core specification describes the device service as the entry point to other services and defines discovery behavior around WS-Discovery.

The ONVIF specification explicitly states that ["the configuration interfaces defined in this standard are Web Services interfaces that are based on the WS-Discovery standard"](https://www.onvif.org/specs/2312/ONVIF-Core-Spec-v2312.pdf). This is the first architectural clue: discovery and subsequent control are not the same transport exchange.

WS-Discovery 1.1 assigns UDP port **3702** and the IPv4 multicast group **239.255.255.250** for ad hoc discovery. OASIS specifies that ["DISCOVERY_PORT" is port 3702 and the IPv4 multicast address is 239.255.255.250](https://docs.oasis-open.org/ws-dd/discovery/1.1/cs-01/wsdd-discovery-1.1-spec-cs-01.html). ONVIF test specifications likewise describe client probes to `239.255.255.250:3702` followed by a device response directly to the client.

The transport behavior of TCP is governed by **RFC 9293, Transmission Control Protocol, 2022**. A TCP session progresses through states such as `SYN-SENT`, `SYN-RECEIVED`, and `ESTABLISHED`. A firewall that admits only the initiating SYN but drops the reverse SYN-ACK prevents the session from ever reaching the established data-transfer state.

Multicast behavior is rooted in **RFC 1112, Host Extensions for IP Multicasting, 1989**, while group membership signaling is modernized by **RFC 3376, IGMPv3, 2002**. These standards matter because multicast discovery is normally local to a broadcast domain unless a router, proxy, reflector, or application-aware relay deliberately carries it across Layer 3 boundaries.

ONVIF media delivery adds another independent path. The ONVIF Streaming Specification profiles **RTP** and **RTSP** and references **RFC 3550** for RTP. It also supports RTP over UDP and firewall-friendlier interleaved transport over RTSP/TCP. Discovery success therefore says nothing about whether the eventual media transport is permitted.

## Mechanism Breakdown

A typical ONVIF workflow begins with **discovery**. A client emits a WS-Discovery Probe using SOAP over UDP toward `239.255.255.250:3702`. Devices listening for the relevant ONVIF discovery type inspect the request and return a ProbeMatch containing service addressing information.

That discovery packet is multicast. A router does not normally forward arbitrary link-local or administratively scoped discovery traffic between VLANs simply because an IP route exists. If the client and camera occupy different Layer 3 segments, automatic discovery therefore requires explicit multicast handling or an application-aware discovery relay.

Once the client knows the device address, interaction becomes primarily **unicast**. The client contacts the ONVIF device service and queries capabilities, media services, imaging functions, profiles, event services, or other exposed interfaces. Depending on implementation and configuration, this control exchange commonly rides over HTTP or HTTPS.

A firewall evaluating such a TCP flow should conceptually process it as:

```text
Client                          Firewall                         Camera
  |                                |                               |
  | ----- SYN -------------------> | ----- SYN ------------------> |
  |                                |                               |
  | <---- SYN-ACK ---------------- | <---- SYN-ACK --------------- |
  |                                |                               |
  | ----- ACK -------------------> | ----- ACK ------------------> |
  |                                |                               |
  |========= ESTABLISHED APPLICATION SESSION =====================|
```

A stateful policy normally permits the initiating connection in one direction and allows packets belonging to the resulting connection state in the reverse direction. The critical condition is **rule ordering**. If an unconditional reverse-direction deny is evaluated before the rule accepting `ESTABLISHED` or `RELATED` traffic, return packets are discarded even though the forward allow rule matched successfully.

The resulting symptom can be deceptive. The client-side allow counter rises because outbound packets are permitted, but the application fails because the handshake or subsequent response traffic never returns.

A simplified policy model illustrates the difference:

```text
# Safe conceptual ordering
accept state ESTABLISHED,RELATED
accept src 172.16.10.0/24 dst 10.20.30.50 tcp dport 2020 state NEW
drop   src 10.20.30.0/24 dst 172.16.10.0/24 state NEW

# Unsafe ordering
drop   src 10.20.30.0/24 dst 172.16.10.0/24
accept state ESTABLISHED,RELATED
```

The unsafe version breaks valid return traffic because the broad deny matches first.

After service negotiation, ONVIF media may use RTP over UDP, RTP interleaved with RTSP over TCP, or another transport defined by the negotiated profile. Each choice has different firewall implications. RTP/UDP typically requires negotiated UDP flows and therefore more dynamic policy handling. RTP/RTSP/TCP can simplify traversal because media is carried inside the established TCP control session.

## Industry Standards Reference

The most relevant vendor-neutral references are:

- **ONVIF Core Specification 26.06, 2026** for device discovery, Web Services behavior, device management, and service architecture.
- **ONVIF Streaming Specification 26.06, 2026** for current media transport behavior, including modernized streaming and SRTP capabilities.
- **OASIS WS-Discovery 1.1, 2009** for multicast discovery over UDP/3702 and `239.255.255.250`.
- **RFC 9293, 2022** for the TCP state machine and three-way handshake.
- **RFC 1112, 1989** for IPv4 multicast host behavior.
- **RFC 3376, 2002** for IGMPv3 group membership reporting.
- **RFC 3550, 2003** for RTP transport semantics.

The ONVIF specification archive currently identifies [Version 26.06 as the June 2026 specification release](https://www.onvif.org/profiles/specifications/specification-history/), making it the appropriate contemporary baseline for protocol behavior.

## Practical Examples and Evidence

Packet capture is the fastest way to separate discovery failure from session failure.

For discovery traffic:

```bash
tcpdump -ni any 'udp port 3702 or host 239.255.255.250'
```

Expected evidence includes multicast probes from the client and unicast ProbeMatch responses from devices. If probes exist on the client VLAN but never appear on the camera VLAN, the problem is multicast forwarding rather than ONVIF service availability.

For a direct ONVIF TCP service session:

```bash
tcpdump -ni any 'host 10.20.30.50 and tcp port 2020'
```

A healthy handshake should show:

```text
client > camera: Flags [S]
camera > client: Flags [S.]
client > camera: Flags [.]
```

Repeated client SYNs without a returning SYN-ACK indicate a path, firewall, or endpoint problem. A SYN-ACK visible on the camera-facing interface but absent on the client-facing interface strongly implicates reverse-path policy enforcement.

Linux connection tracking provides another useful distinction:

```bash
conntrack -L -p tcp | grep 10.20.30.50
```

A failed handshake may remain in a pre-established state, whereas successful bidirectional policy evaluation allows the flow to progress to `ESTABLISHED`.

## Key Technical Insights

- **ONVIF is not one port.** Discovery, control, events, authentication, and media can use different transports.
- **Direct IP access and discovery are independent.** Unicast routing may work while WS-Discovery multicast remains confined to one VLAN.
- **Forward-rule counters do not prove application success.** They only prove packets matched that rule in that direction.
- **Stateful return rules must precede broad reverse denies.** Otherwise valid TCP replies are indistinguishable from unsolicited traffic to a stateless rule.
- **UDP/3702 is for discovery, not the complete ONVIF session.** A client connecting directly to a known camera IP may never generate discovery traffic.
- **Media transport must be validated separately.** Successful SOAP or HTTP control does not guarantee RTP or RTSP passage.
- **Multicast routing and firewalling solve different problems.** A firewall allow rule cannot forward multicast that the routing architecture never carries across the boundary.

## Prevention Strategies and Takeaways

Design inter-VLAN ONVIF policies around **flow classes**, not a single application label.

- Permit only the required client-to-device control ports and addresses.
- Place `ESTABLISHED,RELATED` acceptance before broad inter-zone deny rules.
- Restrict reverse-direction `NEW` sessions when the security objective is one-way initiation.
- Enable UDP/3702 and controlled multicast forwarding only when automatic WS-Discovery across subnets is genuinely required.
- Treat RTP/RTSP media policy independently from ONVIF discovery and management traffic.
- Validate behavior with packet captures, connection-tracking state, and per-rule counters rather than relying only on application error messages.

The durable engineering lesson is that ONVIF segmentation problems are usually easier to solve once the system is decomposed into **discovery multicast, unicast control, stateful return traffic, and negotiated media flows**. When each path is tested independently, firewall and routing failures become deterministic rather than mysterious.
