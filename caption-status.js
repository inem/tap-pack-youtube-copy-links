// Optional read-only receipt over an already connected TAP bridge. Never connects.
(function () {
  'use strict';
  window.TapYouTubeCaptionStatus = async function (videoId, text) {
    var bridge = window.TapBridge;
    if (!bridge || !bridge.isReady() || !window.crypto || !crypto.subtle) return 'unavailable';
    var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    var digest = Array.from(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    for (var attempt = 0; attempt < 8; attempt++) {
      if (!bridge.isReady()) return 'unavailable';
      try {
        var receipt = await bridge.request('youtube.subtitle-status', {videoId: videoId, sha256: digest});
        if (receipt && receipt.saved === true && receipt.videoId === videoId && receipt.sha256 === digest) return 'saved';
      } catch (_) { return 'unavailable'; }
      if (attempt < 7) await new Promise(function (resolve) { setTimeout(resolve, 500); });
    }
    return 'unconfirmed';
  };
})();
