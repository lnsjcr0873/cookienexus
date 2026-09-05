/**
 * CookieNexus Consent Engine - Zero-dependency, GDPR/CCPA & Google Consent Mode v2 compliant
 */

(function(window, document) {
  'use strict';

  const STORAGE_KEY = 'cookienexus_consent_state';

  class CookieNexusConsent {
    constructor(config = {}) {
      this.config = {
        title: config.title || '🍪 Cookie Preferences & Privacy Choice',
        description: config.description || 'We use cookies and similar technologies to enhance site navigation, analyze site usage, and assist in marketing.',
        categories: {
          necessary: { name: 'Strictly Necessary', required: true, default: true, desc: 'Essential for core website security and authentication.' },
          analytics: { name: 'Analytics & Performance', required: false, default: false, desc: 'Helps us analyze traffic and page interactions.' },
          marketing: { name: 'Marketing & Targeting', required: false, default: false, desc: 'Used to serve relevant ads and track conversions.' },
          functional: { name: 'Functional & Preferences', required: false, default: false, desc: 'Remembers your language, theme, and region settings.' },
        },
        autoBlock: config.autoBlock !== false,
        onConsent: config.onConsent || null,
        ...config
      };

      this.consentState = this.loadState();
      this.initGCM();
      this.initUI();

      if (this.consentState) {
        this.applyConsent(this.consentState);
      }
    }

    loadState() {
      try {
        const item = localStorage.getItem(STORAGE_KEY);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    }

    saveState(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {}
    }

    initGCM() {
      // Google Consent Mode v2 default initialization
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function() { window.dataLayer.push(arguments); };

      const defaultConsent = {
        'ad_storage': 'denied',
        'analytics_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'wait_for_update': 500
      };

      if (this.consentState) {
        defaultConsent.analytics_storage = this.consentState.analytics ? 'granted' : 'denied';
        defaultConsent.ad_storage = this.consentState.marketing ? 'granted' : 'denied';
        defaultConsent.ad_user_data = this.consentState.marketing ? 'granted' : 'denied';
        defaultConsent.ad_personalization = this.consentState.marketing ? 'granted' : 'denied';
      }

      window.gtag('consent', 'default', defaultConsent);
    }

    applyConsent(state) {
      // Update GCM v2
      window.gtag('consent', 'update', {
        'ad_storage': state.marketing ? 'granted' : 'denied',
        'analytics_storage': state.analytics ? 'granted' : 'denied',
        'ad_user_data': state.marketing ? 'granted' : 'denied',
        'ad_personalization': state.marketing ? 'granted' : 'denied',
      });

      // Activate unblocked scripts
      for (const [cat, enabled] of Object.entries(state)) {
        if (enabled) {
          this.activateCategoryScripts(cat);
        }
      }

      if (typeof this.config.onConsent === 'function') {
        this.config.onConsent(state);
      }
    }

    activateCategoryScripts(category) {
      const scripts = document.querySelectorAll(`script[type="text/plain"][data-cookie-category="${category}"]`);
      scripts.forEach(oldScript => {
        if (!oldScript.parentNode) return;
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
          if (attr.name !== 'type' && attr.name !== 'data-cookie-category') {
            newScript.setAttribute(attr.name, attr.value);
          }
        });
        newScript.type = 'text/javascript';
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.text = oldScript.text || oldScript.innerHTML;
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
        console.log(`[CookieNexus Consent] Activated script for category: ${category}`);
      });
    }

    initUI() {
      if (this.consentState) return; // Already answered

      const overlay = document.createElement('div');
      overlay.id = 'cookienexus-consent-modal';
      overlay.innerHTML = `
        <div class="cn-banner-card">
          <div class="cn-banner-header">
            <h3>${this.config.title}</h3>
          </div>
          <p class="cn-banner-desc">${this.config.description}</p>
          
          <div class="cn-categories">
            ${Object.entries(this.config.categories).map(([key, cat]) => `
              <div class="cn-cat-row">
                <div>
                  <strong>${cat.name}</strong>
                  <div class="cn-cat-desc">${cat.desc}</div>
                </div>
                <label class="cn-switch">
                  <input type="checkbox" id="cn-cat-${key}" ${cat.required ? 'checked disabled' : (cat.default ? 'checked' : '')}>
                  <span class="cn-slider"></span>
                </label>
              </div>
            `).join('')}
          </div>

          <div class="cn-actions">
            <button id="cn-accept-necessary" class="cn-btn cn-btn-secondary">Only Necessary</button>
            <button id="cn-save-custom" class="cn-btn cn-btn-secondary">Save Choices</button>
            <button id="cn-accept-all" class="cn-btn cn-btn-primary">Accept All</button>
          </div>
        </div>
      `;

      const mount = () => {
        if (!document.body || document.getElementById('cookienexus-consent-modal')) return;
        document.body.appendChild(overlay);

        document.getElementById('cn-accept-all')?.addEventListener('click', () => {
          const state = { necessary: true, analytics: true, marketing: true, functional: true };
          this.saveAndClose(state);
        });

        document.getElementById('cn-accept-necessary')?.addEventListener('click', () => {
          const state = { necessary: true, analytics: false, marketing: false, functional: false };
          this.saveAndClose(state);
        });

        document.getElementById('cn-save-custom')?.addEventListener('click', () => {
          const state = {
            necessary: true,
            analytics: document.getElementById('cn-cat-analytics')?.checked || false,
            marketing: document.getElementById('cn-cat-marketing')?.checked || false,
            functional: document.getElementById('cn-cat-functional')?.checked || false,
          };
          this.saveAndClose(state);
        });
      };

      if (document.body) {
        mount();
      } else {
        document.addEventListener('DOMContentLoaded', mount);
      }
    }

    saveAndClose(state) {
      this.consentState = state;
      this.saveState(state);
      this.applyConsent(state);
      const modal = document.getElementById('cookienexus-consent-modal');
      if (modal) modal.remove();
    }
  }

  window.CookieNexusConsent = CookieNexusConsent;
})(window, document);
