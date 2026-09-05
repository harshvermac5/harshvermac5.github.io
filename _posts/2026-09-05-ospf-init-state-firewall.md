---
layout: post
title: "Diagnosing OSPF Init State Across Encrypted Overlay Tunnels"
date: 2026-09-05 16:02:00 +0530
description: "How asymmetric OSPF Hello filtering can leave encrypted tunnels healthy while dynamic route exchange silently fails."
tags: [ospf, routing, firewall, wireguard, troubleshooting]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A healthy encrypted tunnel does not prove that the routing control plane running inside that tunnel is healthy. This distinction becomes critical when an overlay uses **OSPFv2** to exchange site prefixes across a point-to-point encrypted interface.

The key diagnostic pattern is an OSPF neighbor stuck in **`Init`**. That state is not a generic adjacency failure. It has a precise meaning: the local router is receiving Hello packets from its peer, but those Hellos do not contain the local router's **Router ID**. In practice, this is strong evidence that Hello communication is asymmetric.

A common cause is control-plane firewalling. A firewall may permit the encrypted tunnel itself while dropping **IP protocol 89** before OSPF packets reach the local routing daemon. The result is deceptively clean: tunnel handshakes succeed, byte counters increment, yet no dynamic site routes appear.

## Co-Technical Subject

The core subject is **OSPF neighbor-state formation across Layer-3 overlay tunnels**, with emphasis on **control-plane firewall policy**, asymmetric Hello exchange, dynamic prefix learning, and the diagnostic meaning of the **`Init`** state.

The same principle applies whether the underlying transport is WireGuard, IPsec VTI, GRE protected by IPsec, or another routed overlay. Encryption provides reachability between tunnel endpoints; OSPF independently establishes a routing adjacency on top of that reachability.

## Theoretical Foundation

OSPFv2 is defined by **RFC 2328, April 1998**. It is a link-state interior gateway protocol in which neighboring routers first establish bidirectional communication, synchronize link-state databases, run the shortest-path-first algorithm, and install resulting routes into the routing information base.

OSPF does not use TCP or UDP. IANA assigns it **IP protocol number 89**. For OSPFv2, **`224.0.0.5`** is the **AllSPFRouters** multicast address. Hello packets are sent to that address on network types that use multicast. **`224.0.0.6`** is **AllDRouters**, used where Designated Router and Backup Designated Router behavior applies.

RFC 2328 gives the **`Init`** state a very specific semantic: a Hello has been received from the neighbor, but bidirectional communication has not yet been proven because the receiving router does not see its own Router ID in the neighbor's Hello packet.

That neighbor-list field is therefore an implicit return-path test. Router A does not merely prove that it can hear Router B. Router A also learns whether Router B has heard Router A.

Once both routers see themselves listed in each other's Hellos, the neighbor relationship reaches **`2-Way`**. On a point-to-point topology, adjacency formation can then progress through **`ExStart`**, **`Exchange`**, **`Loading`**, and finally **`Full`**, where link-state databases are synchronized.

## Mechanism Breakdown

Consider two routers connected by an encrypted Layer-3 overlay. The tunnel endpoints can exchange encrypted packets successfully, so the overlay interface remains up and cryptographic handshakes continue.

OSPF then operates inside that overlay:

- Each router enables OSPF on the tunnel interface.
- Each periodically sends a Hello packet using **IP protocol 89**.
- The receiving router validates parameters such as area, timers, authentication, and network type.
- The receiver records the peer Router ID and moves the neighbor from **`Down`** toward **`Init`**.
- Every Hello contains a list of neighbors from which valid Hellos have already been received.
- When Router A receives a Hello from Router B and sees Router A's own Router ID in B's neighbor list, two-way communication is proven.
- The routers then synchronize database state and exchange LSAs.
- Learned prefixes are installed as OSPF routes and become eligible for forwarding.

Now insert a stateful firewall on Router B between the tunnel-facing security zone and the router's local control plane. If that policy drops protocol 89 from Router A, the encrypted tunnel remains healthy because the firewall is not preventing the tunnel transport itself.

Router A may still receive Router B's Hellos. However, Router B never receives Router A's Hellos, so Router B cannot place Router A's Router ID into its outgoing Hello neighbor list. Router A therefore remains in **`Init`** indefinitely.

This is exactly why **`Init`** is such a high-value troubleshooting signal: it narrows the problem toward asymmetric Hello visibility rather than generic route calculation, SPF failure, or data-plane forwarding.

## Industry Standards Reference

The authoritative behavior comes from **RFC 2328, OSPF Version 2, Standards Track, April 1998**. Section 10 defines the neighbor state machine and states that **`Init`** means a Hello has been seen but bidirectional communication has not been established. Section 9.5 describes Hello processing, including examination of the neighbor list. Appendix A defines **`224.0.0.5`**, **`224.0.0.6`**, and OSPF's use of **IP protocol 89**.

Reference: [RFC 2328 - OSPF Version 2](https://www.rfc-editor.org/rfc/rfc2328)

Protocol-number authority is maintained by IANA. OSPF is registered as **IP protocol 89**, so firewall policy must match an IP protocol number rather than a TCP or UDP port.

Reference: [IANA Protocol Numbers](https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml)

A practical design implication follows directly from the standard: any firewall separating an OSPF-enabled overlay interface from the local routing process must explicitly allow the OSPF control-plane exchange required by that topology.

## Practical Examples and Evidence

A generic FRR configuration for OSPF over a routed tunnel might resemble:

```text
router ospf
 ospf router-id 10.255.255.2
 network 10.20.0.0/24 area 0.0.0.0

interface wg0
 ip ospf area 0.0.0.0
 ip ospf network point-to-point
```

The first command to inspect is the neighbor state:

```bash
show ip ospf neighbor
```

A persistent state resembling this is highly significant:

```text
Neighbor ID     Pri State    Dead Time Address        Interface
10.255.255.1      1 Init/-   00:00:32  10.255.192.1  wg0
```

Packet capture should then verify both directions of protocol 89:

```bash
tcpdump -ni wg0 'ip proto 89'
```

If Hellos arrive from the peer but no locally generated Hellos are visible at the far end, inspect control-plane firewall rules rather than the tunnel encryption state.

A standards-aligned firewall policy should narrowly allow OSPF from the expected tunnel address range to the routing control plane. In pseudo-policy form:

```text
source:      tunnel-prefix
protocol:    89
source-zone: overlay-vpn
destination: local-router
action:      accept
```

After adjacency reaches **`Full`**, verify dynamic routes rather than relying only on tunnel counters:

```bash
ip route show proto ospf
```

The diagnostic evidence behind this learning pattern showed exactly this split. On one side, [`"no OSPF adjacency ever forms"`](https://sfi.uidev.tools/?h=ad35263a) while a local VPN-to-gateway firewall rule accumulated **41,389 dropped packets**. On the peer, [`"OSPF neighbors sit in Init/- on both WireGuard tunnels"`](https://sfi.uidev.tools/?h=946fb6fb), independently demonstrating that Hellos were received in one direction but bidirectional discovery never completed.

The peer-side control-plane firewall showed no corresponding drop, isolating the failure to one side of the adjacency.

## Key Technical Insights

- **Tunnel health and routing health are separate state machines.** A cryptographic handshake proves peer reachability, not successful dynamic route exchange.
- **`Init` is directional evidence.** It means the local router hears the peer, but the peer has not demonstrated that it hears the local router.
- **OSPF uses IP protocol 89, not a transport-layer port.** Port-based ACL reasoning will miss it.
- **Control-plane filtering can fail silently.** Data traffic and tunnel keepalives may continue while routing packets are discarded before the routing daemon receives them.
- **Missing routes can be a downstream symptom.** If OSPF never reaches **`Full`**, the absence of remote prefixes is expected; the route generator may be functioning correctly.
- **Static routes can conceal the real fault.** They may restore connectivity while bypassing the failed routing protocol, making the overlay appear fixed while redundancy and convergence remain broken.
- **Route preference is implementation-specific.** Many platforms prefer static routes over OSPF by default, so temporary static routes should be removed once dynamic adjacency is restored if they would otherwise shadow OSPF-learned paths.
- **Bidirectional packet capture is more valuable than a single interface status.** Comparing Hellos on both tunnel endpoints can distinguish firewall asymmetry from timer mismatch, authentication failure, or database-exchange problems.

## Prevention Strategies and Takeaways

Treat routing protocols over overlays as **control-plane dependencies**, not as incidental tunnel traffic.

- Define explicit firewall policy for routing protocols terminating on the router itself.
- Scope OSPF permits to expected tunnel prefixes and protocol 89 rather than broadly allowing the entire VPN zone.
- Monitor both overlay state and routing adjacency state. A healthy tunnel with no **`Full`** OSPF neighbor should be considered degraded.
- Alert on long-lived **`Init`**, **`ExStart`**, or **`Exchange`** states because each points to a different class of failure.
- Validate learned routes after adjacency formation with the routing table and LSDB, not only with tunnel byte counters.
- Remove temporary static routes after dynamic routing is restored when those routes would override OSPF and defeat path failover.
- When diagnosing asymmetric adjacency, inspect the firewall path from the tunnel interface to the **local routing process**, not only forwarding rules between LAN and VPN zones.

The broader lesson is architectural: an encrypted overlay supplies a secure packet path, while OSPF supplies topology knowledge. When a neighbor is stuck in **`Init`**, the protocol is already telling you that the return control-plane path is missing. Reading that state correctly can turn a vague "VPN is up but routing is broken" incident into a precise investigation of asymmetric Hello delivery.
