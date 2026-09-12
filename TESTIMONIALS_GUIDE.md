# Homepage feedback

Feedback automatically advances every six seconds with a gentle fade and loops to the beginning. Use Pause/Play to control rotation. Hovering, keyboard focus, and hidden browser tabs pause the timer. Reduced-motion preferences disable autoplay initially and remove fades. Previous/Next buttons remain available.

Add one Markdown file per item in `_testimonials/`. The homepage reads approved entries automatically, sorts by `order`, and shows them after Professional Experience. Previous and next buttons show one item at a time. Without JavaScript, all approved entries remain readable.

```yaml
---
title: A generic internal label
order: 50
approved: false
focus: Clear communication
---
A short, accurately paraphrased summary of the feedback.
```

Keep `approved: false` until you have permission to publish the exact summary. Set it to `true` to display it. Lower order numbers appear first. Restart Jekyll after the initial collection configuration change; subsequent Markdown edits use the usual rebuild workflow.

The supplied entries are review drafts, not direct quotations. They deliberately omit identities, ticket numbers, dates, products, configurations, attachments, and customer organizations. The strongest examples concern analysis, explanation, research, and support experience. General praise for an entire support team should not be attributed solely to an individual. A thank-you alone does not establish that you resolved a case.

Hugo is your support alias; avoid silently rewriting a customer's quote to address Harsh. These summaries do not reproduce names or salutations. Add public alias attribution only if authorized.

## Publication and privacy

A public homepage is public. An anonymous summary can still concern confidential company material. Anonymization is not permission to publish. Obtain the necessary company/customer authorization before enabling an entry. This implementation does not establish legal clearance.

Never add original ticket screenshots, messages, identifying filenames, support links, credentials, or internal case notes to this repository. A public Git repository exposes source files and history even when `approved` is false or `output` is false. Store any confidential evidence and approval records outside the repository in an authorized private system. Only generic sanitized review text belongs here.

`output: false` prevents standalone testimonial pages. The search wrapper excludes testimonial entries from the site's search UI; this is not access control and does not stop external search engines reading approved text on the homepage. Draft generic titles may exist in the generated search payload, but feedback body text is not included there. Never put confidential information in front matter.

Before pushing, inspect your Git diff and the homepage. To hide an entry again, set `approved: false` and rebuild; this cannot erase copies already published or committed.
