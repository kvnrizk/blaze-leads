"""
Blaze Production — Instagram Lead Scraper for Paris Weddings
Finds engaged couples & wedding-related profiles from public hashtags.
Scores leads, drafts personalized messages, exports to CSV + PDF.

Usage:
    python blaze_instagram_leads.py                    # scrape default hashtags
    python blaze_instagram_leads.py --login user pass  # login for deeper scraping
    python blaze_instagram_leads.py --hashtags "mariageparis,evjfparis"
    python blaze_instagram_leads.py --max-posts 50     # posts per hashtag
"""

import instaloader
import csv
import json
import re
import argparse
import time
import random
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, field, asdict

# ─── CONFIG ───
DEFAULT_HASHTAGS = [
    "mariageparis",
    "weddingparis",
    "fiancailles",
    "futuremariee",
    "evjfparis",
    "mariagefrance",
    "demandemariage",
    "listemariage",
    "weddinginfrance",
    "parisproposal",
]

WEDDING_KEYWORDS_FR = [
    "mariage", "mariée", "marié", "fiancé", "fiancée", "fiançailles",
    "wedding", "bride", "groom", "engaged", "proposal", "evjf", "evg",
    "liste de mariage", "robe de mariée", "alliances", "cérémonie",
    "demoiselle d'honneur", "témoin", "traiteur mariage", "photographe mariage",
    "vidéaste mariage", "fleuriste mariage", "wedding planner",
    "save the date", "faire-part", "lune de miel", "honeymoon",
    "je dis oui", "she said yes", "he asked", "future mrs",
    "bride to be", "mrs to be", "wifey", "hubby",
]

PARIS_KEYWORDS = [
    "paris", "île-de-france", "ile de france", "idf", "parisienne",
    "75", "92", "93", "94", "91", "78", "95", "77",
    "haussmann", "montmartre", "marais", "eiffel", "champs",
    "versailles", "saint-germain", "trocadéro",
]

PRODUCTION_KEYWORDS = [
    "vidéo", "video", "film", "cinéma", "photo", "photographe",
    "cameraman", "drone", "production", "réalisation", "tournage",
    "clip", "aftermovie", "highlight", "teaser",
]

OUTPUT_DIR = Path("D:/Projects/Noriz/blaze_leads")


@dataclass
class Lead:
    username: str
    full_name: str = ""
    bio: str = ""
    followers: int = 0
    following: int = 0
    posts: int = 0
    is_private: bool = False
    profile_url: str = ""
    found_via: str = ""  # hashtag where found
    wedding_score: int = 0
    paris_score: int = 0
    total_score: int = 0
    lead_type: str = ""  # "couple", "planner", "vendor", "creator"
    draft_message: str = ""
    scraped_at: str = ""


def score_lead(lead: Lead) -> Lead:
    """Score a lead based on bio keywords and profile signals."""
    bio_lower = (lead.bio or "").lower()
    name_lower = (lead.full_name or "").lower()
    text = f"{bio_lower} {name_lower}"

    # Wedding relevance (0-50)
    wedding_hits = sum(1 for kw in WEDDING_KEYWORDS_FR if kw in text)
    lead.wedding_score = min(wedding_hits * 5, 50)

    # Paris relevance (0-30)
    paris_hits = sum(1 for kw in PARIS_KEYWORDS if kw in text)
    lead.paris_score = min(paris_hits * 10, 30)

    # Profile quality bonus (0-20)
    quality = 0
    if not lead.is_private:
        quality += 5
    if 500 <= lead.followers <= 50000:  # sweet spot: not too small, not celebrity
        quality += 5
    if lead.posts >= 10:
        quality += 5
    if lead.followers > 0 and lead.following > 0:
        ratio = lead.followers / lead.following
        if 0.3 <= ratio <= 5:  # normal engagement ratio
            quality += 5

    lead.total_score = lead.wedding_score + lead.paris_score + quality

    # Classify lead type
    production_hits = sum(1 for kw in PRODUCTION_KEYWORDS if kw in text)
    planner_hits = sum(1 for kw in ["wedding planner", "organisat", "coordinat", "event"] if kw in text)

    if planner_hits >= 1:
        lead.lead_type = "planner"
    elif production_hits >= 2:
        lead.lead_type = "creator/vendor"
    elif wedding_hits >= 2 and any(kw in text for kw in ["fiancé", "bride", "mariée", "she said", "je dis oui", "mrs"]):
        lead.lead_type = "couple"
    else:
        lead.lead_type = "other"

    return lead


def draft_message(lead: Lead) -> str:
    """Generate a personalized outreach draft based on lead type."""
    name = lead.full_name.split()[0] if lead.full_name else lead.username

    if lead.lead_type == "couple":
        return (
            f"Bonjour {name} ! Félicitations pour vos fiançailles 🎉\n\n"
            f"Je suis Kevin de Blaze Production — on fait de la captation vidéo "
            f"de mariages à Paris (cinématique, drone, aftermovie).\n\n"
            f"Si vous cherchez encore un vidéaste, je serais ravi de vous envoyer "
            f"notre portfolio. Pas de pression, juste partager notre travail !\n\n"
            f"Belle journée ✨"
        )
    elif lead.lead_type == "planner":
        return (
            f"Bonjour {name},\n\n"
            f"Je suis Kevin, fondateur de Blaze Production — vidéo de mariage "
            f"cinématique à Paris.\n\n"
            f"On travaille régulièrement avec des wedding planners et j'aimerais "
            f"vous proposer un partenariat : recommandation croisée + tarif "
            f"préférentiel pour vos couples.\n\n"
            f"On peut échanger 10 min cette semaine ?\n\n"
            f"Kevin — Blaze Production"
        )
    elif lead.lead_type == "creator/vendor":
        return (
            f"Salut {name} !\n\n"
            f"J'adore votre travail. Je suis Kevin de Blaze Production — "
            f"on fait de la vidéo mariage à Paris.\n\n"
            f"Ça vous dirait de collaborer sur un prochain mariage ? "
            f"Dual-content, on se tag mutuellement. Win-win.\n\n"
            f"Kevin 🎬"
        )
    else:
        return (
            f"Bonjour {name},\n\n"
            f"Blaze Production — vidéo de mariage cinématique à Paris.\n"
            f"N'hésitez pas à visiter notre profil pour voir notre travail !\n\n"
            f"Kevin"
        )


def scrape_hashtag(loader: instaloader.Instaloader, hashtag: str, max_posts: int = 30) -> list[Lead]:
    """Scrape profiles from a hashtag's recent posts."""
    leads = []
    seen_users = set()

    print(f"  Scraping #{hashtag} (up to {max_posts} posts)...")

    try:
        ht = instaloader.Hashtag.from_name(loader.context, hashtag)
        count = 0

        for post in ht.get_posts():
            if count >= max_posts:
                break

            username = post.owner_username
            if username in seen_users:
                continue
            seen_users.add(username)

            try:
                profile = instaloader.Profile.from_username(loader.context, username)

                lead = Lead(
                    username=username,
                    full_name=profile.full_name or "",
                    bio=profile.biography or "",
                    followers=profile.followers,
                    following=profile.followees,
                    posts=profile.mediacount,
                    is_private=profile.is_private,
                    profile_url=f"https://instagram.com/{username}",
                    found_via=f"#{hashtag}",
                    scraped_at=datetime.now().isoformat(),
                )

                lead = score_lead(lead)
                lead.draft_message = draft_message(lead)

                if lead.total_score >= 10:  # minimum threshold
                    leads.append(lead)
                    print(f"    + {username} (score: {lead.total_score}, type: {lead.lead_type})")

            except Exception as e:
                print(f"    - Skipping {username}: {e}")

            count += 1

            # Rate limiting — random delay to avoid detection
            time.sleep(random.uniform(2, 5))

    except Exception as e:
        print(f"  Error on #{hashtag}: {e}")

    return leads


def export_csv(leads: list[Lead], path: Path):
    """Export leads to CSV."""
    if not leads:
        return

    fields = [
        "username", "full_name", "bio", "followers", "following", "posts",
        "is_private", "profile_url", "found_via", "wedding_score",
        "paris_score", "total_score", "lead_type", "draft_message", "scraped_at"
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for lead in leads:
            writer.writerow(asdict(lead))

    print(f"\nCSV exported: {path} ({len(leads)} leads)")


def export_pdf(leads: list[Lead], path: Path):
    """Export leads to a formatted PDF report."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable

    ACCENT = HexColor("#E8590C")
    WHITE = HexColor("#FFFFFF")
    DARK = HexColor("#2d2d2d")
    LIGHT_BG = HexColor("#F8F9FA")
    LIGHT_GRAY = HexColor("#E5E7EB")
    GRAY = HexColor("#6B7280")

    title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=24, textColor=ACCENT, spaceAfter=4)
    subtitle_style = ParagraphStyle("Sub", fontName="Helvetica", fontSize=11, textColor=GRAY, spaceAfter=16)
    h2_style = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
    body_style = ParagraphStyle("Body", fontName="Helvetica", fontSize=9, textColor=DARK, leading=12, spaceAfter=4)
    small_style = ParagraphStyle("Small", fontName="Helvetica", fontSize=7.5, textColor=GRAY, leading=10, spaceAfter=2)
    msg_style = ParagraphStyle("Msg", fontName="Helvetica-Oblique", fontSize=8, textColor=HexColor("#374151"), leading=10, leftIndent=10, spaceAfter=6)

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=20*mm, bottomMargin=15*mm)
    story = []
    W = 174*mm

    # Cover
    story.append(Paragraph("BLAZE PRODUCTION", title_style))
    story.append(Paragraph(f"Instagram Lead Report — {datetime.now().strftime('%B %d, %Y')}", subtitle_style))
    story.append(HRFlowable(width=W, thickness=2, color=ACCENT, spaceAfter=10))

    # Stats
    couples = [l for l in leads if l.lead_type == "couple"]
    planners = [l for l in leads if l.lead_type == "planner"]
    creators = [l for l in leads if l.lead_type == "creator/vendor"]
    high_score = [l for l in leads if l.total_score >= 30]

    stats_data = [
        ["Total Leads", "Couples", "Planners", "Creators", "High Score (30+)"],
        [str(len(leads)), str(len(couples)), str(len(planners)), str(len(creators)), str(len(high_score))],
    ]
    stats_table = Table(stats_data, colWidths=[W/5]*5)
    stats_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, 1), 16),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 8*mm))

    # Sort by score descending
    sorted_leads = sorted(leads, key=lambda l: l.total_score, reverse=True)

    # Group by type
    for lead_type, type_label in [("couple", "Engaged Couples"), ("planner", "Wedding Planners"), ("creator/vendor", "Creators & Vendors"), ("other", "Other Leads")]:
        group = [l for l in sorted_leads if l.lead_type == lead_type]
        if not group:
            continue

        story.append(Paragraph(f"{type_label} ({len(group)})", h2_style))

        for lead in group[:30]:  # cap per section
            bio_clean = (lead.bio or "").replace("\n", " | ")[:120]
            if len(lead.bio or "") > 120:
                bio_clean += "..."

            score_label = "HIGH" if lead.total_score >= 30 else "MED" if lead.total_score >= 15 else "LOW"

            story.append(Paragraph(
                f"<b>@{lead.username}</b> — {lead.full_name} &nbsp; "
                f"[Score: {lead.total_score} / {score_label}] &nbsp; "
                f"Followers: {lead.followers:,} &nbsp; Posts: {lead.posts}",
                body_style
            ))
            story.append(Paragraph(f"Bio: {bio_clean}", small_style))
            story.append(Paragraph(f"Found via: {lead.found_via} &nbsp; | &nbsp; {lead.profile_url}", small_style))

            # Draft message (truncated)
            msg_preview = lead.draft_message.replace("\n", " ")[:200]
            story.append(Paragraph(f"Draft: {msg_preview}...", msg_style))
            story.append(Spacer(1, 2*mm))

        if len(group) > 30:
            story.append(Paragraph(f"... and {len(group) - 30} more in CSV", small_style))

    # Footer
    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width=W, thickness=1, color=LIGHT_GRAY, spaceAfter=6))
    story.append(Paragraph(
        "Generated by Blaze Production Lead Scraper. Messages are drafts — "
        "personalize before sending manually via Instagram DM.",
        small_style
    ))

    doc.build(story)
    print(f"PDF exported: {path}")


def main():
    parser = argparse.ArgumentParser(description="Blaze Production — Instagram Lead Scraper")
    parser.add_argument("--login", nargs=2, metavar=("USER", "PASS"), help="Instagram login credentials")
    parser.add_argument("--hashtags", type=str, help="Comma-separated hashtags (no #)")
    parser.add_argument("--max-posts", type=int, default=30, help="Max posts per hashtag (default: 30)")
    parser.add_argument("--min-score", type=int, default=10, help="Minimum lead score (default: 10)")
    args = parser.parse_args()

    # Setup output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Setup instaloader
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    if args.login:
        print(f"Logging in as {args.login[0]}...")
        try:
            loader.login(args.login[0], args.login[1])
            print("  Logged in successfully.")
        except Exception as e:
            print(f"  Login failed: {e}")
            print("  Continuing without login (limited scraping).")

    # Hashtags
    hashtags = args.hashtags.split(",") if args.hashtags else DEFAULT_HASHTAGS

    # Scrape
    all_leads: list[Lead] = []
    seen_usernames = set()

    print(f"\nScraping {len(hashtags)} hashtags, {args.max_posts} posts each...\n")

    for hashtag in hashtags:
        hashtag = hashtag.strip().lstrip("#")
        leads = scrape_hashtag(loader, hashtag, args.max_posts)

        for lead in leads:
            if lead.username not in seen_usernames and lead.total_score >= args.min_score:
                seen_usernames.add(lead.username)
                all_leads.append(lead)

        # Pause between hashtags
        if hashtag != hashtags[-1]:
            pause = random.uniform(10, 20)
            print(f"  Pausing {pause:.0f}s before next hashtag...")
            time.sleep(pause)

    # Sort by score
    all_leads.sort(key=lambda l: l.total_score, reverse=True)

    print(f"\n{'='*50}")
    print(f"Total leads found: {len(all_leads)}")
    print(f"  Couples: {sum(1 for l in all_leads if l.lead_type == 'couple')}")
    print(f"  Planners: {sum(1 for l in all_leads if l.lead_type == 'planner')}")
    print(f"  Creators/Vendors: {sum(1 for l in all_leads if l.lead_type == 'creator/vendor')}")
    print(f"  Other: {sum(1 for l in all_leads if l.lead_type == 'other')}")
    print(f"  High score (30+): {sum(1 for l in all_leads if l.total_score >= 30)}")

    # Export
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    csv_path = OUTPUT_DIR / f"blaze_leads_{timestamp}.csv"
    pdf_path = OUTPUT_DIR / f"blaze_leads_{timestamp}.pdf"
    json_path = OUTPUT_DIR / f"blaze_leads_{timestamp}.json"

    export_csv(all_leads, csv_path)
    export_pdf(all_leads, pdf_path)

    # Also save raw JSON for later processing
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump([asdict(l) for l in all_leads], f, ensure_ascii=False, indent=2)
    print(f"JSON exported: {json_path}")

    print(f"\nDone! Open the PDF to review leads and draft messages.")
    print(f"Remember: send messages MANUALLY from your Instagram account.")


if __name__ == "__main__":
    main()
