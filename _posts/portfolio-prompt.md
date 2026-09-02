Please go throgh the following documentations:

https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/testing-your-github-pages-site-locally-with-jekyll

https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll

Theme to use in project
https://github.com/alshedivat/al-folio

https://jekyllrb.com/docs/step-by-step/01-setup/

https://jekyllrb.com/docs/pages/

https://jekyllrb.com/docs/posts/

https://jekyllrb.com/docs/front-matter/

https://jekyllrb.com/docs/collections/

https://jekyllrb.com/docs/datafiles/

https://jekyllrb.com/docs/assets/

https://jekyllrb.com/docs/static-files/

https://jekyllrb.com/docs/structure/

https://jekyllrb.com/docs/liquid/

http://jekyllrb.com/docs/variables/

https://jekyllrb.com/docs/includes/

https://jekyllrb.com/docs/layouts/

https://jekyllrb.com/docs/permalinks/

https://jekyllrb.com/docs/themes/

https://jekyllrb.com/docs/pagination/


I need help building a multi-page portfolio website using GitHub Pages and Jekyll with the following structure:

Site Architecture
Portfolio (root): harshvermac5.github.io
Learning Hub: harshvermac5.github.io/learn
Certifications: harshvermac5.github.io/certs

Portfolio Page Requirements
Display my professional background as a Network Engineer at Ubiquiti (UI/UX Technical Support) and Data Center Engineer at E2E Networks. The page should include:
Professional photo placeholders
Work experience section highlighting both roles
Key achievements and accomplishments
Navigation links to my Learning Hub and Certifications pages
Embedded or linked resume (I will provide the file)
Clean, professional layout that showcases technical expertise

Learning Hub Page Requirements
A Jekyll-powered blog/notes section where I'll publish markdown articles. Functionality needed:
Card-based layout displaying all articles with title and excerpt
Latest articles first (reverse chronological order)
Clickable cards that open a modal showing the full article content
Pagination: 20 cards per page
Responsive design for mobile and desktop viewing

Certifications Page Requirements
certification cards
Clickable cards that open a modal showing the full images
Responsive design for mobile and desktop viewing

Additional Notes
I'll provide resume content, photos, and article content in markdown format
Design should be consistent across all three pages
Mobile-responsive and accessible

My resume:

Harsh Verma
📍 Noida, India | 📞 +91 6202964886 | 📧 harshvermac5@gmail.com | 🔗
linkedin.com/in/harshvermac5 | 💻 github.com/harshvermac5
Objective
Proactive and detail-oriented Server Engineer with hands-on experience in Linux systems,
network defense, and infrastructure automation. Skilled in diagnosing and resolving complex
hardware issues, provisioning GPU/CPU systems, and managing large-scale data center
environments.
Professional Experience
Server Engineer – E2E Cloud Limited
📍 Noida, Uttar Pradesh | 🗓 Mar 2025 – Present
- Manage and support 600+ physical GPU/CPU servers (Dell PowerEdge XE9680, ASUS AI,
Supermicro, NVIDIA H100/H200) ensuring consistent uptime and hardware health.
- Diagnose and resolve hardware-level issues involving memory faults, PSU failures, and
storage degradation using BMC/IPMI interfaces and diagnostic utilities.
- Perform firmware and BIOS upgrades across multi-OEM systems (Dell, ASUS,
Supermicro), improving system patch compliance by 30%.
- Implement Linux network configurations (interface bonding, VLANs, static routes) and
performance tuning via Netplan.
- Handle OS provisioning, patching, and security hardening (SSH keys, CIS compliance,
disabling root logins).
- Generate detailed power consumption audits and analytics for Finance to optimize rack
power distribution.
- Troubleshoot GPU stability issues using
`
nvidia-smi`
, dmesg, and performance
benchmarks; coordinate RMA/replacement as needed.
- Configure firewalls and access control policies for workload segmentation between staging,
production, and development environments.
- Resolve incidents through Zoho Ticketing System, adhering to SLAs and escalation
workflows.
Network Engineer – I2K2 Networks Private Limited
📍 Noida, Uttar Pradesh | 🗓 Dec 2024 – Mar 2025
- Administered core network infrastructure — L2/L3 switches, firewalls, and routers —
ensuring stable and secure enterprise connectivity.
- Resolved VPN/IPsec connectivity issues using remote management tools (AnyDesk, RDP),
improving remote uptime and user experience.
- Configured VyOS, FortiGate, and Cisco Firepower firewalls for policy enforcement, NAT,
and routing optimization.
- Monitored system logs and SNMP/Syslog feeds, escalating anomalies to the incident
response team for threat correlation.
- Designed and maintained SSL and IPsec tunnels for client-specific requirements, ensuring
encrypted inter-site communication.
- Managed service requests and change control through Freshdesk, maintaining compliance
with SLAs and documentation standards.
Technical support consultant — Conneqt Business Solutions
📍 Noida, Uttar Pradesh | 🗓 June 2024 – Dec 2025
- Configured Fintech devices like PoS devices, Payment speakers etc.
- Assisted customers with inquiries and provided solutions to their issues via voice and
email.
- Maintained a 96% of customer satisfaction score based on KPI through effective and
efficient service.
- Documented customer interactions and updated the CRM system accurately.
Education
Bachelor of Commerce (B.Com) – Patna University
Vanijya Mahavidyalaya, Patna | 2021 | 63%
Senior Secondary (12th) – Jean Paul’s High School, 2018 | 68%
Secondary (10th) – Jean Paul’s High School, 2016 | 76%
Certifications
CCNA (Cisco Certified Network Associate) – Cisco Global | ID: CSC014498293 | Jan 2024
Security Engineer (TryHackMe) – THM-YUCVU9DACS | Jun 2025
Cyber Security 101 (TryHackMe) – THM-LYFJWOFIXN | Apr 2025
Wireshark Fundamentals (Udemy) – UC-5fa29cd3-2dcO-4257-9c81-3dbe158f923c | Feb
2024
Technical Skills
Server & Hardware Management:
Rack/Blade Servers, GPU/CPU Diagnostics, RAID Setup, BMC/IPMI, iDRAC,
BIOS/Firmware Lifecycle, Power Auditing
Networking:
L2/L3 Switching, VLANs, OSPF, Static Routing, IPsec/SSL VPN, ACLs, Firewall
Configuration (VyOS, FortiGate, Cisco ASA), SNMP/Syslog
Operating Systems:
Linux (Ubuntu, RHEL, Rocky, CentOS), Windows Server, ESXi (basic), VirtualBox
Automation & Scripting:
Python, Bash, PowerShell, JavaScript, Regex, Log Parsing, SSH Automation, Cron
Scheduling, Git, Jenkins, Ansible (basic), Terraform (basic)
Security & Compliance:
Linux Hardening, Patch Management, Endpoint Protection, CIS Benchmarking, Access
Control, Audit Documentation
Monitoring & Tools:
Wireshark, Zabbix, Zoho Desk, Freshdesk
Projects
1. Ping Dashboard –
[github.com/harshvermac5/ping-dashboard](https://github.com/harshvermac5/ping-dashboar
d)
Developed a multithreaded Python network monitoring tool using Tkinter and
ThreadPoolExecutor to track host availability, latency, and packet loss. Includes CSV export,
live status updates, and search/sort features.
2. Extractors-e2e –
[github.com/harshvermac5/extractors-e2e](https://github.com/harshvermac5/extractors-e2e)
Built a Selenium-based automation framework for E2E portal data extraction. Implemented
robust retry logic, multi-tab handling, and structured logging for scalable, error-resilient
scraping of rack and port details.
Highlights & Strengths
Proven experience across server hardware, GPU diagnostics, and firmware maintenance.
Strong foundation in network security, Linux administration, and infrastructure automation.
Hands-on expertise in data center operations, RMM/VPN setup, and incident lifecycle
management.
Analytical, process-oriented, and collaborative under high-pressure environments.