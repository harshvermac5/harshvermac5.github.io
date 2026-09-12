---
layout: post
title: "LACP Link Aggregation, ARP Identity, and Duplicate-IP Detection"
date: 2026-09-12 04:28:00 +0530
description: "How IEEE link aggregation interacts with MAC learning and ARP, why bonded hosts can trigger duplicate-IP alarms, and how to distinguish benign observations from genuine Layer-2 faults."
tags: [lacp, link-aggregation, arp]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A host with multiple Ethernet interfaces can combine them into one logical link for resilience and aggregate throughput. The architectural requirement is that upper layers treat that aggregation as one attachment, even though frames may traverse different physical ports. This creates an important monitoring problem: a device that correlates an IPv4 address with physical ports or source MAC observations can mistake legitimate link aggregation for duplicate address use.

The originating example describes port trunking as [“allows you to combine multiple LAN interfaces for increased bandwidth and load balancing for multiple clients”](https://www.qnap.com/en/how-to/tutorial/article/set-port-trunking-on-your-qnap-nas-to-increase-the-bandwidth-via-802-3ad-protocol). That is the practical symptom, but the deeper principle is the boundary between **logical interface identity**, **LACP member-port identity**, **bridge MAC learning**, and **ARP-based IPv4 identity**.

The objective is to understand why a correctly formed Link Aggregation Group, or **LAG**, should behave as a single logical link; why a monitor can still report multiple devices using one IP; and which observations prove a benign heuristic mismatch versus an actual LAG configuration failure.

## Co-Technical Subject

**Ethernet Link Aggregation, LACP State, MAC Forwarding Databases, and IPv4 Address Conflict Detection**

## Theoretical Foundation

The historical **IEEE 802.3ad-2000** amendment defined Ethernet link aggregation. Its function was later moved into the MAC-independent **IEEE 802.1AX** family. The current base standard is [IEEE 802.1AX-2020](https://standards.ieee.org/ieee/802.1AX/6768/), which defines a LAG so that a MAC client can treat multiple parallel point-to-point links as a single link. IEEE summarizes the design as allowing parallel links to be [“used as if they were a single link”](https://standards.ieee.org/ieee/802.1AX/6768/).

This distinction matters: **link aggregation** is the architecture; **LACP** is the control protocol used to discover compatible partners and maintain operational state. Static aggregation can exist without LACP.

At Layer 3, IPv4 uses **ARP** to map an IP address to a link-layer address. [RFC 826](https://www.rfc-editor.org/info/rfc826/) defines the base Address Resolution Protocol. [RFC 5227](https://www.rfc-editor.org/info/rfc5227/) extends the model with IPv4 Address Conflict Detection, including ARP Probes, Announcements, and ongoing conflict detection. A conflict detector therefore reasons from observations such as “the same sender protocol address appeared with an unexpected sender hardware address.” It does not inherently understand that several physical links may belong to one logical host attachment.

At the switching layer, [IEEE 802.1Q-2022](https://standards.ieee.org/ieee/802.1Q/10323/) defines bridge and VLAN behavior, including the MAC-service model on which forwarding database learning is based. A correctly configured switch should treat member links of a LAG as one logical forwarding construct rather than unrelated access paths.

## Mechanism Breakdown

LACP operates between two systems called the **Actor** and **Partner**. Each candidate aggregation port exchanges **LACPDUs** containing system identity, system priority, operational key, port identity, port priority, and state information. The operational key is central: ports can aggregate only when their characteristics and administrative intent are compatible.

A receive state machine processes partner information. Periodic and transmit logic sends LACPDUs. Selection logic determines which aggregator a port may join. The multiplexer, or **MUX**, controls whether the port is attached and whether it may **Collect** inbound traffic and **Distribute** outbound traffic.

Operational state includes concepts such as **Activity**, **Timeout**, **Aggregation**, **Synchronization**, **Collecting**, **Distributing**, **Defaulted**, and **Expired**. A physical link can be electrically up while still unusable because LACP has not synchronized it into the active aggregator.

Common LACP timer behavior uses a fast periodic interval of approximately **1 second** and a slow interval of approximately **30 seconds**. Loss detection typically follows three missed periods, producing roughly **3-second** short and **90-second** long timeout behavior. The Linux bonding implementation documents these values for standards-oriented `802.3ad` mode in the [kernel bonding documentation](https://docs.kernel.org/networking/bonding.html).

Once synchronized, frame distribution is generally hash-based. A system may hash Layer-2 addresses, Layer-2 plus Layer-3 fields, or other conversation identifiers. The critical property is conversation consistency: frames from one conversation should not be distributed in a way that creates unacceptable reordering. A two-member 1 Gb/s LAG can therefore provide roughly 2 Gb/s across multiple conversations while one flow usually remains bounded by one member.

For IPv4, the IP address should normally be assigned to the **logical bonded interface**, not independently configured on each physical member. The bond presents the host’s Layer-3 identity; member interfaces provide transport underneath it.

## Industry Standards Reference

- [IEEE 802.3ad-2000](https://standards.ieee.org/ieee/802.3ad/1088/) — the original Ethernet link-aggregation amendment, published in 2000 and now superseded.
- [IEEE 802.1AX-2008](https://standards.ieee.org/ieee/802.1AX/4176/) — the first standalone MAC-independent Link Aggregation standard, published in 2008.
- [IEEE 802.1AX-2020](https://standards.ieee.org/ieee/802.1AX/6768/) — the active base Link Aggregation standard, published in 2020.
- [IEEE 802.1Q-2022](https://standards.ieee.org/ieee/802.1Q/10323/) — Bridges and Bridged Networks, including VLAN and MAC-service behavior, published in 2022.
- [RFC 826](https://www.rfc-editor.org/info/rfc826/) — Ethernet Address Resolution Protocol, published in 1982.
- [RFC 5227](https://www.rfc-editor.org/info/rfc5227/) — IPv4 Address Conflict Detection, published in 2008 and updating RFC 826 behavior for probing and conflict handling.

## Practical Examples and Evidence

On a Linux host, a standards-oriented bond can be created with dynamic aggregation and a Layer-2/Layer-3 transmit hash:

```bash
ip link add bond0 type bond mode 802.3ad
ip link set bond0 type bond lacp_rate fast xmit_hash_policy layer2+3
ip link set eth0 master bond0
ip link set eth1 master bond0
ip addr add 10.35.1.2/24 dev bond0
ip link set bond0 up
```

The IP belongs to `bond0`; it should not be separately assigned to `eth0` and `eth1`.

Inspect negotiated state with:

```bash
cat /proc/net/bonding/bond0
```

Evidence of a healthy LAG includes the expected bonding mode, one active aggregator, both intended members participating, matching partner system information, and synchronized collecting/distributing state.

Check the Layer-3 neighbor relationship from another host:

```bash
ip neigh show 10.35.1.2
arping -I eth0 10.35.1.2
```

Capture ARP traffic when duplicate-address alarms appear:

```bash
tcpdump -eni any arp and host 10.35.1.2
```

A stable source hardware address for the bonded IP strongly supports a single logical host identity. If the same IP is repeatedly advertised by two unrelated source MAC addresses, investigate a real address conflict, an unusual bonding mode, virtualization behavior, clustering, or misconfiguration.

On a bridge-capable Linux switch or test system, inspect the forwarding database:

```bash
bridge fdb show | grep -i 'aa:bb:cc:dd:ee:ff'
```

If the same host MAC continually moves between two **independent** physical switch ports, that is MAC flapping. If those ports are legitimate members of one logical LAG, the control plane should interpret the attachment through the aggregate rather than as two competing paths.

## Key Technical Insights

- **LACP does not create multiple Layer-3 hosts.** Its purpose is to make several physical links usable as one logical link.
- **A duplicate-IP alarm is an inference, not proof.** The detector may correlate IP addresses with MAC addresses, switch ports, ARP observations, DHCP state, or a mixture of those signals.
- **One IP with two unrelated source MAC addresses is materially different from one MAC arriving over two synchronized LAG members.** The former suggests competing Layer-3 identities; the latter may be normal aggregation if the observer lacks LAG awareness.
- **MAC flapping is a strong indicator of a broken aggregation boundary.** Typical causes include configuring only one side as a LAG, placing members in different logical aggregates, mismatched VLAN treatment, or connecting members to independent switches without a multi-chassis aggregation technology.
- **Aggregate bandwidth is not single-flow bandwidth.** Hash-based distribution increases parallel capacity and resilience, not necessarily throughput for one TCP session.
- **Physical link-up is insufficient evidence.** LACP synchronization and Collecting/Distributing state determine whether a member is operationally forwarding as part of the aggregate.

## Prevention Strategies and Takeaways

- Configure aggregation consistently on both endpoints and verify that all intended members join the same operational aggregator.
- Assign IPv4 addressing to the logical bond or team interface rather than duplicating the address independently on member NICs.
- Keep member links compatible in speed, duplex, VLAN handling, MTU, and aggregation policy.
- When a duplicate-IP warning appears, correlate **ARP captures**, **neighbor-cache entries**, **bond/LACP state**, and the **switch forwarding database** before concluding that a rogue DHCP server or duplicate static address exists.
- Treat changing IP-to-MAC mappings as higher-risk evidence than the same logical host appearing through multiple synchronized aggregation members.
- If monitoring software raises alarms on an otherwise healthy LAG, determine whether its detection logic is LAG-aware. Suppressing an alert is appropriate only after proving stable Layer-3 identity and correct aggregation state.

The decisive troubleshooting principle is to identify the abstraction boundary. A healthy LAG hides physical path diversity beneath one logical attachment. If Layer-2 and Layer-3 evidence remains consistent at that boundary, multiple active cables are expected. If identity changes across those paths, the issue is no longer cosmetic: the aggregation, host configuration, or address ownership model requires investigation.
