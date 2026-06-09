"""
context_data.py — AI Chatbot Knowledge Base
============================================
This module contains structured, grounded context data for the Gemini AI chatbot.
All candidate manifestos, student concerns, election rules, and process knowledge
are injected as strict system instructions to prevent hallucinations.

The AI must only respond based on this data. Update this file when real
candidate data is approved by the admin.
"""

from typing import Optional

# ═══════════════════════════════════════════════════════════════
#  1. ELECTION PROCESS & PHASES
# ═══════════════════════════════════════════════════════════════

ELECTION_PHASES = [
    {
        "phase": "pre_registration",
        "label": "Pre-Registration",
        "description": (
            "Election has been announced but registration has not yet opened. "
            "Students can view upcoming election details but cannot register to vote or apply as candidates."
        ),
    },
    {
        "phase": "registration_open",
        "label": "Registration Open",
        "description": (
            "Voter registration is open. Students must register to vote by verifying their identity "
            "and linking their student ID. Candidate applications are also open during this period."
        ),
    },
    {
        "phase": "registration_closed",
        "label": "Registration Closed",
        "description": (
            "Voter registration and candidate applications have closed. "
            "No new registrations or applications are accepted."
        ),
    },
    {
        "phase": "campaign_period",
        "label": "Campaign Period",
        "description": (
            "Candidates can submit and edit their manifestos. "
            "Students can view candidate profiles, read manifestos, and review student concerns."
        ),
    },
    {
        "phase": "voting_open",
        "label": "Voting Open",
        "description": (
            "Voting is live. Registered voters can cast their votes securely. "
            "Each voter can vote once per position. Votes are anonymous and cryptographically secured."
        ),
    },
    {
        "phase": "voting_closed",
        "label": "Voting Closed",
        "description": (
            "Voting has ended. Votes are being tallied and verified. "
            "No further votes can be cast."
        ),
    },
    {
        "phase": "results_announced",
        "label": "Results Announced",
        "description": (
            "Results have been published. Final vote counts per candidate per position are available."
        ),
    },
]

# ═══════════════════════════════════════════════════════════════
#  2. VOTER ELIGIBILITY & REGISTRATION RULES
# ═══════════════════════════════════════════════════════════════

VOTER_RULES = {
    "eligibility": (
        "To be eligible to vote in college elections, a student must: \n"
        "  • Be a currently enrolled student of the college.\n"
        "  • Have a valid college email address.\n"
        "  • Complete voter registration during the registration period.\n"
        "  • Verify their identity through the OTP verification process.\n"
        "  • Face verification may also be required via the JIT (Just-In-Time) verification system."
    ),
    "registration_process": (
        "Students register by:\n"
        "  1. Logging in with their student ID and college email.\n"
        "  2. Submitting personal details (department, year of study, mobile number).\n"
        "  3. Verifying their email via OTP sent to their college email.\n"
        "  4. Optionally verifying their mobile number via SMS OTP.\n"
        "  5. Once verified, they receive voting permission from the admin."
    ),
    "voting_process": (
        "How voting works:\n"
        "  1. Voter logs in during the voting period.\n"
        "  2. Voter completes face verification (JIT - Just-In-Time) to confirm identity.\n"
        "  3. Voter selects candidates for each position.\n"
        "  4. Vote is encrypted and stored anonymously — no link between voter and vote.\n"
        "  5. A cryptographic hash chain ensures vote integrity.\n"
        "  6. Voter receives a receipt hash to verify their vote was counted."
    ),
    "anonymity": (
        "Vote anonymity is enforced at the database schema level. "
        "The votes table has NO voter_id column by design. "
        "Each vote session generates a random token that is SHA-256 hashed — "
        "the original token is never stored. This hash cannot be reversed."
    ),
    "face_verification": (
        "JIT (Just-In-Time) face verification uses the voter's reference image "
        "submitted during registration. During voting, a live photo is captured "
        "and compared against the stored reference using facial recognition."
    ),
}

# ═══════════════════════════════════════════════════════════════
#  3. CANDIDATE RULES
# ═══════════════════════════════════════════════════════════════

CANDIDATE_RULES = {
    "eligibility": (
        "To stand as a candidate, a student must:\n"
        "  • Be a currently enrolled student.\n"
        "  • Not have any pending disciplinary actions.\n"
        "  • Submit their candidacy during the registration period.\n"
        "  • Be approved by the election administrator.\n"
        "  • Submit a manifesto outlining their platform."
    ),
    "application_process": (
        "Candidate application process:\n"
        "  1. Student applies for a specific position (e.g., General Secretary).\n"
        "  2. Admin reviews and approves/rejects the application.\n"
        "  3. Approved candidate submits their manifesto (text + optional image).\n"
        "  4. Manifesto is visible to voters during the campaign and voting periods."
    ),
    "statuses": [
        "PENDING — Application submitted, awaiting admin review.",
        "APPROVED — Application accepted. Candidate can submit manifesto.",
        "REJECTED — Application denied (admin provides remarks explaining why).",
        "WITHDRAWN — Candidate has withdrawn from the election.",
    ],
}

# ═══════════════════════════════════════════════════════════════
#  4. STUDENT CONCERNS (Aggregated from platform submissions)
# ═══════════════════════════════════════════════════════════════

STUDENT_CONCERNS = {
    "Placements & Career": {
        "description": "Students want more industry tie-ups, mock interview sessions, LinkedIn profile workshops, and dedicated placement coordinators per department.",
        "vote_count": 342,
        "severity": "High",
    },
    "Campus Wi-Fi & Internet": {
        "description": "The college Wi-Fi speed drops significantly during peak hours in hostels and labs. Students request at least 100 Mbps dedicated bandwidth and better router placement in all blocks.",
        "vote_count": 289,
        "severity": "High",
    },
    "Cafeteria Hygiene & Food Quality": {
        "description": "Many students have reported poor hygiene standards, stale food, and limited vegetarian options. Regular audits and a student-managed food committee are demanded.",
        "vote_count": 231,
        "severity": "Medium",
    },
    "Sports & Recreation Facilities": {
        "description": "The cricket ground and basketball court need maintenance. Students want a proper gym, table tennis area, and inter-department sports tournaments organized each semester.",
        "vote_count": 178,
        "severity": "Medium",
    },
    "Library Resources & Timings": {
        "description": "Students request extended library hours (until 11 PM on weekdays), more digital journal subscriptions, and better AC maintenance inside the library.",
        "vote_count": 156,
        "severity": "Medium",
    },
    "Hostel Infrastructure": {
        "description": "Hot water supply is inconsistent, common rooms lack furniture, and some blocks have poor ventilation. Residents want a dedicated hostel student committee to raise maintenance requests.",
        "vote_count": 143,
        "severity": "High",
    },
    "Mental Health & Counselling": {
        "description": "Students want more awareness sessions, an anonymous online counselling booking system, and at least two certified counsellors available during semester exam periods.",
        "vote_count": 119,
        "severity": "High",
    },
    "Transportation & Bus Routes": {
        "description": "Bus routes from areas like Rajajinagar, Jayanagar, and Electronic City are insufficient. Students want more frequency and GPS tracking of college buses.",
        "vote_count": 98,
        "severity": "Low",
    },
}

# ═══════════════════════════════════════════════════════════════
#  5. CANDIDATE MANIFESTOS
# ═══════════════════════════════════════════════════════════════

CANDIDATE_MANIFESTOS = {}

# ═══════════════════════════════════════════════════════════════
#  6. FAQ — Common Voter Questions
# ═══════════════════════════════════════════════════════════════

FAQ = [
    {
        "question": "How do I register to vote?",
        "answer": (
            "Log in with your student ID and college email. "
            "Go to the registration section, fill in your details, verify your email via OTP, "
            "and optionally verify your mobile number. Once admin grants voting permission, you're all set."
        ),
    },
    {
        "question": "When can I vote?",
        "answer": (
            "Voting is only allowed during the 'Voting Open' phase. "
            "Check the election timeline on your dashboard for exact start and end times."
        ),
    },
    {
        "question": "Can I change my vote after submitting?",
        "answer": "No. Once a vote is cast, it is final and cannot be changed. Votes are cryptographically sealed to prevent tampering."
    },
    {
        "question": "Is my vote anonymous?",
        "answer": (
            "Yes, absolutely. The system is designed with privacy at the database level. "
            "There is no link between your identity and your vote. A one-way hash is used instead of storing your voter ID."
        ),
    },
    {
        "question": "How do I know my vote was counted?",
        "answer": "After voting, you receive a unique receipt hash. You can use this hash to verify your vote exists in the blockchain-style ledger without revealing who you voted for."
    },
    {
        "question": "What is face verification?",
        "answer": (
            "JIT (Just-In-Time) face verification is an extra security layer. "
            "When voting, a live photo is taken and matched against your reference image from registration. "
            "This ensures the person voting is truly you."
        ),
    },
    {
        "question": "How do I apply as a candidate?",
        "answer": (
            "During the registration period, go to the candidate section and apply for your desired position. "
            "Admin will review and approve your application. Then submit your manifesto."
        ),
    },
    {
        "question": "What is a manifesto?",
        "answer": (
            "A manifesto is a candidate's written statement of their plans, promises, and vision if elected. "
            "It covers their stance on various student issues like placements, Wi-Fi, cafeteria, sports, etc."
        ),
    },
    {
        "question": "Can I edit my manifesto after submitting?",
        "answer": "Yes, during the registration and campaign periods. Once voting begins, manifestos are locked."
    },
    {
        "question": "What positions are available in the election?",
        "answer": "Positions vary by election. Common positions include General Secretary, Academic Secretary, Sports Secretary, Cultural Secretary, and other student council roles."
    },
    {
        "question": "How are results announced?",
        "answer": (
            "After voting ends, votes are tallied and verified using the cryptographic hash chain. "
            "Results are published on the platform with vote counts per candidate per position."
        ),
    },
    {
        "question": "What should I do if I face technical issues?",
        "answer": "Contact the election administrator or support team through the platform's concern submission feature."
    },
    {
        "question": "Can I submit a concern or complaint?",
        "answer": (
            "Yes! Use the 'Submit Concern' feature on your dashboard. "
            "Concerns are categorized and shared with candidates so they can address them in their manifestos."
        ),
    },
    {
        "question": "How is vote security maintained?",
        "answer": (
            "Votes are secured through multiple layers:\n"
            "  1. Cryptographic hash chain linking all votes (blockchain-style ledger)\n"
            "  2. One-way hashing of voter tokens for anonymity\n"
            "  3. Anti-replay token system to prevent duplicate votes\n"
            "  4. JIT face verification\n"
            "  5. Rate limiting and fraud detection algorithms\n"
            "  6. AI-based anomaly detection monitoring voting patterns"
        ),
    },
]

# ═══════════════════════════════════════════════════════════════
#  7. QUERY TYPE CLASSIFICATION GUIDE
# ═══════════════════════════════════════════════════════════════

QUERY_TYPE_GUIDE = {
    "manifesto": {
        "description": "Questions about candidate platforms, stances, promises, or positions on issues.",
        "examples": [
            "Compare all candidates on placements",
            "Which candidates address mental health?",
        ],
        "response_guidance": "Use CANDIDATE MANIFESTO DATA. Format comparisons as Markdown tables. If a candidate hasn't addressed an issue, explicitly state that.",
    },
    "voting_process": {
        "description": "Questions about how to vote, when to vote, voting mechanics.",
        "examples": [
            "How do I vote?",
            "When does voting start?",
            "Can I change my vote?",
            "Is my vote anonymous?",
        ],
        "response_guidance": "Use VOTER_RULES and FAQ data. Explain the process step by step.",
    },
    "registration": {
        "description": "Questions about voter registration or candidate application.",
        "examples": [
            "How do I register to vote?",
            "How do I become a candidate?",
            "What is the registration deadline?",
        ],
        "response_guidance": "Use VOTER_RULES and CANDIDATE_RULES data. Reference election phases for timing.",
    },
    "candidate_info": {
        "description": "Questions about candidate backgrounds, eligibility, parties.",
        "examples": [
            "Who is running for President?",
            "Tell me about the candidates",
        ],
        "response_guidance": "Use CANDIDATE MANIFESTO DATA. Focus on candidate background and positions.",
    },
    "election_schedule": {
        "description": "Questions about election timeline, phases, deadlines.",
        "examples": [
            "What is the election schedule?",
            "When does campaigning start?",
            "How long is voting open?",
        ],
        "response_guidance": "Use ELECTION_PHASES data. Explain the current and upcoming phases.",
    },
    "student_concerns": {
        "description": "Questions about student issues, problems, demands.",
        "examples": [
            "What are the top student concerns?",
            "What do students think about Wi-Fi?",
            "How many students voted for placement concerns?",
        ],
        "response_guidance": "Use STUDENT_CONCERNS data. Reference vote counts and severity levels.",
    },
    "security": {
        "description": "Questions about vote security, anonymity, fraud prevention.",
        "examples": [
            "How is my vote secured?",
            "Can someone tamper with votes?",
            "What is the hash chain?",
        ],
        "response_guidance": "Use FAQ and VOTER_RULES data. Explain the security architecture clearly.",
    },
    "rules": {
        "description": "Questions about election rules, eligibility, do's and don'ts.",
        "examples": [
            "Who can vote?",
            "What are the candidate requirements?",
            "Can I vote from my phone?",
        ],
        "response_guidance": "Use VOTER_RULES and CANDIDATE_RULES data. Be precise about rules.",
    },
    "results": {
        "description": "Questions about election results, vote counts, winners.",
        "examples": [
            "Who won the election?",
            "What are the results?",
            "How many votes did each candidate get?",
        ],
        "response_guidance": "If results are published, share available data. If voting is still open or results aren't announced, state that clearly.",
    },
    "off_topic": {
        "description": "Questions completely unrelated to elections, college, or voting.",
        "examples": [
            "What is the capital of France?",
            "Tell me a joke",
            "Solve this math problem",
        ],
        "response_guidance": "Politely decline and redirect to election-related topics.",
    },
}


# ═══════════════════════════════════════════════════════════════
#  8. SYSTEM INSTRUCTION BUILDER
# ═══════════════════════════════════════════════════════════════

def build_system_instruction(
    dynamic_context: Optional[dict] = None,
    candidate_data: Optional[dict] = None,
) -> str:
    """
    Constructs the complete Gemini system instruction from the structured
    context data above. This is injected at session creation and acts as the
    strict knowledge boundary for the AI.

    Args:
        dynamic_context: Optional dict with real-time data like current phase,
                         election dates, actual vote counts, etc.
        candidate_data: Optional dict of real candidate manifesto data fetched
                        from the database. If provided, replaces the hardcoded
                        CANDIDATE_MANIFESTOS. Structure:
                        {"Full Name": {"position": str, "department": str,
                         "year": str, "party": str,
                         "manifesto_content": str | None,
                         "image_url": str | None}}

    Returns:
        A complete system instruction string.
    """
    # Use DB-fetched candidate data if provided, otherwise fall back to hardcoded
    manifestos_source = candidate_data if candidate_data is not None else CANDIDATE_MANIFESTOS
    lines = [
        "You are the official **AI Election Assistant** for a College Online Voting System.",
        "Your ONLY purpose is to help student voters make informed, unbiased decisions by providing",
        "factual, objective information about candidates' manifestos, student concerns, and the election process.",
        "",
        "╔══════════════════════════════════════════════════════════════╗",
        "║              CORE BEHAVIORAL RULES                         ║",
        "╚══════════════════════════════════════════════════════════════╝",
        "",
        "1. NEUTRALITY: Never recommend, endorse, rank, or express preference for any candidate.",
        "   Do NOT say 'I recommend Candidate X' or 'Candidate X is the best choice.'",
        "   If someone asks 'Who should I vote for?', politely decline and explain you can only provide",
        "   objective information to help them decide for themselves.",
        "",
        "2. ANTI-HALLUCINATION: Only answer using the structured data provided below.",
        "   If a candidate has not addressed a specific issue, you MUST explicitly state:",
        "   '[Candidate Name] has not addressed this issue in their submitted manifesto.'",
        "   Never guess, infer, or generalize beyond the provided data.",
        "",
        "3. FORMATTING: Use Markdown for structure.",
        "   • Use **bold** for candidate names, headings, and key terms.",
        "   • Use bullet points for lists.",
        "   • Use Markdown tables when comparing multiple candidates on the same topic.",
        "   • Keep responses concise and easy to read — students are on the go.",
        "",
        "4. SCOPE: Only discuss topics related to this election, candidates, voting process,",
        "   student concerns, and college election rules. Politely decline off-topic questions.",
        "",
        "5. QUERY CLASSIFICATION: When a user asks a question, identify the query type",
        "   (manifesto, voting_process, registration, candidate_info, election_schedule,",
        "   student_concerns, security, rules, results, off_topic) and follow the",
        "   response_guidance for that type.",
        "",
        "6. TRANSPARENCY: Always be honest about limitations. If data isn't available,",
        "   say so clearly. Never fabricate information.",
        "",
        "7. CONTEXT AWARENESS: Pay attention to the user's message context.",
        "   If they ask a follow-up, remember what was discussed before.",
        "   If they ask about 'he/she/they', refer to the last mentioned candidate.",
        "",
        "8. CONCISE ANSWERS: Provide direct answers first, then offer additional details.",
        "   Don't make the user read paragraphs to find their answer.",
        "",
        "╔══════════════════════════════════════════════════════════════╗",
        "║              DYNAMIC ELECTION STATUS                        ║",
        "╚══════════════════════════════════════════════════════════════╝",
    ]

    # ── Dynamic context injection ──────────────────────────────
    if dynamic_context:
        current_phase = dynamic_context.get("current_phase", "unknown")
        election_title = dynamic_context.get("election_title", "Current Election")
        lines.append(f"\nCurrent Election: **{election_title}**")
        lines.append(f"Current Phase: **{current_phase}**")
        if dynamic_context.get("time_remaining"):
            lines.append(f"Time Remaining: **{dynamic_context['time_remaining']}**")

        if dynamic_context.get("positions"):
            pos_list = dynamic_context["positions"]
            lines.append(f"\nAvailable Positions: {', '.join(pos_list)}")
    else:
        lines.append("\n(Election status data not available — provide general information based on the knowledge below.)")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              ELECTION PHASES                               ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for phase_info in ELECTION_PHASES:
        lines.append(f"\n**{phase_info['label']}** (`{phase_info['phase']}`)")
        lines.append(f"  {phase_info['description']}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              VOTER RULES & PROCESS                         ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for key, text in VOTER_RULES.items():
        lines.append(f"\n**{key.replace('_', ' ').title()}:**")
        for line in text.strip().split("\n"):
            lines.append(f"  {line.strip()}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              CANDIDATE RULES                               ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for key, text in CANDIDATE_RULES.items():
        if key == "statuses":
            lines.append(f"\n**Candidate Statuses:**")
            for s in text:
                lines.append(f"  • {s}")
        else:
            lines.append(f"\n**{key.replace('_', ' ').title()}:**")
            for line in text.strip().split("\n"):
                lines.append(f"  {line.strip()}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              STUDENT CONCERNS DATA                         ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for concern, data in STUDENT_CONCERNS.items():
        lines.append(f"\n**{concern}** (Votes: {data['vote_count']}, Severity: {data['severity']})")
        lines.append(f"  Student demand: {data['description']}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              CANDIDATE MANIFESTO DATA                      ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for name, info in manifestos_source.items():
        lines.append(f"\n  ── **{name}** ──")
        lines.append(f"  Position: {info['position']}")
        lines.append(f"  Department: {info['department']} | Year: {info['year']} | Party: {info['party']}")

        # Handle both hardcoded CANDIDATE_MANIFESTOS (with 'platforms' dict)
        # and DB-fetched data (with 'manifesto_content' string)
        if "platforms" in info and info["platforms"]:
            lines.append(f"  **Platform Positions:**")
            for topic, stance in info["platforms"].items():
                if stance:
                    lines.append(f"    ✅ [{topic}]: {stance}")
                else:
                    lines.append(f"    ❌ [{topic}]: NOT ADDRESSED — This candidate has not submitted any stance on this topic.")
        elif "manifesto_content" in info and info["manifesto_content"]:
            lines.append(f"  **Manifesto Content:**")
            # Truncate very long manifestos to avoid overflowing the token limit
            content = info["manifesto_content"]
            if len(content) > 2000:
                content = content[:2000] + "\n    [...truncated, full manifesto available on the candidate's profile page...]"
            for line in content.strip().split("\n"):
                lines.append(f"    {line.strip()}")
        else:
            lines.append(f"  **Platform Positions:**  _Manifesto not yet submitted._")

        # Include manifesto image URL if available
        if info.get("image_url"):
            lines.append(f"  Manifesto image: {info['image_url']}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              FAQ — COMMON VOTER QUESTIONS                   ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")

    for faq in FAQ:
        lines.append(f"\n**Q: {faq['question']}**")
        lines.append(f"  A: {faq['answer']}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              QUERY TYPE RESPONSE GUIDES                    ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")
    lines.append("")
    lines.append("When a user sends a message, follow these guidelines based on query type:")

    for qtype, guide in QUERY_TYPE_GUIDE.items():
        lines.append(f"\n**{qtype.replace('_', ' ').title()}**")
        lines.append(f"  Response: {guide['response_guidance']}")

    lines.append("")
    lines.append("╔══════════════════════════════════════════════════════════════╗")
    lines.append("║              END OF CONTEXT DATA                           ║")
    lines.append("╚══════════════════════════════════════════════════════════════╝")
    lines.append("")
    lines.append("REMEMBER:")
    lines.append("  • Base ALL responses strictly on the above data only.")
    lines.append("  • Stay neutral — NEVER recommend a candidate.")
    lines.append("  • If you're unsure about something, say so rather than guessing.")
    lines.append("  • Your goal is to INFORM, not to PERSUADE.")
    lines.append("  • Always keep the response focused on college election topics.")

    return "\n".join(lines)


# Pre-built system instruction (computed once at module load)
SYSTEM_INSTRUCTION = build_system_instruction()


def format_dynamic_context(
    current_phase: Optional[str] = None,
    election_title: Optional[str] = None,
    time_remaining: Optional[str] = None,
    positions: Optional[list[str]] = None,
) -> dict:
    """Build a dynamic context dict from available real-time data."""
    ctx = {}
    if current_phase:
        ctx["current_phase"] = current_phase
    if election_title:
        ctx["election_title"] = election_title
    if time_remaining:
        ctx["time_remaining"] = time_remaining
    if positions:
        ctx["positions"] = positions
    return ctx
