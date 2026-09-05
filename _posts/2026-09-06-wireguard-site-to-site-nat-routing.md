---
layout: post
title: "Site-to-Site WireGuard Through NAT: Cryptokey Routing, Policy Routes, and Firewall State"
date: 2026-09-06 02:12:00 +0530
description: "A technical guide to building selective site-to-site WireGuard connectivity through NAT while preserving local Internet breakout and predictable firewall behavior."
tags: [wireguard, vpn, nat, routing, firewall]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A gateway-to-gateway WireGuard VPN can be fully established while inter-site traffic still fails. The handshake proves peer authentication and UDP reachability, but it does not prove that either gateway has the correct routes, that the peer authorizes the routed prefixes, or that the forwarding firewall permits decrypted traffic to cross from the tunnel into the LAN.

The core principle is that **WireGuard separates peer identity, cryptokey routing, operating-system routing, NAT traversal, and firewall policy**. These mechanisms cooperate, but they are not interchangeable. The goal is to build a routed tunnel between private LANs while normal Internet traffic continues to use each site's local WAN.

## Co-Technical Subject

**Route-based VPN design, WireGuard cryptokey routing, UDP NAT traversal, policy routing, and stateful firewall forwarding.**

This architecture is useful for branch connectivity, backup networks, and management overlays where one or both VPN gateways sit behind upstream NAT.

## Theoretical Foundation

WireGuard itself is not defined by an IETF standards-track RFC. Its authoritative behavior is documented by the WireGuard project and technical whitepaper. The project summarizes the transport model simply: ["WireGuard securely encapsulates IP packets over UDP."](https://www.wireguard.com/)

Its central abstraction is **Cryptokey Routing**. Each peer public key is associated with IP prefixes. For outbound traffic, the packet destination selects the peer whose allowed prefix matches. For inbound traffic, the decrypted packet's source must be valid for the authenticated peer. Peer identity and permitted layer-3 addresses are therefore tightly coupled.

The underlying primitives are standardized separately: **X25519** in [RFC 7748 (2016)](https://www.rfc-editor.org/rfc/rfc7748.html), **ChaCha20-Poly1305** in [RFC 8439 (2018)](https://www.rfc-editor.org/rfc/rfc8439.html), **BLAKE2** in [RFC 7693 (2015)](https://www.rfc-editor.org/rfc/rfc7693.html), and **HKDF** in [RFC 5869 (2010)](https://www.rfc-editor.org/rfc/rfc5869.html). WireGuard uses UDP, standardized by [RFC 768 (1980)](https://www.rfc-editor.org/rfc/rfc768.html). Private LAN prefixes typically come from [RFC 1918 (1996)](https://www.rfc-editor.org/rfc/rfc1918.html), while [RFC 4787 (2007)](https://www.rfc-editor.org/rfc/rfc4787.html) defines relevant UDP NAT behavior.

## Mechanism Breakdown

Assume Site A uses `192.168.10.0/24`, Site B uses `192.168.20.0/24`, and the WireGuard transit network is `192.168.50.0/24`. Site A is reachable through an upstream UDP port forward. Site B initiates from behind NAT.

Site A must associate Site B's public key with both the tunnel address and Site B LAN:

```ini
[Interface]
Address = 192.168.50.1/24
ListenPort = 51820
PrivateKey = <site-a-private-key>

[Peer]
PublicKey = <site-b-public-key>
AllowedIPs = 192.168.50.8/32, 192.168.20.0/24
```

Site B must associate Site A's peer with the destinations reachable through Site A:

```ini
[Interface]
Address = 192.168.50.8/32
PrivateKey = <site-b-private-key>

[Peer]
PublicKey = <site-a-public-key>
Endpoint = vpn.example.net:51820
AllowedIPs = 192.168.50.1/32, 192.168.10.0/24
PersistentKeepalive = 25
```

A key design point follows: **changing Site A's `AllowedIPs` for Site B does not inherently change Site B's private key, tunnel address, endpoint, or Site A public key**. Adding `192.168.20.0/24` to Site B's peer definition on Site A is local Site A state. Generic WireGuard therefore does not require regenerating Site B's configuration merely because Site A expands the prefixes associated with that peer.

`AllowedIPs`, however, is not a routing protocol. The operating system still needs a route toward the WireGuard interface. Tools such as `wg-quick` may create routes automatically, but that is implementation behavior rather than a WireGuard control-plane exchange.

A simple route-based design installs only the remote LAN:

```bash
ip route add 192.168.20.0/24 dev wg0
```

The default route remains on the ordinary WAN, preserving local Internet breakout. If only one source host should use the VPN, policy routing can narrow the forwarding decision:

```bash
ip rule add from 192.168.10.50/32 to 192.168.20.0/24 table 51820 priority 1000
ip route add 192.168.20.0/24 dev wg0 table 51820
```

After the kernel selects `wg0`, WireGuard still requires the destination to match a peer's `AllowedIPs`.

## NAT Traversal and Session State

If Site A is behind an upstream router, that router must translate the public UDP socket to Site A's private WAN address:

```text
Public_IP:51820/UDP -> Site_A_Private_WAN:51820/UDP
```

Site B normally needs no inbound port forward because it initiates the exchange. Once authenticated packets arrive, WireGuard can learn Site B's current external endpoint.

The more subtle problem is idle timeout. NAT mappings expire, while WireGuard intentionally sends nothing when no traffic exists. The WireGuard quick start says that ["a sensible interval that works with a wide variety of firewalls is 25 seconds."](https://www.wireguard.com/quickstart/) For a NATed peer that must remain reachable after long idle periods, `PersistentKeepalive = 25` is commonly appropriate.

This matters for infrequent jobs such as daily backups. Without keepalives, the responder may remember the peer's previous endpoint while the NAT device has already deleted the mapping.

WireGuard separately rotates cryptographic state. Its whitepaper defines `REKEY-AFTER-TIME` as 120 seconds, `REJECT-AFTER-TIME` as 180 seconds, `REKEY-TIMEOUT` as 5 seconds, and `KEEPALIVE-TIMEOUT` as 10 seconds. These protocol timers should not be confused with persistent keepalives used specifically to preserve NAT/firewall state.

## Firewall and Forwarding Semantics

A successful handshake does not authorize decrypted traffic to enter a LAN. Once decrypted, packets enter the host network stack through the WireGuard interface and must pass ordinary forwarding policy.

A stateful firewall can permit Site A to reach Site B while allowing only return traffic in the opposite direction:

```bash
nft add rule inet filter forward iifname "wg0" oifname "br-lan" \
  ip saddr 192.168.10.0/24 ip daddr 192.168.20.0/24 \
  ct state new,established,related accept

nft add rule inet filter forward iifname "br-lan" oifname "wg0" \
  ip saddr 192.168.20.0/24 ip daddr 192.168.10.0/24 \
  ct state established,related accept
```

A broad temporary rule is useful for proving the forwarding path, but production policy should be reduced to required source hosts, destinations, protocols, and application ports. Avoid NAT between the private prefixes unless overlapping addressing or deliberate translation requires it; routed VPNs are easier to troubleshoot when original addresses remain visible end to end.

## Practical Examples and Evidence

Troubleshooting should follow the packet path rather than treating "VPN up" as a complete test.

Check cryptographic state first:

```bash
wg show wg0
```

A recent handshake and increasing transfer counters prove encrypted UDP exchange. Then confirm the kernel's forwarding decision:

```bash
ip route get 192.168.20.10
ip rule show
```

Capture at each layer:

```bash
tcpdump -nni wan0 udp port 51820
tcpdump -nni wg0 host 192.168.20.10
tcpdump -nni br-lan host 192.168.20.10
```

If UDP is visible on the WAN but no handshake forms, investigate endpoint reachability, forwarding, keys, or peer definitions. If the handshake is current and decrypted packets appear on `wg0` but never on the LAN interface, routing or firewall forwarding is the likely failure domain. If requests reach the destination LAN but replies do not return through `wg0`, inspect the return route, host gateway, stateful policy, and asymmetric routing.

## Industry Standards Reference

- **RFC 768, User Datagram Protocol, 1980** — transport for WireGuard packets.
- **RFC 1918, Address Allocation for Private Internets, 1996** — private IPv4 addressing.
- **RFC 4787, NAT Behavioral Requirements for Unicast UDP, 2007** — UDP NAT mapping and filtering behavior.
- **RFC 5869, HKDF, 2010** — key derivation primitive.
- **RFC 7693, BLAKE2, 2015** — cryptographic hash primitive.
- **RFC 7748, Elliptic Curves for Security, 2016** — X25519 key agreement.
- **RFC 8439, ChaCha20 and Poly1305 for IETF Protocols, 2018** — authenticated encryption.
- **WireGuard Technical Whitepaper and Protocol Documentation** — cryptokey routing, handshake behavior, and timers.

## Key Technical Insights

- **Handshake success proves transport and peer authentication, not routed LAN connectivity.**
- **`AllowedIPs` provides outbound peer selection and inbound source-prefix validation.**
- **Routes and peer authorization must agree.** A route to `wg0` cannot compensate for a missing peer prefix, and an allowed prefix is useless if the kernel never selects `wg0`.
- **Server-side prefix association is local state.** Expanding a peer's remote LAN prefixes does not inherently require regenerating the opposite peer's configuration.
- **NAT traversal is a liveness problem.** Port forwarding makes a responder reachable; persistent keepalives preserve mappings for idle NATed peers.
- **Selective routing is usually simpler than full-tunnel design.** Install only remote private prefixes and leave `0.0.0.0/0` on the local WAN.
- **Firewall classification matters after decryption.** Reason from ingress interface, source, destination, state, and forwarding direction rather than trusting a high-level zone label.

## Prevention Strategies and Takeaways

Design from the routing requirements outward. Use non-overlapping prefixes, define which peer owns each remote network, and verify that the operating-system FIB points those networks toward WireGuard. Keep the default Internet route outside the tunnel unless full-tunnel behavior is explicitly required.

For NATed peers, document which side owns the stable public endpoint, where UDP forwarding occurs, and whether the opposite peer needs persistent keepalives. Treat a recent handshake as only the first checkpoint. Validate `AllowedIPs`, route or policy-rule selection, forwarding rules, return-path symmetry, and captures on both tunnel and LAN interfaces.

The strongest site-to-site design is not merely one that establishes a tunnel. It is one where cryptographic identity, route ownership, NAT state, and least-privilege firewall policy all describe the same intended traffic flow.
