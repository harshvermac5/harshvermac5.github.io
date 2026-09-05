---
layout: post
title: "Inter-VLAN IoT Discovery and Stateful Firewall Isolation"
date: 2026-09-06 01:35:00 +0530
description: "A standards-based analysis of why IoT discovery and direct device access fail across VLAN boundaries, and how to design narrowly scoped inter-VLAN firewall policy without defeating segmentation."
tags: [vlan, mdns, firewall]
categories: [Networking]
published: true
---

## Problem Statement or Learning Objective

Segmenting IoT devices into a separate VLAN is a sound security control, but segmentation changes more than the IP subnet. It creates a new Layer 2 broadcast domain and usually introduces a Layer 3 security boundary. Applications that previously discovered and contacted devices on the same LAN may therefore fail even when both networks have working Internet access.

The core principle is that **service discovery and application communication are separate traffic phases**. Discovery may depend on broadcast or link-local multicast, while the actual session may use ordinary unicast TCP or UDP. A design can successfully relay discovery traffic yet still block the subsequent session with a firewall policy. Conversely, a permissive inter-VLAN firewall does not make link-local broadcast discovery routable.

The engineering objective is to identify each traffic phase, determine its scope and direction, and permit only the flows required by the application.

## Co-Technical Subject

**VLAN segmentation, multicast service discovery, and stateful inter-VLAN firewall policy**.

## Theoretical Foundation

IEEE **802.1Q-2022, Bridges and Bridged Networks** defines VLAN-aware bridging and the logical separation of bridged LANs. A VLAN is effectively an independent broadcast domain: Ethernet frames belonging to one VLAN are not transparently bridged into another VLAN unless an explicit higher-layer function intervenes.

IPv4 routing reinforces this boundary. RFC 1812, *Requirements for IP Version 4 Routers* from 1995, specifies that limited broadcasts remain local to the connected network. Its description is explicit: [“will not be forwarded outside that network”](https://www.rfc-editor.org/rfc/rfc1812.html). This is why a discovery protocol based on IPv4 broadcast cannot simply traverse an inter-VLAN router.

Multicast has different semantics. RFC 1112, *Host Extensions for IP Multicasting* from 1989, defines IPv4 multicast group behavior. Some multicast ranges are intentionally local in scope, and forwarding depends on multicast routing rules rather than ordinary unicast routing.

Multicast DNS is even more deliberately constrained. RFC 6762, *Multicast DNS* from 2013, defines mDNS as DNS-like name resolution on the local link using IPv4 **224.0.0.251** or IPv6 **FF02::FB**, normally over UDP **5353**. The standard describes mDNS as operating [“on the local link”](https://www.rfc-editor.org/rfc/rfc6762.html). RFC 6763, *DNS-Based Service Discovery* from 2013, builds DNS-SD on DNS resource records such as PTR, SRV, and TXT records and can operate over mDNS for zero-configuration discovery.

Firewall behavior is logically separate from VLAN and discovery behavior. RFC 2979, *Behavior of and Requirements for Internet Firewalls* from 2000, treats a firewall as an enforcement point that screens traffic according to policy. It also emphasizes that firewalling and NAT are distinct functions. Internet reachability therefore proves little about whether two internal security zones can communicate directly.

## Mechanism Breakdown

Consider a trusted client VLAN and an isolated IoT VLAN connected through a Layer 3 gateway. A typical application workflow can involve several independent exchanges.

The first phase is **discovery**. A client may send an Ethernet broadcast, an IPv4 broadcast, an mDNS query to **224.0.0.251:5353**, or some proprietary multicast packet. The switch floods appropriate Layer 2 broadcast or multicast traffic only inside the VLAN. The gateway receives traffic addressed to itself or traffic eligible for routing, but it does not convert ordinary local broadcasts into broadcasts on another VLAN.

For mDNS, the client emits a DNS query to the link-local multicast group. Devices on the same link may answer with PTR, SRV, TXT, A, or AAAA records. DNS-SD commonly uses PTR records to enumerate service instances, SRV records to advertise target host and port, and TXT records for service metadata. The discovered endpoint is then contacted using normal unicast traffic.

This leads to the second phase: **session establishment**. Suppose discovery returns an IoT device at `192.0.2.50` with an application service on TCP port `9000`. A client at `198.51.100.25` sends a SYN toward `192.0.2.50:9000`. The gateway performs a route lookup, then evaluates the packet against inter-zone policy. If the policy permits trusted-to-IoT initiation, the SYN crosses the boundary and a stateful firewall normally records the connection tuple.

Return traffic is then matched to the existing state. Common implementations model TCP flows as states such as **NEW** and **ESTABLISHED**, although those names are implementation terminology rather than IETF protocol states. For UDP, a firewall cannot observe a handshake, so it tracks bidirectional packet tuples and expires the pseudo-state after an idle timer.

Isolation features may install policy that is stricter than ordinary routing. Some implementations enforce a default deny between isolated and trusted networks even when routes exist. This is why placing interfaces in reachable IP subnets does not imply permitted communication.

If discovery succeeds but the session fails, the likely fault domain is the inter-zone firewall or host policy. If discovery fails but direct access by IP succeeds, the likely fault domain is broadcast or multicast scope. If both fail, the engineer must test them independently rather than assuming a single cause.

## Industry Standards Reference

- **IEEE 802.1Q-2022**, *IEEE Standard for Local and Metropolitan Area Networks—Bridges and Bridged Networks*. Defines VLAN-aware bridges, VLAN identification, forwarding behavior, and bridged-network architecture: [IEEE 802.1Q](https://standards.ieee.org/ieee/802.1Q/10323/).
- **RFC 1812, 1995**, *Requirements for IP Version 4 Routers*. Defines IPv4 router behavior including broadcast forwarding constraints: [RFC 1812](https://www.rfc-editor.org/rfc/rfc1812.html).
- **RFC 1112, 1989**, *Host Extensions for IP Multicasting*. Defines IPv4 multicast host-group behavior: [RFC 1112](https://www.rfc-editor.org/rfc/rfc1112.html).
- **RFC 4541, 2006**, *Considerations for IGMP and MLD Snooping Switches*. Documents multicast forwarding considerations within switched LANs: [RFC 4541](https://www.rfc-editor.org/rfc/rfc4541.html).
- **RFC 6762, 2013**, *Multicast DNS*. Defines link-local DNS resolution using multicast and UDP 5353: [RFC 6762](https://www.rfc-editor.org/rfc/rfc6762.html).
- **RFC 6763, 2013**, *DNS-Based Service Discovery*. Defines PTR, SRV, and TXT-based service discovery: [RFC 6763](https://www.rfc-editor.org/rfc/rfc6763.html).
- **RFC 2979, 2000**, *Behavior of and Requirements for Internet Firewalls*. Describes firewall interoperability and traffic-screening principles: [RFC 2979](https://www.rfc-editor.org/rfc/rfc2979.html).

## Practical Examples and Evidence

Packet capture should distinguish discovery from application traffic. On a Linux router or observation host, mDNS can be isolated with:

```bash
tcpdump -ni any 'udp port 5353 and host 224.0.0.251'
```

Ordinary broadcast-heavy discovery can be inspected with:

```bash
tcpdump -ni any 'broadcast or multicast'
```

After a device is discovered, capture traffic between the client and IoT endpoint:

```bash
tcpdump -ni any 'host 198.51.100.25 and host 192.0.2.50'
```

The evidence should answer whether the client sends a SYN or UDP request, whether that packet appears on the IoT-side interface, and whether a response returns. A packet present on the ingress interface but absent on the egress interface strongly implicates gateway policy or routing. A request visible on both sides with no response shifts attention toward the endpoint, service port, or host firewall.

A vendor-neutral Linux `nftables` policy can express least-privilege inter-VLAN access:

```nft
table inet filter {
    chain forward {
        type filter hook forward priority 0; policy drop;

        ct state established,related accept

        ip saddr 198.51.100.0/24 ip daddr 192.0.2.50 \
            tcp dport 9000 ct state new accept
    }
}
```

This permits established return traffic automatically while limiting new trusted-to-IoT sessions to one destination and port. If packet capture proves the IoT device must initiate a separate callback, that direction should receive its own narrowly scoped rule rather than a blanket bidirectional allow.

## Key Technical Insights

- **Discovery reachability is not session reachability.** mDNS reflection can reveal a device while the stateful firewall still blocks its application port.
- **Internet connectivity is not evidence of inter-VLAN permission.** Default routes and NAT can work while east-west policy remains deny-by-default.
- **Broadcast and multicast are not interchangeable.** Broadcast generally terminates at the routed boundary; multicast forwarding depends on group scope, multicast control protocols, and explicit relay or routing behavior.
- **mDNS is intentionally link-local.** Extending it across VLANs requires a reflector, proxy, or gateway service that deliberately republishes selected queries and responses.
- **Direction matters.** A rule allowing trusted clients to initiate sessions toward IoT devices is materially different from allowing IoT devices to initiate arbitrary sessions toward trusted networks.
- **Broad allow rules are diagnostic tools, not final architecture.** They can prove that policy is the blocker, but they should be reduced to specific sources, destinations, protocols, and ports after evidence is collected.

## Prevention Strategies and Takeaways

Design IoT segmentation around observable traffic requirements rather than assumptions about how a mobile application behaves. Establish a deny-by-default boundary, then validate discovery and session flows separately with packet captures and state-table evidence.

Where service discovery must cross VLANs, prefer narrowly scoped mDNS or DNS-SD reflection over unrestricted multicast forwarding. Avoid attempting to route generic Layer 2 broadcast discovery across security boundaries. For the actual application session, permit only the initiating direction that is required and rely on stateful return handling where appropriate.

Finally, treat temporary removal of isolation as a controlled experiment. If communication immediately succeeds, isolation has identified the policy layer responsible, but the correct remediation is not permanent de-segmentation. Re-enable the boundary, capture the successful flow, identify exact endpoints and ports, and implement the smallest policy exception that preserves application functionality without collapsing the trust model.
