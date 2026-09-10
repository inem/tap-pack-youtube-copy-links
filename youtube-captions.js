(function(){
  'use strict';
  function playerResponse(videoId) {
    var initial = window.ytInitialPlayerResponse;
    if (initial && initial.videoDetails && initial.videoDetails.videoId === videoId) {
      return Promise.resolve(initial);
    }
    var config = window.ytcfg;
    var get = config && typeof config.get === 'function'
      ? function(key){ return config.get(key); }
      : function(){ return null; };
    var key = get('INNERTUBE_API_KEY');
    var context = get('INNERTUBE_CONTEXT');
    if (!key || !context) return Promise.reject(new Error('player config unavailable'));
    var headers = { 'content-type': 'application/json' };
    var clientName = get('INNERTUBE_CONTEXT_CLIENT_NAME');
    var clientVersion = get('INNERTUBE_CONTEXT_CLIENT_VERSION');
    if (clientName) headers['x-youtube-client-name'] = String(clientName);
    if (clientVersion) headers['x-youtube-client-version'] = String(clientVersion);
    return fetch('/youtubei/v1/player?key=' + encodeURIComponent(key) + '&prettyPrint=false', {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers,
      body: JSON.stringify({
        context: context,
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true
      })
    }).then(function(response){
      if (!response.ok) throw new Error('player request failed');
      return response.json();
    });
  }

  function preferredCaption(tracks) {
    if (!tracks || !tracks.length) return null;
    var language = ((document.documentElement && document.documentElement.lang) || '').split('-')[0];
    return tracks.find(function(track){
      return track.languageCode === language && track.kind !== 'asr';
    }) || tracks.find(function(track){
      return track.languageCode === language;
    }) || tracks.find(function(track){
      return track.languageCode === 'en' && track.kind !== 'asr';
    }) || tracks.find(function(track){
      return track.kind !== 'asr';
    }) || tracks[0];
  }

  function request_captions(videoId, effects) {
    var state = effects.state;
    var requestState = state.lastCaptionRequest = {
      videoId: videoId,
      status: 'requesting'
    };
    return playerResponse(videoId).then(function(player){
      var renderer = player && player.captions && player.captions.playerCaptionsTracklistRenderer;
      var track = preferredCaption(renderer && renderer.captionTracks);
      if (!track || !track.baseUrl) {
        requestState.status = 'unavailable';
        return false;
      }
      requestState.trackUrl = track.baseUrl;
      return fetch(track.baseUrl, { credentials: 'include' }).then(function(response){
        return response.text().then(function(text){
          var received = response.ok && !!text.trim();
          requestState.status = received ? 'fetched' : 'failed';
          if (received && effects.confirmSaved) {
            requestState.local = 'checking';
            effects.confirmSaved(videoId, text).then(function(local){
              requestState.local = local;
              if (state.lastCaptionRequest === requestState) {
                effects.notify(local === 'saved' ? 'Subtitles saved locally' :
                  local === 'unavailable' ? 'Subtitles fetched · local confirmation unavailable' :
                  'Subtitles fetched · local save not confirmed');
              }
            }).catch(function(){ requestState.local = 'unavailable'; });
          }
          return received;
        });
      });
    }).catch(function(error){
      requestState.status = 'failed';
      requestState.error = String(error && error.message || error);
      return false;
    });
  }

  window.TapYouTubeCaptions = { request_captions: request_captions };
})();
