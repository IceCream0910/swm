function keyWordsearch() {

    $(".loader").show();
    gapi.client.setApiKey("AIzaSyDNWzGaX50QUdybwMKkcVYfMzGTqGZMlUs");
    gapi.client.load('youtube', 'v3', function() {
        makeRequest();
    });
}




function makeRequest(page) {

    var q = $('#youtube-input').val();
    var request = gapi.client.youtube.search.list({
        q: q,
        part: 'snippet',
        maxResults: 3,
        pageToken: page
    });


    request.execute(function(response) {

        var nextpage = response.nextPageToken;
        var prevpage = response.prevPageToken;

        $("#prev").click(function() {
            $(".loader").show();
            makeRequest(prevpage);
            $("body").scrollTop(0);
            $(".loader").fadeOut("slow");

        });
        $("#next").click(function() {
            $(".loader").show();
            makeRequest(nextpage);
            $("body").scrollTop(0);
            $(".loader").fadeOut("slow");
        });


        $('#results').empty();
        var srchItems = response.result.items;

        $.each(srchItems, function(index, item) {



            vidTitle = item.snippet.title;
            vidId = item.id.videoId;
            vidDescription = item.snippet.description;
            console.log(response);

            $('#results').append('<div class="videos" onclick="javascript:App.searchedYoutubeClick(\'' + vidId + '\')"><img src="http://i.ytimg.com/vi/' + vidId + '/hqdefault.jpg" style="width:20%;display:inline-block;"> <h3 class="title" style="display:inline-block">' + vidTitle + '</h3></div></div>');
            $(".nextpr").css('display', 'inline');
            setTimeout(function() { $(".loader").fadeOut("slow"); }, 1000);

        })
    });


}