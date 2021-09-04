/* globals attachMediaStream, Vue,  peers, localMediaStream, dataChannels */
const App = new Vue({
    el: "#app",
    data: {
        roomLink: "",
        copyText: "",
        videoDevices: [],
        audioDevices: [],
        audioEnabled: true,
        videoEnabled: true,
        screenshareEnabled: false,
        showIntro: true,
        showChat: false,
        showYoutubeSet: false,
        showSettings: false,
        hideToolbar: false,
        selectedAudioDeviceId: "",
        selectedVideoDeviceId: "",
        name: window.localStorage.name || "",
        typing: "",
        chats: [],
    },
    computed: {},
    methods: {
        copyURL: function() {
            navigator.clipboard.writeText(this.roomLink).then(
                () => {
                    this.copyText = "복사됨 👍";
                    setTimeout(() => (this.copyText = ""), 3000);
                },
                (err) => console.error(err)
            );
        },
        audioToggle: function(e) {
            e.stopPropagation();
            localMediaStream.getAudioTracks()[0].enabled = !localMediaStream.getAudioTracks()[0].enabled;
            this.audioEnabled = !this.audioEnabled;
        },
        videoToggle: function(e) {
            e.stopPropagation();
            localMediaStream.getVideoTracks()[0].enabled = !localMediaStream.getVideoTracks()[0].enabled;
            this.videoEnabled = !this.videoEnabled;
        },
        toggleSelfVideoMirror: function() {
            document.querySelector("#videos .video #selfVideo").classList.toggle("mirror");
        },
        nameToLocalStorage: function() {
            window.localStorage.name = this.name;
        },
        youtubeShareToggle: function(e) {
            e.stopPropagation();
            console.log('youtube');

        },
        changeCamera: function(deviceId) {
            navigator.mediaDevices
                .getUserMedia({ video: { deviceId: deviceId } })
                .then((camStream) => {
                    console.log(camStream);
                    for (let peer_id in peers) {
                        const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
                        sender.replaceTrack(camStream.getVideoTracks()[0]);
                    }
                    camStream.getVideoTracks()[0].enabled = true;

                    const newStream = new MediaStream([camStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
                    localMediaStream = newStream;
                    attachMediaStream(document.getElementById("selfVideo"), newStream);
                    this.selectedVideoDeviceId = deviceId;
                })
                .catch((err) => {
                    console.log(err);
                    alert("카메라를 불러오지 못했어요. 다른 카메라를 선택해보세요.");
                });
        },
        changeMicrophone: function(deviceId) {
            navigator.mediaDevices
                .getUserMedia({ audio: { deviceId: deviceId } })
                .then((micStream) => {
                    for (let peer_id in peers) {
                        const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "audio" : false));
                        sender.replaceTrack(micStream.getAudioTracks()[0]);
                    }
                    micStream.getAudioTracks()[0].enabled = true;

                    const newStream = new MediaStream([localMediaStream.getVideoTracks()[0], micStream.getAudioTracks()[0]]);
                    localMediaStream = newStream;
                    attachMediaStream(document.getElementById("selfVideo"), newStream);
                    this.selectedAudioDeviceId = deviceId;
                })
                .catch((err) => {
                    console.log(err);
                    alert("마이크를 불러오지 못했어요. 다른 마이크를 선택해보세요.");
                });
        },
        sanitizeString: function(str) {
            const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
            const replaceTag = (tag) => tagsToReplace[tag] || tag;
            const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
            return safe_tags_replace(str);
        },
        linkify: function(str) {
            if (str == '/1') {
                return `<img src="https://blog.kakaocdn.net/dn/VzAMG/btqHR66WyUC/xkuXI9X1b5YGd7Nobr1g00/img.gif" style="width:50%;">`;
            } else if (str == '/2') {
                return `<img src="https://cdn.notefolio.net/img/93/c6/93c62f9d432b62cb5f3c96f2094f54f7da8e6313fac02c8b6dffff99fb0ac78c_v1.jpg" style="width:50%;">`;
            } else if (str == '/3') {
                return `<img src="https://www.hushwish.com/wp-content/uploads/2019/10/emo_asiana_009.gif" style="width:50%;">`;
            } else {
                return this.sanitizeString(str).replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
                    let displayURL = match
                        .trim()
                        .replace("https://", "")
                        .replace("https://", "");
                    displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
                    const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
                    return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
                });
            }

        },
        edit: function(e) {
            this.typing = e.srcElement.textContent;
        },
        paste: function(e) {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData("Text");
            document.execCommand("inserttext", false, pastedText.replace(/(\r\n\t|\n|\r\t)/gm, " "));
        },
        sendChat: function(e) {
            e.stopPropagation();
            e.preventDefault();
            if (this.typing.length) {
                const composeElement = document.getElementById("compose");
                const chatMessage = {
                    type: "chat",
                    name: this.name || "이름없음",
                    message: this.typing,
                    date: new Date().toISOString(),
                };
                this.chats.push(chatMessage);
                this.$nextTick(() => {
                    let messages = this.$refs.chats;
                    chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                });
                Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                if (this.typing == '/이모티콘') {
                    const chatMessage = {
                        type: "chat",
                        name: "마르크스",
                        message: '/1 : 윙크\n/2 : 울음\n/3 : 노노\n', //이모티콘 리스트 도움말
                        date: new Date().toISOString(),
                    };
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                }
                this.typing = "";
                composeElement.textContent = "";
                composeElement.blur;
            }
        },
        handleIncomingDataChannelMessage: function(chatMessage) {
            switch (chatMessage.type) {
                case "chat":
                    this.showChat = true;
                    this.hideToolbar = false;

                    this.chats.push(chatMessage.split('\n').join('<br>'));

                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    break;
                case "youtube":
                    var player;

                    function onYouTubeIframeAPIReady(id) {
                        console.log(id);
                        player = new YT.Player('player', {
                            width: '100%',
                            videoId: id,
                            playerVars: { 'autoplay': 1, 'playsinline': 1 },
                            events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
                        });
                    }

                    function onPlayerReady(e) {
                        e.target.mute();
                        e.target.playVideo();

                    }

                    // when video ends
                    function onPlayerStateChange(event) {
                        if (event.data === 0) {
                            $('#videos').show();
                            $('#youtube-sec').hide();
                            $('.flip-btn').hide();
                            $('#video-icon-btn').show();
                            $('#youtube-icon-btn').hide();
                        }
                    }
                    $('#youtubeWrap').hide();
                    var y_id = (chatMessage.message).replace('Youtube 영상 공유 : ', '');
                    console.log(y_id);
                    onYouTubeIframeAPIReady(y_id);
                    $('#videos').hide();
                    $('#youtube-sec').show();
                    $('.flip-btn').show();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();
                    break;
                case "youtube_shareStop":
                    $('#player').attr('src', '');
                    $('#videos').show();
                    $('#youtube-sec').hide();
                    $('.flip-btn').hide();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    break;
                default:
                    break;
            }
        },
        formatDate: function(dateString) {
            const date = new Date(dateString);
            const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
            return (
                (hours < 10 ? "0" + hours : hours) +
                ":" +
                (date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
                " " +
                (date.getHours() >= 12 ? "PM" : "AM")
            );
        },
        stopYoutubeShare: function() {
            $('#player').attr('src', '');
            //youtube 공유 전달
            const chatMessage = {
                type: "youtube_shareStop",
                name: this.name || "이름없음",
                message: 'Youtube 영상 공유 종료',
                date: new Date().toISOString(),
            };
            this.chats.push(chatMessage);
            Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
            $('#videos').show();
            $('#youtube-sec').hide();
            $('.flip-btn').hide();
            $('#video-icon-btn').show();
            $('#youtube-icon-btn').hide();
        },
        youtubeBtn: function(e) {
            var player;

            function onYouTubeIframeAPIReady(id) {
                console.log(id);
                player = new YT.Player('player', {
                    width: '100%',
                    videoId: id,
                    playerVars: { 'autoplay': 1, 'playsinline': 1 },
                    events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
                });
            }

            function onPlayerReady(e) {
                e.target.mute();
                e.target.playVideo();

            }

            // when video ends
            function onPlayerStateChange(event) {
                if (event.data === 0) {
                    $('#videos').show();
                    $('#youtube-sec').hide();
                    $('.flip-btn').hide();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();
                }
            }

            function youtubeId(url) {
                var tag = "";
                if (url) {
                    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
                    var matchs = url.match(regExp);
                    if (matchs) {
                        tag += matchs[7];
                    }
                    return tag;
                }
            }
            e.stopPropagation();
            e.preventDefault();
            var input = $('#youtube-input').val();
            if (input.length) {
                var y_id = youtubeId(input);
                if (input) {
                    $('#youtubeWrap').hide();
                    onYouTubeIframeAPIReady(y_id);
                    $('#videos').hide();
                    $('#youtube-sec').show();
                    $('.flip-btn').show();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();

                    //youtube 공유 전달
                    const chatMessage = {
                        type: "youtube",
                        name: this.name || "이름없음",
                        message: 'Youtube 영상 공유 : ' + y_id,
                        date: new Date().toISOString(),
                    };
                    this.chats.push(chatMessage);
                    Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                }
            }
        },
    },
});