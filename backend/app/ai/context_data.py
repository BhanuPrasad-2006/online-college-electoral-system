"""
context_data.py — AI Chatbot Knowledge Base
============================================
This module contains structured, grounded context data for the Gemini AI chatbot.
All candidate manifestos and student concerns are injected as strict system instructions
to prevent hallucinations. The AI must only respond based on this data.

IMPORTANT: Update this file when real candidate data is approved by the admin.
The data here is used ONLY as a knowledge boundary — the AI cannot fabricate
information beyond what is listed below.
"""

# ── Student Concerns (Aggregated from the platform's concern submissions) ──────
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

# ── Candidate Manifestos ───────────────────────────────────────────────────────
# NOTE: This data is pre-populated with representative mock data.
# When real candidates are approved, update this dictionary using the admin panel.
CANDIDATE_MANIFESTOS = {
    "Arjun Mehta": {
        "position": "General Secretary",
        "department": "Computer Science Engineering",
        "year": "3rd Year",
        "party": "Progress Alliance",
        "platforms": {
            "Placements & Career": (
                "I will establish a dedicated Tech Placement Cell with direct tie-ups to 20+ product-based companies. "
                "I plan to organize bi-monthly mock interview drives, resume review workshops, and a LinkedIn profile building bootcamp in collaboration with the Training & Placement department."
            ),
            "Campus Wi-Fi & Internet": (
                "I will petition the management to upgrade the campus Wi-Fi infrastructure to a minimum of 100 Mbps fiber connection. "
                "I will propose installing additional Wi-Fi repeaters in all hostel blocks and the canteen area, with a dedicated student-accessible bandwidth management portal."
            ),
            "Cafeteria Hygiene & Food Quality": (
                "I plan to form a Food Quality Committee with rotating student representatives who conduct monthly hygiene audits. "
                "I will work with the cafeteria management to introduce a weekly rotating menu, expand vegetarian and vegan options, and install a complaint drop box."
            ),
            "Sports & Recreation Facilities": (
                "My plan includes organizing one inter-department sports tournament each semester and negotiating with management for gym equipment procurement. "
                "I will revive the cricket and basketball leagues and ensure the sports grounds are maintained year-round."
            ),
            "Mental Health & Counselling": (
                "I am committed to launching an anonymous online counselling booking system within the first month of my tenure. "
                "I will advocate for two certified counsellors to be available during exam periods and will organize monthly Mental Health Awareness seminars."
            ),
            "Library Resources & Timings": None,  # Has NOT addressed this issue
            "Hostel Infrastructure": None,  # Has NOT addressed this issue
            "Transportation & Bus Routes": None,  # Has NOT addressed this issue
        },
    },

    "Priya Sharma": {
        "position": "General Secretary",
        "department": "Electronics & Communication Engineering",
        "year": "4th Year",
        "party": "Student First Movement",
        "platforms": {
            "Campus Wi-Fi & Internet": (
                "I have already spoken to the IT department and the Principal about the Wi-Fi issues. "
                "My plan is to implement a smart bandwidth allocation system that prioritizes lab and library networks during academic hours "
                "and automatically switches to hostel networks in the evening. I will also negotiate a dedicated 200 Mbps leased line for hostel blocks."
            ),
            "Hostel Infrastructure": (
                "I will form an official Hostel Welfare Committee with elected student representatives from each block. "
                "The committee will have a direct escalation path to the Chief Warden and management, with monthly resolution meetings. "
                "I will push for hot water geysers in all hostels and regular maintenance inspections."
            ),
            "Cafeteria Hygiene & Food Quality": (
                "I will introduce a live feedback system using QR codes in the cafeteria where students can rate meals daily. "
                "I will push for third-party food safety audits every two months and a student-voted menu system where the top-voted dishes appear each week."
            ),
            "Library Resources & Timings": (
                "I will negotiate with the librarian and management to extend library hours to 11 PM on all weekdays and 9 PM on weekends. "
                "I will also create an online portal to pre-book study rooms and request new book additions to the collection."
            ),
            "Transportation & Bus Routes": (
                "I will conduct a campus-wide survey to identify the top 5 most demanded bus routes and submit a formal proposal to expand coverage. "
                "Additionally, I will push for real-time GPS tracking integration into the college app for all buses."
            ),
            "Placements & Career": None,  # Has NOT addressed this issue
            "Sports & Recreation Facilities": None,  # Has NOT addressed this issue
            "Mental Health & Counselling": None,  # Has NOT addressed this issue
        },
    },

    "Kiran Reddy": {
        "position": "General Secretary",
        "department": "Mechanical Engineering",
        "year": "3rd Year",
        "party": "Unity Front",
        "platforms": {
            "Sports & Recreation Facilities": (
                "Sports are central to my campaign. I will completely revamp the sports committee structure and introduce a dedicated Sports Secretary role. "
                "I will organize an annual college Olympics with 15+ sports, negotiate for new gym equipment, and ensure all courts and grounds are maintained monthly. "
                "I will also push for sports scholarships for students excelling in inter-college competitions."
            ),
            "Cafeteria Hygiene & Food Quality": (
                "I propose a transparent rating system for cafeteria food quality displayed on a public notice board. "
                "I will work with management to hire a certified nutritionist to review the monthly menu and ensure balanced meal options are always available."
            ),
            "Placements & Career": (
                "I will create a cross-departmental Skill Development Club that organizes coding competitions, design hackathons, and core engineering workshops. "
                "I will also establish an alumni mentorship network where 3rd and 4th year students can seek career guidance from senior alumni currently working in industry."
            ),
            "Mental Health & Counselling": (
                "I will launch a Peer Support Network — a trained group of student volunteers who can provide initial emotional support. "
                "I will also push for a dedicated mental health awareness week each semester with activities and open sessions."
            ),
            "Campus Wi-Fi & Internet": None,  # Has NOT addressed this issue
            "Hostel Infrastructure": None,  # Has NOT addressed this issue
            "Library Resources & Timings": None,  # Has NOT addressed this issue
            "Transportation & Bus Routes": None,  # Has NOT addressed this issue
        },
    },
}


def build_system_instruction() -> str:
    """
    Constructs the complete Gemini system instruction from the structured
    context data above. This is injected at session creation and acts as the
    strict knowledge boundary for the AI.
    """
    lines = [
        "You are the official AI Election Assistant for a College Online Voting System.",
        "Your ONLY purpose is to help student voters make informed, unbiased decisions by providing",
        "factual, objective information about candidates' manifestos and student concerns.",
        "",
        "=== STRICT BEHAVIORAL RULES ===",
        "1. NEUTRALITY: Never recommend, endorse, rank, or express preference for any candidate.",
        "   Do NOT say 'I recommend Candidate X' or 'Candidate X is the best choice.'",
        "2. ANTI-HALLUCINATION: Only answer using the structured data provided below.",
        "   If a candidate has not addressed a specific issue, you MUST explicitly state:",
        "   '[Candidate Name] has not addressed this issue in their submitted manifesto.'",
        "   Never guess, infer, or generalize beyond the provided data.",
        "3. FORMATTING: When comparing candidates, use Markdown tables or bullet lists.",
        "   Use **bold** for candidate names and headings. Keep responses concise and easy to read.",
        "4. SCOPE: Only discuss topics related to this election, candidates, and student concerns.",
        "   Politely decline off-topic questions and redirect the user to election-related topics.",
        "5. TRANSPARENCY: You may mention that data is limited to submitted manifestos if asked.",
        "",
        "=== STUDENT CONCERNS DATA ===",
    ]

    for concern, data in STUDENT_CONCERNS.items():
        lines.append(f"\n**{concern}** (Votes: {data['vote_count']}, Severity: {data['severity']})")
        lines.append(f"  Student demand: {data['description']}")

    lines.append("\n\n=== CANDIDATE MANIFESTO DATA ===")

    for name, info in CANDIDATE_MANIFESTOS.items():
        lines.append(f"\n--- Candidate: {name} ---")
        lines.append(f"Position running for: {info['position']}")
        lines.append(f"Department: {info['department']} | Year: {info['year']} | Party: {info['party']}")
        lines.append("Platform Positions:")
        for topic, stance in info["platforms"].items():
            if stance:
                lines.append(f"  [{topic}]: {stance}")
            else:
                lines.append(f"  [{topic}]: NOT ADDRESSED — This candidate has not submitted any stance on this topic.")

    lines.append("\n\n=== END OF CONTEXT DATA ===")
    lines.append("Remember: base ALL responses strictly on the above data only.")

    return "\n".join(lines)


# Pre-built system instruction (computed once at module load)
SYSTEM_INSTRUCTION = build_system_instruction()
