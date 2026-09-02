---
layout: post
title: "Diagnosing Linux Critical Thermal Shutdowns"
date: 2026-09-02 05:23:02 +0530
description: "A practical framework for distinguishing genuine silicon overheating from faulty thermal telemetry when Linux initiates a protective shutdown."
tags: [linux, thermal-management, hardware-diagnostics]
categories: [Infrastructure]
published: true
---

## Problem Statement or Learning Objective

A Linux host that abruptly disappears may resemble an application crash, watchdog reset, or power failure. When the kernel records **`critical temperature reached`** immediately before shutdown, however, the causal mechanism is different: a registered thermal zone crossed its **critical trip point**, and the kernel deliberately entered a hardware-protection path.

The objective is to prove that sequence, distinguish mitigation from emergency action, and determine whether the trigger represents genuine silicon overheating or invalid thermal telemetry. This distinction matters because cooling changes can correct environmental heat soak, while an erratic on-die sensor, sensor interface, calibration value, or board-level thermal path usually requires hardware remediation.

## Co-Technical Subject

**Linux thermal management, embedded hardware monitoring, and evidence-based shutdown diagnostics.**

The central principle is that temperature is not a single system-wide value. Each sensor observes a particular physical location through its own driver and calibration path. A processor junction sensor can therefore report a materially different temperature from a board-mounted monitor without either reading being inherently impossible.

## Theoretical Foundation

The Linux thermal subsystem models thermal control as three related objects: **thermal zones**, **trip points**, and **cooling devices**. A zone represents a monitored region such as a CPU cluster or system-on-chip. Trip points define temperatures at which actions become necessary. Cooling devices expose controllable states such as fan levels, processor frequency limits, or idle injection.

Trip types express increasing levels of intervention:

- **Active** trips request physical cooling, commonly a higher fan state.
- **Passive** trips reduce heat generation through mechanisms such as frequency or power throttling.
- **Hot** trips notify a platform driver so firmware-specific handling can occur.
- **Critical** trips protect hardware by initiating shutdown or, where explicitly configured, reboot.

Thermal governors such as **`step_wise`** and **`power_allocator`** select cooling-device states around controllable trips. The critical shutdown path is not merely another governor decision. Once the critical threshold is crossed, the thermal core invokes the platform's emergency action. Linux first attempts an orderly shutdown; supported configurations may force power-off after a delay and ultimately invoke an emergency restart if orderly handling fails.

On Device Tree platforms, firmware description links a sensor to a thermal zone, specifies polling intervals or interrupt-driven monitoring, defines trip temperature and hysteresis, and maps non-critical trips to cooling devices. **Hysteresis** prevents repeated state changes near a threshold by retaining mitigation until temperature falls below the trip point minus the hysteresis value.

## Mechanism Breakdown

The failure sequence begins when a sensor driver registers a temperature source with the thermal core. The platform associates that source with a zone such as **`soc-thermal`** and exposes it below **`/sys/class/thermal/thermal_zoneN`**. Temperatures and trip points are normally represented in millidegrees Celsius.

The sensor either raises an interrupt when a programmed window is crossed or the thermal framework polls it. Polling intervals must be shorter than the time required for the hardware's maximum temperature slope to cross multiple trip boundaries. An overly long interval can allow the system to move from a manageable state to a critical state between samples.

At an active or passive trip, the selected governor evaluates the zone and requests a cooling state. A frequency-cooling device might progress from unrestricted operation to successively lower operating points. If cooling is effective, temperature falls through the hysteresis boundary and mitigation relaxes.

If temperature continues upward and reaches a critical trip, the thermal core emits a kernel event and invokes the configured critical action. Services may then log connection refusals, reporting failures, or incomplete writes because shutdown has already started. Those later errors are consequences, not competing root causes.

After reboot, real-time sensor output may look normal because the device cooled while powered off or operated at reduced load. A single healthy sample therefore cannot invalidate a preceding critical event. The investigation must correlate monotonic event order, persisted logs, sensor identities, workload, ambient conditions, and recurrence across rotated logs.

## Industry Standards Reference

This mechanism is governed primarily by Linux platform interfaces rather than an IETF RFC or IEEE networking standard. The authoritative implementation references are the [Linux Kernel 7.1 generic thermal sysfs documentation](https://docs.kernel.org/7.1/driver-api/thermal/sysfs-api.html), derived from the platform-independent thermal interface introduced in 2008, and the [Devicetree thermal-zones schema](https://www.kernel.org/doc/Documentation/devicetree/bindings/thermal/thermal-zones.yaml), standardized as a YAML binding in 2020.

The [Linux hardware-monitoring sysfs interface](https://docs.kernel.org/hwmon/sysfs-interface.html) defines attributes such as **`tempN_input`**, **`tempN_max`**, **`tempN_crit`**, and **`fanN_input`**. These values must be interpreted according to the sensor's physical placement and label; similarly named channels are not automatically measurements of the same thermal mass.

For facility context, **ASHRAE TC 9.9, Thermal Guidelines for Data Processing Environments, Fifth Edition, 2021**, distinguishes recommended inlet conditions from wider allowable operating limits. Its environmental classes are useful for room and inlet design, but ambient compliance does not prove that a device has adequate local airflow or a healthy internal thermal path.

## Practical Examples and Evidence

Start by inventorying every zone, its policy, and its trips rather than reading only **`thermal_zone0`**:

```bash
for zone in /sys/class/thermal/thermal_zone*; do
  printf '\n%s type=%s temp=%s policy=%s\n' \
    "$zone" \
    "$(cat "$zone/type")" \
    "$(cat "$zone/temp")" \
    "$(cat "$zone/policy" 2>/dev/null || printf unknown)"
  grep -H . "$zone"/trip_point_* 2>/dev/null
done
```

A standards-aligned embedded platform may describe mitigation and protection like this:

```dts
cpu_thermal: cpu-thermal {
    polling-delay-passive = <250>;
    polling-delay = <1000>;
    thermal-sensors = <&tsens 0>;

    trips {
        cpu_passive: cpu-passive {
            temperature = <90000>;
            hysteresis = <2000>;
            type = "passive";
        };

        cpu_critical: cpu-critical {
            temperature = <105000>;
            hysteresis = <1000>;
            type = "critical";
        };
    };
};
```

The following event is direct evidence of the protection path, not merely a high-temperature observation:

```text
kernel: thermal thermal_zone0: critical temperature reached (106 C), shutting down
```

Correlate it against boot boundaries and related services:

```bash
journalctl -k --list-boots
journalctl -k -b -1 | grep -Ei 'thermal|critical|shutdown|watchdog'
journalctl --since '2026-08-31 07:40:30' --until '2026-08-31 07:42:00'
sensors -u
```

Suppose an on-die zone reaches **106 °C** while a board monitor reports **64 °C**. The 42 °C delta supports two hypotheses: localized junction heating across a real thermal resistance, or an erroneous sensor path. It does not select between them. A smooth rise tied to workload and improved by airflow supports genuine heating. Instantaneous spikes, impossible slew rates, repeated identical ceiling values, or failures at low load support telemetry or hardware instability.

## Key Technical Insights

- **Causal ordering outranks log volume.** The first decisive kernel event explains the service failures that follow during shutdown.
- **Sensor scope matters.** Junction, package, board, inlet, and external-monitor temperatures are not interchangeable.
- **A normal post-boot reading is weak counterevidence.** Power-off changes both thermal load and elapsed cooling time.
- **Repeated historical critical trips establish recurrence.** Rotated logs help separate a persistent mechanism from a one-time environmental excursion.
- **Low fan RPM is contextual, not self-explanatory.** Zero RPM can indicate fan-stop policy, passive cooling, missing fan hardware, or failure; validate the platform design and requested cooling state.
- **Reboot is a risky critical action.** Repeated rebooting can re-energize thermally stressed hardware before it cools, which is why shutdown is the preferred Device Tree default.

## Prevention Strategies and Takeaways

- Place equipment where intake and exhaust paths remain unobstructed; avoid enclosed cabinets, stacked heat sources, and recirculating exhaust.
- Monitor every relevant zone and retain kernel logs across boots. Alert below the critical threshold so operators observe throttling before protection activates.
- Record ambient or inlet temperature alongside junction telemetry. Cross-sensor trends are more useful than isolated absolute values.
- Validate polling intervals against the platform's worst-case temperature rise and use sensor interrupts where supported.
- After an airflow change, reproduce comparable workload and verify that no new **`critical temperature reached`** event appears.
- Escalate for hardware repair when critical trips persist under verified ambient conditions, readings show implausible discontinuities, or sensor disagreement cannot be explained by load and thermal design.

The governing diagnostic rule is simple: trust the kernel event as proof of why the system shut down, but do not confuse proof of the shutdown mechanism with proof of the underlying thermal cause. That second conclusion requires correlated telemetry, physical inspection, controlled environmental testing, and recurrence analysis.
