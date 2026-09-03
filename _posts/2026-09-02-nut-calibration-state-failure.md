---
layout: post
title: "When UPS Calibration State Becomes a Shutdown Hazard in Network UPS Tools"
date: 2026-09-02 19:39:00 +0530
description: "A deep analysis of how stale NUT calibration state can turn a brief monitoring outage into an immediate infrastructure shutdown."
tags: [nut, linux, ups]
categories: [Infrastructure]
published: true
---

## Problem Statement or Learning Objective

A UPS monitoring system makes shutdown decisions from two inputs: the **last known electrical state** of the UPS and the **current ability to communicate with it**. That interaction becomes dangerous when the last known state is wrong.

The specific failure mode examined here is a stale **calibration state**. A UPS reports `CAL` while performing a battery self-test, returns to normal line power, but the monitoring path never observes the corresponding transition out of calibration. If communication later disappears, even briefly, a management daemon may interpret the combination of **last known calibrating** plus **currently unreachable** as a potentially exhausted or unsafe power source and initiate shutdown immediately.

The core principle is broader than UPS monitoring: **distributed control systems must treat transient states as transitions, not durable labels**. If an endpoint asserts a temporary state, it must reliably publish its termination.

## Co-Technical Subject

**Network UPS Tools state propagation, calibration lifecycle, and fail-safe shutdown semantics.**

This topic sits at the intersection of Linux infrastructure management, distributed state machines, TCP client/server monitoring, and automated power-failure control.

## Theoretical Foundation

The Network UPS Tools protocol is documented in **RFC 9271, published August 2022**, describing NUT software 2.8.0 and protocol version 1.3. It is Informational rather than IETF Standards Track, but it documents the interoperable protocol model.

RFC 9271 separates the architecture into an **Attachment Daemon**, which exposes UPS variables, and a **Management Daemon**, which polls those variables and makes operational decisions. These components may run on the same host or across a network. The protocol runs over **TCP port 3493**, registered by IANA as the `nut` service.

A critical architectural property is that the wire protocol is mostly stateless while the management application is not. RFC 9271 explicitly states that the management daemon must retain the prior UPS state so it can derive events from transitions. The specification notes that ["The Management Daemon is required to remember the previous `ups.status` value"](https://www.rfc-editor.org/rfc/rfc9271.html#section-4).

That makes transition correctness fundamental: the daemon evaluates both current state and change from the previous observation.

The standard status model includes normal power states such as `OL` for online, `OB` for on battery, `LB` for low battery, and `FSD` for forced shutdown. NUT additionally defines `CAL` for calibration in progress and `NOTCAL` as the corresponding completion event in the monitoring layer. The official `upsmon` documentation describes `CAL` as **UPS calibration in progress** and `NOTCAL` as **UPS calibration finished**.

NUT uses TCP, specified by **RFC 9293 (2022)**. TCP can deliver an ordered byte stream, but it cannot generate a missing application transition; a reliable connection cannot repair a missing `NOTCAL`.

IANA lists `nut` on **3493/TCP** under the registry framework documented by **RFC 6335 (2011)**.

## Mechanism Breakdown

During normal operation, the attachment side continuously publishes UPS variables including `ups.status`. A management daemon such as `upsmon` polls the server at a configured interval. NUT defaults `POLLFREQ` to five seconds under normal conditions and uses `POLLFREQALERT` when an alert condition exists.

A normal calibration lifecycle conceptually looks like this:

```text
OL
  -> self-test starts
OL CAL
  -> self-test completes
OL
```

The important property is that **calibration is transient**. Once the test ends, later reads must no longer contain `CAL`.

Consider what happens if the final transition is lost at the producer:

```text
T0  ups.status = OL
T1  ups.status = OL CAL
T2  physical self-test completes
T3  exported ups.status remains OL CAL
T4  server becomes unreachable
```

At `T3`, physical and exported state have diverged: power may be healthy while the management daemon retains a logically hazardous state.

Communication-loss handling then becomes the second state machine. NUT normally allows a UPS to remain unreachable for a period controlled by **`DEADTIME`**. The `upsmon.conf` documentation states that the default is 15 seconds and explains that failed polls first make the data stale; only continued staleness beyond `DEADTIME` normally causes the UPS to be declared dead.

A representative configuration is:

```ini
MONITOR ups@power-host 1 monitor secret secondary
POLLFREQ 5
POLLFREQALERT 5
DEADTIME 15
NOCOMMWARNTIME 300
FINALDELAY 5
```

The design becomes conservative when the last known state implies battery operation. NUT documents that an unreachable UPS last known on battery may be assumed critical, because telemetry loss during battery operation carries different risk than telemetry loss while safely online.

Calibration complicates the model because calibration commonly exercises the battery. In NUT 2.8.1 behavior documented in upstream issue 2794, an unreachable UPS whose cached state indicates calibration can take an immediate dead-UPS path. The reported log sequence contains the decisive message ["was last known to be calibrating and currently is not communicating, assuming dead"](https://github.com/networkupstools/nut/issues/2794).

Therefore, increasing `DEADTIME` may not help when a special calibration safety branch applies. The decision is driven by **state classification before communication failure**, not only outage duration.

## Industry Standards Reference

**RFC 9271 (2022)** documents NUT protocol 1.3, its client/server architecture, variable model, `ups.status`, and previous-versus-current state comparison.

**RFC 9293 (2022)** defines TCP, the transport used by NUT; transport reliability does not repair incorrect application state.

**RFC 6335 (2011)** defines IANA service-name and port registration procedures; IANA assigns **3493/TCP** to `nut`.

The **NUT `upsmon(8)` and `upsmon.conf(5)` documentation** defines `CAL`, `NOTCAL`, polling timers, `DEADTIME`, and shutdown behavior.

Upstream **NUT issue 2794, opened in 2025**, provides independent field evidence for the calibrating-then-unreachable shutdown path in NUT 2.8.1.

## Practical Examples and Evidence

The first diagnostic task is to inspect the authoritative exported state rather than infer it from a graphical dashboard or battery percentage.

```bash
upsc ups@power-host
```

A healthy post-calibration result should resemble:

```text
battery.charge: 100
ups.status: OL
```

A suspicious result after the physical self-test has completed is:

```text
battery.charge: 100
ups.status: OL CAL
```

`OL CAL` is not inherently contradictory during an active self-test. The problem is persistence after the calibration has physically ended.

For repeated observation, sample the variable over time:

```bash
while true; do
    date --iso-8601=seconds
    upsc ups@power-host ups.status
    sleep 5
done
```

Expected transition evidence is conceptually:

```text
2026-09-02T01:00:00+00:00
OL
2026-09-02T01:05:00+00:00
OL CAL
2026-09-02T01:05:20+00:00
OL
```

If the final `OL` never appears, the defect is upstream of `upsmon`: the attachment side continues exporting stale state. Restarting a client can clear its cached history, but it cannot correct the producer's state machine.

For safe validation, replace the real shutdown action before intentionally interrupting the server:

```ini
SHUTDOWNCMD "/usr/local/sbin/log-would-shutdown"
```

This proves decision logic without halting workloads.

## Key Technical Insights

- **State transitions are part of the API contract.** Publishing `CAL` without reliably withdrawing it is equivalent to leaving a distributed lock permanently asserted.
- **Last-known state can outweigh current reachability timers.** Fail-safe software often treats communication loss differently depending on whether the previous state was safe, degraded, or hazardous.
- **`DEADTIME` is not a universal debounce mechanism.** Special safety branches may bypass ordinary stale-data timers when the cached state implies battery discharge or another critical condition.
- **Transport reliability and semantic correctness are separate problems.** TCP can deliver every byte correctly while the application still exports a permanently incorrect status token.
- **Telemetry ownership matters.** The component that originates `ups.status` must own the lifecycle of temporary flags. A controller or dashboard cannot safely invent a missing state transition unless it has independent electrical evidence.
- **Composite states require careful interpretation.** A status such as `OL CAL` combines source-power and activity information. Automation must evaluate the complete state vector rather than treating each token as independent trivia.
- **Safety-oriented automation intentionally favors false positives over catastrophic false negatives.** Immediate shutdown may appear aggressive, but the logic is understandable when calibration implies battery use and telemetry suddenly disappears.

## Prevention Strategies and Takeaways

Test temporary state flags as complete lifecycles: prove that `CAL` appears at test start, disappears at completion, and is observed by downstream clients.

Monitor `ups.status` directly, retain timestamped history, and alert when `CAL` persists beyond the expected self-test window. This exposes stale state before a restart or network interruption does.

Test **electrical-state transitions** separately from **communication-loss transitions**. Behavior with cached `OL` may differ sharply from cached `OB`, `LB`, or `CAL`.

Treat daemon restarts, reloads, upgrades, and network reconvergence as expected failure inputs. The monitoring channel can disappear without the protected load losing power.

Do not use longer timers as a substitute for correct state. If calibration completion is missing, the durable fix belongs at the state producer. Robust designs keep **physical state, exported state, cached state, and shutdown policy causally aligned**.
