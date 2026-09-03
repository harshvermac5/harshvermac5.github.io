---
layout: post
title: "IPsec Phase 2 Traffic Selectors and Partial Tunnel Failures"
date: 2026-09-03 14:32:00 +0530
description: "Why an IPsec tunnel can remain established while one subnet pair fails because routing state and negotiated traffic selectors are separate control-plane objects."
tags: [ipsec, ike, vpn]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

An IPsec VPN can appear healthy while traffic for one protected subnet silently fails. The core principle is that **tunnel reachability, routing, IKE state, and IPsec traffic selectors are separate pieces of state**. A route toward a remote prefix does not prove that an IPsec Security Association exists for that prefix, and an established IKE session does not prove that every intended subnet pair has a usable Phase 2 SA.

This distinction matters most in multi-subnet site-to-site VPNs, where one selector pair can remain healthy while another disappears.

The diagnostic objective is therefore to verify the complete chain: **route → security policy → negotiated selector → installed SA → encrypted traffic**.

## Co-Technical Subject

**IPsec Security Association and Traffic Selector Negotiation**

The topic spans the IPsec Security Policy Database, IKEv1 Quick Mode, IKEv2 Child SAs, route-based VPNs, and Linux XFRM state.

## Theoretical Foundation

The architectural foundation is **RFC 4301, Security Architecture for the Internet Protocol, December 2005**. IPsec does not protect traffic merely because a route points toward a tunnel. RFC 4301 defines a **Security Policy Database (SPD)** whose selectors determine whether a packet is protected, bypassed, or discarded. The specification states that ["packets are selected for one of three processing actions"](https://www.rfc-editor.org/rfc/rfc4301.html): **PROTECT**, **BYPASS**, or **DISCARD**.

An SPD entry can match local and remote address ranges, upper-layer protocol, and ports. These selectors define the granularity of the SAs that protect traffic. The corresponding cryptographic state is stored in the **Security Association Database (SAD)**.

For legacy IKEv1, **RFC 2409, The Internet Key Exchange, November 1998**, defines Phase 2 **Quick Mode**. The RFC describes Quick Mode as ["used as part of the SA negotiation process (phase 2)"](https://www.rfc-editor.org/rfc/rfc2409.html). The IPsec identities used during IKEv1 negotiation are defined by **RFC 2407, November 1998**, including `ID_IPV4_ADDR_SUBNET` for subnet selectors.

IKEv2 modernizes this model. **RFC 7296, Internet Key Exchange Protocol Version 2, October 2014**, uses **TSi** and **TSr** payloads to express the traffic protected by a Child SA. RFC 7296 states that ["Traffic Selector (TS) payloads allow endpoints to communicate some of the information from their SPD to their peers"](https://www.rfc-editor.org/rfc/rfc7296.html).

IKEv1 remains common in legacy interoperability scenarios, but it is no longer recommended for new deployments. **RFC 9395, April 2023** formally deprecated IKEv1 and moved RFCs 2407, 2408, and 2409 to Historic status. Its guidance is explicit: ["systems running IKEv1 should be upgraded and reconfigured to run IKEv2"](https://www.rfc-editor.org/rfc/rfc9395.html).

## Mechanism Breakdown

A multi-subnet site-to-site VPN contains several independent state machines and databases.

- **Routing** decides where plaintext traffic should be forwarded. A route can point a destination prefix toward a VTI, XFRM interface, tunnel interface, or next hop.
- **Security policy** determines whether that traffic must use IPsec and which selectors describe the protected flow.
- **IKE** negotiates cryptographic parameters and the identities or traffic selectors that both peers agree to protect.
- **SAD/XFRM state** contains the installed ESP SAs used for actual packet encryption and decryption.

In IKEv1, Phase 1 establishes the ISAKMP/IKE SA between the two peers. Phase 2 then runs Quick Mode to negotiate one or more IPsec SAs. A healthy Phase 1 therefore says only that the peers can authenticate and exchange protected IKE messages. It says nothing about whether every subnet pair has completed Quick Mode.

Consider one local prefix and two remote prefixes:

```text
Local:    172.16.100.0/24
Remote A: 10.10.0.0/16
Remote B: 10.20.0.0/16
```

The peer may successfully negotiate only:

```text
172.16.100.0/24 <-> 10.10.0.0/16
```

while never negotiating:

```text
172.16.100.0/24 <-> 10.20.0.0/16
```

The IKE session remains established, ESP counters may continue increasing for Remote A, and monitoring may report the VPN as healthy. Remote B still fails because no matching IPsec SA exists.

A subtle design issue appears with **route-based VPNs**. “Route-based” is an implementation architecture rather than a different IPsec protocol. RFC 4301 remains policy-driven underneath. Some platforms use broad selectors such as `0.0.0.0/0 <-> 0.0.0.0/0`, then use routes and interface identifiers to steer traffic. Others negotiate narrow selectors while still presenting a routed tunnel interface.

A configured **remote network list** may create routes, SPD entries, IKE selectors, or some combination of them. A management-plane prefix is therefore not automatically equivalent to an IKE selector.

If only one peer initiates a narrow selector, the other gateway may never recreate that SA when the initiator stops proposing it, even though routing still contains the remote prefix.

## Industry Standards Reference

The standards that govern this behavior are:

- **RFC 4301 — Security Architecture for the Internet Protocol, 2005.** Defines SPD, SAD, selectors, and packet processing for IPsec.
- **RFC 7296 — Internet Key Exchange Protocol Version 2, 2014.** Defines IKEv2, Child SAs, and TSi/TSr traffic-selector negotiation.
- **RFC 2409 — The Internet Key Exchange, 1998.** Defines IKEv1 Phase 1 and Quick Mode Phase 2; now Historic.
- **RFC 2407 — IP Security Domain of Interpretation for ISAKMP, 1998.** Defines IKEv1 IPsec identification types such as IPv4 subnet identities; now Historic.
- **RFC 9395 — Deprecation of IKEv1, 2023.** Moves the IKEv1 RFC set to Historic status and recommends migration to IKEv2.

For new designs, use **IKEv2** unless a legacy interoperability constraint requires IKEv1.

## Practical Examples and Evidence

On Linux, `ip route` proves routing state but not IPsec protection:

```bash
ip route show 10.20.0.0/16
```

A route may exist:

```text
10.20.0.0/16 dev xfrm0 scope link
```

Now inspect the actual IPsec policy:

```bash
ip xfrm policy
```

A healthy selector might appear as:

```text
src 172.16.100.0/24 dst 10.10.0.0/16
    dir out priority 100
    tmpl src 198.51.100.10 dst 203.0.113.20
    proto esp mode tunnel
```

If there is no equivalent policy for `10.20.0.0/16`, the route alone is insufficient.

Inspect installed ESP state as well:

```bash
ip xfrm state
```

The presence of state for Remote A but not Remote B strongly localizes the failure to policy or SA negotiation rather than ordinary IP routing.

For IKEv1, daemon logs should be searched for Quick Mode activity involving the missing subnet. A conceptual successful exchange looks like:

```text
received QUICK_MODE request
IDci: 10.20.0.0/16
IDcr: 172.16.100.0/24
proposal accepted
IPsec SA installed
```

Absence of any proposal for the subnet is materially different from an explicit rejection. Messages such as `NO_PROPOSAL_CHOSEN`, identity mismatch, or unacceptable selector indicate negotiation occurred and failed. No matching Quick Mode or TS messages indicate that the selector may never have been proposed.

## Key Technical Insights

- **“Tunnel up” is not a complete health signal.** IKE liveness and per-selector IPsec state must be monitored separately.
- **A route is not a Security Association.** The FIB answers where traffic should go; the SPD/SAD determine whether IPsec can actually protect it.
- **Multi-subnet tunnels can fail partially.** One selector pair can remain healthy while another disappears.
- **Initiation behavior matters.** If only one peer generates a particular selector, the tunnel depends on that peer continuing to initiate or rekey it.
- **No proposal and rejected proposal are different failure classes.** Search IKE logs for evidence of the missing selector before changing firewall policy.
- **Route-based does not mean selector-free.** Implementations may hide selector behavior behind a virtual interface, broad traffic selectors, policy marks, or generated SPD entries.
- **Firewall evidence must be placed in packet-processing order.** If the required IPsec policy or SA does not exist, changing a later-stage firewall rule cannot create it.

## Prevention Strategies and Takeaways

- Prefer **IKEv2** for new deployments and migrations.
- Explicitly document every intended local/remote selector pair, even when the platform presents a route-based abstraction.
- Verify how each implementation maps configured remote prefixes into **routes, SPD entries, and IKE traffic selectors**.
- Monitor per-Child-SA or per-Phase-2 state instead of relying only on peer-level tunnel status.
- During troubleshooting, compare `ip route`, `ip xfrm policy`, `ip xfrm state`, IKE negotiation logs, and ESP counters.
- Treat a missing selector as an IKE/SPD problem until evidence shows that the selector is installed and traffic reaches a later firewall stage.
- When interoperating across different implementations, test tunnel recovery after peer restarts, rekeys, configuration reloads, and loss of individual SAs.

The durable lesson is simple: **IPsec connectivity is established per security policy and SA, not merely per peer**. A VPN can be cryptographically alive yet operationally incomplete. The fastest path to root cause is to inspect the exact selector state that protects the failing traffic.
