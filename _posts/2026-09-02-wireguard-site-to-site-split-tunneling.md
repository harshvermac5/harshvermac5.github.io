---
layout: post
title: "WireGuard Site-to-Site Routing with Selective Split Tunneling"
date: 2026-09-02 04:54:00 +0530
description: "How WireGuard cryptokey routing, policy-based forwarding, firewall rules, NAT, and return paths combine in a selective site-to-site VPN design."
tags: [wireguard, vpn, routing, pbr, networking]
categories: [Networking]
published: true
---

A selective WireGuard site-to-site VPN is best understood as a **Layer-3 encrypted overlay controlled by normal routing policy**. WireGuard encrypts and authenticates packets between peers, but it does not independently decide which application traffic should enter the tunnel.


## Separate the Underlay from the Overlay

Every WireGuard deployment has two logical paths.

The **underlay** carries encrypted UDP packets between the public or translated addresses of the WireGuard peers.

```text
Router A public IP
        |
     Internet
        |
Router B public/NAT address
```

The **overlay** carries the original Layer-3 traffic after encryption and decapsulation.

```text
LAN A ---- Router A === WireGuard === Router B ---- LAN B
```

The remote WireGuard endpoint must remain reachable through the underlay. Routing the peer's public endpoint back into the tunnel creates recursive routing: the tunnel would need to exist before the endpoint required to establish it could be reached.

## Route Selection Happens Before WireGuard Peer Selection

Assume only two systems need to communicate:

```text
Site A backup server: 10.10.10.20
Site B storage server: 10.20.20.30
```

A destination-specific route can steer all traffic for the remote server into WireGuard:

```text
10.20.20.30/32 -> wg0
```

If only one local source should use the tunnel, **Policy-Based Routing** can make the decision more specific:

```text
if src == 10.10.10.20
and dst == 10.20.20.30:
    use wg0
else:
    use normal routing
```

The forwarding plane therefore decides whether a packet reaches the WireGuard interface. WireGuard then decides which peer is allowed to carry that packet.

## Understand What AllowedIPs Actually Does

WireGuard associates IP prefixes with peer public keys through **`AllowedIPs`**.

For outbound traffic:

```text
Destination IP
    -> AllowedIPs lookup
    -> Peer public key
    -> Encryption
```

For inbound traffic:

```text
Authenticated peer
    -> Decrypt packet
    -> Inspect source IP
    -> Verify source is inside that peer's AllowedIPs
```

For example:

```text
Peer B
AllowedIPs = 10.20.20.0/24
```

A decrypted packet from Peer B with source `10.20.20.30` is valid. A packet from the same peer claiming source `10.50.50.100` is rejected unless that prefix is also assigned to Peer B.

This means **`AllowedIPs` is both a peer-selection mechanism and a source-address authorization mechanism**.

Do not treat it as identical to the operating system routing table. Some management tools automatically create routes from `AllowedIPs`, but the logical functions remain separate:

```text
Routing/PBR
    -> select wg0
    -> AllowedIPs
    -> select cryptographic peer
```

## Keep Split-Tunnel Scope Narrow

The route scope determines whether the design is selective or broad.

```text
10.20.20.30/32 -> tunnel
```

This sends only one destination through WireGuard.

```text
10.20.20.0/24 -> tunnel
```

This sends the entire remote subnet through the tunnel.

```text
0.0.0.0/0 -> tunnel
```

This can turn the peer into a default IPv4 egress path.

For tightly controlled application connectivity, a `/32` route provides the smallest forwarding scope and reduces accidental VPN transit.

## Return-Path Routing Is Mandatory

A successful handshake proves that the WireGuard peers can authenticate and exchange tunnel packets. It does not prove that hosts behind those peers can communicate.

If Site A routes `10.20.20.30` through WireGuard but Site B has no route back to `10.10.10.20`, the request may arrive while the response leaves through another interface.

```text
Forward path: Site A -> WireGuard -> Site B
Return path:  Site B -> default route -> WAN
```

That asymmetry commonly breaks connectivity because of stateful firewalls, NAT, anti-spoofing checks, or private RFC1918 addressing.

Verify both directions:

```text
Site A: 10.20.20.30/32 -> WireGuard
Site B: 10.10.10.20/32 -> WireGuard
```

## Treat Routing and Firewall Policy as Separate Controls

Routing answers **where the packet should go**. Firewall policy answers **whether the packet is allowed to go there**.

A secure selective design should align three scopes:

- **Cryptographic scope:** which addresses belong to the remote peer.
- **Routing scope:** which traffic is sent into the tunnel.
- **Security scope:** which sources, destinations, and applications are permitted.

For a backup workflow, avoid allowing the complete LAN-to-LAN path when only two systems need access.

```text
source      = 10.10.10.20
destination = 10.20.20.30
protocol    = required backup services
action      = allow
```

## Account for NAT and Idle Peers

WireGuard runs over UDP. A peer behind NAT may lose its translation or firewall state during long idle periods.

**`PersistentKeepalive`** can maintain that state:

```text
PersistentKeepalive = 25
```

This is primarily a NAT traversal mechanism, not a general tunnel-health monitor. WireGuard is intentionally quiet when no traffic needs to be sent.


## Check MTU When Large Transfers Fail

WireGuard adds roughly 60 bytes of overhead over IPv4 transport and 80 bytes over IPv6.

If the tunnel MTU is too large, symptoms can include:

- TCP sessions that establish but stall during larger transfers.
- Fragmentation or ICMP dependency.
- Broken Path MTU Discovery.
- Backup jobs that fail only under sustained throughput.

If small pings work but application transfers fail, MTU and TCP MSS behavior should be part of the investigation.

## Troubleshooting Order

When a selective WireGuard site-to-site path fails, check the forwarding chain in order:

- Confirm the remote public endpoint is reachable through the WAN underlay.
- Confirm a recent WireGuard handshake exists when traffic is generated.
- Verify the local route or PBR rule sends the intended flow to the WireGuard interface.
- Verify the destination matches the correct peer's `AllowedIPs`.
- Verify the remote side accepts the decrypted source address under its own `AllowedIPs` configuration.
- Confirm firewall policy allows the application traffic in both directions.
- Confirm the return route points back through WireGuard.
- Check for overlapping LAN prefixes.
- Investigate MTU if only large packets or sustained transfers fail.

The key design principle is simple: **WireGuard encryption, route selection, and firewall policy should describe the same intended traffic scope**. When those three layers agree, selective site-to-site connectivity becomes predictable and much easier to troubleshoot.
