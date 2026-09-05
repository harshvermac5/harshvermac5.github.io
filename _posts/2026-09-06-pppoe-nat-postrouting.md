---
layout: post
title: "PPPoE and Source NAT: Why Translation Belongs After Routing"
date: 2026-09-06 00:58:00 +0530
description: "A deep technical guide to how PPPoE creates an IP forwarding interface, how stateful source NAT binds flows in post-routing, and when to use SNAT versus masquerading."
tags: [pppoe, nat, linux]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

The core principle is that **PPPoE session establishment and IPv4 source NAT are separate mechanisms operating at different layers and stages of the forwarding path**. PPPoE creates a point-to-point session over Ethernet and ultimately exposes an IP-capable logical interface. Source NAT then operates on routed IP packets, normally after the routing decision has selected that logical interface as the egress path.

A platform may establish PPPoE successfully yet still fail to expose the PPP-backed WAN as a selectable NAT target. That can be a control-plane modeling limitation rather than a forwarding-plane inability to translate traffic.

## Co-Technical Subject

**PPPoE session mechanics, IPv4 source NAT, Linux Netfilter post-routing, and stateful connection tracking.**

The important interaction is between a dynamically created point-to-point interface such as `ppp0`, the route lookup that chooses that interface, and a stateful NAT engine that creates a translation binding for the first packet of a flow.

## Theoretical Foundation

PPP is standardized by **RFC 1661, STD 51, July 1994**. It defines encapsulation, the Link Control Protocol, and Network Control Protocols. The RFC summarizes PPP as ["a standard method for transporting multi-protocol datagrams over point-to-point links"](https://www.rfc-editor.org/rfc/rfc1661.html). PPP is therefore not an address-translation protocol. Its responsibility is to establish and operate the point-to-point link over which network-layer protocols run.

**RFC 2516, February 1999** defines PPP over Ethernet. PPPoE adds an Ethernet-based discovery and session layer while preserving PPP's point-to-point semantics. Once discovery completes, the endpoints allocate state for a PPP session and exchange PPP frames through the resulting logical relationship. The RFC explicitly notes that ["Once a PPP session is established, both the Host and the Access Concentrator MUST allocate the resources for a PPP virtual interface."](https://www.rfc-editor.org/rfc/rfc2516.html)

For IPv4, **RFC 1332, May 1992** defines IPCP. IPCP negotiates IPv4 parameters after PPP has reached the network-layer protocol phase. Only after IPCP reaches the Opened state can IPv4 datagrams be carried over the PPP link.

NAT is conceptually separate. **RFC 2663, August 1999** defines NAT terminology and describes translation as mapping addresses between address realms while maintaining per-session state. **RFC 3022, January 2001** describes traditional NAT and NAPT. In both models, address translation occurs at an IP forwarding boundary rather than inside PPPoE negotiation itself.

## Mechanism Breakdown

PPPoE begins with a discovery exchange on Ethernet. The client sends **PADI**, an access concentrator responds with **PADO**, the client selects an offer with **PADR**, and the concentrator confirms the session with **PADS**. PADS supplies the PPPoE session identifier used for subsequent session traffic.

PPP then enters its own control process. **LCP** establishes and tests the data-link relationship and negotiates link options. Authentication may follow. An NCP then configures the relevant network-layer protocol; for IPv4, that NCP is **IPCP**. After IPCP opens, the operating system has an IP-capable logical PPP interface and can install connected, peer, and default routes associated with it.

At that point ordinary IP forwarding begins. Consider a packet sourced from `10.20.30.10` toward an Internet destination:

- The packet enters the router from an internal interface.
- The IP routing lookup selects the default route through a logical PPP interface such as `ppp0`.
- The packet traverses the forwarding path subject to firewall and policy checks.
- The source-NAT hook runs after the egress route is known.
- A NAT rule can therefore match the source prefix, the selected output interface, or both.
- The first packet creates connection-tracking and translation state.
- Subsequent packets use that established state instead of recomputing a fresh translation decision.
- Return traffic is matched to the existing connection and reverse-translated before delivery to the internal host.

This is why **post-routing** is the natural location for source translation. The router already knows which egress interface will carry the packet, so a rule can safely bind translation behavior to that interface.

Modern Linux implements this through Netfilter and nftables. The nftables manual states that NAT chains operate from connection-tracking state and that only the first packet of a connection normally performs the rule lookup. It also defines **masquerade** as a special form of SNAT that uses the current address of the outgoing interface.

## Industry Standards Reference

The relevant specifications and implementation references are:

- **RFC 1661, STD 51, 1994**: Point-to-Point Protocol architecture, LCP, NCP framework, and PPP link-state behavior.
- **RFC 1332, Proposed Standard, 1992**: IPCP negotiation and the conditions required before IPv4 datagrams can traverse a PPP link.
- **RFC 2516, Informational, 1999**: PPPoE discovery, session establishment, session identifiers, and PPP carriage over Ethernet.
- **RFC 2663, Informational, 1999**: NAT terminology, address realms, transparent routing, and session-oriented translation state.
- **RFC 3022, Informational, 2001**: Traditional Basic NAT and NAPT behavior.
- **RFC 4638, Informational, 2006**: PPPoE MTU/MRU extension beyond the traditional 1492-byte PPP payload caused by PPPoE and PPP overhead within Ethernet.
- **IEEE 802.3-2022**: Base Ethernet standard underlying PPPoE transport, including the MAC and physical-layer architecture.
- **Netfilter nftables documentation**: Linux semantics for `snat`, `dnat`, `masquerade`, NAT hooks, and connection tracking.

These references describe complementary components. After PPPoE decapsulation, NAT operates on the resulting IP forwarding path rather than on PPPoE discovery itself.

## Practical Examples and Evidence

A modern Linux router can express source NAT directly against a PPP egress interface with nftables:

```nft
add table ip nat
add chain ip nat postrouting { type nat hook postrouting priority srcnat; }
add rule ip nat postrouting ip saddr 10.20.30.0/24 oifname "ppp0" masquerade
```

The official nftables documentation describes masquerading as ["a special form of snat which always uses the outgoing interface's IP address"](https://www.netfilter.org/projects/nftables/manpage.html). That behavior is well suited to PPP sessions whose negotiated address may change after reconnection.

When the upstream provider routes a stable public prefix to the PPP endpoint, explicit SNAT is usually more deterministic:

```nft
add rule ip nat postrouting ip saddr 10.20.30.0/24 oifname "ppp0" snat to 203.0.113.10
```

For a pool or policy split, source selection can be more granular:

```nft
add rule ip nat postrouting ip saddr 10.20.30.0/25 oifname "ppp0" snat to 203.0.113.10
add rule ip nat postrouting ip saddr 10.20.30.128/25 oifname "ppp0" snat to 203.0.113.11
```

These examples assume the provider routes the translated public addresses back toward the PPP subscriber. NAT does not create upstream reachability by itself; it only rewrites packet headers and maintains translation state.

Useful verification focuses on each layer independently:

```bash
ip addr show dev ppp0
ip route show
nft list ruleset
conntrack -L
ip -s link show dev ppp0
```

A packet capture taken on the internal and PPP-facing interfaces should show the private source before post-routing and the translated source after NAT.

## Key Technical Insights

- **PPPoE is an access encapsulation and session mechanism, not a NAT mechanism.** Once decapsulated, forwarded IPv4 traffic can be processed by the normal routing and NAT pipeline.
- **Control-plane limitations are not proof of data-plane limitations.** A GUI or configuration schema may fail to reference a dynamically created PPP interface even when the kernel can match it.
- **Masquerade and SNAT solve different operational problems.** Masquerade follows the egress interface's current address; SNAT deliberately selects a specific address or pool.
- **NAT is stateful in typical implementations.** The translation decision is established for the first packet and reused through connection tracking, which is why changing NAT policy does not always alter already-established flows.
- **Routing must succeed before source NAT can be meaningfully tied to an egress path.** If the default route, PPP session, or provider route for an additional public prefix is wrong, NAT cannot compensate.
- **PPPoE MTU remains an independent failure domain.** A working NAT rule does not eliminate fragmentation or PMTUD problems associated with the traditional 1492-byte PPPoE payload limit.

## Prevention Strategies and Takeaways

Treat PPPoE and NAT as separate subsystems during design and troubleshooting. First prove that discovery, LCP, authentication, IPCP, interface creation, and routing are correct. Then validate NAT state and translation independently.

Prefer **masquerade** when the PPP-assigned address is dynamic. Prefer explicit **SNAT** when a stable address or routed public pool must be selected predictably. Confirm that the upstream network routes every translated address back to the PPP endpoint.

On managed appliances, determine whether a missing PPPoE NAT option is a product-policy restriction, a configuration-model gap, or a true forwarding limitation. Where automation or custom rules are supported, make them declarative and persistent rather than injecting ephemeral state after boot.

Finally, validate the entire forwarding chain with route inspection, connection tracking, counters, and packet captures. The most reliable mental model is simple: **PPPoE creates the path, routing selects the path, and post-routing NAT rewrites the packet after that decision has been made.**
