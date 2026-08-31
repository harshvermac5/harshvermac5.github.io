# Harsh Verma — Portfolio & Learning Hub

[![Live site](https://img.shields.io/badge/Live%20site-harshvermac5.github.io-0aa2c0?style=flat-square)](https://harshvermac5.github.io/)
[![Deploy site](https://github.com/harshvermac5/harshvermac5.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/harshvermac5/harshvermac5.github.io/actions/workflows/deploy.yml)
[![Jekyll](https://img.shields.io/badge/Jekyll-4.4-cc0000?style=flat-square&logo=jekyll)](https://jekyllrb.com/)
[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

Personal portfolio and technical learning hub for **Harsh Verma**, a network and infrastructure engineer specializing in enterprise routing, switching, VPN, SD-WAN, network security, Linux systems, server infrastructure, troubleshooting, and automation.

**Live website:** [harshvermac5.github.io](https://harshvermac5.github.io/)

## What is included

- A responsive professional portfolio with work experience, technical focus areas, and selected projects
- A Markdown-powered Learning Hub for practical engineering notes
- A searchable certification gallery with full-size credential previews
- A data-driven résumé covering experience, education, skills, certificates, and projects
- Light and dark themes
- Keyboard-accessible search
- Responsive layouts for desktop, tablet, and mobile
- Automated deployment through GitHub Actions and GitHub Pages

## Main pages

| Page           | URL                                                | Purpose                                                     |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Portfolio      | [`/`](https://harshvermac5.github.io/)             | Professional introduction, experience, skills, and projects |
| Learning Hub   | [`/learn/`](https://harshvermac5.github.io/learn/) | Technical notes and articles                                |
| Certifications | [`/certs/`](https://harshvermac5.github.io/certs/) | Certification cards and credential images                   |
| Résumé         | [`/cv/`](https://harshvermac5.github.io/cv/)       | Complete professional résumé                                |

## Technology

- [Jekyll 4.4](https://jekyllrb.com/) for static-site generation
- [al-folio](https://github.com/alshedivat/al-folio) v1 components for the core site runtime
- Liquid for reusable templates and data rendering
- Markdown for Learning Hub articles
- YAML for résumé, certifications, profile, and site configuration
- Custom CSS and JavaScript for the portfolio interface and interactions
- GitHub Actions for production builds
- GitHub Pages for hosting

## Project structure

```text
.
├── _config.yml                 # Site settings, URLs, features, and plugins
├── _pages/                     # Portfolio, Learning Hub, certifications, and CV pages
├── _posts/                     # Learning Hub Markdown articles
├── _data/
│   ├── certifications.yml     # Certification details and image paths
│   ├── cv.yml                 # Résumé content
│   ├── profile.yml            # Profile photograph
│   └── socials.yml            # Contact and social links
├── _includes/cv/              # Tracked local CV presentation overrides
├── assets/
│   ├── css/portfolio.css      # Custom portfolio styling
│   ├── js/portfolio.js        # Dialog, navigation, and scrolling behavior
│   └── img/                   # Profile, certification, and article images
├── .github/workflows/         # Build and deployment automation
├── CONTENT_GUIDE.md           # Adding images, certificates, and articles
└── PROJECT_GUIDE.md           # Beginner-friendly maintenance guide
```

Jekyll generates the finished website in `_site/`. That directory is build output and should not be edited manually.

## Run locally

### Requirements

- Ruby and Bundler
- Node.js 20 or newer
- npm
- Git
- ImageMagick for the same image-processing behavior used by production builds

### Install dependencies

Clone the repository and enter the project directory:

```sh
git clone git@github.com:harshvermac5/harshvermac5.github.io.git
cd harshvermac5.github.io
```

Install Ruby and JavaScript dependencies:

```sh
bundle install
npm ci
```

### Start the development server

```sh
bundle exec jekyll serve --livereload --host 127.0.0.1
```

Open [http://127.0.0.1:4000/](http://127.0.0.1:4000/) in a browser. Jekyll rebuilds the site when a source file changes, and LiveReload refreshes the page.

Stop the server with `Control+C`.

### Port 4000 is already in use

Check which process owns the port:

```sh
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

If it is an old Jekyll process, stop it gracefully using its PID:

```sh
kill PID_NUMBER
```

Alternatively, preview the site on another port:

```sh
bundle exec jekyll serve --livereload --host 127.0.0.1 --port 4001
```

## Updating content

| Change                                                      | Edit                            |
| ----------------------------------------------------------- | ------------------------------- |
| Homepage introduction, experience, skills, or project cards | `_pages/about.md`               |
| Profile photograph selection                                | `_data/profile.yml`             |
| Learning Hub article                                        | Add or edit a file in `_posts/` |
| Certification details                                       | `_data/certifications.yml`      |
| Certificate image                                           | `assets/img/certifications/`    |
| Résumé information                                          | `_data/cv.yml`                  |
| Social and contact links                                    | `_data/socials.yml`             |
| Portfolio colors, spacing, or responsive behavior           | `assets/css/portfolio.css`      |
| Site title, URL, plugins, or global features                | `_config.yml`                   |

For step-by-step instructions, read:

- [Project guide](PROJECT_GUIDE.md) — how the project works, local preview, debugging, Git, and deployment
- [Content guide](CONTENT_GUIDE.md) — profile photos, certification images, and Learning Hub notes

## Validate changes

Build the complete site before committing:

```sh
bundle exec jekyll build
```

Check formatting:

```sh
npm run lint:prettier
```

The CV uses acknowledged local overrides of the `al_folio_cv` renderer. Check them for drift after dependency updates:

```sh
bundle exec al-folio upgrade overrides audit --fail-on-stale
```

Review the changes Git will save:

```sh
git status
git diff
```

## Commit an update

```sh
git add --all
git commit -m "Describe the website update"
git push origin main
```

Use a short commit message that describes the result, for example:

```text
Add network troubleshooting article
Update résumé experience
Improve mobile project cards
Add certification images
```

## Deployment

Production deployment is automatic:

```text
Source files on main
        ↓
GitHub Actions builds the Jekyll site
        ↓
The generated _site directory is published to gh-pages
        ↓
https://harshvermac5.github.io/
```

The deployment workflow is defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). After pushing a website change, check the repository's [Actions page](https://github.com/harshvermac5/harshvermac5.github.io/actions) and wait for **Deploy site** to complete successfully.

Do not edit the `gh-pages` branch or generated `_site/` files directly. They are replaced by the next deployment.

## Credits

This website is built with [Jekyll](https://jekyllrb.com/) and the [al-folio](https://github.com/alshedivat/al-folio) project, with a custom portfolio design, content model, navigation behavior, and CV presentation.

The inherited project license is available in [LICENSE](LICENSE).
