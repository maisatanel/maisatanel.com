var lastfmData = {
  baseURL:
    "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=",
  // Your Last.fm Username
  user: "Linwer_",
  // Your API key
  api_key: "a843a74b0b1c002f48cd1d6f9ef42ada",
  additional: "&format=json&limit=1"
};

var getSetLastFM = function() {
  jQuery.ajax({
    type: "GET",
    url:
      lastfmData.baseURL +
      lastfmData.user +
      "&api_key=" +
      lastfmData.api_key +
      lastfmData.additional,
    dataType: "json",
    success: function(resp) {
      var recentTrack = resp.recenttracks.track[0];
      var formatted =
        recentTrack.name;
      jQuery("span#tracktitle")
        .html(formatted)
        //.attr("href", recentTrack.url)
        .attr("title", recentTrack.name + " by " + recentTrack.artist["#text"])
        .attr("target", "_blank");

      var artistFormatted =
        recentTrack.artist["#text"];
      jQuery("span#trackartist")
        .html(artistFormatted)
        .attr("title", "Artist : " + recentTrack.artist["#text"]);
      //$("img#trackart").attr("src", recentTrack.image[2]["#text"]);
    },
    error: function(resp) {
      jQuery("span#tracktitle").html(
        "The sounds of silence"
      );
      // jQuery("img#trackart").attr("src", "https://i.imgur.com/Q6cCswP.jpg");
      // var artistFormatted =
      //   "<img src='https://i.imgur.com/fae5XZA.png'>of silence";
      // jQuery("span#trackartist")
      //   .html(artistFormatted);
    }
  });
};

// Get the new one.
getSetLastFM();
// Start the countdown.
setInterval(getSetLastFM, 10 * 100);
