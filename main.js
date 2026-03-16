
    // ===================================================================
    // HEADER — Fondo blur al hacer scroll
    // ===================================================================
    const hd = document.getElementById('header');
    window.addEventListener('scroll', () => {
      hd.classList.toggle('scrolled', window.scrollY > 55);
    }, { passive: true });

    // ===================================================================
    // HERO BG — Zoom suave al cargar
    // ===================================================================
    window.addEventListener('load', () => {
      const bg = document.getElementById('heroBg');
      if (bg) bg.classList.add('loaded');
    });

    // ===================================================================
    // HAMBURGER — Menú móvil
    // ===================================================================
    const hbg    = document.getElementById('hbg');
    const mobNav = document.getElementById('mobNav');

    hbg.addEventListener('click', () => {
      const open = mobNav.classList.toggle('open');
      hbg.classList.toggle('open', open);
      hbg.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    function closeNav() {
      mobNav.classList.remove('open');
      hbg.classList.remove('open');
      hbg.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mobNav.classList.contains('open')) closeNav();
    });

    // ===================================================================
    // INTERSECTION OBSERVER — Fade-in al hacer scroll
    // ===================================================================
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -36px 0px' }
    );

    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // Hero ya visible al cargar
    document.querySelectorAll('#hero .reveal').forEach(el => el.classList.add('visible'));

    // ===================================================================
    // SMOOTH SCROLL — Con offset por el header fijo
    // ===================================================================
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href');
        if (id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        const offset = hd.offsetHeight + 12;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      });
    });
  
