# Harsh Verma portfolio content guide

This guide explains exactly where to place your photos, certificates, and Markdown notes, how to preview them locally, and how to save them to GitHub.

## Quick folder map

```text
Jekyll-site/
├── assets/
│   └── img/
│       ├── profile/          # Your professional profile photo
│       ├── certifications/   # Full certificate images
│       └── notes/            # Images used inside Learning Hub notes
├── _data/
│   ├── profile.yml           # Selects your profile photo
│   └── certifications.yml    # Certificate names, dates, IDs, and image paths
└── _posts/                   # Your Learning Hub Markdown notes
```

Use lowercase filenames with hyphens instead of spaces. For example, use `ccna-certificate.jpg`, not `CCNA Certificate.jpg`.

## 1. Add your profile photo

### Place the image here

Create the `assets/img/profile/` folder if it does not exist, then add your image:

```text
assets/img/profile/harsh-verma.jpg
```

A portrait image with a 4:5 ratio works best. A size around 1200 × 1500 pixels is enough for a sharp result without making the site unnecessarily heavy.

### Connect it to the website

Open `_data/profile.yml` and change:

```yaml
photo:
```

to:

```yaml
photo: /assets/img/profile/harsh-verma.jpg
```

You can also improve the image description:

```yaml
photo_alt: Professional portrait of Harsh Verma
```

If `photo` is left blank, the website continues showing the `HV` placeholder.

## 2. Add certificate images

### Place the images here

Create `assets/img/certifications/` and use clear filenames such as:

```text
assets/img/certifications/ccna.jpg
assets/img/certifications/tryhackme-security-engineer.jpg
assets/img/certifications/cyber-security-101.jpg
assets/img/certifications/wireshark-fundamentals.jpg
```

JPG, PNG, and WebP files are suitable. Make sure the text remains readable when the full image is opened.

### Connect each image to its card

Open `_data/certifications.yml`. Find the matching certificate and set its `image` value.

Example:

```yaml
- title: Cisco Certified Network Associate (CCNA)
  short: CCNA
  issuer: Cisco
  date: January 2024
  credential_id: CSC014498293
  image: /assets/img/certifications/ccna.jpg
```

Repeat this for every certificate. If an `image` value remains blank, that card displays the current “Image coming soon” placeholder.

Certificate IDs are public on the website. Remove a `credential_id` value if you do not want to publish it.

## 3. Add a Learning Hub note

Every note is one Markdown file inside `_posts/`.

### Name the file

The filename must start with its publication date:

```text
_posts/2026-08-30-linux-network-troubleshooting.md
```

Use this pattern:

```text
YYYY-MM-DD-short-title.md
```

### Add the note header

Start every note with YAML front matter:

```yaml
---
layout: post
title: "Linux Network Troubleshooting Checklist"
date: 2026-08-30 09:00:00 +0530
description: "A practical checklist for diagnosing Linux connectivity problems."
tags: [linux, networking, troubleshooting]
categories: [learning]
published: true
---
```

Write the article underneath that closing `---`:

````markdown
## Start with the interface

Check whether the expected interface is present and operational.

```bash
ip address show
ip route show
```

## Continue with name resolution

Compare direct IP connectivity with DNS-based connectivity.
````

The Learning Hub automatically:

- sorts notes newest first;
- displays up to 20 cards per page;
- uses `description` as the card excerpt;
- opens the full note in a dialog;
- creates a permanent page for sharing the article.

### Add an image to a note

Put the image in:

```text
assets/img/notes/linux-network-diagram.png
```

Then reference it in Markdown:

```markdown
![Linux network troubleshooting flow]({{ '/assets/img/notes/linux-network-diagram.png' | relative_url }})
```

Always include a useful description between the square brackets for accessibility.

## 4. Preview your changes locally

From the `Jekyll-site` folder, run:

```sh
bundle exec jekyll serve --livereload --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4000/
```

Check these pages:

- Portfolio: `http://127.0.0.1:4000/`
- Learning Hub: `http://127.0.0.1:4000/learn/`
- Certifications: `http://127.0.0.1:4000/certs/`

Keep that terminal open while editing. Whenever you save a project file, Jekyll rebuilds the site and LiveReload refreshes the browser automatically.

### If port 4000 is already in use

Do not start a second preview server. Return to the terminal running Jekyll and press `Control+C`. If you cannot find that terminal, identify the process using the port:

```sh
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Copy the number in the `PID` column and stop that process gracefully:

```sh
kill PID_NUMBER
```

Then start the LiveReload command again. Use `kill -9` only as a last resort for a process that refuses to stop.

Before committing, run a production build:

```sh
bundle exec jekyll build
```

Only continue if the build finishes successfully.

## 5. Commit the complete website for the first time

The local repository already points to:

```text
https://github.com/harshvermac5/harshvermac5.github.io.git
```

If that repository does not exist yet, create an empty public repository on GitHub named exactly `harshvermac5.github.io`. Do not initialize it with a README, license, or `.gitignore` because this local project already contains those files.

Review the pending changes:

```sh
git status
```

Stage the full new website, including the removal of al-folio demo content:

```sh
git add --all
```

Create the first commit:

```sh
git commit -m "Build personal portfolio with learning hub and certifications"
```

Push the `main` branch:

```sh
git push -u origin main
```

Do not commit the generated `_site/` folder. It is already ignored by Git.

## 6. Commit future content updates

After adding or editing a photo, certificate, or note, preview and build the site first. Then run:

```sh
git status
git add --all
git commit -m "Add new portfolio content"
git push
```

Use a more descriptive message when possible:

```sh
git commit -m "Add CCNA certificate image"
git commit -m "Publish Linux bonding troubleshooting note"
git commit -m "Update professional profile photo"
```

Each commit should represent one clear update. This makes it easier to understand the project history and undo a specific change later.

## 7. Confirm GitHub Pages deployment

After pushing:

1. Open the repository on GitHub.
2. Open the **Actions** tab and wait for the `Deploy site` workflow to finish successfully.
3. Open **Settings → Pages**.
4. Set the publishing source to the `gh-pages` branch if it is not already selected.
5. Visit `https://harshvermac5.github.io` after deployment completes.

Your normal workflow is therefore:

```text
Add content → Preview locally → Build successfully → Commit → Push → Check deployment
```
