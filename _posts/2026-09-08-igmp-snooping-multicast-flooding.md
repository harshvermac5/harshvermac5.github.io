---
layout: post
title: "IGMP Snooping, Querier Election, and Multicast Flooding"
date: 2026-09-08 01:08:00 +0530
description: "A standards-based analysis of how IGMP snooping builds multicast forwarding state, how querier election sustains that state, and why failures cause Layer 2 multicast flooding."
tags: [multicast, igmp, switching]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Ethernet switches normally have no Layer 3 knowledge of which hosts want a particular IPv4 multicast stream. Without multicast-aware filtering, a bridge can replicate multicast frames across forwarding ports much like unknown traffic. **IGMP snooping** changes this behavior by observing Internet Group Management Protocol control traffic and building Layer 2 forwarding state for multicast groups.

The core engineering problem is understanding why a network can have IGMP snooping enabled yet still flood multicast traffic. The answer usually lies in the separation between **snooping**, **querier operation**, **membership state**, and **unknown multicast forwarding policy**. A switch reporting itself as a non-querier is not inherently unhealthy; it may simply be observing the elected querier elsewhere on the subnet.

## Co-Technical Subject

**Layer 2 multicast forwarding with IGMPv3 group-management state and querier election.**

IGMP operates between IPv4 hosts and multicast routers, while snooping bridges inspect those messages to derive per-port forwarding decisions.

## Theoretical Foundation

The active bridging baseline is **IEEE Std 802.1Q-2022, Bridges and Bridged Networks**, which defines MAC bridging and VLAN operation. IEEE identifies it as the active standard governing how the MAC service is supported by bridged networks. At the IP multicast layer, the current IGMPv3 specification is **RFC 9776, Internet Standard STD 100, March 2025**. RFC 9776 obsoletes RFC 3376 and updates IGMPv2 behavior defined by RFC 2236.

IGMP snooping itself is documented by **RFC 4541, May 2006**, an Informational RFC containing implementation recommendations rather than an Internet Standard. Its motivation is explicit: ["significant bandwidth can be wasted by flooding"](https://www.rfc-editor.org/rfc/rfc4541.html). Snooping therefore optimizes Layer 2 delivery by mapping observed receiver interest to bridge ports.

RFC 9776 defines the control-plane behavior that snooping devices observe. It states that ["IGMPv3 elects a single querier per subnet"](https://www.rfc-editor.org/rfc/rfc9776.html#section-6.6.2). Election is based on source IPv4 address: when a multicast router receives a General Query from a lower address, it stops acting as querier and starts an Other-Querier-Present timer.

This distinction is critical. **The querier maintains membership freshness; the snooping bridge consumes that membership signaling to build forwarding state.** A device can snoop successfully while remaining a non-querier.

## Mechanism Breakdown

A healthy IGMP-snooped VLAN converges through a repeating control-plane cycle.

- The elected querier periodically sends **General Query** messages. RFC 9776 defines a default **Query Interval** of 125 seconds and a default **Robustness Variable** of 2.
- Hosts that want multicast reception maintain interface-level group state. When queried, they send membership reports within the advertised response window rather than all replying simultaneously.
- IGMPv3 membership reports are sent to `224.0.0.22`. Reports can express **INCLUDE** or **EXCLUDE** source-filtering state, allowing Source-Specific Multicast behavior as well as traditional Any-Source Multicast.
- A snooping bridge inspects these reports and associates the multicast group with the ingress port on which receiver interest was observed.
- The bridge separately identifies **multicast-router ports**, commonly by observing IGMP Queries arriving from those ports. RFC 4541 recommends maintaining this router-port knowledge because reports and multicast data must be delivered appropriately toward multicast-routing functions.
- Data for a registered multicast group is forwarded only toward interested receiver ports plus required multicast-router ports, rather than indiscriminately across the VLAN.

Querier election is timer driven. When a router hears a General Query from a lower IPv4 address, it yields. The **Other Querier Present Interval** is:

```text
Other Querier Present Interval =
(Robustness Variable x Query Interval) +
(0.5 x Query Response Interval)
```

With the RFC 9776 defaults of Robustness Variable `2`, Query Interval `125 s`, and Query Response Interval `10 s`, the interval is `255 s`. A non-querier therefore does not immediately take over if a few Queries are missed. It waits for the timer to expire before beginning General Queries itself.

Receiver departure follows a different path. When group state may have changed, the querier can send **Group Specific Queries** or IGMPv3 **Group-and-Source Specific Queries**. The default **Last Member Query Interval** is 1 second, while the **Last Member Query Count** defaults to the Robustness Variable. This creates a short verification window before forwarding state is pruned.

Snooping state must also age independently. RFC 4541 warns that a switch must not rely exclusively on Leave messages because receivers can disappear without transmitting a clean leave. Periodic queries and membership timers are therefore fundamental to correct pruning.

## Industry Standards Reference

- **IEEE Std 802.1Q-2022** — active standard for Bridges and Bridged Networks. It defines the underlying VLAN-aware bridging architecture on which multicast filtering operates. The IEEE description states that it ["specifies how the Media Access Control (MAC) Service is supported by Bridged Networks"](https://standards.ieee.org/ieee/802.1Q/10323/).
- **RFC 9776, March 2025, STD 100** — current Internet Standard for IGMPv3. It defines membership reports, source filtering, querier election, protocol timers, compatibility behavior, and multicast-router state.
- **RFC 4541, May 2006** — Informational recommendations for IGMP and MLD snooping switches. It separates snooping behavior into IGMP control forwarding and multicast data forwarding considerations.
- **RFC 4604, August 2006** — IGMPv3 and MLDv2 requirements for Source-Specific Multicast.

## Practical Examples and Evidence

The most useful diagnostic evidence is packet-level proof that Queries are present, Reports are returning, and multicast data forwarding corresponds to receiver state.

On a Linux observation point or mirrored switch port, capture IGMP and multicast IPv4 traffic:

```bash
sudo tcpdump -ni eth0 'igmp or (ip multicast)'
```

A healthy exchange may resemble:

```text
10.30.0.1 > 224.0.0.1: igmp query v3
10.30.0.44 > 224.0.0.22: igmp v3 report, group 239.20.30.40
10.30.0.50 > 239.20.30.40: UDP, length 1316
```

The evidence should be interpreted causally:

- General Queries prove that an active querier is refreshing group membership on the VLAN.
- Membership Reports prove that receivers are expressing interest and that a snooping bridge has control traffic available to learn from.
- Multicast data arriving only on receiver-facing ports demonstrates that forwarding state is being enforced.
- Multicast data appearing on unrelated access ports indicates either missing group state, unknown-multicast flooding policy, incorrect router-port classification, implementation limitations, or stale state after topology change.

Compare a working and affected segment using the same group. If both see Queries but only one sees receiver Reports, the failure is downstream of the querier. If neither is visible, investigate VLAN continuity, filtering, topology, or control-plane forwarding first.

## Key Technical Insights

- **Non-querier status is normally expected.** Only one querier should win per subnet. Multiple snooping switches can legitimately report non-querier while learning from the same router or Layer 3 interface.
- **Snooping configuration is not proof of snooping state.** The operational question is whether group-to-port entries exist and are refreshed by observed Reports.
- **Unknown multicast flooding can be standards-consistent.** RFC 4541 requires unregistered multicast to reach multicast-router ports and permits implementations to flood unregistered traffic more broadly. Flooding does not automatically prove that IGMP processing is disabled.
- **Missing Queries eventually destroys useful state.** Without periodic General Queries, receiver memberships age out and streams can revert to unknown-multicast behavior.
- **Topology changes matter.** RFC 4541 recommends that snooping switches account for spanning-tree changes because a forwarding-path change can invalidate learned multicast-port state and delay convergence.
- **Version compatibility matters.** IGMPv3 networks may fall back when older-version Queries are observed. A device that only partially understands IGMPv3 reports can mis-handle source-filtered membership and either over-forward or incorrectly prune traffic.

## Prevention Strategies and Takeaways

- Ensure every multicast-enabled VLAN has a stable, reachable IGMP querier, even when no multicast routing protocol is otherwise required on that segment.
- Treat the querier and the snooping function as separate control-plane roles. Do not diagnose a switch as faulty merely because it is a non-querier.
- Validate operation with packet captures and forwarding-state inspection rather than configuration screenshots alone.
- Confirm that General Queries reach every relevant Layer 2 segment and that Membership Reports return from receiver ports.
- Compare unknown-multicast policy with registered-group forwarding behavior before concluding that all flooding is a snooping failure.
- Keep IGMP versions and source-filtering capabilities consistent across the switching path, especially for IGMPv3 and SSM deployments.
- After spanning-tree, uplink, or VLAN topology changes, verify that multicast-router ports and membership entries reconverge correctly.
- Use timer tuning only after control-plane correctness is proven. Shorter timers may improve convergence but increase protocol traffic and sensitivity to loss; larger robustness values tolerate loss but increase leave latency.

The decisive troubleshooting principle is to **prove the entire membership lifecycle**: identify the querier, observe Queries, confirm Reports, verify group-to-port state, and validate data-plane pruning. Multicast flooding usually reflects missing or untrusted forwarding state, not merely a disabled feature toggle.
