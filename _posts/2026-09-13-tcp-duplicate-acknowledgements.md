---
layout: post
title: "TCP Duplicate ACKs and Fast Retransmit: Reading Packet Loss in Wireshark"
date: 2026-09-13 04:34:00 +0530
description: "Learn how TCP duplicate acknowledgements expose sequence gaps, trigger fast retransmission, and help distinguish packet loss from out-of-order delivery in Wireshark."
tags: [tcp, wireshark, packet-analysis, fast-retransmit]
categories: [Networking]
published: true
---

A **TCP Duplicate Acknowledgement**, or **Dup ACK**, is an ACK that repeats an acknowledgement number already sent by the receiver. It usually appears when the receiver gets data beyond a gap in the TCP byte stream and is still waiting for an earlier segment.

Dup ACKs are useful troubleshooting evidence, but they do not automatically prove packet loss. They can also result from packet reordering or duplication. The surrounding sequence numbers and retransmissions determine what actually happened.

## TCP Acknowledgements Are Cumulative

TCP sequence numbers identify bytes, not packets. The ACK number means **the next byte the receiver expects**.

If a receiver sends `ACK=5001`, it is effectively saying that all bytes through `5000` have arrived in order and byte `5001` is next.

Consider this simplified flow:

```text
Sender                         Receiver
SEQ=1001 LEN=1000  ----------> receives 1001-2000
                  <----------  ACK=2001

SEQ=2001 LEN=1000  ---X        lost
SEQ=3001 LEN=1000  ----------> out of order
                  <----------  ACK=2001  Dup ACK

SEQ=4001 LEN=1000  ----------> out of order
                  <----------  ACK=2001  Dup ACK

SEQ=5001 LEN=1000  ----------> out of order
                  <----------  ACK=2001  Dup ACK
```

The receiver cannot advance its cumulative ACK because bytes beginning at `2001` are missing. Even though later data arrived, it continues advertising `ACK=2001`.

If **Selective Acknowledgement**, or **SACK**, is enabled, the receiver can additionally report which higher sequence ranges arrived successfully. The cumulative ACK still points to the beginning of the unresolved gap.

## Why Duplicate ACKs Occur

The most common causes are:

- **Packet loss**: A TCP segment is dropped while later segments continue to arrive.
- **Out-of-order delivery**: A delayed segment arrives after newer sequence numbers, often because of path variation, buffering, ECMP, or transient queue behavior.
- **Packet duplication**: The same data or ACK is observed more than once. This is less common and may indicate capture artifacts or unusual network behavior.

This distinction matters. A few isolated Dup ACKs followed by the delayed original segment can indicate reordering. Repeated Dup ACKs followed by a retransmission of the missing sequence range are stronger evidence of loss.

## How Fast Retransmit Works

TCP does not always wait for the **Retransmission Timeout**, or **RTO**, before recovering a missing segment.

Under the classic fast retransmit behavior defined by TCP congestion control, the sender treats **three duplicate ACKs** as evidence that a segment is probably missing. It retransmits the segment beginning at the oldest unacknowledged sequence number without waiting for the RTO to expire.

Using the earlier example, three Dup ACKs carrying `ACK=2001` tell the sender that newer data is reaching the receiver while the byte range beginning at `2001` is still absent.

The sender can then retransmit the missing data:

```text
Sender                         Receiver
SEQ=2001 LEN=1000  ----------> retransmission
                  <----------  ACK=6001
```

Once the missing segment arrives, the receiver can process the previously buffered out-of-order data and send a **cumulative ACK** that jumps forward. `ACK=6001` means everything before byte `6001` has now been received in order.

Fast retransmit therefore reduces recovery latency compared with waiting for a retransmission timer.

## How Wireshark Identifies Duplicate ACKs

Wireshark performs TCP state analysis across packets in the same flow. Its duplicate-ACK heuristic expects conditions such as:

- TCP payload length is zero.
- The receive window is non-zero and unchanged, unless valid SACK information is present.
- The connection has established sequence and acknowledgement tracking state.
- `SYN`, `FIN`, and `RST` are not set.

Useful display filters include:

```text
tcp.analysis.duplicate_ack
```

```text
tcp.analysis.fast_retransmission
```

```text
tcp.analysis.retransmission
```

```text
tcp.analysis.out_of_order
```

Do not troubleshoot from the Info column alone. Inspect the TCP **Sequence Number**, **Acknowledgement Number**, **Next Sequence Number**, payload length, SACK blocks, and packet timing.

## Distinguishing Loss From Reordering

When analyzing a trace, first identify the sequence gap that caused the ACK number to stop advancing.

Then inspect what happens next:

- If the original missing segment appears shortly afterward and there is no retransmission, **reordering** is likely.
- If the sender retransmits the missing sequence range after repeated Dup ACKs, **packet loss** is more likely.
- If retransmissions continue repeatedly, investigate persistent loss, congestion, MTU problems, filtering, or a failing path.
- If many unrelated packets appear duplicated, verify the capture method before blaming the network.

Capture location is critical. A packet can be visible at one capture point and still be dropped farther downstream. Likewise, host offloading and mirrored capture paths can create misleading packet-analysis symptoms.

## Practical Troubleshooting Workflow

Start with the affected TCP stream and establish which direction carries the data experiencing the gap.

- Find the first `tcp.analysis.duplicate_ack` event.
- Record its ACK number. That value identifies the next byte the receiver is waiting for.
- Search backward for the segment that should have supplied that byte range.
- Check whether later sequence numbers arrived before it.
- Look for `tcp.analysis.fast_retransmission` or another retransmission of the missing range.
- Compare timestamps to determine whether the event was brief reordering or actual loss recovery.
- Correlate repeated loss with interface counters, queue drops, wireless retries, WAN quality, MTU behavior, or upstream packet captures.

A Dup ACK is therefore best treated as a **signal of a sequence-space gap**, not as a root cause by itself.

## Key Takeaways

- A TCP ACK identifies the **next expected byte** and cumulatively acknowledges earlier data.
- Duplicate ACKs commonly appear when data arrives beyond a missing sequence range.
- Three duplicate ACKs can trigger **TCP Fast Retransmit**, allowing recovery before the retransmission timeout.
- Duplicate ACKs can result from both **packet loss** and **out-of-order delivery**.
- A retransmission following repeated Dup ACKs is stronger loss evidence than Dup ACKs alone.
- Wireshark analysis is capture-point dependent, so sequence behavior should be correlated with counters and captures from multiple points when possible.

The most useful troubleshooting question is not "Why are there duplicate ACKs?" but **"Which sequence range stopped advancing, and what happened to that data between sender and receiver?"**
