---
layout: post
title: "Why FQDN Firewall Rules Depend on DNS Visibility"
date: 2026-09-16 20:01:00 +0530
description: "A deep technical look at how DNS-driven firewall objects become kernel address sets, why external resolvers can break FQDN policy matching, and how to design deterministic controls."
tags: [dns, firewall, netfilter]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

An **FQDN-based firewall rule** appears to express a simple policy: allow or deny traffic to a hostname such as `api.example.net`. At the packet-processing layer, however, IP packets do not contain that hostname. The firewall normally sees only source and destination IP addresses, transport protocol, ports, interfaces, connection state, and other packet metadata.

The practical consequence is important: many firewall implementations translate an FQDN policy into a **dynamically maintained set of IP addresses**. A DNS-aware process resolves the name, inserts returned A and AAAA records into that set, and the kernel packet filter matches traffic against the populated addresses. If DNS resolution occurs somewhere else, the firewall may never learn the mapping.

The core learning objective is therefore to understand **DNS-to-firewall state coupling**: how name resolution becomes packet-filter state, when that coupling fails, and how to design DNS architecture so FQDN policies remain deterministic.

## Co-Technical Subject

**DNS-Aware Stateful Packet Filtering and Dynamic Address Sets**

## Theoretical Foundation

DNS itself does not define firewall semantics. **RFC 1034, Domain Names — Concepts and Facilities (1987)** separates the DNS architecture into the domain namespace, name servers, and resolvers. Its resolver model is particularly relevant because the resolver is the component that learns address records on behalf of applications. [> “RESOLVERS are programs that extract information from name servers in response to client requests.”](https://www.rfc-editor.org/rfc/rfc1034.html)

**RFC 1035, Domain Names — Implementation and Specification (1987)** defines A records as host addresses and describes cached data learned by resolvers. Cached DNS data is temporary and subject to expiration rather than being a permanent identity binding. [> “The second kind of data is cached data which was acquired by a local resolver.”](https://www.rfc-editor.org/rfc/rfc1035.html)

That distinction matters because an FQDN firewall object is not a standardized DNS feature. It is an implementation technique that consumes DNS results and converts them into packet-filterable state.

On Linux systems, a common implementation uses **Netfilter sets**. The ipset subsystem stores collections such as IP addresses or networks, while iptables can test packet fields against those sets with the `set` match. The Netfilter documentation explicitly describes this relationship: [> “IP sets can be used via the set match and SET target in iptables rules.”](https://ipset.netfilter.org/features.html)

A DNS forwarder such as `dnsmasq` can bridge DNS and Netfilter. Its `--ipset` option places resolved addresses for configured domains into named Netfilter sets. The official documentation states: [> “Places the resolved IP addresses of queries for one or more domains in the specified Netfilter IP set.”](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)

## Mechanism Breakdown

Consider a policy that permits TCP traffic to `service.example.net` on port `8443`.

At policy compilation time, the control plane creates an address set for the hostname and a packet-filter rule that references the set. A generic configuration may look like this:

```text
ipset=/service.example.net/fw_dst_service_v4,fw_dst_service_v6
```

The packet filter then evaluates destination addresses against the generated set:

```bash
iptables -A FORWARD \
  -p tcp --dport 8443 \
  -m set --match-set fw_dst_service_v4 dst \
  -j ACCEPT
```

The set initially may be empty. The DNS-aware resolver becomes the population mechanism.

When a client sends a DNS query for `service.example.net` to the resolver that owns the `ipset=` integration, that resolver forwards or answers the query, receives an A or AAAA record, and inserts the returned address into the appropriate set. If the A record is `203.0.113.40`, the resulting state is conceptually equivalent to:

```bash
ipset add fw_dst_service_v4 203.0.113.40
```

Subsequent packets toward `203.0.113.40:8443` match the set and can be accepted.

The important dependency is that **the integrated resolver must observe the DNS answer**. Suppose clients instead send queries directly to another recursive resolver:

```text
Client -> External Resolver -> Authoritative DNS
Client -> Firewall -> 203.0.113.40:8443
```

The external resolver learns that `service.example.net` maps to `203.0.113.40`, but the firewall-integrated resolver sees no query and no answer. Its address set remains empty. The packet reaches the firewall as an ordinary IP flow with destination `203.0.113.40`; there is no hostname field available for the firewall to reconstruct the original DNS lookup.

The policy therefore fails not because DNS resolution failed, but because **DNS resolution and policy-state generation occurred on different systems**.

TTL handling adds another layer. Dynamic firewall entries should track DNS validity closely; stale entries can permit obsolete endpoints, while premature expiry can deny legitimate traffic.

CNAME chains, multiple A/AAAA records, geo-distributed answers, and CDN rotation further complicate set maintenance.

## Industry Standards Reference

Relevant standards and implementation references are:

- **RFC 1034 — Domain Names: Concepts and Facilities, 1987.** Defines the DNS architecture, resolvers, name servers, caching concepts, and namespace model.
- **RFC 1035 — Domain Names: Implementation and Specification, 1987.** Defines DNS message formats and resource records including A records used for IPv4 address resolution.
- **RFC 7858 — Specification for DNS over Transport Layer Security, 2016.** Defines DNS over TLS, which deliberately prevents on-path observers from reading DNS messages.
- **RFC 8484 — DNS Queries over HTTPS, 2018.** Defines DNS over HTTPS and maps DNS exchanges into encrypted HTTPS transactions.
- **Netfilter ipset and iptables documentation.** Defines address-set storage and packet matching through `--match-set`.
- **dnsmasq documentation.** Defines the `--ipset` and `--nftset` mechanisms that populate kernel sets from DNS answers.

Encrypted DNS strengthens the architectural lesson. DoT and DoH intentionally reduce passive DNS visibility. A firewall that depends on snooping arbitrary client DNS traffic cannot reliably reconstruct FQDN-to-address state once name resolution is encrypted or bypasses the expected resolver path.

## Practical Examples and Evidence

A clean vendor-neutral design makes the security gateway or another policy-aware resolver the client-facing DNS endpoint, then forwards queries upstream as required.

For example, a local resolver can forward an internal namespace to a private authoritative server while resolving other names through normal upstream recursion:

```text
server=/corp.example/10.20.30.53
server=9.9.9.9
```

An FQDN policy integration can then populate a destination set:

```text
ipset=/service.example.net/fw_service_v4,fw_service_v6
```

Validation should examine both DNS and packet-filter state:

```bash
dig service.example.net @192.0.2.1
ipset list fw_service_v4
iptables -S FORWARD | grep fw_service_v4
conntrack -L | grep 203.0.113.40
```

Expected evidence is a successful DNS answer, the resolved address in the set, a rule referencing that set, and matching connections.

If clients use a different resolver, test the failure mode directly:

```bash
dig service.example.net @10.20.30.53
ipset list fw_service_v4
```

A successful DNS answer combined with an empty firewall set demonstrates a **visibility gap**, not a routing failure.

## Key Technical Insights

- **FQDN matching is usually indirect.** The firewall matches IP addresses derived from DNS, not strings embedded in packets.
- **Resolver placement becomes part of security policy.** If dynamic firewall objects depend on DNS answers, DNS architecture is no longer merely a naming concern.
- **Control-plane and data-plane state must converge.** The DNS resolver produces identity-to-address state; the packet filter consumes that state.
- **External DNS can create policy blindness.** A resolver outside the policy engine may resolve names correctly while leaving firewall address sets unpopulated.
- **Encrypted DNS makes passive reconstruction unreliable by design.** DoT and DoH remove the assumption that a middlebox can inspect arbitrary DNS exchanges.
- **CDNs weaken static assumptions.** Frequently changing A/AAAA records, geo-distributed responses, and CNAME indirection require timely dynamic updates.
- **Static host mappings trade dynamism for predictability.** They may stabilize matching temporarily but can silently become stale when the service changes addresses.

## Prevention Strategies and Takeaways

Design FQDN-based enforcement so that the component maintaining firewall address sets is also in the **authoritative resolution path for the clients whose traffic it filters**. A common pattern is to provide a policy-aware local resolver to clients and use conditional forwarding for internal namespaces.

When DNS visibility cannot be guaranteed, prefer controls that do not depend on inferred hostname state. Stable IP prefixes, authenticated application-layer proxies, service meshes, explicit egress gateways, or other identity-aware controls may be more deterministic depending on the environment.

Monitor both halves of the mechanism. DNS success alone does not prove FQDN firewall readiness. Validate the resolver response, the resulting dynamic set, the kernel rule that references the set, and the final packet counters or connection state.

The broader architectural lesson is simple: **an FQDN firewall object is a synchronization system between DNS and packet filtering**. Its correctness depends on where resolution occurs, how quickly address state is propagated, how expiration is handled, and whether clients can bypass the resolver that feeds policy state. Treat those dependencies as first-class design constraints rather than incidental implementation details.
