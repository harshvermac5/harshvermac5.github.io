---
layout: post
title: "When Auto Is Not Auto-Negotiation: SFP28 Speed Sweeps, FEC, and LAG Failure Modes"
date: 2026-09-15 04:23:00 +0530
description: "A standards-grounded analysis of how 25 GbE pluggable ports can use local speed probing instead of true IEEE auto-negotiation, and why this creates timing-dependent link rates and asymmetric LAG behavior."
tags: [ethernet, sfp28, link-aggregation]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A port configured as **Auto** does not necessarily mean the link is performing IEEE-standard Ethernet auto-negotiation. On high-speed pluggable interfaces, especially ports that can operate at multiple SerDes rates, an implementation may instead cycle through candidate speeds locally until carrier appears. If the device then caches the active speed at the instant the remote receiver becomes usable, link establishment becomes timing-dependent.

The important distinction is between **protocol negotiation** and **local speed detection**. True auto-negotiation exchanges capabilities and resolves a mutually supported mode. A local speed sweep simply tries modes until one produces link, so an electrically healthy 10/25 GbE connection can settle at different rates after reboots or hot-plug events.

## Co-Technical Subject

The primary subject is **25 Gigabit Ethernet PHY initialization and SFP28 link-mode selection**, with related considerations for **Clause 73 auto-negotiation**, **Forward Error Correction**, and **IEEE 802.1AX Link Aggregation**.

The central design question is simple: when both endpoints support 25 Gb/s, what mechanism actually decides that the link should operate at 25 Gb/s?

## Theoretical Foundation

IEEE **802.3by-2016** introduced 25 Gb/s Ethernet PHYs including **25GBASE-CR/CR-S** for twinaxial copper, **25GBASE-KR/KR-S** for electrical backplanes, and **25GBASE-SR** for multimode fiber. Those specifications were later incorporated into the consolidated **IEEE 802.3-2022 Standard for Ethernet**.

For copper-cable and backplane PHYs, **Clause 73 Auto-Negotiation** provides a standards-defined mechanism for peers to exchange capabilities and select compatible operation. An IEEE 802.3 task-force document summarizes the purpose directly: [“Auto-Negotiation provides a device with the capability to detect the abilities ... determine common abilities, and configure for joint operation.”](https://www.ieee802.org/3/df/public/22_12/brown_3df_03c_2212.pdf)

Clause 73 is not a universal negotiation protocol for every optical or pluggable link. IEEE material on optical automatic link configuration explicitly characterizes it as auto-negotiation for **backplane and copper cable PHYs**. A host may therefore use local detection logic when the media path does not use Clause 73 end to end. The UI label **Auto** is an administrative policy, not proof that IEEE capability exchange occurs on the wire.

## Mechanism Breakdown

With true Clause 73 operation, both PHYs participate in a defined state machine. They exchange link codewords containing technology abilities and related capabilities, acknowledge received pages, resolve a common technology, determine FEC behavior where applicable, and then transition the chosen PHY mode toward operational link state.

A simplified standards-oriented sequence looks like this:

- Both endpoints enter auto-negotiation and advertise supported technologies.
- Each endpoint receives the peer's base-page information.
- The common technology set is calculated.
- Priority resolution selects the highest-priority common mode.
- FEC capability and request bits are resolved for the selected 25G PHY.
- The chosen PCS/PMA/PMD path initializes and the link becomes operational.

A **speed sweep** instead uses local trial-and-error logic resembling:

```text
set 25G, autoneg off
wait for carrier
set 10G, autoneg off
wait for carrier
set 1G, autoneg as required
wait for carrier
repeat
```

If the remote endpoint becomes ready while the local side is testing 10 Gb/s, the local state machine may declare success and persist that rate even though both devices are capable of 25 Gb/s. No peer-to-peer arbitration selected 10 Gb/s; the result was simply the first working combination encountered by the detector.

This creates a race between **remote-link readiness** and **local probe phase**. Boot order may correlate with the result without causing it. The same link can establish at 25 Gb/s, drop, and later return at 10 Gb/s if the second event lands in a different sweep phase.

## Forward Error Correction Is a Separate Compatibility Gate

At 25 Gb/s, link speed alone is insufficient. **FEC mode must also be compatible**.

IEEE 802.3 Clause 73 includes FEC-resolution behavior for 25G copper and backplane PHYs. The standard distinguishes requests for **RS-FEC** and **BASE-R FEC**. IEEE task-force material quoting IEEE 802.3-2022 notes that for 25GBASE-KR and 25GBASE-CR, RS-FEC takes precedence when requested; otherwise BASE-R FEC can be selected when requested.

With manual speed rather than end-to-end auto-negotiation, FEC may also need deterministic configuration. A forced 25 Gb/s link with mismatched FEC can fail PCS synchronization even when signal detect is present.

On Linux, the operational state can be inspected with standard tooling:

```bash
ethtool eth0
ethtool --show-fec eth0
```

Where supported by the driver and hardware, deterministic settings can be applied explicitly:

```bash
ethtool -s eth0 speed 25000 duplex full autoneg off
ethtool --set-fec eth0 encoding baser
```

The `ethtool` manual documents both speed/autonegotiation controls and `--show-fec` / `--set-fec`; driver support remains hardware-specific.

## Link Aggregation Implications

A second failure domain appears when links with different settled rates participate in a LAG. IEEE **802.1AX-2020** defines Link Aggregation so multiple full-duplex point-to-point links can be presented to the MAC client as one logical link. The standard's architectural intent is summarized as [“parallel instances of full-duplex point-to-point links ... aggregated together to form a Link Aggregation Group.”](https://1.ieee802.org/tsn/802-1ax-rev/)

Earlier Link Aggregation descriptions emphasized members operating at the same data rate. Later revision work explicitly relaxed that assumption: IEEE P802.1AX-Rev/D1.0 stated that aggregating different data rates is neither prohibited nor required, while traffic distribution across unequal-rate links is outside the standard's scope.

Unequal members are still operationally awkward. Most LAG implementations hash conversations onto individual members to avoid reordering. With 25 Gb/s and 10 Gb/s members, flow performance depends on the selected path, and symmetric hashing may create uneven queue pressure. For deterministic high-throughput design, members should normally use the same speed, FEC policy, MTU, and forwarding characteristics.

## Practical Examples and Evidence

A timing-driven detector can produce logs resembling the following synthetic sequence:

```text
00:00:01 probe speed=25000 autoneg=off
00:00:03 probe speed=10000 autoneg=off
00:00:04 remote signal detected
00:00:04 link up speed=10000-full fec=off
00:00:04 persist link mode to cache
```

After the peer resets, the same hardware may produce a different result:

```text
00:21:31 carrier lost
00:21:32 probe speed=25000 autoneg=off
00:21:34 remote signal detected
00:21:34 link up speed=25000-full fec=baser
00:21:34 persist link mode to cache
```

The key evidence is that **the same port changes its settled rate across link events** while the medium remains unchanged. That pattern points toward link-mode selection logic rather than a fixed cable, optic, or PHY defect. Capture speed and FEC, bounce one member at a time, and compare repeated transitions.

## Industry Standards Reference

- **IEEE 802.3by-2016**, Amendment 2 to IEEE 802.3-2015: introduced 25 Gb/s Ethernet PHYs including 25GBASE-CR, 25GBASE-KR, and 25GBASE-SR. Source: https://standards.ieee.org/ieee/802.3by/6024/
- **IEEE 802.3-2022**, Standard for Ethernet: consolidated Ethernet MAC, PHY, management, auto-negotiation, and FEC specifications. Clause 73 covers backplane/copper auto-negotiation; Clauses 74 and 91 define major FEC mechanisms used across high-speed Ethernet PHYs.
- **IEEE 802.1AX-2020**, Standard for Local and Metropolitan Area Networks — Link Aggregation: defines MAC-independent aggregation and resilient multi-link connectivity. Source: https://1.ieee802.org/tsn/802-1ax-rev/
- **Linux ethtool**, current userspace interface for querying and configuring Ethernet link modes and FEC. Source: https://man7.org/linux/man-pages/man8/ethtool.8.html

## Key Technical Insights

- **Auto is an administrative label, not a protocol guarantee.** Always determine whether the medium and PHY actually use IEEE auto-negotiation.
- **A local speed sweep can create nondeterministic link rates.** The selected mode may depend on timing rather than capability preference.
- **Boot order can correlate with the symptom without being the root cause.** Repeated link transitions on the same port are more informative than one startup sequence.
- **FEC is part of link compatibility.** Forcing 25 Gb/s while leaving FEC unresolved can replace a speed problem with a no-link problem.
- **LAG health cannot be inferred from logical-up state alone.** Member speed and FEC should be validated individually.
- **Topology or uplink discovery is logically separate from physical link negotiation.** LLDP, bridge forwarding state, LAG peer relationships, and topology inference can identify a logical path that differs from the directly attached physical port.

## Prevention Strategies and Takeaways

For links that must always operate at a known rate, prefer **deterministic configuration on both ends** when the hardware and media support it. Pin the intended speed, align FEC, verify module compatibility, and test each physical member independently before placing it into a LAG.

Do not assume a multi-rate SFP28 port will always prefer the highest common speed merely because both endpoints advertise 25 Gb/s capability in their management interfaces. Confirm whether the actual PHY path performs standards-based negotiation or implementation-specific detection.

Finally, validate the data plane independently from topology visualization. Use link state, PCS/FEC counters, MAC learning, LACP state, and forwarding evidence as the source of truth. A management topology tree is an interpretation of control-plane information; it is not a substitute for physical-layer and forwarding-plane verification.
