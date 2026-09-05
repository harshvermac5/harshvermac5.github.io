---
layout: post
title: "Why Domain-Based Policy Routing Fails When DNS Bypasses the Gateway"
date: 2026-09-06 02:15:00 +0530
description: "A deep technical analysis of DNS-observed policy routing, dynamic destination sets, encrypted DNS bypass, and deterministic multi-WAN forwarding design."
tags: [dns, policy-routing, multi-wan]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Domain-based policy routing appears simple: define a hostname such as `service.example`, associate it with a secondary uplink, and expect every connection to that service to leave through that uplink. The hidden difficulty is that routers forward IP packets, not domain names. Once an application resolves a name, the packet carries only source and destination IP addresses; the original DNS name is absent from the IPv4 or IPv6 header.

Many implementations bridge that semantic gap by observing DNS responses and translating domain names into a temporary set of destination addresses. The forwarding rule then matches the resulting IP set. This creates a dependency that is easy to miss: **the router must observe the DNS transaction before it can classify the later IP flow**.

The objective is to understand this coupling and why external or encrypted DNS, caches, and CDN address rotation can leave an apparently valid policy with nothing to match.

## Co-Technical Subject

**DNS-Assisted Policy-Based Routing and Multi-WAN Traffic Classification**

This mechanism combines DNS resolution, packet classification, policy routing, connection tracking, and NAT. It is an implementation architecture built on standard DNS and IP forwarding behavior, not a standalone IETF routing protocol.

## Theoretical Foundation

DNS is defined primarily by **RFC 1034** and **RFC 1035**, published in 1987 as Internet Standard **STD 13**. DNS separates names from network-layer addresses. RFC 1035 states that ["The goal of domain names is to provide a mechanism for naming resources"](https://www.rfc-editor.org/rfc/rfc1035.html#section-2.1). A resolver returns A or AAAA records, and applications then communicate using those addresses.

An ordinary IP packet does not carry the DNS name that selected its destination. **RFC 1812** defines IPv4 router requirements around IP forwarding, so domain-aware routing requires an additional classifier outside normal destination lookup.

A gateway DNS proxy is also a recognized architecture. **RFC 5625, BCP 152, 2009** notes that ["The proxy serves as a convenient default DNS resolver for clients on the LAN"](https://www.rfc-editor.org/rfc/rfc5625.html#section-1). A policy-routing implementation can reuse that observation point to associate DNS answers with configured domains. This domain-to-address classifier is **not standardized by DNS RFCs**.

## Mechanism Breakdown

A DNS-assisted policy-routing pipeline typically operates as follows.

- The client sends an A or AAAA query to the gateway DNS proxy or forwarder.
- The gateway observes the response and extracts relevant A/AAAA records, including applicable CNAME-derived addresses.
- Those addresses enter a **dynamic destination set**, usually with lifetimes related to DNS TTLs.
- Later packets are matched against that set.
- A match applies a policy selector such as a mark or alternate routing table.
- Policy lookup chooses the alternate WAN next hop, while NAT and connection tracking retain flow-specific egress state.

Conceptually, the DNS-learning stage resembles:

```text
on_dns_response(qname, answers):
    if qname matches configured_domain:
        for address_record in answers:
            destination_set.insert(
                address_record.address,
                timeout=address_record.ttl
            )
```

If a client sends DNS directly to an external resolver, the local proxy never observes the response in the context required by the classifier. The destination set remains empty, so a valid rule can still match **zero packets**.

A fail-closed or "kill switch" control does not fix this. It acts **after a packet matches a policy**; a classification miss falls through to normal forwarding before that logic matters.

## Industry Standards Reference

The standards define the building blocks rather than domain routing itself.

- **RFC 1034 and RFC 1035, STD 13, 1987** define DNS concepts, resolver behavior, resource records, caching, and query/response processing.
- **RFC 5625, BCP 152, 2009** provides DNS proxy implementation guidance for gateway devices.
- **RFC 1812, Proposed Standard, 1995** defines core IPv4 router forwarding requirements.
- **RFC 7858, Proposed Standard, 2016** defines DNS over TLS. Encryption prevents an ordinary intermediate observer from reading the DNS transaction.
- **RFC 8310, Proposed Standard, 2018** updates operational privacy profiles for DNS over TLS and DTLS.
- **RFC 8484, Proposed Standard, 2018** defines DNS over HTTPS. Its architecture explicitly states that ["Each DNS query-response pair is mapped into an HTTP exchange"](https://www.rfc-editor.org/rfc/rfc8484.html#section-1), which can remove DNS visibility from a gateway classifier.
- **RFC 1918, BCP 5, 1996** defines private IPv4 address space commonly seen on internal or upstream-NAT interfaces.
- **RFC 3022, Informational, 2001** describes traditional NAT and NAPT behavior relevant to multi-WAN egress translation.
- **RFC 5737, Informational, 2010** reserves IPv4 prefixes used below for documentation examples.

No IEEE switching standard directly governs this mechanism because the decision is primarily a Layer-3 forwarding and DNS-classification function rather than an Ethernet control-plane behavior.

## Practical Examples and Evidence

A Linux reference implementation illustrates the forwarding portion. Assume WAN1 uses `192.0.2.1`, WAN2 uses `198.51.100.1`, and the DNS observer learned `203.0.113.40`.

A dynamic nftables set can represent learned destinations:

```nft
set domain_wan2_v4 {
    type ipv4_addr
    flags timeout
}
```

The observer inserts the address using a lifetime derived from DNS state:

```bash
nft add element inet pbr domain_wan2_v4 '{ 203.0.113.40 timeout 300s }'
```

Packet classification can then mark matching traffic:

```nft
ip daddr @domain_wan2_v4 meta mark set 0x2
```

Linux policy routing can map that mark to a secondary table:

```bash
ip rule add fwmark 0x2 lookup 200
ip route add default via 198.51.100.1 dev wan2 table 200
```

If the destination set is empty, no mark is applied and the main table remains authoritative. Diagnostic evidence therefore should test the entire chain rather than only the configured rule:

```text
DNS query observed by gateway:     yes/no
A/AAAA address learned:             yes/no
Destination present in dynamic set: yes/no
Packet counter on classifier:       increasing/static
Policy mark applied:                yes/no
Alternate FIB selected:             yes/no
Egress interface:                   wan1/wan2
```

Path testing can expose the resulting forwarding choice. A simplified pre-fix trace might show WAN1:

```text
1  10.0.0.1
2  192.0.2.1
```

After DNS visibility and policy matching are restored, a fresh connection might show WAN2:

```text
1  10.0.0.1
2  198.51.100.1
```

Existing sessions may remain on the original path because connection tracking, NAT state, HTTP reuse, and QUIC can outlive a browser tab. Test with fresh DNS resolution and a new transport flow.

## Key Technical Insights

- **Domain routing is really address routing with a DNS-fed classifier.** The configured hostname is metadata used to maintain an IP set; packets are still forwarded by IP.
- **Resolver placement becomes a routing dependency.** Direct external DNS can bypass the observation point even though ordinary Internet connectivity remains healthy.
- **Encrypted DNS changes observability by design.** DoH and DoT improve confidentiality but can conflict with middlebox features that depend on inspecting DNS answers.
- **Caching creates temporal state.** The OS, application, recursive resolver, gateway, classifier, and connection tracker can all hold state with different lifetimes.
- **CDNs make domain-to-IP mapping non-deterministic.** A hostname may return multiple addresses, change by geography, use short TTLs, or share addresses with unrelated hostnames.
- **Double NAT does not inherently break outbound policy routing.** A secondary WAN may itself use private addressing behind an upstream NAT and still provide a valid outbound next hop. The larger impact is on inbound reachability and port mapping.
- **Static IP policies are more deterministic but less semantic.** They avoid DNS-observation failure but are fragile with rotating CDN or anycast addresses.

## Prevention Strategies and Takeaways

Treat the DNS path as part of the forwarding architecture.

- Ensure clients intended to use DNS-derived routing send resolution through the observation point that maintains the policy's destination set.
- Account for manually configured resolvers, VPN-provided DNS, browser DoH, operating-system encrypted DNS, and privacy relay services.
- Monitor dynamic-set population and rule counters, not merely configuration presence.
- Align learned-address lifetimes with DNS TTL behavior and remove stale entries predictably.
- Test with fresh DNS state and new connections so old cache, NAT, or connection-tracking entries do not mask the result.
- Prefer IP or prefix policy when the destination set is stable and strict deterministic routing matters more than hostname semantics.
- For large CDN-backed applications, treat domain-based routing as a best-effort classifier unless the architecture provides an authoritative application-aware control point.
- Document the privacy trade-off explicitly. Requiring gateway-visible DNS can conflict with encrypted-DNS objectives, so the network design should choose intentionally between observability-driven policy and end-to-end resolver privacy.

The central principle is simple but consequential: **a domain-based routing rule can only classify addresses it has learned**. When DNS resolution bypasses the learner, the routing policy does not fail at the forwarding table; it fails one stage earlier, at classification.
