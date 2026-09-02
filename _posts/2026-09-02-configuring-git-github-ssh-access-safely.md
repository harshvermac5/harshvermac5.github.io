---
layout: post
title: "Configuring Git and GitHub SSH Access Safely"
date: 2026-09-02 02:00:00 +0530
description: "A practical guide to configuring Git identity, setting up SSH authentication with GitHub, managing remotes, and pushing changes safely."
tags: [git, github, ssh]
categories: [learning]
published: true
---

Git is straightforward once the relationship between your local repository, SSH authentication, and GitHub remotes is clear. Most setup problems come from mixing these three areas together or using commands without understanding their impact.

This guide covers a common GitHub workflow while masking usernames, email addresses, and repository names that should not be copied directly between environments.

## Configure Your Git Identity

Git records an author name and email address inside each commit. Configure these globally if you normally use the same identity across repositories.

```bash
git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_EMAIL@example.com"
```

Verify the configuration:

```bash
git config --global user.name
git config --global user.email
```

These values are commit metadata. They are separate from GitHub SSH authentication.

If you use different identities for different repositories, configure them locally instead:

```bash
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL@example.com"
```

Local configuration overrides the global value for that repository.

## Generate an SSH Key

SSH authentication allows Git to communicate with GitHub without repeatedly entering credentials.

Generate an Ed25519 key:

```bash
ssh-keygen -t ed25519 -C "YOUR_EMAIL@example.com"
```

Unless you already have a key-management strategy, the default location is normally sufficient:

```text
~/.ssh/id_ed25519
```

Two files are created:

* `id_ed25519` is the private key.
* `id_ed25519.pub` is the public key.

**Never share the private key.**

Display only the public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy that value into the [SSH key section of your GitHub account](https://github.com/settings/ssh/new).

## Test GitHub SSH Authentication

After adding the public key to GitHub, test the connection:

```bash
ssh -T git@github.com
```

On the first connection, SSH may ask whether you trust GitHub's host key.

A successful authentication confirms that:

* SSH can locate your private key.
* GitHub recognizes the associated public key.
* Your local machine can authenticate to GitHub.

This does not automatically mean you have access to every repository. Repository permissions are still evaluated separately.

## Understand Git Remotes

A Git remote maps a local repository to another repository, typically on GitHub.

Check the current configuration:

```bash
git remote -v
```

A typical SSH remote looks like this:

```text
origin  git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git
```

If `origin` already exists and you want to change it, use:

```bash
git remote set-url origin git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git
```

If the repository does not have an `origin` remote yet, use:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git
```

Do not run both commands blindly.

**`git remote add` creates a new remote. `git remote set-url` modifies an existing one.**

Verify the result:

```bash
git remote -v
```

This simple check prevents accidentally pushing code to the wrong repository.

## Commit and Push Changes

After modifying files, stage the specific files you want included:

```bash
git add _config.yml .github/workflows/deploy.yml
```

Review what Git will commit:

```bash
git status
```

Create the commit:

```bash
git commit -m "Fix GitHub Pages deployment"
```

Push it:

```bash
git push origin main
```

For a new remote branch, it is useful to configure the upstream relationship:

```bash
git push -u origin main
```

After that, future pushes can usually be performed with:

```bash
git push
```

## Be Careful With Force Pushes

A command such as:

```bash
git push origin main --force
```

should not be part of a normal deployment workflow.

A force push tells GitHub to replace the remote branch history with the local version, even when the histories conflict.

This can overwrite commits created by another workstation or contributor.

If rewriting history is intentional, a safer option is:

```bash
git push origin main --force-with-lease
```

`--force-with-lease` refuses the push when the remote branch has changed unexpectedly since your last fetch.

Before any force push, inspect the repository state:

```bash
git status
git log --oneline --decorate -10
git remote -v
```

For shared repositories, fetching first is also useful:

```bash
git fetch origin
```

## Switching Between GitHub Repositories

If you reuse the same local working directory for another GitHub repository, changing `origin` changes where future pushes are sent.

For example:

```bash
git remote set-url origin git@github.com:YOUR_USERNAME/ANOTHER_REPOSITORY.git
```

Verify immediately:

```bash
git remote -v
```

In most cases, however, maintaining separate local directories for separate repositories is safer and easier to reason about.

```text
~/projects/
├── website/
└── application/
```

Each directory can keep its own `.git` metadata and `origin` remote.

## Key Takeaways

* Configure Git identity separately from SSH authentication.
* Use Ed25519 SSH keys for GitHub authentication.
* Share only the `.pub` public key, never the private key.
* Check `git remote -v` before pushing.
* Use `git remote add` only when the remote does not exist.
* Use `git remote set-url` when changing an existing remote.
* Prefer normal pushes over force pushes.
* Use `--force-with-lease` instead of `--force` when history rewriting is genuinely required.
* Replace usernames, email addresses, and repository names with environment-specific values instead of embedding personal information in reusable documentation.
