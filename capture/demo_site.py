"""Write the made-up web project the Design Tweak pictures preview.

Design Tweak previews a folder on disk, and it has no API that writes one: the
project is the user's own code, which the agent edits. So the demo project is a
small static site written from scratch here, for a bakery that does not exist
(Sunfield Bakery, ``sunfield-bakery.example``), and registered with the app
through its own API in ``scenes.json``.

    python capture/demo_site.py /tmp/kc-design-tweak-demo

writes ``<dir>/sunfield-bakery/{index.html,styles.css}``, replacing any earlier
copy, and prints the project folder.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

INDEX = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sunfield Bakery</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#">Sunfield Bakery</a>
    <nav class="nav">
      <a href="#breads">Breads</a>
      <a href="#visit">Visit</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1 class="hero-title">Bread baked before sunrise</h1>
      <p class="hero-lead">Slow sourdough, seeded rye and olive focaccia from a small
        wood-fired oven on Mill Lane.</p>
      <a class="cta" href="#breads">See today's loaves</a>
    </section>

    <section id="breads" class="breads">
      <h2 class="section-title">Today's loaves</h2>
      <div class="cards">
        <article class="card">
          <h3>Country sourdough</h3>
          <p>48-hour ferment, crackling crust.</p>
          <span class="price">$9</span>
        </article>
        <article class="card">
          <h3>Seeded rye</h3>
          <p>Dark rye with sunflower and flax.</p>
          <span class="price">$8</span>
        </article>
        <article class="card">
          <h3>Olive focaccia</h3>
          <p>Rosemary, sea salt, green olives.</p>
          <span class="price">$7</span>
        </article>
      </div>
    </section>

    <section id="visit" class="visit">
      <h2 class="section-title">Visit us</h2>
      <p>Open Wednesday to Sunday, 7am until the bread runs out.</p>
    </section>
  </main>

  <footer class="site-footer">
    <p>Sunfield Bakery &middot; hello@sunfield-bakery.example</p>
  </footer>
</body>
</html>
"""

STYLES = """* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  color: #2b2118;
  background: #fbf7f0;
}
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 40px;
  border-bottom: 1px solid #eadfcd;
  background: #fffdf8;
}
.brand { font-size: 20px; font-weight: bold; color: #2b2118; text-decoration: none; }
.nav a { margin-left: 24px; color: #6b5a48; text-decoration: none; font-size: 15px; }
.hero { padding: 72px 40px 56px; max-width: 760px; }
.hero-title { font-size: 44px; line-height: 1.15; margin: 0 0 16px; color: #2b2118; }
.hero-lead { font-size: 18px; line-height: 1.6; color: #5a4a3a; margin: 0 0 28px; }
.cta {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 6px;
  background: #6b5a48;
  color: #fffdf8;
  text-decoration: none;
  font-size: 15px;
}
.breads, .visit { padding: 32px 40px; }
.section-title { font-size: 26px; margin: 0 0 20px; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.card {
  background: #fffdf8;
  border: 1px solid #eadfcd;
  border-radius: 10px;
  padding: 20px;
}
.card h3 { margin: 0 0 8px; font-size: 19px; }
.card p { margin: 0 0 14px; color: #5a4a3a; }
.price { font-weight: bold; color: #2b2118; }
.site-footer { padding: 28px 40px; color: #8a7865; font-size: 14px; border-top: 1px solid #eadfcd; }
"""


def write_site(base: Path) -> Path:
    project = base / "sunfield-bakery"
    if project.exists():
        shutil.rmtree(project)
    project.mkdir(parents=True)
    (project / "index.html").write_text(INDEX, encoding="utf-8")
    (project / "styles.css").write_text(STYLES, encoding="utf-8")
    return project


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    print(write_site(Path(argv[0]).expanduser().resolve()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
