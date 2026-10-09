# Getting Ember into parent communities

**The pitch in one line:** *"The short-video app you can actually say yes to. Friends first, no strangers in DMs, and protections your kid can't switch off."*

Parents are the buyers and gatekeepers here. Kids pick the app, but parents decide whether it stays on the phone. So every step below is aimed at **earning parents' trust first** and then letting them hand it to their kids.

---

## 0. Get these done before you market to parents
Parents and journalists will check these. Missing ones kill trust instantly.

- [ ] **Privacy policy and terms of service** in plain English, linked from the welcome screen.
- [ ] **A decision on under-13s.** Either raise the minimum age to 13 (a one-line change in `server/routes/account.js`), or get legal advice on COPPA (US) / UK Age Appropriate Design Code verifiable parental consent before accepting younger kids.
- [ ] **A real person reading reports.** Use a support email, check the reports at least daily, and have a written plan for serious child-safety issues, including reporting to NCMEC (US) or CEOP / IWF (UK).
- [ ] **Persistent storage:** a database plus the paid disk or `DATABASE_URL`, so no family loses their account.
- [ ] **A simple landing page** covering what Ember is, the safety features, screenshots, an "Install" button and a short "For parents" page.

---

## 1. Start small: 20–50 families you know (weeks 1–4)
- Start with friends, family, your school and your sports clubs. Ask 5–10 parents to set it up with their kids **together**. Onboarding with the parent PIN is your best demo.
- Watch them do it, then fix whatever confuses them.
- Collect **quotes** ("I finally said yes to a video app") and **screenshots** of the parent features. These become your marketing.
- Ember spreads through friend groups, so aim for **whole friend groups or classes**, not single kids. An app with no friends on it gets deleted.

## 2. Go where parents already talk (month 2+)
| Channel | What to do |
|---|---|
| **School parent groups and PTAs** | Offer a free 20-minute "Kids & social media safety" talk. Teach general online safety and show Ember as one option. Don't make it a sales pitch. |
| **Facebook parent groups and local community pages** | Join as a parent or founder, be open that you built it, and answer questions. A short "I built this because…" post works well. Read each group's rules on promotion first. |
| **Reddit** (r/Parenting, r/daddit, r/Mommit, r/Teachers) | Answer screen-time and TikTok threads helpfully, and mention Ember only where it fits. Self-promotion rules there are strict. |
| **Nextdoor and local newsletters** | "A local parent built a safer TikTok alternative." Local angles get picked up. |
| **Parenting creators** (YouTube, Instagram, podcasts) | Small and mid-size accounts reply. Offer a walkthrough, not money at first. |
| **Teachers and school counsellors** | They see the harm daily. A one-page PDF ("Safety features at a glance") is easy for them to share. |
| **Churches, scouts, sports clubs, homeschool co-ops** | These are tight communities where one trusted adult's recommendation reaches dozens of families. |

## 3. Messages that work with parents
Lead with **fears they already have** and how Ember answers each one:
- *"Strangers messaging my kid"* → **Messages are friends-only. Adults can't find or contact under-18s.**
- *"The algorithm shows them awful stuff"* → **Opens on friends, not strangers. Filters for violence, drugs, self-harm and dangerous challenges are locked on for kids.**
- *"They'll just change the settings"* → **Parent PIN. Kids' protections can't be switched off.**
- *"Photos being sent around"* → **View-once Snaps, location data stripped, and reporting keeps evidence.**

**Never overclaim.** Say "safer" and "designed for", never "100% safe". The filters read text, not video pixels, so be honest about that. Honesty is a selling point with parents.

## 4. Build features that turn parents into promoters
These are worth building next, because parents share tools that make them feel in control:
1. **Parent dashboard:** a linked parent account that sees friend lists and settings, plus weekly summaries, but *not* private message content. Kids accept that kind of oversight more readily.
2. **Daily time limits** with a friendly "take a break" screen.
3. **"Invite another family" link** that shows the parent safety page first.
4. **A printable one-page safety sheet** for schools.

## 5. Press and credibility
- Pitch local news, parenting magazines and education blogs with a story angle: *"[Your age/town] creator builds safer TikTok alternative after [reason]."* A founder story gets covered more than a product does.
- Apply to safety-review sites for apps and kids' media, such as Common Sense Media's app reviews, once you have real users.
- If you're a student, school and youth enterprise competitions bring good press and mentors.

## 6. Measure what matters
- **Weekly active families**, not downloads.
- **How many friends each kid has on Ember.** Under 3 means they'll leave. Aim for 5 or more.
- **Reports per 1,000 users and how fast you respond.** Publish these. Openness builds trust.
- **Parent quotes and NPS** ("Would you recommend Ember to another parent?").

## A simple 90-day plan
| Weeks | Goal |
|---|---|
| 1–2 | Privacy and terms pages, persistent database, landing page, minimum-age decision |
| 3–6 | 20–50 founding families, fix onboarding, collect quotes |
| 7–9 | Two school or club talks, posts in local parent groups, one-page PDF for teachers |
| 10–13 | Contact 10 parenting creators and 5 local journalists. Start building the parent dashboard. |
