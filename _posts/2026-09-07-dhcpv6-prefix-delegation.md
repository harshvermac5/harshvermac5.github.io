---
layout: post
title: "DHCPv6 Prefix Delegation: From WAN Lease to LAN Prefix Activation"
date: 2026-09-07 00:55:00 +0530
description: "A deep technical guide to DHCPv6 Prefix Delegation, including IA_PD state, renewal timers, downstream /64 assignment, Router Advertisements, and failure isolation."
tags: [ipv6, dhcpv6, prefix-delegation]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

DHCPv6 Prefix Delegation separates **obtaining IPv6 address space from an upstream provider** from **installing and advertising that address space on downstream networks**. This distinction matters because a router can successfully receive a delegated prefix in DHCPv6 while still failing to configure LAN interfaces, generate downstream routes, or advertise usable prefixes to hosts.

The central troubleshooting principle is therefore to validate Prefix Delegation as a pipeline rather than a single event. Engineers should independently prove that the requesting router asked for a prefix, that the delegating router returned one, that the requesting router installed appropriate downstream subnets, and that hosts learned those subnets through Router Advertisements or DHCPv6.

A successful WAN-side DHCPv6 exchange proves only the first half of that chain. It does not prove that downstream IPv6 service is operational.

## Co-Technical Subject

**IPv6 DHCPv6 Prefix Delegation and downstream subnet lifecycle management**

The mechanism spans DHCPv6 client state, delegated-prefix lifetimes, routing-table installation, /64 subnet derivation, Neighbor Discovery, Router Advertisements, SLAAC, and optional stateful DHCPv6 address assignment.

## Theoretical Foundation

**RFC 8415, Dynamic Host Configuration Protocol for IPv6, November 2018**, defines modern DHCPv6 behavior and incorporates Prefix Delegation previously specified separately by RFC 3633. It defines **IA_PD** as [“an IA that carries delegated prefixes”](https://datatracker.ietf.org/doc/html/rfc8415), while **IA_NA** carries non-temporary IPv6 addresses assigned to the requesting node itself.

These objects solve different problems. A WAN interface might receive an address through IA_NA such as `2001:db8:601:30::f:a1df/128`, while the same DHCPv6 transaction delegates `2001:db8:42a1:5c00::/56` through IA_PD. The `/128` identifies the router as an IPv6 endpoint on the WAN. The `/56` is routing authority that the router can divide into downstream subnets.

A `/56` contains 256 distinct `/64` networks. The delegated `/56` is therefore not normally assigned wholesale to one LAN. Instead, the requesting router derives one or more `/64` prefixes from it and binds those prefixes to downstream interfaces.

**RFC 7084, Basic Requirements for IPv6 Customer Edge Routers, November 2013**, states that an IPv6 edge router [“MUST assign a separate /64”](https://datatracker.ietf.org/doc/html/rfc7084) from its delegated space to each LAN interface. RFC 9818, published in July 2025, updates RFC 7084 with additional guidance for DHCPv6 Prefix Delegation on LANs.

## Mechanism Breakdown

A standard DHCPv6 Prefix Delegation transaction commonly begins with **Solicit**. The requesting router includes an IA_PD option and may include an IA Prefix option as a **prefix-length hint**, for example `::/56`. The hint expresses the desired size; it does not force the server to return that exact prefix length.

The delegating router responds with **Advertise**, including an IA_PD if it can offer a prefix. The requesting router then sends **Request**, identifying the selected server and the requested IA_PD. The server finalizes the lease with **Reply**. Rapid Commit can shorten this exchange when both sides support it.

The IA_PD contains an **IAID**, **T1**, **T2**, and one or more delegated prefixes. Each delegated prefix has a **preferred lifetime** and **valid lifetime**.

- **T1** controls when the client should contact the original server to renew the binding.
- **T2** controls when the client should attempt rebinding with any available server.
- **Preferred lifetime** determines how long addresses formed from the prefix remain preferred for new connections.
- **Valid lifetime** determines how long those addresses remain valid at all.

RFC 8415 recommends T1 and T2 values near 50% and 80% of the shortest preferred lifetime when the server explicitly controls renewal timing. For a 21,600-second preferred lifetime, values of `T1=10800` and `T2=17280` map exactly to those proportions.

After receiving the Reply, the requesting router must move from **lease acquisition** to **prefix consumption**. It selects `/64` subnets from the delegated block, configures downstream interface state, installs connected and delegated-prefix routes, and begins advertising appropriate Prefix Information Options through ICMPv6 Router Advertisements.

Hosts using SLAAC then construct addresses from the advertised `/64`. RFC 4862 describes SLAAC as requiring [“no manual configuration of hosts”](https://datatracker.ietf.org/doc/html/rfc4862) in the normal case. DHCPv6 may still provide stateful addresses or ancillary information such as DNS, depending on Router Advertisement flags and local design.

Neighbor Discovery is separate from DHCPv6. **RFC 4861, September 2007**, defines Neighbor Solicitation, Neighbor Advertisement, Router Solicitation, and Router Advertisement behavior. Seeing Neighbor Solicitation in a capture proves NDP activity, not Prefix Delegation success.

## Industry Standards Reference

- **RFC 8200 — Internet Protocol, Version 6 (IPv6) Specification, July 2017:** the base IPv6 Internet Standard and packet-format architecture.
- **RFC 8415 — Dynamic Host Configuration Protocol for IPv6, November 2018:** authoritative DHCPv6 behavior, IA_NA, IA_PD, IA Prefix options, timers, Renew, Rebind, and status codes.
- **RFC 4861 — Neighbor Discovery for IP version 6, September 2007:** NDP, Router Advertisements, Neighbor Solicitation, reachability, and router discovery.
- **RFC 4862 — IPv6 Stateless Address Autoconfiguration, September 2007:** SLAAC address formation, lifetimes, and Duplicate Address Detection.
- **RFC 6177 — IPv6 Address Assignment to End Sites, March 2011:** operational guidance for end-site allocation sizes and the architectural need for multiple subnets.
- **RFC 7084 — Basic Requirements for IPv6 Customer Edge Routers, November 2013:** edge-router requirements for requesting delegated prefixes and assigning downstream `/64`s.
- **RFC 9818 — DHCPv6 Prefix Delegation on IPv6 Customer Edge Routers in LANs, July 2025:** updates RFC 7084 for downstream Prefix Delegation scenarios.

## Practical Examples and Evidence

The following sanitized trace demonstrates a healthy acquisition phase using documentation-only IPv6 prefixes:

```text
DHCPv6 Solicit
  IA_NA IAID:1
  IA_PD IAID:1
    IA_PREFIX ::/56 preferred=0 valid=0

DHCPv6 Advertise
  IA_NA IAID:1 T1=10800 T2=17280
    IA_ADDR 2001:db8:601:30::f:a1df
  IA_PD IAID:1 T1=10800 T2=17280
    IA_PREFIX 2001:db8:42a1:5c00::/56 preferred=21600 valid=21600

DHCPv6 Request
  IA_NA IAID:1
  IA_PD IAID:1
    IA_PREFIX 2001:db8:42a1:5c00::/56

DHCPv6 Reply
  IA_NA IAID:1 T1=10800 T2=17280
    IA_ADDR 2001:db8:601:30::f:a1df
  IA_PD IAID:1 T1=10800 T2=17280
    IA_PREFIX 2001:db8:42a1:5c00::/56 preferred=21600 valid=21600
```

This capture proves that the server accepted the Prefix Delegation request and returned a valid `/56`. If the router subsequently has no delegated `/64` on its LAN, the failure is downstream of DHCPv6 acquisition.

A correct implementation could derive networks such as:

```text
Delegated block: 2001:db8:42a1:5c00::/56
LAN-A:           2001:db8:42a1:5c00::/64
LAN-B:           2001:db8:42a1:5c01::/64
LAN-C:           2001:db8:42a1:5c02::/64
```

Engineers should then verify the control plane directly:

```bash
ip -6 addr show
ip -6 route show
rdisc6 eth0
sudo tcpdump -ni eth0 'icmp6 or (udp port 546 or udp port 547)'
```

A DHCPv6 Reply containing **NoPrefixAvail** inside IA_PD has a very different meaning: the delegating server could not provide a prefix for that IA. RFC 8415 explicitly defines this status behavior. Absence of that status, combined with a returned IA Prefix, rules out upstream refusal for that transaction.

## Key Technical Insights

The most important diagnostic separation is **IA_NA versus IA_PD**. Receiving a WAN IPv6 address does not prove that the router obtained routable space for downstream networks. Conversely, successful IA_PD does not require the delegated prefix to appear as the WAN interface address.

A second separation is **delegation versus advertisement**. DHCPv6 operates between the requesting and delegating routers. SLAAC and NDP operate on the downstream link. A working DHCPv6 exchange can coexist with missing Router Advertisements, absent `/64` interface configuration, stale routes, or failed internal prefix-state propagation.

Prefix changes introduce another state problem. A router must not simply replace an old prefix without lifecycle handling. Downstream hosts may retain addresses until advertised lifetimes expire. RFC 7084 requires routers to deprecate an old prefix when a delegated prefix changes so hosts stop selecting stale addresses for new connections.

Finally, intermittent failures should be analyzed around renewal boundaries. If initial acquisition works but service disappears around T1, T2, or valid-lifetime expiry, investigate Renew and Rebind exchanges, DUID and IAID stability, lease persistence, routing updates, and Router Advertisement regeneration.

## Prevention Strategies and Takeaways

- Validate DHCPv6 Prefix Delegation in stages: **request, server assignment, local installation, route creation, Router Advertisement, and host address formation**.
- Capture both successful and failed periods and compare IAID, DUID, delegated prefix, T1, T2, preferred lifetime, valid lifetime, and DHCPv6 status codes.
- Treat a returned IA_PD prefix as proof of upstream delegation, not proof of downstream activation.
- Allocate one `/64` per LAN or VLAN from the delegated block rather than assigning the entire delegated aggregate to a single broadcast domain.
- Verify that prefix changes trigger downstream deprecation and new Router Advertisements instead of leaving stale addresses active.
- Correlate failures with T1/T2 renewal and rebind events when instability appears periodic.
- Keep NDP evidence separate from DHCPv6 evidence. Neighbor Solicitation shows link-local neighbor discovery; IA_PD in DHCPv6 is what proves Prefix Delegation.

The reusable troubleshooting model is simple: **prove each state transition independently**. When the DHCPv6 Reply contains a valid IA_PD but downstream `/64`s never appear, the investigation should move away from the provider and toward the router's internal prefix-consumption, routing, and advertisement logic.
