from app.models.report import Finding, HealthScore

SCORING_VERSION = "score-v1"
WEIGHTS = {"error": 12, "warning": 5, "info": 0}

def score(findings: list[Finding]) -> HealthScore:
    deductions: dict[str, int] = {}
    for finding in findings:
        deduction = WEIGHTS[finding.severity]
        deductions[finding.rule_id] = min(30, deductions.get(finding.rule_id, 0) + deduction)
    return HealthScore(score=max(0, 100 - sum(deductions.values())), deductions=deductions, scoring_version=SCORING_VERSION)
