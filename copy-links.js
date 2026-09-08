(function(){
  'use strict';
  if (window.__tapYoutubeCopyLinks) return;
  if (!window.YouTubeUI) return;

  // This is the composition: operations and site policy do not import one another.
  var links = window.TapLinkCopy;
  var clipboard = links.browser_clipboard(navigator, document);
  var captionState = { lastCaptionRequest: null };
  var captionsEnabled = !!window.TapYouTubeCaptions;
  var settings = { format: 'short' };
  function linkFor(entry) { return window.TapYouTubeLinkPolicy(entry, settings); }
  function copy(entry) {
    var copied = links.copy_link(linkFor(entry), clipboard);
    // Independent optional effect; failure here must never fail the copy gesture.
    if (captionsEnabled) {
      try {
        Promise.resolve(window.TapYouTubeCaptions.request_captions(entry.id, {
          state: captionState,
          notify: function(message){ if (captionsEnabled) window.YouTubeUI.showToast(message); },
          confirmSaved: window.TapYouTubeCaptionStatus
        })).catch(function(){});
      } catch (_) {}
    }
    return copied;
  }
  var state = window.__tapYoutubeCopyLinks = window.TapYouTubeCopyControls(window.YouTubeUI, {
    linkFor: linkFor,
    copy: copy,
    copyText: function(text){
      try { return Promise.resolve(clipboard.writeText(text)); }
      catch (error) { return Promise.reject(error); }
    }
  });
  // Page-local composition switch. This is not a Core profile-config API.
  state.setCaptionsEnabled = function(enabled){
    captionsEnabled = !!enabled && !!window.TapYouTubeCaptions;
    return captionsEnabled;
  };
  Object.defineProperty(state, 'lastCaptionRequest', {
    get: function(){ return captionState.lastCaptionRequest; }
  });
})();
