---
layout: post
title: "Building and Transferring Docker Images to Air-Gapped Debian Systems"
date: 2026-09-02 03:25:00 +0530
description: "A practical Debian-focused guide to Docker images, containers, offline Docker installation, and transferring workloads into air-gapped environments."
tags: [docker, debian, containers, airgap, linux]
categories: [learning]
published: true
---

Docker works well in isolated environments because applications and their dependencies can be packaged on an internet-connected system, transferred as files, and loaded on a completely offline host.

The important part is understanding what should be transferred. In most cases, **transfer the Docker image, not the container**.

A Docker image is a static, read-only template containing the application filesystem, configuration, metadata, and image layers. A Docker container is a runtime instance created from that image.

## Image vs Container

Think of an **image** as an application package and a **container** as a running copy of that package.

An image:

- Is read-only.
- Can be versioned and tagged.
- Can create multiple containers.
- Preserves image layers and Docker metadata.
- Is normally built from a Dockerfile.
- Can be transferred with `docker save` and restored with `docker load`.

A container:

- Is created from an image.
- Has a writable filesystem layer.
- Represents runtime state.
- Can be started, stopped, modified, or deleted.
- Can be exported as a flattened filesystem using `docker export`.

For air-gapped deployments, **`docker save` and `docker load` should normally be used**.

Use `docker export` and `docker import` when you specifically need the filesystem state of an existing container and do not care about preserving its original image layers and history.

## Choosing the Right Method

Use **Dockerfile → build → save → load** for production deployments, repeatable lab environments, and normal air-gapped application distribution.

Use **docker commit → save → load** when you need to capture useful container changes quickly but cannot immediately reproduce them in a Dockerfile.

Use **export → import** when only the resulting container filesystem matters and losing layers, history, and some Docker metadata is acceptable.

For long-term infrastructure management, prefer Dockerfiles. They document exactly how an image was created and make rebuilding, auditing, patching, and version control significantly easier.

## Building an Image on an Internet-Connected Debian System

First, install Docker Engine on the connected host. Follow the official Docker installation guide for Debian: https://docs.docker.com/engine/install/debian/

Verify installation:

```bash
sudo systemctl status docker
sudo docker run hello-world
```

A Dockerfile is the preferred way to create a repeatable image. For example:

```dockerfile
FROM debian:13-slim

RUN apt-get update && \
    apt-get install -y curl iputils-ping && \
    rm -rf /var/lib/apt/lists/*

CMD ["/bin/bash"]
```

Build it:

```bash
docker build -t offline-tools:1.0 .
```

Verify the image:

```bash
docker images
docker run --rm -it offline-tools:1.0
```

Everything the container will require from package repositories should be installed **during the image build while internet access is available**. Do not design an offline container around running `apt update` after deployment.

## Saving the Docker Image

Export the image into a portable tar archive:

```bash
docker save -o offline-tools-1.0.tar offline-tools:1.0
```

`docker save` preserves the image's layers, tags, configuration, and parent-layer information that Docker needs.

If you made changes after running it interactively, commit the image first:

```bash
docker commit <container_id> offline-tools:2.0
docker save -o offline-tools-2.0.tar offline-tools:2.0
```

For multiple images:

```bash
docker save -o application-stack.tar \
  frontend:1.0 \
  backend:1.0 \
  postgres:17
```

Generate a checksum before transferring:

```bash
sha256sum offline-tools-1.0.tar > offline-tools-1.0.tar.sha256
```

Transfer both files using approved removable media or your organization's air-gap transfer process.

## Installing Docker on the Air-Gapped Debian System

The offline host needs Docker Engine before it can load the transferred image. Download Docker `.deb` packages on an internet-connected system and transfer them to the air-gapped host.

Follow the official Docker documentation for the **manual package installation method**: https://docs.docker.com/engine/install/debian/#install-from-a-package

In summary:

- Download the required `.deb` files from `https://download.docker.com/linux/debian/dists/` for your Debian version and architecture.
- Transfer the packages offline.
- Install them using `sudo dpkg -i`.
- Verify installation with `sudo systemctl status docker`.

Because the machine is offline, do **not** use `docker run hello-world` unless the `hello-world` image has also been transferred.

## Loading the Image Offline

First, verify that the archive was not corrupted during transfer:

```bash
sha256sum -c offline-tools-1.0.tar.sha256
```

A successful result should report:

```text
offline-tools-1.0.tar: OK
```

Load the image:

```bash
sudo docker load -i offline-tools-1.0.tar
```

Verify it:

```bash
sudo docker images
```

Run the container:

```bash
sudo docker run --rm -it offline-tools:1.0
```

At this point, neither an internet connection nor Docker Hub is required.

## Exporting a Container Instead

Sometimes the important state exists inside a modified container rather than its original image.

Find the container:

```bash
docker ps -a
```

Export its filesystem:

```bash
docker export <container_id> -o container.tar
```

Transfer the archive and import it on the offline system:

```bash
docker import container.tar imported-container:1.0
```

Verify it:

```bash
docker images
```

This is different from `docker save`.

**`docker save` + `docker load`** should be used for normal image distribution.

**`docker export` + `docker import`** creates a flattened filesystem snapshot. Image layer history is lost, and data stored in Docker volumes is not included.

If you modified a container interactively but want to preserve it as an image before transferring it, another option is:

```bash
docker commit <container_id> custom-image:1.0
docker save -o custom-image-1.0.tar custom-image:1.0
```

This works, but building the changes into a Dockerfile is preferable because the resulting environment is reproducible.

## Key Takeaways

For most air-gapped deployments, the workflow should be:

```text
Internet-connected Debian host
        |
        | docker build
        v
Docker image
        |
        | docker save / commit and save
        v
image.tar + SHA256 checksum
        |
        | approved offline transfer
        v
Air-gapped Debian host
        |
        | docker load
        v
Local Docker image
        |
        | docker run
        v
Running container
```

Build everything possible while connected to the internet, transfer immutable images instead of relying on runtime downloads, verify transferred files with checksums, and keep the Dockerfile as the authoritative definition of the environment.

That approach makes an air-gapped Docker deployment reproducible instead of turning the offline container into a manually maintained system.