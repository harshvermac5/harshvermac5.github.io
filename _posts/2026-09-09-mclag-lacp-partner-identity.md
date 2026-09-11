---
layout: post
title: "Why LACP Fails Across Independent Chassis: MC-LAG Partner Identity and STP Interaction"
date: 2026-09-09 21:28:00 +0530
description: "A deep technical analysis of how LACP partner identity, multi-chassis aggregation, and spanning tree interact when one logical bundle spans independent switches."
tags: [lacp, mclag, stp]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A link aggregation group is only stable when every selected member represents the same logical attachment between two LACP systems. A common design failure appears when one side is a true multi-chassis aggregation pair, while the opposite side consists of two independent switches that are not participating in a shared multi-chassis LAG domain.

The physical topology may look symmetrical, but logical symmetry exists only when both switch pairs coordinate aggregation state and present consistent LACP identity. If one side places all links into one aggregator while the opposite side presents different partner identities, LACP excludes or churns mismatched members. STP can then appear guilty because its port states change after the aggregate changes.

The objective is to understand **why LACP System ID consistency is fundamental to multi-chassis designs** and how to separate LACP-driven churn from STP-driven convergence.

## Co-Technical Subject

**Ethernet Link Aggregation, Multi-Chassis LAG, LACP Partner Selection, and RSTP Convergence**

## Theoretical Foundation

The current standards foundation for Ethernet link aggregation is **IEEE 802.1AX-2020, Link Aggregation**. IEEE describes the purpose of aggregation as allowing ["parallel point-to-point links to be used as if they were a single link"](https://standards.ieee.org/ieee/802.1AX/6768/). The standard is MAC-independent and defines the control behavior required to combine multiple physical links into one logical service.

LACP originated in **IEEE 802.3ad-2000** and later moved into the IEEE 802.1 family. **IEEE/ISO/IEC 8802-1AX-2021** is the international adoption of IEEE 802.1AX-2020.

Bridging and spanning tree behavior are governed by **IEEE 802.1Q-2022**. IEEE states that it covers ["the operation of MAC Bridges and VLAN Bridges, including management, protocols, and algorithms"](https://standards.ieee.org/ieee/802.1Q/10323/). RSTP functionality historically associated with IEEE 802.1D is now incorporated into the 802.1Q bridge architecture.

The essential design rule is simple: an aggregator is not merely a collection of ports with matching configuration. It is a set of links whose LACP information proves that they connect the same two logical systems with compatible operational keys.

## Mechanism Breakdown

LACP uses Ethernet Slow Protocol EtherType **0x8809**, subtype **0x01**, and multicast destination **01:80:C2:00:00:02**. Each LACPDU advertises actor and learned partner information.

Important actor and partner attributes include:

- **System Priority** and **System ID**, where the System ID is normally derived from a MAC address and identifies the logical LACP system.
- **Key**, which identifies ports that are eligible to participate in the same aggregator.
- **Port Priority** and **Port Number**, which identify the individual member.
- State flags such as **Activity**, **Timeout**, **Aggregation**, **Synchronization**, **Collecting**, **Distributing**, **Defaulted**, and **Expired**.

The receive state machine learns partner information on each physical link; selection logic then determines which links can join one aggregator. Matching VLANs or physical proximity is irrelevant if learned partner information is incompatible.

A true multi-chassis pair can advertise one coordinated System ID and compatible Key across both chassis, so a peer may legitimately select links terminating on either chassis into one logical bundle. Reverse the topology and the requirement still applies: if four upstream members terminate on two independent downstream switches, some links advertise **System ID A** and others **System ID B**. If one downstream switch is not running LACP, those links may provide no usable partner state at all. One aggregator cannot treat those links as one partner.

Typical results are:

- Members with an incompatible System ID remain unselected.
- Ports oscillate between selected and unselected states as partner information changes.
- The aggregate temporarily loses synchronized members and is declared unavailable until valid members return.

LACP **active** versus **passive** controls who initiates negotiation. At least one side must be active. This does not solve a partner-identity mismatch. Short versus long timeout behavior changes failure-detection speed, not aggregator eligibility.

The LACP multiplexer state machine controls whether a member is synchronized, collecting, and distributing. Invalid partner information can stop forwarding while physical carrier remains up: **Layer-1 link-up does not imply active LAG membership at Layer 2**.

## Industry Standards Reference

The primary authoritative references are:

- **IEEE 802.1AX-2020**, *IEEE Standard for Local and Metropolitan Area Networks—Link Aggregation*, published 2020. This is the principal standard for LACP and MAC-independent link aggregation.
- **IEEE/ISO/IEC 8802-1AX-2021**, the international adoption of IEEE 802.1AX-2020, published 2021.
- **IEEE 802.1Q-2022**, *Bridges and Bridged Networks*, published 2022. This defines modern bridge behavior, VLAN operation, and spanning-tree algorithms including RSTP functionality.
- **IEEE 802.3ad-2000**, the historical Ethernet amendment in which LACP was originally standardized before migration to IEEE 802.1AX.

The architectural principle is that physical redundancy becomes one logical forwarding object only when the control plane presents consistent shared identity and state.

## Practical Examples and Evidence

The following topology is valid only if the two switches on each side participate in a coordinated multi-chassis aggregation domain:

```text
        Logical system X
       +--------------+
       | chassis X1   |
       | chassis X2   |
       +--------------+
          \\  |  //
           \\ | //
            \\|//
       +--------------+
       | chassis Y1   |
       | chassis Y2   |
       +--------------+
        Logical system Y
```

If the lower pair is not a shared logical LACP system, one four-member trunk becomes an invalid design assumption:

```text
Aggregator on system X
  member 1 -> independent system Y1
  member 2 -> independent system Y1
  member 3 -> independent system Y2
  member 4 -> independent system Y2

Observed partner identities:
  members 1-2: System ID = Y1
  members 3-4: System ID = Y2
```

A safer architecture is to terminate separate aggregators on each independent chassis and let the bridge control plane provide path redundancy:

```text
logical-aggregate agg10
  members -> system Y1
  lacp mode active

logical-aggregate agg20
  members -> system Y2
  lacp mode active

RSTP/MSTP controls which redundant Layer-2 path forwards.
```

Packet capture can prove the mismatch. On a Linux capture host or mirrored port, inspect Slow Protocol frames:

```bash
tcpdump -ni eth0 -e 'ether proto 0x8809'
```

In Wireshark, use:

```text
lacp
```

or inspect the reserved destination directly:

```text
eth.dst == 01:80:c2:00:00:02
```

Compare **Actor System ID**, **Actor Key**, **Partner System ID**, **Partner Key**, and **Synchronization/Collecting/Distributing** flags across all intended members. Different partner System IDs inside one supposed aggregate prove that the logical topology differs from the cabling diagram.

A representative event sequence may look like this:

```text
LAG member becomes non-active
aggregate loses synchronized members
RSTP forwarding -> discarding
RSTP role designated -> disabled
LACP member becomes synchronized again
RSTP discarding -> learning -> forwarding
```

Ordering matters. If aggregate membership changes first and spanning-tree state follows, STP is reacting. If a stable aggregate is blocked first because of BPDU/root-path logic, STP may be the initiating mechanism.

## Key Technical Insights

- **LACP aggregates logical partners, not merely cables.** Matching speed, VLANs, and port counts are insufficient.
- **System ID consistency is central to MC-LAG.** A multi-chassis pair must coordinate the identity and state exposed to its LACP partner.
- **One-sided MC-LAG does not make both sides multi-chassis capable.** Independent peer switches cannot automatically be treated as one partner.
- **LACP active/passive is a negotiation behavior, not a topology repair mechanism.** It cannot reconcile different partner System IDs or missing aggregation configuration.
- **Physical link state and logical forwarding state are different.** A port may remain electrically up while LACP removes it from Collecting/Distributing state.
- **STP logs can be secondary evidence.** Repeated forwarding, discarding, learning, and role transitions may reflect LAG churn rather than an STP defect.
- **Symmetric configuration matters.** Multi-chassis designs require equivalent aggregation intent, keys, and peer-domain state.

## Prevention Strategies and Takeaways

- Validate the logical topology before cabling: identify which physical switches are expected to present a single LACP system on each side.
- Never place links terminating on independent partner systems into one LACP aggregator unless a standards-compatible multi-chassis mechanism makes those systems appear as one logical partner.
- Confirm **System ID**, **Key**, synchronization, and Collecting/Distributing state on every member rather than relying only on an interface showing `up`.
- Use LACP active on at least one side of every bundle and treat timeout tuning as a convergence choice, not as a fix for identity mismatch.
- Keep RSTP or MSTP enabled when separate Layer-2 paths provide redundancy; spanning tree still protects the wider bridged topology.
- During incident analysis, correlate LACP state transitions, aggregator membership, physical carrier events, and STP transitions by timestamp. This establishes which control plane moved first.
- For active/active connectivity across two chassis on both ends, verify that both switch pairs explicitly support and are configured for multi-chassis aggregation. Redundant cabling alone does not create a multi-chassis LAG.

The general lesson is architectural: **a bundle is valid only when every selected link agrees on who the partner is**. Once that invariant is violated, LACP does exactly what it was designed to do—exclude inconsistent members—and every dependent Layer-2 protocol must reconverge around the resulting topology.
