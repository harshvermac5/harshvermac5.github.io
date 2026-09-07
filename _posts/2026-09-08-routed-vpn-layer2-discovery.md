---
layout: post
title: "Why Layer 2 Discovery Fails Across Routed VPNs"
date: 2026-09-08 02:58:00 +0530
description: "A standards-based analysis of why LLDP and other link-local discovery protocols do not traverse routed remote-access VPNs, and where proxy ARP and Layer 2 overlays fit."
tags: [vpn, lldp, layer2, proxy-arp, ethernet]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Remote-access VPNs can provide complete IP reachability to an internal network while still failing applications that depend on Ethernet adjacency. The architectural distinction is that most remote-access VPNs extend **Layer 3 reachability**, not the **Layer 2 broadcast domain**.

This matters for **Link Layer Discovery Protocol (LLDP)**, raw Ethernet discovery, ARP-dependent discovery, and broadcast-oriented management tools. A remote client may successfully ping, SSH to, or open TCP sessions with a device while remaining unable to participate in the same Ethernet segment.

The governing principle is straightforward: **routing transports IP packets between subnets; bridging transports Ethernet frames within or between Layer 2 segments**. A firewall rule can permit routed traffic, but it cannot convert an IP tunnel into an Ethernet bridge.

## Co-Technical Subject

**Layer 3 VPN forwarding, Ethernet adjacency, LLDP scope, Proxy ARP, and Layer 2 overlay design.**

The engineering question is not simply whether a VPN client can use an address from the same IP prefix as a LAN. It is whether the tunnel preserves the forwarding semantics required by the application: unicast IP, broadcast IP, multicast IP, ARP, or arbitrary Ethernet frames.

## Theoretical Foundation

IEEE **802.1AB-2016**, *Station and Media Access Control Connectivity Discovery*, defines LLDP for topology discovery between adjacent IEEE 802 stations. IEEE describes the protocol as supporting ["discovering the physical topology from adjacent stations in IEEE 802 LANs"](https://standards.ieee.org/ieee/802.1AB/6047/). The word **adjacent** is fundamental: LLDP is intended for local-link visibility rather than routed discovery.

LLDP commonly uses the nearest-bridge group MAC address **01:80:C2:00:00:0E**. IEEE material describes this destination as constraining propagation to a single physical link. Bridges do not normally relay frames addressed to that reserved group address, and routers do not forward the Ethernet frame at all.

RFC **1812**, *Requirements for IP Version 4 Routers* (1995), reinforces the Layer 3 boundary. Section 5.3.4 states that ["A router MUST NOT forward any packet that the router received as a Link Layer broadcast"](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.3.4), subject to the IP-multicast exception described there. LLDP is even further removed from normal IP forwarding because an LLDPDU is an Ethernet PDU, not an IP packet.

ARP is defined by RFC **826** (1982). RFC **1027** (1987) later documented **Proxy ARP**, where a gateway answers ARP on behalf of a host reachable through another interface. Its goal is to let hosts communicate ["without being aware of the existence of subnets"](https://www.rfc-editor.org/rfc/rfc1027.html). Proxy ARP can therefore hide an IP routing boundary, but it does not transport arbitrary Ethernet frames across that boundary.

## Mechanism Breakdown

A routed remote-access VPN introduces a logical Layer 3 interface. The remote host receives or configures a tunnel address, installs routes for protected prefixes, and sends matching IP packets into an encrypted tunnel. The VPN gateway decapsulates those packets and forwards them according to its IP routing table.

```text
Remote host
10.255.0.10/24
    |
virtual VPN interface
    |
encrypted IP tunnel
    |
VPN gateway
10.255.0.1/24
    |
Layer 3 routing
    |
LAN interface
192.0.2.1/24
    |
LAN host
192.0.2.50/24
```

The VPN and LAN are separate Layer 3 interfaces. When the gateway forwards an IP packet, it removes the incoming Layer 2 encapsulation, performs an IP route lookup, updates forwarding metadata such as TTL or Hop Limit, resolves the egress next-hop link-layer address, and creates a new Layer 2 frame on the destination interface.

LLDP never enters that forwarding path. An LLDP frame uses EtherType **0x88CC** and is processed by an LLDP agent at Layer 2. It contains no source or destination IP address on which a router could perform a route lookup.

LLDP itself is stateful. The transmit state machine periodically constructs an LLDPDU containing identification data such as **Chassis ID**, **Port ID**, and **Time To Live**, followed by optional TLVs and an end marker. IEEE 802.1AB configuration models define **msgTxInterval** for periodic transmission and **msgTxHold** as the multiplier used to calculate the advertised lifetime. A commonly recommended interval is **30 seconds** with a hold multiplier of **4**, producing a nominal **120-second TTL**.

The receive state machine stores neighbor information until the TTL expires. A TTL of zero instructs the receiving agent to remove the neighbor immediately. These timers govern neighbor database aging; they do not provide any mechanism for routing LLDP across subnets.

Proxy ARP changes only the IP reachability model. Consider a LAN using **192.0.2.0/24** and a remote client assigned **192.0.2.200** even though it is not physically attached to that Ethernet segment. When a LAN host broadcasts an ARP request for 192.0.2.200, the gateway can answer with its own MAC address. The LAN host then sends IP packets to the gateway, which routes or tunnels them to the remote client.

The client can therefore appear on-subnet from an IP addressing perspective without becoming a true Layer 2 peer. LLDP, spanning-tree BPDUs, unknown EtherTypes, and other link-local frames remain outside the routed data path unless the tunnel explicitly provides Ethernet bridging or pseudowire behavior.

## Industry Standards Reference

The relevant standards form a clear hierarchy:

- **IEEE 802.1AB-2016** defines LLDP behavior, LLDPDUs, managed objects, transmission state, reception state, and local-link topology discovery. **802.1ABcu-2021** adds YANG management models without changing the fundamental adjacency model.
- **RFC 826**, *An Ethernet Address Resolution Protocol* (1982), defines ARP address resolution on a local network.
- **RFC 1027**, *Using ARP to Implement Transparent Subnet Gateways* (1987), documents Proxy ARP for hiding subnet boundaries from hosts.
- **RFC 1812**, *Requirements for IP Version 4 Routers* (1995), defines IPv4 router forwarding behavior and link-layer broadcast restrictions.
- **RFC 3931**, *Layer Two Tunneling Protocol Version 3* (2005), defines a framework for tunneling Layer 2 connections between IP nodes.
- **RFC 4448**, *Encapsulation Methods for Transport of Ethernet over MPLS Networks* (2006), defines Ethernet pseudowires carrying Ethernet/802.3 PDUs over MPLS.
- **RFC 7348**, *Virtual eXtensible Local Area Network* (2014), describes VXLAN as a Layer 2 overlay over Layer 3 infrastructure.
- **RFC 7432**, *BGP MPLS-Based Ethernet VPN* (2015), defines EVPN control-plane procedures for distributed Ethernet services.

These technologies solve different problems. A remote-access VPN focuses on protected IP connectivity. L2TPv3, Ethernet pseudowires, VXLAN, and EVPN explicitly address Layer 2 transport or overlay behavior.

## Practical Examples and Evidence

On a Linux endpoint, the routing boundary is visible through interface and route inspection:

```bash
ip address show
ip route show
```

A routed VPN may produce evidence similar to:

```text
10.255.0.10/24 dev vpn0
192.0.2.0/24 dev vpn0
```

LLDP can be verified independently by capturing EtherType 0x88CC or its destination MAC:

```bash
tcpdump -eni eth0 ether proto 0x88cc
tcpdump -eni eth0 ether dst 01:80:c2:00:00:0e
```

A local segment may show:

```text
01:80:c2:00:00:0e, ethertype LLDP (0x88cc), length 142
```

The same capture on a routed VPN interface should not reveal the LAN's native LLDP frames unless a deliberate Layer 2 encapsulation mechanism exists.

ARP behavior can be contrasted with LLDP using:

```bash
ip neigh show
arping -I eth0 192.0.2.50
```

Proxy ARP may cause a gateway MAC address to appear for a destination that is not physically local. That demonstrates address-resolution mediation, not Ethernet transparency.

## Key Technical Insights

- **Same-subnet addressing is not equivalent to same Layer 2 adjacency.** Address assignment and forwarding behavior are separate design dimensions.
- **Firewall policy cannot create a missing protocol layer.** A rule can allow or deny traffic handled by the forwarding plane; it cannot make a router relay arbitrary link-local Ethernet frames.
- **Proxy ARP is an IP reachability technique, not a generic Layer 2 tunnel.** It changes ARP resolution so traffic reaches a gateway that can forward it elsewhere.
- **Discovery requirements must be classified by protocol.** LLDP, ARP, IPv4 broadcast, mDNS, SSDP, and vendor-defined UDP discovery have different forwarding constraints.
- **Layer 2 extension enlarges the failure domain.** Broadcast, unknown-unicast, control-plane traffic, loops, and MAC learning can all span the overlay.
- **Layer 3 boundaries are usually deliberate.** Routed VPNs provide cleaner segmentation, smaller broadcast domains, and more explicit security-policy enforcement.

## Prevention Strategies and Takeaways

Design remote-management workflows around the actual discovery mechanism rather than assuming IP reachability is sufficient.

- Prefer management protocols that use **routable unicast IP** when remote administration is required.
- Verify whether a discovery application depends on **LLDP, ARP, broadcast, multicast, or a vendor-specific EtherType** before changing firewall policy.
- Capture traffic on both sides of the routing boundary to prove where discovery frames terminate.
- Treat same-prefix VPN addressing as a routing and address-resolution feature unless the design explicitly states that Ethernet frames are bridged.
- Deploy Layer 2 overlays only when required, and account for MTU overhead, broadcast propagation, loop prevention, MAC learning, failure-domain expansion, and security exposure.
- When Layer 2 locality is unavoidable, a controlled management endpoint inside the target segment is often simpler than extending the entire broadcast domain across a remote-access path.

The decisive troubleshooting question is not "Can the VPN reach the LAN?" but **"Which protocol data unit must cross the boundary, and does the tunnel preserve that layer's forwarding semantics?"**
