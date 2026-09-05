---
layout: post
title: "Why Dynamic DNS Breaks Behind CGNAT and Tunneled WAN Interfaces"
date: 2026-09-06 01:20:00 +0530
description: "A deep technical analysis of why interface-bound Dynamic DNS can publish the wrong address behind CGNAT, GRE tunnels, and multi-stage WAN architectures."
tags: [ddns, cgnat, gre]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Dynamic DNS is often treated as a simple mapping problem: detect the current WAN address, update an `A` record, and let remote clients follow the hostname. That model works when the edge router actually owns the globally routable address. It becomes unreliable when the router's selected WAN interface is a tunnel endpoint or a Carrier-Grade NAT-facing interface.

The core principle is that **DNS update and public-address discovery are separate mechanisms**. A DDNS client can correctly update DNS while still choosing an address that has no global reachability. If a client is configured to read the address directly from a tunnel interface, and that interface is numbered from `100.64.0.0/10`, the client may publish a CGN shared address even though outbound traffic eventually appears on the Internet from a different public IPv4 address.

This article explains why that happens, how GRE and CGNAT alter address ownership, and why discovering a public address with an external service still does not guarantee inbound reachability.

## Co-Technical Subject

**Dynamic DNS, Carrier-Grade NAT, tunnel interface addressing, and WAN address discovery**.

The important architectural boundary is between the address configured on the customer edge interface and the address used after upstream translation. In direct PPP, DHCP, or static WAN designs, those may be the same address. In tunneled cellular, managed access, or CGNAT designs, they may be completely different.

## Theoretical Foundation

Dynamic DNS itself is standardized by **RFC 2136, Dynamic Updates in the Domain Name System, 1997**. DNS UPDATE defines how resource records are added, replaced, or removed. It does not define how a DDNS application determines which IPv4 address should be inserted into an `A` record. RFC 2136 states that ["The Update Section contains the edits to be made"](https://www.rfc-editor.org/rfc/rfc2136.html). Address discovery therefore remains an implementation decision outside the DNS UPDATE protocol.

That distinction matters because common DDNS clients generally use one of two discovery models:

- **Interface-bound discovery** reads the address configured on a named network interface.
- **External-observation discovery** queries an Internet service that reports the source address observed after all upstream translations.

Carrier-Grade NAT changes the meaning of the interface address. **RFC 6598, IANA-Reserved IPv4 Prefix for Shared Address Space, 2012** reserves `100.64.0.0/10` for service-provider shared addressing and explicitly states that ["The Shared Address Space address range is 100.64.0.0/10."](https://www.rfc-editor.org/rfc/rfc6598.html) This range is not ordinary RFC 1918 private space, but it is also not globally routable subscriber address space.

**RFC 6888, Common Requirements for Carrier-Grade NATs, 2013**, describes CGN as a provider-controlled translation function that shares public IPv4 addresses among subscribers. Its operational significance is summarized by the statement ["A CGN is not managed by the subscribers."](https://www.rfc-editor.org/rfc/rfc6888.html) The subscriber therefore cannot assume control over the public-side address, port mappings, or unsolicited inbound traffic.

GRE adds another layer of indirection. **RFC 2784, Generic Routing Encapsulation, 2000** describes a general-purpose tunnel in which ["The payload is first encapsulated in a GRE packet."](https://www.rfc-editor.org/rfc/rfc2784.html) A GRE interface may therefore carry routed subscriber traffic while its own local address represents only the tunnel endpoint. The address on that logical interface need not be the address ultimately visible to the public Internet.

## Mechanism Breakdown

Consider an edge router with a cellular backup path presented as a GRE interface. The interface may look like this:

```text
gre1@NONE: <POINTOPOINT,NOARP,UP,LOWER_UP>
    link/gre 10.10.11.1 peer 10.10.11.232
    inet 100.127.125.129/31 scope global gre1
```

The `/31` is a point-to-point subnet. Both addresses are inside `100.64.0.0/10`, so neither is a globally routable subscriber address.

An interface-bound DDNS workflow behaves approximately as follows:

- The DDNS configuration references `gre1` as the source WAN interface.
- The updater calls the operating system's interface-address APIs or inspects local network state.
- The selected IPv4 address is `100.127.125.129`.
- The updater compares that value with its last recorded value.
- If a change is detected, it sends an authenticated update to the DNS provider.
- The authoritative DNS zone is updated with the address supplied by the client.

Nothing in that sequence is inherently broken. The client is publishing the address it was told to monitor. The architectural error is assuming that the interface address is equivalent to the Internet-visible address.

Outbound traffic follows a different path. A packet may traverse the GRE tunnel, reach a service-provider gateway, and then pass through CGN before reaching the Internet. A simplified path is:

```text
LAN host
   -> edge router
   -> GRE interface 100.127.125.129
   -> provider tunnel endpoint
   -> carrier NAT
   -> public Internet address 198.51.100.42
```

The edge router owns `100.127.125.129`; the provider's NAT owns the translation that causes Internet servers to observe `198.51.100.42`. These are different address domains.

An external check service exposes that difference:

```bash
ip -4 addr show dev gre1
curl -4 https://example-check-ip.invalid
```

Conceptually, the first command may return `100.127.125.129`, while the second returns the translated public address. This is useful diagnostic evidence because it proves that the local interface address and the externally observed source address are not identical.

However, publishing the externally observed address is not equivalent to making inbound connectivity work. Under CGN, the provider controls the public-side mapping. A DNS record can correctly point to the shared public address while unsolicited inbound TCP or UDP still has no mapping back to the subscriber. DDNS solves **name-to-address freshness**; it does not create NAT state or port ownership.

## Industry Standards Reference

- **RFC 2136, 1997 — Dynamic Updates in the Domain Name System:** defines DNS UPDATE transaction semantics, prerequisites, additions, deletions, and server processing.
- **RFC 2784, 2000 — Generic Routing Encapsulation:** defines GRE packet encapsulation and the separation between payload and delivery protocols.
- **RFC 3022, 2001 — Traditional IP Network Address Translator:** explains basic NAT and NAPT translation between address realms and documents fundamental NAT limitations.
- **RFC 6598, 2012 — IANA-Reserved IPv4 Prefix for Shared Address Space:** reserves `100.64.0.0/10` for service-provider shared addressing used with CGN deployments.
- **RFC 6888, 2013 — Common Requirements for Carrier-Grade NATs:** specifies operational requirements for multi-subscriber NAT and emphasizes that CGN is controlled by the service provider.

The standards collectively reveal an important boundary: DNS can publish any syntactically valid address, but routing and NAT determine whether that address is meaningful or reachable from the public Internet.

## Practical Examples and Evidence

A vendor-neutral DDNS configuration might explicitly bind a hostname to an interface:

```yaml
ddns:
  hostname: backup.example.net
  address_source: interface
  interface: gre1
```

With this model, the authoritative record can legitimately become:

```text
backup.example.net. 300 IN A 100.127.125.129
```

A diagnostic workflow should compare local assignment, forwarding selection, external observation, and DNS state:

```bash
ip -4 addr show dev gre1
ip route get 1.1.1.1
dig +short backup.example.net A
curl -4 https://ifconfig.me
```

If the results are conceptually:

```text
interface address:    100.127.125.129
DNS A record:         100.127.125.129
external source IP:   198.51.100.42
```

then the DDNS client is behaving consistently with **interface-bound address discovery**, but the chosen discovery method does not represent the post-CGN Internet address.

An external-observation design changes only the discovery stage:

```yaml
ddns:
  hostname: backup.example.net
  address_source: external_check
```

That can make the DNS record match the translated public address. It still does not prove inbound reachability. A separate test from an unrelated external network is required to determine whether the provider permits inbound mappings or provides a dedicated public address.

## Key Technical Insights

- **DDNS is not NAT traversal.** Updating an `A` record does not establish inbound state through a carrier NAT.
- **Interface ownership matters.** A logical WAN or tunnel interface may own only a transport endpoint, not the address ultimately visible on the Internet.
- **`100.64.0.0/10` is a strong architectural signal.** Seeing this range on the subscriber-facing WAN strongly suggests provider shared addressing and possible CGN.
- **A successful external IP check proves egress translation, not inbound reachability.** The observed address may be shared among many subscribers.
- **Failover designs amplify discovery mistakes.** A DDNS client that changes source interfaces during failover must understand whether each path exposes a direct public address, a private address, a tunnel endpoint, or a CGN address.
- **Correct configuration can still produce an unusable result.** The DDNS application may faithfully publish the configured interface address even when that address has no global routing significance.

## Prevention Strategies and Takeaways

- Determine whether the WAN interface directly owns a globally routable address before binding DDNS to it.
- Treat addresses inside `100.64.0.0/10` as provider shared space, not as normal public WAN addresses.
- Compare `ip addr`, route selection, an external check-IP result, and the authoritative DNS record when diagnosing DDNS mismatches.
- Use external-observation address discovery only when the goal is to publish the post-NAT source address, and document that this does not guarantee inbound connectivity.
- For inbound services, verify whether the provider offers a dedicated public IPv4 address, static mapping, port-control mechanism, or non-CGN access profile.
- Prefer outbound-established overlay tunnels when remote reachability must survive NAT, CGN, or WAN failover. These designs reverse the dependency: the site initiates connectivity toward a reachable rendezvous or tunnel endpoint rather than waiting for unsolicited inbound traffic.
- In multi-WAN designs, model **address discovery**, **DNS publication**, **NAT ownership**, and **inbound reachability** as separate control-plane questions. Conflating them is the root cause of many apparently inconsistent DDNS failures.

The general lesson is straightforward: the address attached to a WAN interface is not always the address that represents the site on the Internet. Once tunnels and provider-side NAT are introduced, DDNS must be designed around address ownership and translation boundaries rather than interface names alone.
