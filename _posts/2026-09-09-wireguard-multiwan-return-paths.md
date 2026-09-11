---
layout: post
title: "WireGuard Multi-WAN Return-Path Failures: Policy Routing, NAT, and Endpoint Roaming"
date: 2026-09-09 21:28:00 +0530
description: "A deep technical analysis of how multihoming, policy routing, NAT port translation, and WireGuard endpoint roaming can create one-way tunnel failures."
tags: [wireguard, policy-routing, multiwan]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A WireGuard tunnel can fail even when the initiator reaches the correct peer IP and UDP port and the responder receives the handshake. The fault may exist entirely in the **return path**: the responder uses a source address from one WAN, normal routing selects another WAN for the destination, and a policy rule intended to correct that mismatch stops matching because NAT changed the peer's observed UDP source port.

The core principle is **source-aware routing in multihomed systems**. A multi-WAN node must keep source-address selection, egress-interface selection, policy routing, and NAT state consistent. WireGuard adds another variable because peer endpoints can change dynamically as authenticated traffic arrives from new IP:port tuples.

An interface being administratively up does not prove that the tunnel is usable. A peer can exist in the running configuration and receive inbound UDP while the cryptographic session still fails because the responder's packets never return to the initiator.

## Co-Technical Subject

The subject is **multihomed UDP tunnel routing**, combining:

- WireGuard handshake and endpoint roaming
- Linux policy routing and multiple routing tables
- IPv4 source-address and egress-interface selection
- UDP NAT address-and-port mapping

The failure is not primarily cryptographic. It is **path inconsistency around the encrypted UDP transport**.

## Theoretical Foundation

WireGuard is a connectionless UDP tunnel using the **Noise_IK** handshake. Its protocol documentation describes a handshake initiation from the initiator, a handshake response from the responder, and periodic retries when the response is not received. Only after key exchange can encrypted transport packets flow. See the [WireGuard protocol and cryptography documentation](https://www.wireguard.com/protocol/).

Repeated handshake initiations with no successful `latest handshake` update therefore point toward a missing responder-to-initiator path, packet filtering, or invalid response handling rather than an inner-tunnel routing problem.

Multihoming introduces source-selection constraints. RFC 1122, **Requirements for Internet Hosts — Communication Layers** (1989), covers outbound routing and source-address selection. For responses, it says the source address ["SHOULD be the specific-destination address of the request"](https://www.rfc-editor.org/rfc/rfc1122.html). It also describes strong-versus-weak host behavior, including whether a host may transmit a packet through an interface that does not correspond to its source address.

Local permission does not guarantee Internet delivery. RFC 2827 / **BCP 38** (2000) and RFC 3704 / **BCP 84** (2004) describe source-address validation and ingress filtering. RFC 8704 (2020) refines feasible-path uRPF for multihomed networks. A packet sourced from ISP-A's prefix but transmitted through ISP-B can therefore be discarded upstream even when the local kernel routes it successfully.

## Mechanism Breakdown

Consider a dual-WAN gateway with `wan0` and `wan1`. A WireGuard socket is associated with an address on `wan0`, but the remote peer's public address numerically belongs to a prefix directly connected to `wan1`.

The sequence is:

- The peer sends a WireGuard handshake initiation to the gateway's `wan0` address and UDP port.
- The packet reaches the correct socket and is authenticated.
- WireGuard prepares a handshake response sourced from the local endpoint associated with `wan0`.
- The kernel performs a route lookup for the peer's public IP.
- A more-specific connected route on `wan1` wins over the default route on `wan0`.
- The response can leave `wan1` while carrying a source address assigned to `wan0`.
- Upstream source-address validation may discard the packet, so the initiator never receives the response.

Policy routing can override this by selecting a routing table whose default route exits `wan0`. Linux `ip rule` supports selectors such as source, destination, `fwmark`, IP protocol, source port, and destination port. The [`ip-rule(8)` manual](https://man7.org/linux/man-pages/man8/ip-rule.8.html) documents these selectors.

The fragile design is matching on a **remote UDP port assumed to be permanent**. WireGuard supports authenticated endpoint roaming; its routing documentation explicitly states that ["WireGuard endpoints can roam"](https://www.wireguard.com/netns/). After receiving valid traffic from a new source IP or port, the implementation may update the peer's endpoint to that observed tuple.

NAT makes port changes normal. RFC 4787, **NAT Behavioral Requirements for Unicast UDP** (2007), defines UDP address-and-port mappings and discusses ["port preservation"](https://www.rfc-editor.org/rfc/rfc4787.html). A NAT is not guaranteed to expose the same source port used by the internal socket. A tunnel listening locally on UDP/51820 might appear remotely as UDP/40231.

If a policy rule says "use WAN-A only when the remote port is 51820," but the live peer endpoint has roamed to UDP/40231, the rule no longer matches. Destination-based routing takes over and may select the wrong uplink.

## Industry Standards Reference

Applicable standards and authoritative references include:

- **RFC 1122, 1989** — host routing, multihoming, UDP source-address behavior, and strong-versus-weak host considerations.
- **RFC 2827 / BCP 38, 2000** — ingress filtering against inappropriate or spoofed source addresses.
- **RFC 3704 / BCP 84, 2004** — source validation and reverse-path filtering in multihomed networks.
- **RFC 4787, 2007** — UDP NAT mappings, filtering behavior, port assignment, and mapping lifetime.
- **RFC 8704 / BCP 84, 2020** — enhanced feasible-path uRPF for multihomed environments.
- **WireGuard protocol documentation** — Noise_IK handshake, retry behavior, key establishment, and UDP encapsulation.
- **WireGuard routing documentation** — endpoint roaming and `fwmark`-based routing intended to avoid stale endpoint-specific rules.

These sources converge on one practical requirement: **a multihomed UDP service must use an egress path compatible with its selected source address without assuming the peer's translated port is stable**.

## Practical Examples and Evidence

Use RFC 5737 documentation prefixes. Assume a gateway owns `198.51.100.10` on `wan0` and `203.0.113.10/24` on `wan1`. The peer is `203.0.113.44`, directly reachable through `wan1`, while WireGuard is intended to use `wan0`.

```text
wan0: 198.51.100.10
wan1: 203.0.113.10/24
peer: 203.0.113.44
local WireGuard UDP: 51820
observed peer UDP: 40231
```

A route lookup can expose the conflict:

```bash
ip route get 203.0.113.44 from 198.51.100.10
```

A problematic result resembles:

```text
203.0.113.44 dev wan1 src 198.51.100.10
```

The destination exits `wan1`, but the source belongs to `wan0`.

A fragile policy rule could be:

```bash
ip rule add to 203.0.113.44 ipproto udp dport 51820 lookup 100 priority 100
ip route add default via 198.51.100.1 dev wan0 table 100
```

It stops matching if the live peer endpoint becomes UDP/40231.

A more resilient pattern is to classify the tunnel socket independently of the peer's current port. WireGuard's Linux integration provides `fwmark` for this purpose:

```bash
wg set wg0 fwmark 0xca6c
ip rule add fwmark 0xca6c lookup 100 priority 100
ip route add default via 198.51.100.1 dev wan0 table 100
```

The exact policy depends on the topology, but the principle is consistent: **route by tunnel identity, source, VRF, or mark rather than a NAT-sensitive remote port**.

Useful diagnostics include:

```bash
wg show
ip rule show
ip route show table all
ip route get <peer-ip> from <local-wan-ip>
ss -uapn
conntrack -L -p udp
```

Capture simultaneously on both uplinks. Seeing the initiation arrive on the intended WAN and the response leave another WAN immediately exposes the return-path split.

## Key Technical Insights

- **Interface up is not tunnel up.** Successful handshakes and receive counters are stronger evidence than link state.
- **Connected routes can defeat WAN affinity.** Longest-prefix match usually beats a default route.
- **Source address matters beyond the host.** Provider source-validation policies can reject packets using the wrong uplink.
- **UDP ports are not stable identities across NAT.** A configured listen port and a remotely observed source port are different things.
- **Endpoint roaming is intentional.** Routing logic that assumes an immutable WireGuard IP:port tuple is brittle.
- **Policy rules must match live traffic.** A correct-looking rule has no effect when one selector no longer matches.
- **One-way handshakes localize the fault.** If the responder sees initiations while the initiator receives zero bytes, prioritize return routing, NAT, firewall state, and upstream filtering.

## Prevention Strategies and Takeaways

- Keep tunnel **source addresses and egress WANs aligned**.
- Validate paths with `ip route get <peer> from <source>` instead of checking only default routes.
- Avoid policy rules tied to translated remote UDP ports unless port preservation is explicitly guaranteed.
- Prefer **packet marks, source-based rules, VRFs, or dedicated routing tables** for WAN affinity.
- Design routing policy to tolerate WireGuard endpoint roaming.
- Capture on all candidate WANs during failures; interface counters alone cannot show the response path.
- Monitor both `transfer` counters and `latest handshake`; high transmit with zero receive is a strong return-path signal.
- Account for BCP 38/84 source validation when evaluating locally legal but externally implausible paths.

The broader lesson is architectural: **encrypted tunnels still depend on ordinary IP routing underneath them**. Cryptography can be completely correct while inconsistent routing, NAT state, or source selection makes the tunnel unusable.
