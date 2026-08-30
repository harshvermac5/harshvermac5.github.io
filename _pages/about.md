---
layout: default
title: Harsh Verma
permalink: /
nav: false
---

<link rel="stylesheet" href="{{ '/assets/css/portfolio.css' | relative_url }}">

<main class="portfolio-site" id="main-content">
  <section class="portfolio-hero" aria-labelledby="portfolio-title">
    <div class="hero-copy">
      <p class="eyebrow">Routing, Switching &amp; Security Engineer · Gurugram, India</p>
      <h1 id="portfolio-title">Engineering resilient, secure networks.</h1>
      <p class="hero-lead">
      I’m Harsh Verma, a network and infrastructure engineer specializing in enterprise routing, switching, VPN, SD-WAN, and network security, with a strong background in Linux systems, server infrastructure, complex troubleshooting, and practical automation.
      </p>
      <div class="hero-actions" aria-label="Portfolio actions">
        <a class="button button-primary" href="{{ '/learn/' | relative_url }}">Explore the Learning Hub</a>
        <a class="button button-secondary" href="{{ '/certs/' | relative_url }}">View certifications</a>
        <a class="button button-quiet" href="{{ '/cv/' | relative_url }}">Read my résumé</a>
      </div>
      <ul class="contact-strip" aria-label="Contact links">
        <li><a href="https://www.linkedin.com/in/harshvermac5">LinkedIn</a></li>
        <li><a href="https://github.com/harshvermac5">GitHub</a></li>
        <li>{% al_email_protect_link site.data.socials.email %}</li>
      </ul>
    </div>

    <aside class="profile-panel" aria-label="Professional profile">
      {% assign profile_photo = site.data.profile.photo %}
      {% if profile_photo != blank %}
        <div class="portrait-placeholder has-photo">
          <img class="profile-photo" src="{{ profile_photo | relative_url }}" alt="{{ site.data.profile.photo_alt | default: 'Professional photo of Harsh Verma' }}">
        </div>
      {% else %}
        <div class="portrait-placeholder" role="img" aria-label="Professional photo placeholder for Harsh Verma">
          <span aria-hidden="true">HV</span>
          <small>Professional photo</small>
        </div>
      {% endif %}
      <div class="availability"><span aria-hidden="true"></span> Open to infrastructure challenges</div>
    </aside>

  </section>

  <section class="metric-grid" aria-label="Career highlights">
    <article class="metric-tile">
      <strong>600+</strong>
      <span>GPU and CPU servers supported</span>
    </article>
    <article class="metric-tile">
      <strong>30%</strong>
      <span>Improvement in patch compliance</span>
    </article>
    <article class="metric-tile">
      <strong>96%</strong>
      <span>Customer satisfaction achieved</span>
    </article>
  </section>

  <section class="portfolio-section" aria-labelledby="experience-title">
    <div class="section-heading">
      <p class="eyebrow">Professional experience</p>
      <h2 id="experience-title">Operating where hardware, networks, and users meet.</h2>
    </div>

    <div class="experience-list">
      <article class="experience-entry">
        <div class="experience-meta">
          <span class="experience-date">Jul 2026 - Present</span>
          <span>Gurugram, Uttar Pradesh</span>
        </div>
        <div>
          <h3>Technical Support Engineer</h3>
          <p class="company">Ubiquiti Inc.</p>
          <p>Provide advanced technical support for UniFi enterprise networking environments, specializing in routing, switching, VPN, SD-WAN, and network security. Perform deep log and support-file analysis to identify complex configuration, firmware, hardware, and application-level issues.</p>
          <ul>
	    <li>Troubleshoot complex L2/L3 issues involving VLANs, STP/RSTP, DHCP, routing, NAT, firewalls, LAG, SFP/SFP+, PoE, and multi-WAN.</li>
	    <li>Diagnose and design VPN/SD-WAN solutions using IPsec/IKEv2, WireGuard, policy-based routing, and site-to-site architectures.</li>
	    <li>Perform deep log, packet-capture, telemetry, and support-file analysis to isolate network, firmware, hardware, and application failures.</li>
	    <li>Reproduce defects, develop workarounds, prepare engineering bug reports, and manage complex cases through escalation and resolution.</li>
          </ul>
        </div>
      </article>

      <article class="experience-entry">
        <div class="experience-meta">
          <span class="experience-date">Mar 2025 — Jul 2026</span>
          <span>Noida, Uttar Pradesh</span>
        </div>
        <div>
          <h3>Server Engineer</h3>
          <p class="company">E2E Cloud Limited</p>
          <p>Manage and support a fleet of 600+ physical GPU and CPU servers across Dell, ASUS, Supermicro, and NVIDIA platforms.</p>
          <ul>
            <li>Diagnose memory, PSU, storage, firmware, and GPU stability issues through BMC/IPMI tooling and Linux diagnostics.</li>
            <li>Provision and harden Linux systems, configure bonding, VLANs, static routes, and firewall policies.</li>
            <li>Produce power audits and coordinate incident resolution, RMA work, and SLA-based escalation.</li>
          </ul>
        </div>
      </article>

      <article class="experience-entry">
        <div class="experience-meta">
          <span class="experience-date">Dec 2024 — Mar 2025</span>
          <span>Noida, Uttar Pradesh</span>
        </div>
        <div>
          <h3>Network Engineer</h3>
          <p class="company">I2K2 Networks Private Limited</p>
          <p>Administered L2/L3 switching, routers, and firewalls while supporting secure, reliable enterprise connectivity.</p>
          <ul>
            <li>Configured VyOS, FortiGate, and Cisco Firepower for routing, NAT, policy enforcement, and VPN connectivity.</li>
            <li>Maintained SSL and IPsec tunnels and investigated SNMP, Syslog, and remote-access incidents.</li>
          </ul>
        </div>
      </article>

      <article class="experience-entry">
        <div class="experience-meta">
          <span class="experience-date">Jun 2024 — Dec 2025</span>
          <span>Noida, Uttar Pradesh</span>
        </div>
        <div>
          <h3>Technical Support Consultant</h3>
          <p class="company">Conneqt Business Solutions</p>
          <p>Supported customers by voice and email, configured fintech devices, and documented interactions accurately in the CRM.</p>
          <ul>
            <li>Maintained a 96% customer satisfaction score through clear, efficient issue resolution.</li>
          </ul>
        </div>
      </article>
    </div>

  </section>

  <section class="portfolio-section split-section" aria-labelledby="expertise-title">
    <div class="section-heading">
      <p class="eyebrow">Technical focus</p>
      <h2 id="expertise-title">Built for hands-on infrastructure work.</h2>
      <p>I combine careful operations with scripting and automation to make recurring work safer and faster.</p>
    </div>
    <div class="skill-clusters">
      <article>
        <h3>Networking &amp; security</h3>
        <p>VLANs, OSPF, routing, IPsec/SSL VPN, ACLs, FortiGate, VyOS, Cisco firewalls, hardening, and audit documentation.</p>
      </article>
      <article>
        <h3>Servers &amp; Linux</h3>
        <p>GPU/CPU diagnostics, RAID, BMC/IPMI, iDRAC, BIOS and firmware lifecycle, Ubuntu, RHEL, Rocky, and CentOS.</p>
      </article>
      <article>
        <h3>Automation &amp; monitoring</h3>
        <p>Python, Bash, PowerShell, JavaScript, Ansible, Terraform, Jenkins, Zabbix, Wireshark, and log parsing.</p>
      </article>
    </div>
  </section>

  <section class="portfolio-section" id="projects" aria-labelledby="projects-title">
    <div class="section-heading">
      <p class="eyebrow">Selected projects</p>
      <h2 id="projects-title">Tools shaped by real operational needs.</h2>
    </div>
    <div class="project-grid">
      <a class="project-tile" href="https://github.com/harshvermac5/ping-dashboard">
        <span class="project-number">01</span>
        <h3>Ping Dashboard</h3>
        <p>A multithreaded Python network monitor for host availability, latency, packet loss, live status, search, and CSV export.</p>
        <span class="text-link">View on GitHub <span aria-hidden="true">↗</span></span>
      </a>
      <a class="project-tile" href="https://github.com/harshvermac5/extractors-e2e">
        <span class="project-number">02</span>
        <h3>Extractors E2E</h3>
        <p>A Selenium automation framework with retries, multi-tab handling, and structured logging for rack and port data extraction.</p>
        <span class="text-link">View on GitHub <span aria-hidden="true">↗</span></span>
      </a>
      <article class="project-tile">
        <a class="project-card-link" href="https://harshvermac5.github.io/multi-search" aria-label="Open the Multi Search Utility hosted project"></a>
        <span class="project-number">03</span>
        <h3>Multi Search Utility</h3>
        <p>Spawns multiple tabs for searches, concurrently (3-5 sec interval) with terms prefix and suffix support. Makes learnings and research faster.</p>
        <a class="text-link project-repository-link" href="https://github.com/harshvermac5/multi-search">View on GitHub <span aria-hidden="true">↗</span></a>
      </article>

    </div>
  </section>

  <section class="portfolio-cta" aria-labelledby="cta-title">
    <div>
      <p class="eyebrow">Keep exploring</p>
      <h2 id="cta-title">Notes from the field, documented as I learn.</h2>
    </div>
    <a class="button button-primary" href="{{ '/learn/' | relative_url }}">Open Learning Hub</a>
  </section>
</main>

<script src="{{ '/assets/js/portfolio.js' | relative_url }}" defer></script>
