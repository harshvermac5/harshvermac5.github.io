---
layout: post
title: "Diagnosing WAN Failures Beyond Physical Link State"
date: 2026-09-02 15:28:12 +0530
description: "A layered method for distinguishing Ethernet carrier loss, upstream path degradation, and application-level failure in redundant WAN designs."
tags: [wan, failover, network-monitoring]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

A WAN interface reporting **link up** does not prove that the Internet path is usable. Ethernet carrier state confirms only that two adjacent physical-layer devices have established a link. It says nothing about upstream forwarding, congestion, recursive DNS behavior, or the reachability of remote services.

This article explains how to isolate WAN failures by correlating physical-link telemetry with active ICMP and DNS probes. It also examines how a redundant edge should convert those measurements into stable failover decisions without reacting to a single lost packet or a single unresponsive target.

The core principle is simple: **failure detection must test the service level that the routing decision is intended to protect**. Carrier detection protects against a failed local attachment. Routed probes test IP forwarding. DNS probes test an application dependency. These signals are related, but they are not interchangeable.

## Co-Technical Subject

**Multi-WAN path health detection, layered fault isolation, and deterministic failover state machines.**

## Theoretical Foundation

Ethernet link establishment is governed by **IEEE 802.3-2022**. A PHY may report carrier, negotiated speed, and duplex while frames beyond the directly connected device are being discarded. A clean MAC interface therefore rules out some local faults, but it cannot certify the provider network.

At the network layer, **ICMP Echo Request and Echo Reply** are defined by [RFC 792, Internet Control Message Protocol, 1981](https://www.rfc-editor.org/info/rfc792/). Echo exchanges provide a convenient active reachability signal, but ICMP is not a reliability protocol. A missing reply may represent path loss, rate limiting, filtering, reverse-path failure, or destination behavior. Health monitors must therefore use multiple samples and, preferably, multiple independent destinations.

Packet loss and delay have formal measurement models. [RFC 2680, 1999](https://www.rfc-editor.org/rfc/rfc2680) defines loss relative to a selected waiting time, while [RFC 2679, 1999](https://www.rfc-editor.org/rfc/rfc2679.html) defines one-way delay. [RFC 5357, TWAMP, 2008](https://www.rfc-editor.org/info/rfc5357/) provides a standardized active-measurement architecture.

DNS adds an application-semantic test. [RFC 1035, Domain Names—Implementation and Specification, 1987](https://www.rfc-editor.org/info/rfc1035/) defines DNS message structure, including the transaction identifier, flags, section counts, questions, and resource records. A response is not healthy merely because a UDP datagram arrives from port 53. The monitor must validate that the response is syntactically well formed, corresponds to the query, and contains an acceptable result.

No universal RFC defines a generic multi-WAN failover algorithm. [RFC 5880, Bidirectional Forwarding Detection, 2010](https://www.rfc-editor.org/rfc/rfc5880) supplies a useful analogue: periodic control traffic, timers, and explicit state transitions detect forwarding-path failure.

## Mechanism Breakdown

A robust monitor evaluates the path in layers.

- **Physical state:** Read carrier, negotiated speed, duplex, PHY resets, and link transitions. If carrier drops, the failure is at or before the adjacent device. Repeated down intervals of nearly identical duration can indicate deterministic modem retraining, watchdog recovery, or firmware restart behavior rather than random cable movement.

- **Interface integrity:** Inspect CRC errors, alignment errors, runts, giants, symbol errors, dropped frames, and carrier counters. Rising corruption counters with link flaps implicate the local cable, optics, PHY, or adjacent port. Zero error counters do not prove end-to-end health, but they materially weaken a local Layer 1 hypothesis.

- **Next-hop reachability:** Test the directly connected gateway when it is expected to answer. Success proves the local Layer 2 segment, address resolution, and a limited portion of the upstream control plane. Failure may still reflect an intentionally silent gateway, so this test requires topology knowledge.

- **Remote IP reachability:** Probe multiple stable addresses through the monitored interface. Bind both the source address and egress interface so policy routing cannot accidentally send the probe through a healthy secondary WAN. Measure loss, round-trip time, and response consistency across a sliding window.

- **Application validation:** Send a deterministic DNS query through a selected resolver. Validate the transaction ID, QR bit, opcode, response code, question tuple, section boundaries, and resource-record encoding. A malformed response proves that some packet exchange occurred, but not that the resolver path is usable.

The monitor then converts samples into a state machine such as **UP**, **DEGRADED**, **DOWN**, and **RECOVERING**. A single timeout should not normally produce **DOWN**. Instead, the decision should combine consecutive failures, windowed loss, delay limits, and agreement between independent probe types.

**Hysteresis** prevents route oscillation. The failure threshold can be relatively short to protect active traffic, while the recovery threshold should require a longer run of successful probes. This asymmetric policy avoids restoring the preferred route during a brief improvement in an unstable circuit.

An interface can be administratively enabled and carrier-up yet unusable because its routed probes fail. That combination indicates a fault beyond the local Ethernet attachment; it is not contradictory.

## Practical Examples and Evidence

Begin by checking local link and interface evidence on a Linux-based edge:

```bash
ethtool wan0
ip -s link show dev wan0
ethtool -S wan0
```

A result such as the following narrows the fault domain:

```text
Speed: 2500Mb/s
Duplex: Full
Link detected: yes
RX errors: 0
TX errors: 0
Carrier changes: 0
```

This does not prove Internet reachability. It proves that the sampled local attachment is established and that the host has not observed common MAC-layer faults.

Bind active tests to the WAN under investigation:

```bash
ping -I wan0 -c 20 1.1.1.1
ping -I wan0 -c 20 8.8.8.8
dig @1.1.1.1 example.net A +tries=1 +time=2
```

Evidence such as **57 percent packet loss**, multi-second or tens-of-seconds round-trip time, and invalid DNS messages while carrier remains up identifies a severe upstream forwarding problem. The conclusion is stronger when independent destinations fail concurrently and a secondary WAN remains healthy.

A generic monitor policy might be expressed as follows:

```yaml
health_check:
  interval_ms: 1000
  timeout_ms: 2000
  targets:
    icmp: [198.51.100.10, 203.0.113.10]
    dns:
      server: 192.0.2.53
      question: health.example.net.
      type: A
  declare_down:
    consecutive_failed_rounds: 5
    require_failed_probe_classes: 2
  declare_up:
    consecutive_successful_rounds: 20
```

The documentation ranges are illustrative. In production, use permitted targets whose routing independence matches the design objective.

Correlate probe transitions with carrier events using a monotonic clock and normalized timestamps. If four link losses each recover after exactly 38 seconds, the repeatability is significant. Random copper faults usually vary; fixed recovery intervals more often indicate retraining, reboot, or watchdog behavior. This remains an inference until upstream telemetry confirms it.

## Industry Standards Reference

- **IEEE 802.3-2022**, Ethernet, defines MAC and PHY operation, link establishment, and management parameters.

- **RFC 792, 1981**, defines ICMPv4 Echo and Echo Reply behavior.

- **RFC 1035, 1987**, defines DNS message encoding and response semantics.

- **RFC 2679 and RFC 2680, 1999**, define IP performance metrics for delay and packet loss.

- **RFC 5357, 2008**, defines TWAMP for standardized two-way active measurement.

- **RFC 5880, 2010**, defines BFD timers and state-machine principles for rapid forwarding-failure detection.

- **ITU-T Y.1540**, Internet protocol data communication service performance parameters, provides a carrier-oriented framework for IP transfer performance.

## Key Technical Insights

- **Carrier is adjacency evidence, not service evidence.** A provider path can fail while the customer-facing Ethernet link remains stable.

- **Probe diversity reduces false attribution.** ICMP tests forwarding, while DNS validation tests both transport and application semantics. Multiple destinations reduce dependence on one host's response policy.

- **Clean counters narrow rather than close the investigation.** They make local corruption unlikely but do not exclude faults inside an upstream modem or provider network.

- **Timing patterns reveal state machines.** Identical outage durations are evidence of deterministic recovery behavior and should be correlated with modem retraining, watchdog, thermal, and firmware logs.

- **Failover is a control-system problem.** Aggressive detection reduces outage time but increases false positives. Conservative recovery and hysteresis protect against flapping.

## Prevention Strategies and Takeaways

- Monitor physical, network, and application layers independently and retain the raw measurements behind every failover event.

- Bind probes to the intended source and interface, and verify the resulting route, so a healthy backup path cannot mask primary-path failure.

- Use multiple administratively independent probe targets and require consensus across probe classes before withdrawing a route.

- Record loss, delay distribution, DNS validation failures, carrier transitions, and interface counters with synchronized timestamps.

- Maintain separate failure and recovery thresholds. Require sustained health before failing back to the preferred circuit.

- When evidence points upstream, request provider telemetry such as signal-to-noise ratio, correctable and uncorrectable codewords, optical levels where applicable, and timeout or retraining history.

The decisive troubleshooting habit is to ask what each signal actually proves. Link state proves local physical adjacency. Clean counters reduce the probability of local corruption. Successful remote probes prove forwarding at a moment in time. Only their correlation provides a defensible diagnosis and a stable failover design.
