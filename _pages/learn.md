---
layout: page
title: Learning Hub
permalink: /learn/
description: Practical notes on servers, networking, Linux, security, and infrastructure automation.
nav: true
nav_order: 2
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 20
  sort_field: date
  sort_reverse: true
---

<link rel="stylesheet" href="{{ '/assets/css/portfolio.css' | relative_url }}">

<div class="learning-hub">
  <header class="page-intro">
    <p class="eyebrow">Markdown-powered field notes</p>
    <h2>What I’m learning, testing, and documenting.</h2>
    <p>Browse practical notes from newest to oldest. Select any card to read the complete article without leaving the page.</p>
  </header>

{% assign postlist = paginator.posts | default: site.posts %}
{% if postlist.size > 0 %}

<div class="learning-grid" aria-label="Learning Hub articles">
{% for post in postlist %}
{% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
<a class="learning-tile" href="{{ post.url | relative_url }}" data-dialog-id="article-{{ forloop.index0 }}">
<div class="article-topline">
<time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%d %b %Y' }}</time>
<span>{{ read_time }} min read</span>
</div>
<h3>{{ post.title }}</h3>
<p>{{ post.description | default: post.excerpt | strip_html | truncatewords: 30 }}</p>
{% if post.tags.size > 0 %}
<ul class="tag-list" aria-label="Article topics">
{% for tag in post.tags limit: 3 %}<li>{{ tag }}</li>{% endfor %}
</ul>
{% endif %}
<span class="text-link">Read article <span aria-hidden="true">→</span></span>
</a>

        <dialog class="portfolio-dialog article-dialog" id="article-{{ forloop.index0 }}" aria-labelledby="article-title-{{ forloop.index0 }}">
          <div class="dialog-shell">
            <button class="dialog-close" type="button" data-dialog-close aria-label="Close article">×</button>
            <div class="dialog-heading">
              <p class="eyebrow">{{ post.date | date: '%d %B %Y' }} · {{ read_time }} min read</p>
              <h2 id="article-title-{{ forloop.index0 }}">{{ post.title }}</h2>
              {% if post.description %}<p>{{ post.description }}</p>{% endif %}
            </div>
            <article class="dialog-article">{{ post.content }}</article>
            <a class="text-link standalone-link" href="{{ post.url | relative_url }}">Open the shareable article page <span aria-hidden="true">↗</span></a>
          </div>
        </dialog>
      {% endfor %}
    </div>

    {% if page.pagination.enabled %}
      <div class="hub-pagination">{% include pagination.liquid %}</div>
    {% endif %}

{% else %}

<div class="empty-state">
<h2>The first note is on its way.</h2>
<p>New Markdown articles will appear here automatically, newest first.</p>
</div>
{% endif %}

</div>

<script src="{{ '/assets/js/portfolio.js' | relative_url }}" defer></script>
