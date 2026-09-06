---
layout: post
title: "Diagnosing MAC Authentication Bypass Failures on Embedded Ethernet Devices"
date: 2026-09-07 02:52:00 +0530
description: "A protocol-level guide to understanding and troubleshooting MAB failures when embedded Ethernet devices lack an 802.1X supplicant."
tags: [802.1X, RADIUS, MAB, Ethernet, NAC]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Embedded controllers, printers, industrial devices, cameras, and other fixed-function endpoints often lack an **IEEE 802.1X supplicant**. In networks that require authenticated access, these devices are commonly admitted through **MAC Authentication Bypass (MAB)**, where the access switch presents the endpoint MAC address to a backend AAA service.

The difficult failure mode is not a simple RADIUS rejection. An endpoint can remain absent from the switch client table, never transition to an authorized state, and produce no obvious authentication event. The key diagnostic question is therefore: did the endpoint fail authorization at the RADIUS server, or did the authenticator never trigger MAB?

This article explains how to separate those conditions by reasoning from Layer 2 learning, 802.1X port state, RADIUS signaling, and packet evidence.

## Co-Technical Subject

**Network Access Control: IEEE 802.1X authenticator behavior, MAC Authentication Bypass, RADIUS authorization, and Ethernet source-MAC learning.**

The central principle is that **MAB is not an IEEE 802.1X authentication method**. IEEE 802.1X defines the controlled-port architecture and EAP-based relationship among supplicant, authenticator, and authentication server. MAB is an implementation technique for endpoints that do not participate in EAPOL. Trigger conditions, credential representation, retry behavior, and fallback timers can therefore vary between switching platforms.

## Theoretical Foundation

IEEE **802.1X-2020**, *Port-Based Network Access Control*, defines the architecture used to restrict access to a LAN port until authentication and authorization conditions are satisfied. The standard describes controlled and uncontrolled access paths associated with a Port Access Entity. The uncontrolled path permits authentication-control exchanges, while ordinary data traffic is governed by the controlled-port state.

The IEEE summarizes the objective as: [“Port-based network access control allows a network administrator to restrict the use of IEEE 802 LAN service access points.”](https://standards.ieee.org/ieee/802.1X/7345/)

In a normal wired 802.1X exchange, a supplicant communicates using **EAP over LAN (EAPOL)**. The authenticator relays authentication material toward a backend service, commonly RADIUS. RFC 3580 summarizes the model: [“IEEE 802.1X enables authenticated access to IEEE 802 media.”](https://www.rfc-editor.org/rfc/rfc3580.html)

RADIUS is defined by **RFC 2865, June 2000**. The switch acts as the **Network Access Server (NAS)** and sends an `Access-Request`. The server returns an `Access-Accept`, `Access-Reject`, or, in EAP workflows, potentially an `Access-Challenge`.

RFC 3579, published in **September 2003**, defines how EAP is carried inside RADIUS using `EAP-Message`. That path applies to real 802.1X supplicants. A MAB-only endpoint has no EAP conversation; the authenticator constructs an AAA request based on the Layer 2 identity it observes.

This distinction matters because an embedded device may never send `EAPOL-Start`, never answer `EAP-Request/Identity`, and may transmit only a brief burst of ARP, DHCP, discovery, or proprietary Ethernet frames after link-up.

## Mechanism Breakdown

When an Ethernet link comes up on an access-controlled port, the authenticator initializes the authorization state. If 802.1X is active, normal user data is not yet permitted through the controlled path.

A standards-based supplicant can initiate EAPOL or respond to an identity request. A MAB-only endpoint is unaware that network access control exists, so the switch typically has to infer identity from ordinary Ethernet traffic.

A common MAB flow is:

- Link transitions to **up** while the port remains unauthorized.
- The authenticator attempts 802.1X or waits through a supplicant-response interval.
- A frame arrives from an endpoint source MAC address.
- The switch associates that MAC with the physical port.
- The MAB process converts the MAC into an authentication identity.
- The switch sends a RADIUS `Access-Request` with NAS, port, and station attributes.
- `Access-Accept` authorizes the session, optionally applying VLAN or policy attributes.
- `Access-Reject` leaves the endpoint unauthorized.

The crucial boundary is between **frame arrival** and **Access-Request generation**. If the switch never exposes the station identity to its access-control process, the RADIUS server has nothing to accept or reject.

MAC representation creates another interoperability risk. RFC 3580 recommends that `Calling-Station-Id` contain the endpoint MAC in uppercase ASCII with hyphens, for example `00-10-A4-23-19-C0`. However, MAB `User-Name` and `User-Password` conventions are not standardized by IEEE 802.1X. Implementations may use `0010A42319C0`, `00-10-A4-23-19-C0`, or `00:10:A4:23:19:C0`. AAA policy must match the identity format actually sent by the NAS.

Dynamic VLAN assignment adds a later decision point. RFC 3580 describes a common `Access-Accept` pattern:

```text
Tunnel-Type = VLAN
Tunnel-Medium-Type = 802
Tunnel-Private-Group-ID = "2002"
```

Authentication can therefore succeed while post-authentication policy still fails. That is distinct from a MAB transaction that never reaches RADIUS.

## Industry Standards Reference

The core references are:

- **IEEE 802.1X-2020**, published 2020: port-based network access control, Port Access Entities, controlled access, authentication, and authorization.
- **RFC 2865**, published June 2000: base RADIUS authentication and authorization protocol.
- **RFC 3579**, published September 2003: EAP carriage within RADIUS using `EAP-Message` and `Message-Authenticator`.
- **RFC 3580**, published September 2003: RADIUS usage guidelines for IEEE 802.1X, including station identity and VLAN authorization.
- **RFC 7268**, published July 2014: additional RADIUS attributes for IEEE 802 networks and an update to RFC 3580.
- **IEEE 802.1Q-2022**: bridging and VLAN behavior relevant after authorization.

RFC 3580 provides a useful identity convention: [“this attribute is used to store the Supplicant MAC address in ASCII format”](https://www.rfc-editor.org/rfc/rfc3580.html). That guidance applies to `Calling-Station-Id`; it should not be confused with implementation-specific MAB username formatting.

## Practical Examples and Evidence

The most decisive troubleshooting method is to observe the transaction at the AAA server while reproducing the endpoint connection.

On a Linux RADIUS server:

```bash
sudo tcpdump -ni any 'udp port 1812'
```

To search a capture for a specific station identity:

```bash
tshark -r radius-test.pcapng \
  -Y 'radius.Calling_Station_Id contains "00-0E-C6" || radius.User_Name contains "000EC6"'
```

The evidence should be classified by where the chain stops.

If an `Access-Request` arrives and the server returns `Access-Reject`, the switch successfully triggered MAB. Investigation should move to **AAA policy**, including MAC normalization, NAS-IP restrictions, NAS groups, credential matching, and authorization rules.

If an `Access-Request` receives `Access-Accept` but the endpoint remains blocked, the fault is downstream of authentication. Inspect controlled-port state, returned VLAN or ACL attributes, and session installation.

If **no Access-Request reaches RADIUS**, the problem is earlier. Capture directly on or near the access link and determine whether the endpoint transmitted frames after link-up. A port mirror is valuable because traffic dropped at the ingress access-control boundary may never be visible elsewhere.

For a MAB-only endpoint, useful trigger traffic includes:

```text
ARP who-has 192.0.2.1 tell 192.0.2.50
DHCP Discover from 00:0e:c6:94:08:a4
IPv6 Neighbor Solicitation
Vendor discovery Ethernet frame
```

If those frames are visible on the wire but the switch never creates a MAB session or RADIUS request, the evidence points toward the authenticator's **station-learning or MAB trigger path**, not AAA policy.

Link-state history also matters. A device that emits only one startup burst can be sensitive to link renegotiation, forwarding initialization, power-saving behavior, or repeated physical flaps. Those conditions do not prove a MAB defect, but they can explain why one authenticator sees the endpoint while another does not.

## Key Technical Insights

- **No RADIUS packet is itself evidence.** It moves the failure boundary from AAA policy toward the authenticator, Layer 2 learning, or endpoint transmit behavior.
- **A healthy RADIUS server does not prove every MAB identity will work.** NAS-specific rules and MAC formatting can produce selective failures.
- **Successful MAB clients on the same switch are powerful controls.** They reduce the likelihood of a global reachability, shared-secret, or VLAN fault.
- **Client-table absence can be meaningful.** For a MAB implementation driven by source-MAC observation, no learned station may explain why authentication never starts.
- **MAB interoperability is weaker than 802.1X interoperability.** The access-control architecture is standardized; the bypass trigger and credential encoding are not.
- **Comparative captures are most useful when aligned by event.** Compare link-up, first endpoint frame, first RADIUS request, authorization result, and first permitted data frame.

## Prevention Strategies and Takeaways

Use MAB as an exception path for devices that cannot support 802.1X, not as an equivalent security mechanism. A MAC address is observable and spoofable, so authorization should be narrow and combined with segmentation, least-privilege ACLs, and physically controlled access ports.

Normalize MAC identities in AAA policy so that separator and case differences do not silently break authorization. Policy should still validate NAS identity and expected access location.

During troubleshooting, instrument both sides of the decision boundary. Capture endpoint ingress traffic and RADIUS traffic simultaneously. This separates **endpoint silence**, **authenticator trigger failure**, **RADIUS rejection**, and **post-authentication policy failure** without relying on UI state alone.

Treat MAB as a chain of dependent mechanisms: Ethernet link establishment, source-MAC observation, access-control state, RADIUS request generation, AAA policy evaluation, and post-authorization forwarding. Root-cause analysis becomes much faster once you identify the first stage for which expected evidence is missing.
