/**
 * Akù website — shared nav (hamburger) + scroll-reveal behaviour.
 * Vanilla JS, no dependencies. Loaded on every page via <script src="/nav.js" defer>.
 */
(function () {
  'use strict';

  // ── Mobile nav toggle ─────────────────────────────────────────────────────
  var toggle = document.getElementById('navToggle');
  var menu   = document.getElementById('navMenu');

  if (toggle && menu) {
    var closeMenu = function () {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    toggle.addEventListener('click', function () {
      var willOpen = !menu.classList.contains('open');
      menu.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      document.body.classList.toggle('menu-open', willOpen);
    });

    // Close on link tap (so anchor scrolling isn't hidden behind the menu)
    Array.prototype.forEach.call(menu.querySelectorAll('a'), function (a) {
      a.addEventListener('click', closeMenu);
    });

    // Close on Escape, and when resizing back to desktop width
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  // ── Scroll-reveal ─────────────────────────────────────────────────────────
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
      );
      Array.prototype.forEach.call(revealEls, function (el) { io.observe(el); });
    } else {
      Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('visible'); });
    }
  }

  // ── Sticky nav shadow on scroll (subtle depth once page has scrolled) ──────
  var nav = document.querySelector('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
