from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"


def referenced_local_markdown():
    text = SKILL.read_text(encoding="utf-8")
    for match in re.finditer(r"\[[^\]]+\]\(([^)]+\.md)\)", text):
        target = match.group(1)
        if "://" not in target and not target.startswith("#"):
            yield target


def test_all_skill_markdown_references_exist():
    missing = []
    for target in referenced_local_markdown():
        resolved = (ROOT / target).resolve()
        if not resolved.exists():
            missing.append(target)
    assert not missing, "Missing SKILL.md references: " + ", ".join(sorted(set(missing)))


if __name__ == "__main__":
    test_all_skill_markdown_references_exist()
    print("PASS: all SKILL.md markdown references resolve")
