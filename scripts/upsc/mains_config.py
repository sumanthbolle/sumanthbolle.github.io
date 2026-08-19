"""Editable Mains-paper mapping for Pattern Atlas anchors.

Keep topic-to-paper assignment here so `mains_generator.py` does not embed
syllabus judgement in its selection or Worker-calling logic.
"""

# Eight dominant UPSC Mains directive words. The generator rotates through this
# list so every item appears inside any rolling 14-day window.
DIRECTIVES = (
    "Discuss",
    "Explain",
    "Analyse",
    "Examine",
    "Evaluate",
    "Comment",
    "Justify",
    "Critically Examine",
)

# Keyword fragments matched against anchor title, aliases and codes.
# More specific keys should appear before generic ones.
GS_PAPER_BY_TOPIC = {
    "ethics": "GS4",
    "probity": "GS4",
    "integrity": "GS4",
    "aptitude": "GS4",
    "moral": "GS4",
    "case study": "GS4",
    "polity": "GS2",
    "governance": "GS2",
    "federalism": "GS2",
    "constitution": "GS2",
    "parliament": "GS2",
    "judiciary": "GS2",
    "judicial": "GS2",
    "welfare": "GS2",
    "civil service": "GS2",
    "international": "GS2",
    "neighbourhood": "GS2",
    "diaspora": "GS2",
    "economy": "GS3",
    "fiscal": "GS3",
    "budget": "GS3",
    "agriculture": "GS3",
    "infrastructure": "GS3",
    "science": "GS3",
    "technology": "GS3",
    "environment": "GS3",
    "climate": "GS3",
    "biodiversity": "GS3",
    "security": "GS3",
    "disaster": "GS3",
    "society": "GS1",
    "urbanisation": "GS1",
    "poverty": "GS1",
    "communalism": "GS1",
    "globalisation": "GS1",
    "population": "GS1",
    "history": "GS1",
    "heritage": "GS1",
    "geography": "GS1",
    "monsoon": "GS1",
    "essay": "GS1",
}

GS_PAPERS = ("GS1", "GS2", "GS3", "GS4")
DEFAULT_WORD_LIMIT = 250
DEFAULT_TIME_BUDGET_MINUTES = 12
