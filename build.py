#!/usr/bin/env python3
"""Fabrique console-test.js : le plugin, sa feuille de style et le panneau de test, en un seul
fichier à coller dans la console d'un forum.

    python build.py
"""
import json
import pathlib

ici = pathlib.Path(__file__).parent
js = (ici / "fa-moderation.js").read_text(encoding="utf-8")
css = (ici / "fa-moderation.css").read_text(encoding="utf-8")
footer = (ici / "test-footer.js").read_text(encoding="utf-8")

style = (
    "\n(function () {\n"
    "  if (document.getElementById('fam-css')) return;\n"
    "  var s = document.createElement('style');\n"
    "  s.id = 'fam-css';\n"
    "  s.textContent = %s;\n"
    "  document.head.appendChild(s);\n"
    "})();\n" % json.dumps(css, ensure_ascii=False)
)

sortie = ici / "console-test.js"
sortie.write_text(js + style + footer, encoding="utf-8", newline="\n")
print("console-test.js : %d octets" % sortie.stat().st_size)
