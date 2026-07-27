from pathlib import Path

root = Path.cwd()
path = root / "scripts/apply-static-cloud-deep-fix.py"
source = path.read_text(encoding="utf-8")
old = 'responsive = replace_once(responsive, old_patch, new_patch, "fail-closed patch")'
new = '''responsive = regex_once(
    responsive,
    r'  if \\(!next\\.includes\\(STATIC_SWIPE_FIX_MARKER\\)\\) \\{.*?  return next;',
    new_patch,
    "fail-closed patch",
)'''
if source.count(old) != 1:
    raise RuntimeError(f"applicator repair expected one match, found {source.count(old)}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
(root / "scripts/repair-static-applicator.py").unlink()
print("Repaired applicator matching")
