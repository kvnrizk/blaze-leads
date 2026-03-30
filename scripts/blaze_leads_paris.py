"""
Blaze Production — Paris Wedding Leads PDF Generator
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas
from datetime import datetime

# Colors
BLACK = HexColor("#1a1a1a")
DARK = HexColor("#2d2d2d")
ACCENT = HexColor("#E8590C")  # Blaze orange
LIGHT_BG = HexColor("#F8F9FA")
WHITE = HexColor("#FFFFFF")
GRAY = HexColor("#6B7280")
LIGHT_GRAY = HexColor("#E5E7EB")
LINK_BLUE = HexColor("#2563EB")

# Styles
title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=28, textColor=ACCENT, spaceAfter=4)
subtitle_style = ParagraphStyle("Subtitle", fontName="Helvetica", fontSize=12, textColor=GRAY, spaceAfter=20)
h1_style = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=18, textColor=BLACK, spaceBefore=20, spaceAfter=10)
h2_style = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=14, textColor=ACCENT, spaceBefore=16, spaceAfter=8)
body_style = ParagraphStyle("Body", fontName="Helvetica", fontSize=10, textColor=DARK, leading=14, spaceAfter=6)
small_style = ParagraphStyle("Small", fontName="Helvetica", fontSize=8, textColor=GRAY, leading=10)
bullet_style = ParagraphStyle("Bullet", fontName="Helvetica", fontSize=10, textColor=DARK, leading=14, leftIndent=15, bulletIndent=5, spaceAfter=4)
link_style = ParagraphStyle("Link", fontName="Helvetica", fontSize=9, textColor=LINK_BLUE, leading=12, spaceAfter=2)

def make_table(headers, rows, col_widths=None):
    data = [headers] + rows
    if col_widths is None:
        col_widths = [170*mm / len(headers)] * len(headers)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 1), (-1, -1), DARK),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ]
    t.setStyle(TableStyle(style))
    return t

def build_pdf():
    output_path = "D:/Projects/Noriz/Blaze_Production_Paris_Wedding_Leads.pdf"
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=25*mm, bottomMargin=20*mm
    )
    story = []
    W = 170*mm

    # ─── COVER ───
    story.append(Spacer(1, 40*mm))
    story.append(Paragraph("BLAZE PRODUCTION", title_style))
    story.append(Paragraph("Paris Wedding Market — Lead Prospecting Report", subtitle_style))
    story.append(HRFlowable(width=W, thickness=2, color=ACCENT, spaceAfter=12))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')}", small_style))
    story.append(Paragraph("Confidential — Internal Use Only", small_style))
    story.append(Spacer(1, 20*mm))
    story.append(Paragraph(
        "This document maps the key communities, platforms, influencers, and vendor networks "
        "in the Paris wedding market. Use it to identify and reach potential clients — engaged "
        "couples, wedding planners, and content creators who can refer business to Blaze Production.",
        body_style
    ))
    story.append(PageBreak())

    # ─── 1. ONLINE COMMUNITIES (WHERE TO FIND LEADS) ───
    story.append(Paragraph("1. Online Communities — Where Couples Gather", h1_style))
    story.append(Paragraph(
        "These are the active communities where engaged couples in Paris ask for recommendations. "
        "Presence here = direct access to warm leads.",
        body_style
    ))

    story.append(Paragraph("Facebook Groups", h2_style))
    fb_headers = ["Group Name", "Focus", "Lead Potential"]
    fb_rows = [
        ["Couples Retreat Group\n(Say I Do in France)",
         "Destination wedding support.\nNo-vendor policy, peer-to-peer.",
         "HIGH — International couples\nplanning Paris weddings. Trusted recs."],
        ["Wedding Planning Facebook Groups\n(10+ groups via VintageBash list)",
         "General bride/groom support\ngroups with active discussions.",
         "MEDIUM — Volume play.\nPost helpful content, not ads."],
        ["Expat Groups: AWG Paris,\nWICE, InterNations",
         "English-speaking expats in\nParis. Many get engaged locally.",
         "MEDIUM — Indirect but steady.\nExpats need English-speaking vendors."],
        ["Mariages.net Communaute",
         "Biggest French wedding forum.\nRegional sub-groups (Ile-de-France).",
         "HIGH — French couples actively\nasking 'qui recommandez-vous?'"],
    ]
    story.append(make_table(fb_headers, fb_rows, [55*mm, 55*mm, 60*mm]))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Reddit Communities", h2_style))
    reddit_headers = ["Subreddit", "Focus", "Lead Potential"]
    reddit_rows = [
        ["r/BigBudgetBrides", "Luxury wedding planning.\nHigh-net-worth couples.", "HIGH — They ask for Paris\nplanner/vendor recs by name."],
        ["r/ProposalParis", "Pre-engagement couples\nscouting Paris locations.", "MEDIUM — Early funnel.\nThey'll need production later."],
        ["r/weddingplanning", "General wedding planning.\n2M+ members.", "MEDIUM — Filter for Paris\nand France-related threads."],
    ]
    story.append(make_table(reddit_headers, reddit_rows, [45*mm, 55*mm, 70*mm]))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Forums & Directories", h2_style))
    forum_headers = ["Platform", "URL", "Why It Matters"]
    forum_rows = [
        ["The Knot\n(Destination Weddings)", "theknot.com/community", "International couples choosing\nParis as destination."],
        ["Junebug Weddings", "junebugweddings.com/vendors\n/france/paris/", "Curated vendor directory.\nGet listed = inbound leads."],
        ["OuiLove Paris", "ouilove-paris.com/Directory", "Paris-specific trusted\nvendor directory."],
        ["French Wedding Style", "frenchweddingstyle.com\n/wedding-vendors/", "Professional supplier directory\nfor France weddings."],
        ["WeddingWire France", "weddingwire.com/c/fr-france\n/paris/", "Top 10 Paris planners listed.\nReview-driven discovery."],
        ["Carats + Cake", "caratsandcake.com/wedding\n-vendors/europe/france", "High-end vendor directory\nfor luxury France weddings."],
    ]
    story.append(make_table(forum_headers, forum_rows, [40*mm, 55*mm, 75*mm]))

    story.append(PageBreak())

    # ─── 2. INFLUENCERS & BLOGS ───
    story.append(Paragraph("2. Influencers, Blogs & Content Creators", h1_style))
    story.append(Paragraph(
        "These individuals and blogs shape where couples spend money. "
        "Partner with them or get featured for referral-based leads.",
        body_style
    ))

    story.append(Paragraph("Wedding Blogs (High Authority)", h2_style))
    blog_headers = ["Blog / Influencer", "URL", "Angle for Blaze"]
    blog_rows = [
        ["La Soeur de la Mariee", "lasoeurdelamariee.com", "Reviews wedding lists & vendors.\nPitch Blaze for feature/collab."],
        ["Le Blog de Madame C", "leblogdemadamec.fr", "Personalized wedding content.\nComment sections = couple leads."],
        ["La Mariee en Colere", "lamarieeencolere.com", "Vendor selection advice.\n'Les choisir, ne pas se tromper'."],
        ["La Mariee aux Pieds Nus", "lamarieeauxpiedsnus.com", "Ceremony guides, aesthetic\nweddings. High engagement."],
        ["PrepareTonMariage.fr", "preparetonmariage.fr", "Connects brides with Parisian\nsuppliers. Get listed."],
        ["Danielle Moss", "danielle-moss.com", "English-language 'How to Plan\na Wedding in Paris' guide."],
    ]
    story.append(make_table(blog_headers, blog_rows, [45*mm, 50*mm, 75*mm]))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Wedding Planners (Referral Partners)", h2_style))
    story.append(Paragraph(
        "These planners work with high-budget Paris couples and recommend production teams. "
        "Building relationships here = steady referral pipeline.",
        body_style
    ))
    planner_headers = ["Planner / Agency", "Speciality", "Contact Point"]
    planner_rows = [
        ["Jennifer Fox Weddings", "English-speaking, luxury.\nParis + Provence.", "jenniferfoxweddings.com\nDirect outreach."],
        ["Say I Do in France\n(Paula)", "Curated supplier directory.\nManages Couples Retreat Group.", "sayidoinfrance.com\nFacebook group admin."],
        ["Flovinno Agency", "Event planning + legal\nguidance (Mairie process).", "flovinno.com\nPropose production collab."],
        ["Declaration Mariage Paris", "Paris showroom weddings.\nPress/media connections.", "declaration-mariage.com\nShowroom partnership."],
        ["Confidence Mariage", "Paris showroom experience.\nBridal events.", "confidence-mariage.com\nEvent sponsorship."],
        ["Top 10 on WeddingWire", "Various rated planners\nin Paris.", "weddingwire.com — reach out\nto each individually."],
    ]
    story.append(make_table(planner_headers, planner_rows, [45*mm, 55*mm, 70*mm]))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("2025 Trend: Wedding Content Creators", h2_style))
    story.append(Paragraph(
        "A new vendor category is emerging — individuals hired to create behind-the-scenes "
        "Instagram Reels and TikTok content at weddings. Unlike traditional photographers, they "
        "focus on short-form, real-time social content. These creators are both competitors AND "
        "potential collaborators for Blaze Production.",
        body_style
    ))
    story.append(Paragraph("<bullet>&bull;</bullet> They tag couples, venues, and planners — creating organic reach", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Couples now budget specifically for 'social content' separate from photo/video", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Blaze can position as the premium alternative or partner with creators", bullet_style))

    story.append(PageBreak())

    # ─── 3. WEDDING LIST PLATFORMS ───
    story.append(Paragraph("3. Wedding List Platforms — Where Couples Register", h1_style))
    story.append(Paragraph(
        "These platforms know who is getting married and when. Explore partnership, "
        "advertising, or content collaboration opportunities.",
        body_style
    ))

    list_headers = ["Platform", "Commission", "Key Feature", "Partnership Angle"]
    list_rows = [
        ["MilleMercisMariage\nmillemercismariage.com", "1% + 0.30 EUR", "Lowest fees.\n1,713 Trustpilot reviews.", "Advertise in their\nvendor recommendations."],
        ["Zankyou\nzankyou.fr", "1.4-1.85%", "International reach.\n50/50 deal w/ Printemps.", "Get featured in their\nvendor directory."],
        ["Kadolog\nkadolog.com", "2.4% + flat fee", "10% discount at 250+\npartner shops.", "Join partner network\nfor cross-referrals."],
        ["Mille et une listes\nmilleetunelistes.fr", "5% (cash out)", "Galeries Lafayette +\nBHV integration.", "Department store event\npartnerships."],
        ["Le Bon Marche\nlistes.lebonmarche.com", "Free (internal)", "5% bonus on donations.\nElite Rive Gauche.", "Luxury wedding events\nat the store."],
        ["Un Grand Jour\nungrandjour.com", "Free", "Wedding website +\ncash fund + RSVP.", "Content partnership\non their blog."],
    ]
    story.append(make_table(list_headers, list_rows, [40*mm, 25*mm, 45*mm, 60*mm]))

    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Department Store Wedding Events", h2_style))
    story.append(Paragraph(
        "Paris department stores host wedding events and showrooms. These are high-value "
        "networking opportunities — couples who register at Galeries Lafayette or Printemps "
        "are typically high-budget clients.",
        body_style
    ))
    store_headers = ["Store", "Wedding Service", "Blaze Opportunity"]
    store_rows = [
        ["Galeries Lafayette\nHaussmann", "Volume-based registry.\nPersonal Shopping Suite.", "Sponsor wedding events.\nOffer production demos."],
        ["Printemps\nHaussmann", "50/50 cash + store credit.\n10% off bridal, 15% guest.", "Rooftop event partnership.\nBridal fashion content."],
        ["Le Bon Marche\nRive Gauche", "Listes d'Exception.\n5% bonus. Intimate luxury.", "Private client events.\nExclusive production offer."],
    ]
    story.append(make_table(store_headers, store_rows, [45*mm, 55*mm, 70*mm]))

    story.append(PageBreak())

    # ─── 4. SOCIAL MEDIA STRATEGY ───
    story.append(Paragraph("4. Social Media Lead-Gen Strategy", h1_style))

    story.append(Paragraph("Instagram", h2_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Follow and engage with Paris wedding blogs (listed above) — comment on posts, share stories", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Use hashtags: #MariageParis #WeddingParis #ListeDeMariage #FutureMariee #EVJF", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Repost couple content (with permission) and tag venues/planners for cross-exposure", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Partner with wedding content creators for dual-branded Reels", bullet_style))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("TikTok", h2_style))
    story.append(Paragraph("<bullet>&bull;</bullet> 'Behind the scenes' wedding production content performs extremely well", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Trending: setup/breakdown timelapses, first look reactions, venue reveals", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Use: #MariageParis #WeddingTikTok #ParisWedding #BlazeProduction", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Duet/stitch Paris wedding creators to tap into their audience", bullet_style))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("Facebook", h2_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Join communities listed in Section 1 — provide value first, never hard-sell", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Answer questions about production/videography when couples ask for recs", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Create a Blaze Production Facebook page with portfolio and reviews", bullet_style))
    story.append(Paragraph("<bullet>&bull;</bullet> Run targeted ads: engaged couples, 25-40, Paris + Ile-de-France", bullet_style))

    story.append(PageBreak())

    # ─── 5. ACTION PLAN ───
    story.append(Paragraph("5. Immediate Action Plan", h1_style))
    story.append(HRFlowable(width=W, thickness=1, color=ACCENT, spaceAfter=10))

    actions = [
        ("Week 1-2: Community Presence", [
            "Join Couples Retreat Group (Facebook) and introduce Blaze Production",
            "Create accounts on Mariages.net, WeddingWire, Junebug, OuiLove",
            "Set up Reddit presence in r/BigBudgetBrides and r/weddingplanning",
        ]),
        ("Week 3-4: Influencer Outreach", [
            "Email 6 wedding blogs (listed above) with portfolio + collab proposal",
            "DM 10 wedding content creators on Instagram for partnership",
            "Contact top 5 wedding planners for referral arrangement",
        ]),
        ("Week 5-6: Platform Partnerships", [
            "Reach out to MilleMercisMariage and Zankyou for vendor listing",
            "Contact Galeries Lafayette / Printemps wedding events team",
            "Explore Le Bon Marche private client event sponsorship",
        ]),
        ("Ongoing: Content Engine", [
            "Post 3x/week on Instagram (Reels + Stories from past events)",
            "Post 2x/week on TikTok (behind-the-scenes, setup timelapses)",
            "Engage daily in Facebook groups (answer questions, share tips)",
        ]),
    ]

    for phase_title, items in actions:
        story.append(Paragraph(phase_title, h2_style))
        for item in items:
            story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", bullet_style))
        story.append(Spacer(1, 4*mm))

    # ─── FOOTER NOTE ───
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width=W, thickness=1, color=LIGHT_GRAY, spaceAfter=8))
    story.append(Paragraph(
        "Sources: NotebookLM deep research (67 web sources), Mariages.net, Reddit, "
        "WeddingWire, Junebug Weddings, French wedding blogs. Report generated for "
        "Blaze Production internal use.",
        small_style
    ))

    doc.build(story)
    print(f"PDF generated: {output_path}")

if __name__ == "__main__":
    build_pdf()
