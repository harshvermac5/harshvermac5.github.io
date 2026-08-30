---
layout: page
title: Certifications
permalink: /certs/
description: Professional certifications across networking, cybersecurity, and infrastructure.
nav: true
nav_order: 3
---

<link rel="stylesheet" href="{{ '/assets/css/portfolio.css' | relative_url }}">

<div class="certifications-page">
  <header class="page-intro">
    <p class="eyebrow">Validated learning</p>
    <h2>Credentials that support the work.</h2>
    <p>Explore certifications across networking, cybersecurity, and troubleshooting. Select a card to inspect its full-size certificate image when available.</p>
  </header>

  <div class="certification-grid" aria-label="Professional certifications">
    {% for certification in site.data.certifications %}
      <button class="certification-tile" type="button" data-dialog-id="certification-{{ forloop.index0 }}">
        <span class="certificate-preview">
          {% if certification.image != blank %}
            <img src="{{ certification.image | relative_url }}" alt="Preview of {{ certification.title }} certificate" loading="lazy">
          {% else %}
            <span class="certificate-placeholder" aria-hidden="true"><strong>{{ certification.short }}</strong><small>Image coming soon</small></span>
          {% endif %}
        </span>
        <span class="certificate-copy">
          <span class="certificate-date">{{ certification.date }}</span>
          <strong>{{ certification.title }}</strong>
          <span>{{ certification.issuer }}</span>
          <span class="text-link">View credential <span aria-hidden="true">↗</span></span>
        </span>
      </button>

      <dialog class="portfolio-dialog certificate-dialog" id="certification-{{ forloop.index0 }}" aria-labelledby="certificate-title-{{ forloop.index0 }}">
        <div class="dialog-shell certificate-dialog-shell">
          <button class="dialog-close" type="button" data-dialog-close aria-label="Close certificate">×</button>
          <div class="certificate-full-view">
            {% if certification.image != blank %}
              <img src="{{ certification.image | relative_url }}" alt="{{ certification.title }} certificate issued by {{ certification.issuer }}">
            {% else %}
              <div class="certificate-placeholder certificate-placeholder-large" role="img" aria-label="Certificate image placeholder">
                <strong>{{ certification.short }}</strong><small>Add certificate image</small>
              </div>
            {% endif %}
          </div>
          <div class="certificate-dialog-copy">
            <p class="eyebrow">{{ certification.date }}</p>
            <h2 id="certificate-title-{{ forloop.index0 }}">{{ certification.title }}</h2>
            <p>{{ certification.issuer }}</p>
            {% if certification.credential_id != blank %}<p class="credential-id">Credential ID: {{ certification.credential_id }}</p>{% endif %}
          </div>
        </div>
      </dialog>
    {% endfor %}

  </div>
</div>

<script src="{{ '/assets/js/portfolio.js' | relative_url }}" defer></script>
