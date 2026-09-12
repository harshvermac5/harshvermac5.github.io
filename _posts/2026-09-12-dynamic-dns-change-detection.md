---
layout: post
title: "Dynamic DNS Change Detection: Why a Client May Correctly Refuse to Update"
date: 2026-09-12 04:47:00 +0530
description: "A deep technical analysis of how Dynamic DNS clients detect address changes, suppress redundant updates, and securely publish new DNS mappings."
tags: [ddns, dns, networking, linux, automation]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Dynamic DNS failures are often misdiagnosed as authentication or provider problems when the real issue is **change detection**. A Dynamic DNS client normally does not publish an address simply because it was started. It first determines the address that should be advertised, compares that value with remembered state, and updates the remote service only when policy says an update is required.

The core principle is **event-driven synchronization between interface state and DNS state**. A healthy client can establish connectivity, authenticate successfully, and still send no update because its state machine concludes that the advertised address has not changed.

This distinction matters on gateways, Linux hosts, edge appliances, and automated infrastructure using dynamically assigned public addresses. A forced update can prove that the provider path works, but it does not prove that automatic change detection works.

## Co-Technical Subject

**Dynamic DNS state synchronization and WAN address change detection**

The subject sits at the intersection of DNS architecture, interface address management, HTTP-based update APIs, persistent client state, and event-driven automation.

## Theoretical Foundation

RFC 1034 and RFC 1035, published in 1987 and collectively identified as **STD 13**, define the DNS namespace, resource records, resolvers, authoritative servers, queries, caching, and zone data model.

RFC 2136, published in 1997, extended that model with the **DNS UPDATE** opcode. Its motivation is explicit: [“The Domain Name System was originally designed to support queries of a statically configured database.”](https://www.rfc-editor.org/rfc/rfc2136.html) DNS UPDATE allows authorized clients to add or delete resource records without offline zone-file edits. The transaction can carry prerequisites and update operations, and [“UPDATE is atomic”](https://www.rfc-editor.org/rfc/rfc2136.html), so failed prerequisites prevent partial application.

Public Dynamic DNS services, however, do not necessarily expose RFC 2136. Many provide an **HTTPS update API** in which a client submits a hostname and current address to a service endpoint. The provider ultimately changes authoritative DNS data, but the client may never construct an RFC 2136 packet.

This creates two distinct control planes: the client-side mechanism that decides whether an update is needed, and the provider-side mechanism that commits the mapping.

## Mechanism Breakdown

A typical Dynamic DNS client loads configuration containing a hostname, credentials, address-family policy, provider endpoint, and a method for determining the current address. That address source may be a local interface, an external address-discovery service, or a custom command.

When an interface is selected, the client enumerates addresses and filters unusable candidates. A link-local IPv6 address such as `fe80::/10` is not suitable as a globally reachable DNS destination. A client configured for IPv4-only publication should likewise reject IPv6 candidates.

The open-source Inadyn implementation illustrates this model. Its example configuration describes `iface` as [“Set interface to check for IP”](https://github.com/troglobit/inadyn/blob/master/examples/inadyn.conf). If no interface is selected, an implementation may query an external check-address service instead.

After discovery, the client compares the detected value with cached state from the previous successful invocation:

```text
current = discover_publishable_address()
previous = load_cached_address(hostname)

if force_update:
    publish(current)
elif current != previous:
    publish(current)
else:
    suppress_update()
```

This local comparison avoids unnecessary provider calls and protects against excessive-update policies. It is deliberately different from querying authoritative DNS before every run.

When an update is required, an HTTPS-oriented client resolves the update service, establishes transport, negotiates TLS, authenticates, submits the hostname and address, validates the response, and updates its local cache only after provider success.

A forced-update option bypasses only the **change-decision gate**. It should not bypass certificate validation, authentication, request validation, or response handling. Therefore, a successful forced update isolates the problem: the publication path works even if automatic triggering remains suspect.

## Industry Standards Reference

- **RFC 1034, Domain Names - Concepts and Facilities, 1987, STD 13** defines the conceptual DNS architecture.
- **RFC 1035, Domain Names - Implementation and Specification, 1987, STD 13** defines DNS message formats and resource-record behavior.
- **RFC 2136, Dynamic Updates in the Domain Name System, 1997** defines the DNS UPDATE opcode, prerequisites, transaction semantics, and response handling.
- **RFC 3007, Secure Domain Name System Dynamic Update, 2000** updates the security model for authenticated dynamic DNS changes.
- **RFC 7617, The Basic HTTP Authentication Scheme, 2015** defines HTTP Basic authentication and requires an external secure channel for confidentiality.
- **RFC 9110, HTTP Semantics, 2022, STD 97** defines the modern HTTP request-response semantics used by many DDNS APIs.
- **RFC 9846, The Transport Layer Security Protocol Version 1.3, 2026** is the current TLS 1.3 specification for securing HTTPS update sessions.

The architectural caveat is that **RFC 2136 and HTTP-based DDNS APIs are not interchangeable protocols**. RFC 2136 standardizes direct DNS update transactions. Provider APIs standardize only as far as HTTP, authentication, and TLS are concerned; URI structure, parameters, response bodies, and account policies remain service-specific.

## Practical Examples and Evidence

Assume a Linux edge host whose publishable IPv4 address is `203.0.113.10`. A diagnostic run might show:

```text
Cached IP: 203.0.113.10
Checking interface wan0
Detected IPv4 address: 203.0.113.10
No IP change detected
Update suppressed
```

That is not a provider failure. It means the client reached its decision point and concluded that `current == previous`.

A forced diagnostic run follows a different branch:

```text
Detected IPv4 address: 203.0.113.10
Forced update requested
Connecting to update.ddns.example:443
TLS certificate validation successful
HTTP request sent
HTTP 200 received
Provider response: good 203.0.113.10
Cache updated
```

This proves provider name resolution, outbound routing, TCP connectivity, TLS negotiation, certificate validation, authentication acceptance, request formatting, and provider-side processing.

A generic Inadyn-style configuration expresses the same architecture without depending on a commercial service:

```conf
iface = wan0

custom update.ddns.example {
    username = "ddns-user"
    password = "secret-from-protected-store"
    hostname = "edge.example.net"
    ddns-server = update.ddns.example
    ddns-path = "/nic/update?hostname=%h&myip=%i"
    ssl = true
}
```

Troubleshooting should compare three independent states: the address configured on the WAN interface, the address remembered by the DDNS client, and the address currently published in DNS. If the interface changed but the client cache did not, investigate address discovery or event triggering. If the client detects the new address but the provider rejects it, investigate transport, credentials, policy, or request syntax. If the provider accepts the update but recursive resolvers still return the old record, investigate authoritative state, TTLs, and caching.

## Key Technical Insights

- **A successful forced update does not validate automatic triggering.** It validates the publication path after the change-detection gate.
- **“No change” is a state decision, not a network error.** Suppressing a redundant request can be correct behavior.
- **The address source is part of the control plane.** A wrong interface, internal address, link-local address, or stale discovery service can feed bad input into otherwise correct logic.
- **Local cache and authoritative DNS can diverge.** Out-of-band provider changes may not be noticed by a client that only compares against its own last successful state.
- **Rate limiting is a design constraint.** Change-based suppression reduces unnecessary updates and avoids provider throttling.
- **Multi-WAN designs increase complexity.** Address discovery and trigger events must follow the interface that owns the advertised egress identity.
- **Debug output can expose secrets.** Authorization headers, tokens, and generated configuration files require redaction.

## Prevention Strategies and Takeaways

- Bind each DDNS instance to a verifiable address source when multiple WANs, tunnels, or policy-routing domains exist.
- Persist the last successfully published address and update that cache only after confirmed provider success.
- Trigger reevaluation on interface address acquisition, DHCP or PPP lease changes, failover transitions, and configuration changes.
- Use periodic reconciliation as a safety net, but avoid aggressive forced updates that may trigger rate limits.
- Validate automatic behavior separately from forced behavior. Test the real address-change event rather than merely editing the remote DNS record.
- Protect credentials in configuration files, process arguments, logs, and support bundles. When HTTP Basic authentication is used, require TLS and avoid logging the `Authorization` header.
- Troubleshoot in layers: verify address discovery, decision logic, provider transport and authentication, authoritative DNS state, then recursive cache behavior.

Dynamic DNS is fundamentally a **state-synchronization system**, not merely an HTTP request or DNS write. Reliable operation depends on accurate address discovery, correct event generation, disciplined comparison with prior state, authenticated publication, and independent verification that authoritative DNS reflects the intended edge address.
