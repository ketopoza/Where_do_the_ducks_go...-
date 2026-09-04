#!/usr/bin/env python3
"""Regenerate about.html from about.md."""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
md_path = os.path.join(ROOT, 'about.md')
html_path = os.path.join(ROOT, 'about.html')

with open(md_path, 'r') as f:
    md = f.read()

html = '''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
</head>
<body class="about-page">
    <div class="page-wrap">
        <div id="about">
            <a class="back-link" href="index.html">&larr; Volver al mapa</a>
            <div id="about-content"></div>
        </div>
        <nav id="toc" aria-label="Tabla de contenidos">
            <p id="toc-label">En esta pagina</p>
            <ul id="toc-list"></ul>
        </nav>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script type="text/markdown" id="about-md">
''' + md + '''
    </script>
    <script>
        const md = document.getElementById('about-md').textContent;
        const content = document.getElementById('about-content');
        content.innerHTML = marked.parse(md);

        const tocList = document.getElementById('toc-list');
        const headings = content.querySelectorAll('h2, h3');
        headings.forEach((h, i) => {
            if (!h.id) h.id = 'section-' + i;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#' + h.id;
            a.textContent = h.textContent;
            if (h.tagName === 'H3') a.className = 'toc-h3';
            li.appendChild(a);
            tocList.appendChild(li);
        });

        const tocLinks = tocList.querySelectorAll('a');
        const observer = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    tocLinks.forEach(l => l.classList.remove('active'));
                    const link = tocList.querySelector('a[href="#' + e.target.id + '"]');
                    if (link) link.classList.add('active');
                }
            });
        }, { rootMargin: '-20% 0px -75% 0px' });
        headings.forEach(h => observer.observe(h));
    </script>
</body>
</html>
'''

with open(html_path, 'w') as f:
    f.write(html)

print(f'about.html regenerated from about.md ({len(md)} chars)')
