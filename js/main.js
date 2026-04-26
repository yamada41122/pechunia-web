/* =========================================
   NOVA STELLA — main.js
   ========================================= */

(function () {
  'use strict';

  // ---------- Header scroll state ----------
  const header = document.getElementById('siteHeader');
  if (header) {
    const updateHeader = () => {
      if (window.scrollY > 24) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    };
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
  }

  // ---------- Mobile menu toggle ----------
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menuToggle.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    // Close menu on nav click (mobile)
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        if (nav.classList.contains('is-open')) {
          nav.classList.remove('is-open');
          menuToggle.classList.remove('is-open');
          document.body.style.overflow = '';
        }
      });
    });
  }

  // ---------- Reveal on scroll ----------
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // ---------- Contact form validation ----------
  const form = document.getElementById('contactForm');
  if (form) {
    const successMsg = document.getElementById('formSuccess');
    const fields = form.querySelectorAll('input, select, textarea');

    const validateField = (field) => {
      const wrap = field.closest('.field');
      if (!wrap) return true;

      let valid = true;
      if (field.required) {
        if (field.type === 'checkbox') {
          valid = field.checked;
        } else if (field.type === 'email') {
          valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
        } else {
          valid = field.value.trim() !== '';
        }
      }

      wrap.classList.toggle('error', !valid);
      return valid;
    };

    fields.forEach((field) => {
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => {
        const wrap = field.closest('.field');
        if (wrap && wrap.classList.contains('error')) validateField(field);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let allValid = true;
      fields.forEach((field) => {
        if (!validateField(field)) allValid = false;
      });

      if (allValid) {
        if (successMsg) {
          successMsg.classList.add('is-visible');
          successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        form.reset();
      } else {
        const firstError = form.querySelector('.field.error');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  // ---------- Scroll to top button ----------
  // ボタンを動的に挿入（全ページ共通で1か所で管理するため）
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.className = 'scroll-top';
  scrollTopBtn.setAttribute('aria-label', 'ページ上部へ');
  scrollTopBtn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="6 14 12 8 18 14"/></svg>';
  document.body.appendChild(scrollTopBtn);

  let lastScrollY = 0;
  let scrollTopTicking = false;
  const SHOW_THRESHOLD = 400;

  const updateScrollTopBtn = () => {
    if (window.scrollY > SHOW_THRESHOLD) {
      scrollTopBtn.classList.add('is-visible');
    } else {
      scrollTopBtn.classList.remove('is-visible');
    }
    scrollTopTicking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      lastScrollY = window.scrollY;
      if (!scrollTopTicking) {
        window.requestAnimationFrame(updateScrollTopBtn);
        scrollTopTicking = true;
      }
    },
    { passive: true }
  );

  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---------- Hero parallax (subtle) ----------
  const heroBg = document.querySelector('.hero-bg');
  const heroGrid = document.querySelector('.hero-grid');
  if (heroBg || heroGrid) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY;
          if (heroBg) heroBg.style.transform = `translateY(${y * 0.25}px)`;
          if (heroGrid) heroGrid.style.transform = `translateY(${y * 0.12}px)`;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
