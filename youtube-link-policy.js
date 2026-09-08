(function(){
  'use strict';
  window.TapYouTubeLinkPolicy = function(entry, settings){
    var format = settings.format || 'short';
    if (format !== 'short' && format !== 'original') throw new Error('unknown link format');
    return function(){
      return format === 'short' ? 'https://youtu.be/' + entry.id : entry.url;
    };
  };
})();
