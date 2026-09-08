(function(){
  'use strict';

  // Resolve on the gesture, so DOM and SPA changes cannot leave a stale URL.
  function select_link(selector, root) {
    return function(){
      var element = root.querySelector(selector);
      if (!element || !element.getAttribute('href')) throw new Error('link not found');
      return new URL(element.getAttribute('href'), element.baseURI).href;
    };
  }

  function copy_link(link, clipboard) {
    // Call writeText during the gesture (no await before browser activation).
    try { return Promise.resolve(clipboard.writeText(link())); }
    catch (error) { return Promise.reject(error); }
  }

  function browser_clipboard(navigator, document) {
    function fallback(text) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      finally { textarea.remove(); }
      if (!ok) throw new Error('copy failed');
    }
    return { writeText: function(text){
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return Promise.resolve(navigator.clipboard.writeText(text)).catch(function(){ fallback(text); });
        }
      } catch (_) { /* Browser access may throw synchronously; try the fallback. */ }
      return fallback(text);
    }};
  }

  window.TapLinkCopy = {
    select_link: select_link,
    copy_link: copy_link,
    browser_clipboard: browser_clipboard
  };
})();
