# Beginner's guide to the Harsh Verma portfolio

This guide explains how this specific website works, where to make common changes, how to preview those changes, and how to diagnose problems safely.

You do not need to understand every file before editing the site. Start with the quick workflow below, then use the relevant section when you need it.

## The safe everyday workflow

For almost every update:

1. Open the project folder in your editor.
2. Change the appropriate source file.
3. Save the file.
4. Preview the site locally.
5. Run a production build.
6. Review the Git changes.
7. Commit and push to `main`.
8. Check the GitHub Actions deployment.

The commands are:

```sh
bundle exec jekyll serve --livereload --host 127.0.0.1
```

Open `http://127.0.0.1:4000/` while that command is running.

Before committing, stop the preview with `Control+C`, then run:

```sh
bundle exec jekyll build
git status
git diff
git add --all
git commit -m "Describe the update"
git push
```

Never run Git commands you do not understand merely because they appear in an error message or online answer. In particular, commands containing `--force`, `reset`, `clean`, or `rm` deserve extra care.

## The big picture

This is a Jekyll website. Jekyll combines your Markdown, HTML, YAML data, CSS, JavaScript, configuration, and the installed al-folio theme to produce ordinary static HTML files.

```text
Editable source files
        ↓
Jekyll + al-folio gems
        ↓
Generated _site/ folder
        ↓
GitHub Actions copies the build to gh-pages
        ↓
https://harshvermac5.github.io
```

There are three important layers:

1. **Source:** Files such as `_pages/about.md`, `_data/certifications.yml`, and `assets/css/portfolio.css`. Edit these.
2. **Theme runtime:** Layouts, the navbar template, and base styles supplied by installed al-folio Ruby gems. Normally do not edit these.
3. **Generated output:** `_site/` locally and the `gh-pages` branch on GitHub. Never edit these directly because the next build replaces them.

## Project map

```text
Jekyll-site/
├── _config.yml                    # Site-wide settings and feature switches
├── Gemfile                        # Ruby and Jekyll dependencies
├── Gemfile.lock                   # Exact dependency versions
├── CONTENT_GUIDE.md               # Adding images, certificates, and notes
├── PROJECT_GUIDE.md               # This guide
│
├── _pages/
│   ├── about.md                   # Homepage and portfolio content
│   ├── learn.md                   # Learning Hub listing and dialogs
│   ├── certifications.md          # Certification listing and dialogs
│   ├── cv.md                      # Résumé page settings
│   ├── projects-nav.md            # Projects navbar anchor
│   └── 404.md                     # Not-found page
│
├── _posts/                        # Learning Hub Markdown articles
│
├── _data/
│   ├── profile.yml                # Profile photograph configuration
│   ├── certifications.yml         # Certificate data
│   ├── cv.yml                     # Résumé data
│   └── socials.yml                # Email and social accounts
│
├── assets/
│   ├── css/portfolio.css          # Custom visual design and responsive layout
│   ├── js/portfolio.js            # Navbar, scrolling, and dialog behavior
│   └── img/
│       ├── profile/               # Profile photograph
│       ├── certifications/        # Certificate images
│       └── notes/                 # Images used by articles
│
└── .github/workflows/deploy.yml   # Builds and publishes the site
```

## The file types you will encounter

### Markdown

Markdown files normally end in `.md`. Markdown provides simple syntax for headings, links, lists, images, and code blocks.

```markdown
## Heading

[Link text](https://example.com)

- List item
```

Markdown files can also contain HTML and Liquid. The homepage uses mostly HTML because its layout is more customized.

### YAML

YAML stores structured data and configuration. It uses indentation instead of braces.

```yaml
photo: /assets/img/profile/harsh-verma.jpg
photo_alt: Professional portrait of Harsh Verma
```

Important YAML rules:

- Use spaces, not tabs.
- Keep indentation consistent.
- Put quotes around text containing unusual punctuation when unsure.
- A colon must normally be followed by a space.

### Front matter

The YAML section between two `---` lines at the beginning of a page is called front matter.

```yaml
---
layout: page
title: Certifications
permalink: /certs/
nav: true
nav_order: 3
---
```

Front matter tells Jekyll how to build the page:

- `layout` selects a theme layout.
- `title` supplies the page title and often its navbar label.
- `permalink` defines the URL.
- `nav: true` adds the page to the navigation.
- `nav_order` controls its position.

### Liquid

Liquid is Jekyll's template language. It appears inside `{{ ... }}` and `{% ... %}`.

```liquid
{{ '/assets/css/portfolio.css' | relative_url }}
```

This creates a URL that works both locally and on GitHub Pages.

```liquid
{% for certification in site.data.certifications %}
  {{ certification.title }}
{% endfor %}
```

This loops over `_data/certifications.yml` and creates one card for every entry.

## How the homepage works

The homepage is `_pages/about.md`. Its permalink is `/`, so Jekyll turns it into the site's root page.

The major sections are:

- `.portfolio-hero`: introduction, buttons, contact links, and profile image.
- `.metric-grid`: the three career statistics.
- `.experience-list`: employment history.
- `.skill-clusters`: technical focus areas.
- `#projects`: selected project cards.
- `.portfolio-cta`: the Learning Hub call to action.

### Change the introduction

Edit the text inside `.hero-copy` in `_pages/about.md`:

```html
<p class="eyebrow">Job title and location</p>
<h1 id="portfolio-title">Main headline.</h1>
<p class="hero-lead">Professional introduction...</p>
```

Keep `id="portfolio-title"` because the surrounding section uses it for accessibility.

### Change the career statistics

Edit the `<strong>` value and `<span>` description inside `.metric-grid`:

```html
<article class="metric-tile">
  <strong>600+</strong>
  <span>GPU and CPU servers supported</span>
</article>
```

### Add or edit employment

Each job is one `<article class="experience-entry">` inside `.experience-list`.

Copy an existing article, paste it in the correct chronological location, and update:

- `.experience-date`
- location
- `<h3>` job title
- `.company`
- summary paragraph
- bullet list

Make sure every opening tag has a corresponding closing tag.

### Add a GitHub-only project

For a project whose whole card should open GitHub, copy this pattern:

```html
<a class="project-tile" href="https://github.com/USERNAME/REPOSITORY">
  <span class="project-number">04</span>
  <h3>Project name</h3>
  <p>Short project description.</p>
  <span class="text-link">View on GitHub <span aria-hidden="true">↗</span></span>
</a>
```

### Add a hosted project with a separate GitHub link

Do not place an `<a>` inside another `<a>`; nested links are invalid HTML. Use the Multi Search pattern instead:

```html
<article class="project-tile">
  <a class="project-card-link" href="https://USERNAME.github.io/PROJECT" aria-label="Open the Project Name hosted project"></a>
  <span class="project-number">04</span>
  <h3>Project name</h3>
  <p>Short project description.</p>
  <a class="text-link project-repository-link" href="https://github.com/USERNAME/REPOSITORY"> View on GitHub <span aria-hidden="true">↗</span> </a>
</article>
```

The invisible `.project-card-link` covers the card. `.project-repository-link` sits above it, so the GitHub action remains independently clickable.

## How navigation works

The navbar HTML itself comes from the installed `al_folio_core` gem. Do not edit files inside `.gem/`; a dependency update can replace them.

The normal menu is created from pages containing:

```yaml
nav: true
nav_order: 2
```

The current order is:

1. About
2. Projects
3. Learning Hub
4. Certifications

The About label comes from the homepage's `title: About` front matter. The site brand comes from `title: Harsh Verma` in `_config.yml`.

`_pages/projects-nav.md` is a navigation-only page. It points to `/#projects`, which scrolls to the Projects section instead of generating a separate Projects page.

The theme normally shows the Harsh Verma brand only on inner pages. `assets/js/portfolio.js` adds the same brand to the homepage.

When changing the Projects anchor, update all three matching pieces:

1. `permalink: /#projects` in `_pages/projects-nav.md`
2. `id="projects"` on the section in `_pages/about.md`
3. `#projects` references in `assets/js/portfolio.js`

`#projects` also has `scroll-margin-top` in the CSS so the fixed navbar does not cover its heading.

## How the Learning Hub works

The Learning Hub page is `_pages/learn.md`, but its article content comes from `_posts/`.

For every post, Jekyll generates:

- a card on `/learn/`;
- a dialog containing the complete article;
- a permanent shareable article URL.

Create a post using this filename format:

```text
_posts/YYYY-MM-DD-short-title.md
```

Example:

```yaml
---
layout: post
title: "Linux Network Troubleshooting Checklist"
date: 2026-09-01 09:00:00 +0530
description: "A practical checklist for diagnosing connectivity problems."
tags: [linux, networking, troubleshooting]
categories: [learning]
published: true
---
```

Write the Markdown article below the front matter.

If a post does not appear, check:

- the filename begins with a valid date;
- the front matter has both opening and closing `---` lines;
- `published` is not `false`;
- the date is not accidentally in the future;
- Jekyll printed no YAML error.

See `CONTENT_GUIDE.md` for detailed image and article examples.

## How certifications work

`_pages/certifications.md` controls the layout. `_data/certifications.yml` controls the actual certificate records.

One entry looks like:

```yaml
- title: Cisco Certified Network Associate (CCNA)
  short: CCNA
  issuer: Cisco
  date: January 2024
  credential_id: CSC014498293
  image: /assets/img/certifications/ccna.jpg
```

The page loops over the YAML list and creates a button and dialog for every entry. Therefore, adding a correctly formatted YAML record automatically creates a new certificate card.

If the image does not appear:

1. Confirm the image exists under `assets/img/certifications/`.
2. Confirm the filename, capitalization, and extension match exactly.
3. Use a path beginning with `/assets/`.
4. Check that the YAML indentation matches the surrounding records.

## How the résumé works

`_pages/cv.md` enables the résumé page at `/cv/` and selects the CV layout.

The résumé content is stored in `_data/cv.yml`. Edit the existing YAML sections rather than changing the generated page.

After editing the CV:

```sh
bundle exec jekyll build
```

YAML indentation mistakes are the most common source of CV build failures.

## Profile photograph and social links

The profile image path and alternative text are stored in `_data/profile.yml`.

```yaml
photo: /assets/img/profile/harsh-verma.jpg
photo_alt: Professional portrait of Harsh Verma
```

Social accounts and email are in `_data/socials.yml`. Empty values are normally ignored by the theme.

Do not commit passwords, API keys, private tokens, private addresses, or other secrets to these files. The GitHub repository and website are public.

## Understanding the custom CSS

The custom design is in `assets/css/portfolio.css`.

### Design variables

The variables at the top define the site's reusable visual language:

```css
:root {
  --portfolio-ink: var(--global-text-color, #14213d);
  --portfolio-muted: var(--global-text-color-light, #59667a);
  --portfolio-surface: var(--global-card-bg-color, #ffffff);
  --portfolio-line: var(--global-divider-color, #dfe5ec);
  --portfolio-accent: var(--global-theme-color, #006d77);
  --portfolio-radius: 1.25rem;
}
```

Change variables when you want a site-wide visual adjustment. Change a component rule when you want to affect only that component.

Examples:

- `.button` controls every custom pill button.
- `.project-tile` controls project cards.
- `.certification-tile` controls certificate cards.
- `.portfolio-cta` controls the bottom homepage banner.
- `.portfolio-dialog` controls article and certificate dialogs.

### Responsive behavior

Rules inside media queries apply at smaller widths:

```css
@media (max-width: 780px) {
  /* tablet and phone layout */
}

@media (max-width: 480px) {
  /* narrow phone layout */
}
```

When changing a grid or button, always inspect both desktop and mobile widths.

### Light and dark themes

The custom variables refer to al-folio's global theme variables. That is why the custom pages automatically follow the light/dark theme button.

Avoid replacing theme-aware variables with fixed white or black values unless the color must remain fixed.

### Safe CSS debugging

When an element looks wrong:

1. Inspect it in the browser's developer tools.
2. Note its class name.
3. Search `assets/css/portfolio.css` for that class.
4. Temporarily disable individual CSS declarations in developer tools.
5. Make the confirmed change in the source CSS file.
6. Test desktop, mobile, light mode, and dark mode.

## Understanding the custom JavaScript

`assets/js/portfolio.js` currently handles three behaviors:

1. Adds the Harsh Verma brand to the homepage navbar.
2. Smoothly scrolls to Projects and closes the mobile menu.
3. Opens and closes Learning Hub and certificate dialogs.

The dialogs connect HTML to JavaScript through attributes:

```html
<button data-dialog-id="certification-0">...</button>
<dialog id="certification-0">...</dialog>
```

The `data-dialog-id` value must match the dialog's `id`. Close buttons use `data-dialog-close`.

If a dialog stops working, check the browser console for JavaScript errors and verify those IDs and attributes before rewriting the script.

## Important `_config.yml` settings

Common site-wide settings near the top include:

```yaml
title: Harsh Verma
url: https://harshvermac5.github.io
baseurl:
navbar_fixed: true
search_enabled: true
max_width: 1100px
```

Because this is the user site `harshvermac5.github.io`, `baseurl` should remain empty.

Restart the local Jekyll server after editing `_config.yml`. Jekyll watches ordinary content files, but configuration changes are not always reloaded safely while the server is running.

## Local preview and build

### First-time setup

From the project directory:

```sh
bundle install
```

If you also want the project's formatter and optional JavaScript tests:

```sh
npm install
```

Use the lock files already in the repository. Do not delete `Gemfile.lock` or `package-lock.json` merely to solve a dependency error.

### Start the preview

```sh
bundle exec jekyll serve --livereload --host 127.0.0.1
```

Leave this terminal open. Jekyll rebuilds when a source file changes.

### Port 4000 is already in use

First, find the existing server:

```sh
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

If it is your existing Jekyll process, use that server instead of starting another one. Otherwise, stop it gracefully using the displayed PID:

```sh
kill PID_NUMBER
```

Use `kill -9` only as a last resort.

### LiveReload does not update the page

Check the following:

- The Jekyll terminal is still running.
- The command includes `--livereload`.
- You edited a source file, not a generated `_site` file.
- The terminal does not show a build error.
- You restarted Jekyll after changing `_config.yml`.
- The browser is using `http://127.0.0.1:4000/` rather than the public site.

Try a normal browser refresh after Jekyll reports that regeneration finished.

### Production build

```sh
bundle exec jekyll build
```

A successful build creates `_site/`. That folder is disposable and is ignored by Git.

## How deployment works

The source branch is `main`. The generated deployment branch is `gh-pages`.

When you push a relevant change to `main`:

1. `.github/workflows/deploy.yml` starts on GitHub Actions.
2. GitHub installs Ruby, Python, and Node dependencies.
3. Jekyll builds the site into `_site/`.
4. PurgeCSS removes unused CSS from the generated build.
5. The deployment action publishes `_site/` to `gh-pages`.
6. GitHub Pages serves the `gh-pages` branch from `/ (root)`.

Do not manually edit or commit to `gh-pages`. Do not commit your local `_site/` folder.

After pushing:

1. Open the repository's **Actions** tab.
2. Open the latest **Deploy site** run.
3. Wait for every step to become green.
4. Visit `https://harshvermac5.github.io`.

If deployment fails, open the failed step and read the first useful error rather than the final generic `Process completed with exit code 1` message.

## Git without surprises

### See what changed

```sh
git status
git diff
```

`git status` lists changed, deleted, and untracked files. `git diff` shows modifications to tracked files.

### Save an update

```sh
git add --all
git status
git commit -m "Add another portfolio project"
git push
```

Always inspect the second `git status` before committing. It tells you exactly what the commit will contain.

### Inspect history

```sh
git log --oneline --decorate -10
```

### View an older file without changing anything

```sh
git show HEAD~1:_pages/about.md
```

### Discarding changes

`git restore FILE` permanently discards uncommitted edits to that file. Review `git diff -- FILE` first, and make a copy if you might need the work.

Avoid `git reset --hard`, `git clean`, and force pushes during normal updates.

## Common problems and where to look

### The whole build fails

Look at the Jekyll terminal. Typical causes are:

- malformed YAML;
- missing closing `---` in front matter;
- invalid Liquid syntax;
- a missing dependency.

The error usually names the file and line.

### A page is unstyled

Confirm the page includes:

```liquid
<link rel="stylesheet" href="{{ '/assets/css/portfolio.css' | relative_url }}">
```

Then check the browser's Network panel for a failed `portfolio.css` request.

### A link works locally but fails publicly

Use Liquid's `relative_url` for links to your own site:

```liquid
href="{{ '/certs/' | relative_url }}"
```

Check capitalization. GitHub's servers use case-sensitive paths even when your Mac may appear forgiving.

### An image is broken

Check the path, filename, capitalization, and extension. Avoid spaces in filenames; use lowercase words separated by hyphens.

### The navbar covers an anchor

Add `scroll-margin-top` to the target in `assets/css/portfolio.css` rather than adding arbitrary blank HTML above it.

### A button or dialog does nothing

Open the browser console, find the first JavaScript error, and verify the IDs/classes/data attributes used by `assets/js/portfolio.js`.

### The public site still shows an old version

Check, in order:

1. Did `git push` succeed?
2. Did the latest **Deploy site** workflow finish successfully?
3. Did `gh-pages` receive a new commit?
4. Is GitHub Pages configured for `gh-pages` and `/ (root)`?
5. Does a private/incognito window show the new version?

## Things not to edit directly

- `_site/`: generated local output.
- `gh-pages`: generated deployment branch.
- `node_modules/`: installed JavaScript packages.
- `.jekyll-cache/`: generated Jekyll cache.
- Files inside the installed al-folio gem under `~/.gem/`: dependency-managed theme code.

If the navbar's underlying template must eventually be changed, create a deliberate local override only after understanding the maintenance cost. For ordinary labels and order, use page front matter instead.

## A checklist before every push

- [ ] The local preview looks correct.
- [ ] Homepage, Learning Hub, Certifications, and Résumé were checked.
- [ ] Desktop and narrow mobile widths were checked.
- [ ] Light and dark modes were checked when CSS changed.
- [ ] Links and dialogs work.
- [ ] `bundle exec jekyll build` succeeds.
- [ ] `git status` contains only intended files.
- [ ] No passwords, tokens, or private information were added.
- [ ] The commit message describes the change.
- [ ] The GitHub Actions deployment completes after pushing.

## Recommended learning order

You do not need to learn everything at once. A useful order is:

1. Basic Markdown
2. Basic HTML elements and nesting
3. CSS selectors, spacing, flexbox, and grid
4. YAML and Jekyll front matter
5. Liquid variables, loops, and filters
6. Browser developer tools
7. Basic JavaScript events and DOM selection
8. Git status, diff, add, commit, push, and log

The fastest way to learn this project is to make one small change, preview it, inspect the result, and commit it before beginning the next change.
