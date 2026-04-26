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
    const closeMenu = () => {
      nav.classList.remove('is-open');
      menuToggle.classList.remove('is-open');
      document.body.classList.remove('is-menu-open');
    };
    const openMenu = () => {
      nav.classList.add('is-open');
      menuToggle.classList.add('is-open');
      document.body.classList.add('is-menu-open');
    };

    menuToggle.addEventListener('click', () => {
      if (nav.classList.contains('is-open')) closeMenu();
      else openMenu();
    });

    // ナビ項目タップで自動クローズ
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        if (nav.classList.contains('is-open')) closeMenu();
      });
    });

    // リサイズでデスクトップに戻ったら強制クローズ
    window.addEventListener('resize', () => {
      if (window.innerWidth > 720 && nav.classList.contains('is-open')) closeMenu();
    });
  }

  // ---------- Reveal on scroll ----------
  const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
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

  // ---------- Contact form validation + Formspree submit ----------
  const form = document.getElementById('contactForm');
  if (form) {
    const successMsg = document.getElementById('formSuccess');
    const errorMsg = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');
    const fields = form.querySelectorAll('input, select, textarea');

    const validateField = (field) => {
      const wrap = field.closest('.field');
      if (!wrap) return true;
      if (field.name === '_gotcha') return true; // honeypot 無視

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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let allValid = true;
      fields.forEach((field) => {
        if (!validateField(field)) allValid = false;
      });

      if (!allValid) {
        const firstError = form.querySelector('.field.error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Formspree が未設定の場合のガード
      if (form.action.indexOf('YOUR_FORM_ID') !== -1) {
        if (errorMsg) {
          errorMsg.style.display = '';
          errorMsg.classList.add('is-visible');
          errorMsg.innerHTML = '✕ フォーム送信先が未設定です。<br>サイト管理者にFormspreeの設定をご依頼ください。';
          errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // 送信中UI
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      if (successMsg) successMsg.classList.remove('is-visible');
      if (errorMsg) {
        errorMsg.classList.remove('is-visible');
        errorMsg.style.display = 'none';
      }

      try {
        const formData = new FormData(form);
        const res = await fetch(form.action, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          form.reset();
          if (successMsg) {
            successMsg.classList.add('is-visible');
            successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Form submit error:', err);
        if (errorMsg) {
          errorMsg.style.display = '';
          errorMsg.classList.add('is-visible');
          errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit →';
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
